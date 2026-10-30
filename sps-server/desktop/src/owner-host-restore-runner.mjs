import { spawnWindowsJobSupervisor } from "@sps/desktop-node";

function assertEmpty(terminal) {
  if (!terminal || terminal.activeProcesses !== 0
    || !["exit", "cancelled"].includes(terminal.type)
    || terminal.type === "exit" && (!Number.isInteger(terminal.code) || terminal.code < 0 || terminal.code > 0xffffffff)) {
    throw new Error("SPS Host restore termination is unconfirmed; staged data was preserved.");
  }
}

/** Retain the exact helper/Job until authenticated emptiness and helper closure. */
export function createSpsOwnerHostRestoreRunner({ spawn = spawnWindowsJobSupervisor } = {}) {
  let active = null;
  let generation = 0n;
  const release = owner => { if (active === owner) active = null; };

  return Object.freeze({
    isActive: () => active !== null,
    generation: () => generation,
    hasUnconfirmedTermination: () => active?.uncertain === true,
    async run({ command, cwd, helperPath, configPath, backupFile, dbModulePath, embeddedPostgresModulePath, environment }) {
      if (active) throw new Error("Another SPS Host restore is still running or its termination is unconfirmed.");
      const child = spawn({ executable: command, cwd,
        args: [helperPath, configPath, backupFile, dbModulePath, embeddedPostgresModulePath],
        env: Object.fromEntries(Object.entries({ ...process.env, ...environment }).filter(([, value]) => typeof value === "string")),
      });
      const owner = { child, cancelled: false, uncertain: true, stopping: null };
      active = owner;
      let stderr = "";
      child.stdout?.resume();
      child.stderr?.on("data", chunk => { stderr = `${stderr}${String(chunk)}`.slice(-8000); });
      child.stdin?.end();
      try {
        await child.supervisorReady;
        const terminal = await child.waitForOwnedJobTermination();
        assertEmpty(terminal);
        owner.uncertain = false;
        release(owner);
        if (owner.cancelled || terminal.type !== "exit") throw new Error("SPS Host restore was cancelled; staged data was preserved.");
        if (terminal.code !== 0) throw new Error(`SPS Host database restore failed${stderr.trim() ? `: ${stderr.trim()}` : "."}`);
      } catch (error) {
        // Even after startup failure or helper death, neither a rejected
        // promise nor absence of a PID proves its owned descendants closed.
        if (owner.uncertain) active = owner;
        throw error;
      }
    },
    async stop() {
      // Invalidate even an operation between helper completion and promotion.
      // A failed quit attempt cannot revive that old async continuation.
      generation += 1n;
      const owner = active;
      if (!owner) return;
      owner.cancelled = true;
      if (owner.stopping) return owner.stopping;
      const operation = (async () => {
        const terminal = await owner.child.terminateOwnedJob();
        assertEmpty(terminal);
        owner.uncertain = false;
        release(owner);
      })();
      owner.stopping = operation;
      try { await operation; }
      finally { if (owner.stopping === operation) owner.stopping = null; }
    },
  });
}
