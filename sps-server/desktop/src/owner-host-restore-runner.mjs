import { spawnWindowsJobSupervisor } from "@sps/desktop-node";
import { randomUUID } from "node:crypto";
import path from "node:path";

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
  const pathApi = process.platform === "win32" ? path.win32 : path.posix;
  const referenceSpecs = Object.freeze([
    ["command", "file"], ["cwd", "directory"], ["helperPath", "file"],
    ["configPath", "file"], ["backupFile", "file"], ["dbModulePath", "file"],
    ["embeddedPostgresModulePath", "file"],
  ]);
  function captureReferences(input) {
    const values = Object.fromEntries(referenceSpecs.map(([key]) => [key, input?.[key]]));
    return Object.freeze({
      id: randomUUID(),
      values: Object.freeze(values),
      references: Object.freeze(referenceSpecs.map(([key, kind]) => Object.freeze({ id: randomUUID(), path: values[key], kind }))),
    });
  }
  function isCanonicalReferencePath(value) {
    if (typeof value !== "string" || !value || /[\u0000-\u001f\u007f]/u.test(value)
      || !pathApi.isAbsolute(value)) return false;
    if (process.platform === "win32" && /^[\\/]{2}/u.test(value)) return false;
    return pathApi.resolve(value) === value;
  }
  function readArtifactReferences() {
    if (!active) return Object.freeze({ available: true, references: Object.freeze([]) });
    const { values, references } = active.artifacts;
    if (referenceSpecs.some(([key]) => !isCanonicalReferencePath(values[key]))) {
      return Object.freeze({ available: false, references: Object.freeze([]) });
    }
    return Object.freeze({ available: true, references });
  }

  return Object.freeze({
    isActive: () => active !== null,
    generation: () => generation,
    hasUnconfirmedTermination: () => active?.uncertain === true,
    readArtifactReferences,
    async run({ command, cwd, helperPath, configPath, backupFile, dbModulePath, embeddedPostgresModulePath, environment }) {
      if (active) throw new Error("Another SPS Host restore is still running or its termination is unconfirmed.");
      const artifacts = captureReferences({ command, cwd, helperPath, configPath, backupFile, dbModulePath, embeddedPostgresModulePath });
      const owner = { id: artifacts.id, artifacts, child: null, cancelled: false, uncertain: true, stopping: null };
      active = owner;
      const child = owner.child = spawn({ executable: artifacts.values.command, cwd: artifacts.values.cwd,
        args: [artifacts.values.helperPath, artifacts.values.configPath, artifacts.values.backupFile,
          artifacts.values.dbModulePath, artifacts.values.embeddedPostgresModulePath],
        env: Object.fromEntries(Object.entries({ ...process.env, ...environment }).filter(([, value]) => typeof value === "string")),
      });
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
        if (!owner.child) throw new Error("SPS Host restore termination is unconfirmed; staged data was preserved.");
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
