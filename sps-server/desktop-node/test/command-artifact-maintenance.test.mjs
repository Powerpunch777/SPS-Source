import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  cancelSpsNodeCommand,
  cancelSpsNodeCommands,
  executeSpsNodeCommand,
  withSpsNodeCommandArtifactMaintenance,
} from "../src/command-runner.mjs";

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function command(id = randomUUID()) {
  return { id, command: "agy", runtimeKind: "agy_cli", args: [], env: {}, timeoutMs: 10_000 };
}

function commandOptions(id, overrides = {}) {
  return {
    command: command(id),
    hubUrl: "https://fixture.example.test",
    nodeId: "maintenance-fixture",
    profile: {},
    resolveWorkspace: async () => process.cwd(),
    resolveInvocation: async () => ({
      executable: process.execPath,
      args: ["-e", "setInterval(() => {}, 1000)"],
    }),
    checkCommandLease: async () => ({ active: true }),
    appendCommandEvent: async () => {},
    completeCommand: async () => {},
    spawnCommand: (invocation, options) => spawn(invocation.executable, invocation.args, options),
    ...overrides,
  };
}

async function assertArtifactActivity(promise) {
  await assert.rejects(promise, error => error?.code === "artifact-activity");
}

test("maintenance rejects an active command without cancelling it", { timeout: 10_000 }, async () => {
  const id = randomUUID();
  const childSpawned = deferred();
  const ownership = Symbol("maintenance-active-command");
  let child;
  const execution = executeSpsNodeCommand(commandOptions(id, {
    ownership,
    spawnCommand: (invocation, options) => {
      child = spawn(invocation.executable, invocation.args, options);
      childSpawned.resolve();
      return child;
    },
  }));
  void execution.catch(() => {});

  try {
    await childSpawned.promise;
    let actionCalls = 0;
    await assertArtifactActivity(withSpsNodeCommandArtifactMaintenance(async () => { actionCalls += 1; }));
    assert.equal(actionCalls, 0);
    assert.equal(child.exitCode, null, "a failed maintenance attempt does not cancel the command");
    assert.equal(await cancelSpsNodeCommand(id, "Fixture cleanup", { ownership }), true);
    await execution;
  } finally {
    await cancelSpsNodeCommand(id, "Fixture cleanup", { ownership }).catch(() => false);
    await execution.catch(() => {});
  }
});

test("maintenance scope is exclusive, blocks commands before preflight, and releases after callback failure", async () => {
  const entered = deferred();
  const release = deferred();
  let nestedActionCalls = 0;
  let workspaceCalls = 0;
  let invocationCalls = 0;
  let spawnCalls = 0;
  const maintenance = withSpsNodeCommandArtifactMaintenance(async scope => {
    assert.equal(Object.isFrozen(scope), true);
    assert.equal(scope.assertCurrent(), undefined);
    entered.resolve(scope);
    await release.promise;
    throw new Error("fixture maintenance callback failed");
  });

  try {
    const scope = await entered.promise;
    await assertArtifactActivity(withSpsNodeCommandArtifactMaintenance(async () => { nestedActionCalls += 1; }));
    await assertArtifactActivity(executeSpsNodeCommand(commandOptions(randomUUID(), {
      resolveWorkspace: async () => { workspaceCalls += 1; return process.cwd(); },
      resolveInvocation: async () => { invocationCalls += 1; return null; },
      spawnCommand: () => { spawnCalls += 1; throw new Error("must not spawn"); },
    })));
    assert.deepEqual([nestedActionCalls, workspaceCalls, invocationCalls, spawnCalls], [0, 0, 0, 0]);
    release.resolve();
    await assert.rejects(maintenance, /fixture maintenance callback failed/);
    assert.throws(() => scope.assertCurrent(), error => error?.code === "artifact-activity");

    let nextActionCalls = 0;
    assert.equal(await withSpsNodeCommandArtifactMaintenance(async nextScope => {
      nextActionCalls += 1;
      nextScope.assertCurrent();
      return "released";
    }), "released");
    assert.equal(nextActionCalls, 1);
  } finally {
    release.resolve();
    await maintenance.catch(() => {});
  }
});

test("an in-flight preflight blocks maintenance even before a child exists", { timeout: 10_000 }, async () => {
  const workspaceStarted = deferred();
  const resolveWorkspace = deferred();
  let spawned = false;
  const execution = executeSpsNodeCommand(commandOptions(randomUUID(), {
    resolveWorkspace: async () => {
      workspaceStarted.resolve();
      return resolveWorkspace.promise;
    },
    resolveInvocation: async () => ({ executable: process.execPath, args: ["-e", "process.exit(0)"] }),
    spawnCommand: (invocation, options) => {
      spawned = true;
      return spawn(invocation.executable, invocation.args, options);
    },
  }));

  try {
    await workspaceStarted.promise;
    await assertArtifactActivity(withSpsNodeCommandArtifactMaintenance(async () => {}));
    assert.equal(spawned, false);
    resolveWorkspace.resolve(process.cwd());
    await execution;
    assert.equal(spawned, true);
    assert.equal(await withSpsNodeCommandArtifactMaintenance(async scope => scope.assertCurrent()), undefined);
  } finally {
    resolveWorkspace.resolve(process.cwd());
    await execution.catch(() => {});
  }
});

test("cancelAll invalidates the current scope and the callback can release it", async () => {
  let scope;
  const maintenance = withSpsNodeCommandArtifactMaintenance(async currentScope => {
    scope = currentScope;
    assert.equal(await cancelSpsNodeCommands("Invalidate artifact maintenance fixture"), 0);
    assert.throws(() => currentScope.assertCurrent(), error => error?.code === "artifact-activity");
    return "cancelled";
  });

  await assertArtifactActivity(maintenance);
  assert.throws(() => scope.assertCurrent(), error => error?.code === "artifact-activity");
  assert.equal(await withSpsNodeCommandArtifactMaintenance(async () => "released"), "released");
});

test("failed Source cleanup retains the activity block until explicit cleanup succeeds", { timeout: 10_000 }, async () => {
  const id = randomUUID();
  const ownership = Symbol("maintenance-source-cleanup");
  let allowClose = false;
  let closeAttempts = 0;
  const execution = executeSpsNodeCommand(commandOptions(id, {
    ownership,
    resolveInvocation: async () => ({ executable: process.execPath, args: ["-e", "process.exit(0)"] }),
    openWorkspaceSourceRoute: async () => ({
      workspacePath: process.cwd(),
      close: async () => {
        closeAttempts += 1;
        if (!allowClose) throw new Error("fixture Source cleanup unavailable");
      },
    }),
  }));

  try {
    await assert.rejects(execution, /fixture Source cleanup unavailable/);
    await assertArtifactActivity(withSpsNodeCommandArtifactMaintenance(async () => {}));
    allowClose = true;
    assert.equal(await cancelSpsNodeCommand(id, "Retry fixture Source cleanup", { ownership }), true);
    assert.equal(closeAttempts, 2);
    assert.equal(await withSpsNodeCommandArtifactMaintenance(async () => "clean"), "clean");
  } finally {
    allowClose = true;
    await cancelSpsNodeCommand(id, "Fixture cleanup", { ownership }).catch(() => false);
    await execution.catch(() => {});
  }
});

test("unconfirmed child closure retains the activity block until confirmation is restored", { timeout: 10_000 }, async () => {
  const id = randomUUID();
  const ownership = Symbol("maintenance-unconfirmed-child");
  let unconfirmed = true;
  let sourceCloses = 0;
  const processTermination = {
    isAlive: child => Boolean(child && child.exitCode === null && child.signalCode === null),
    hasUnconfirmedTermination: () => unconfirmed,
    pending: () => undefined,
    terminate: async () => {},
  };
  const execution = executeSpsNodeCommand(commandOptions(id, {
    ownership,
    processTermination,
    resolveInvocation: async () => ({ executable: process.execPath, args: ["-e", "process.exit(0)"] }),
    openWorkspaceSourceRoute: async () => ({
      workspacePath: process.cwd(),
      close: async () => { sourceCloses += 1; },
    }),
  }));

  try {
    await assert.rejects(execution, /termination has not been confirmed/);
    await assertArtifactActivity(withSpsNodeCommandArtifactMaintenance(async () => {}));
    assert.equal(sourceCloses, 0);
    unconfirmed = false;
    assert.equal(await cancelSpsNodeCommand(id, "Confirm fixture child closure", { ownership }), true);
    assert.equal(sourceCloses, 1);
    assert.equal(await withSpsNodeCommandArtifactMaintenance(async () => "clean"), "clean");
  } finally {
    unconfirmed = false;
    await cancelSpsNodeCommand(id, "Fixture cleanup", { ownership }).catch(() => false);
    await execution.catch(() => {});
  }
});
