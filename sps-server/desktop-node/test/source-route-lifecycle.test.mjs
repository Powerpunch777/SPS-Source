import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import test from "node:test";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { createWorkspaceE2eFixture } from "../../desktop/scripts/workspace-e2e-fixture.mjs";
import { createNodeIdentity } from "../src/identity.mjs";
import { openSpsWorkspaceSourceRoute } from "../src/host-project-share.mjs";
import { executeSpsNodeCommand, cancelSpsNodeCommand } from "../src/command-runner.mjs";
import { sealSpsHostProjectShareCredential } from "../../desktop/src/host-project-share.mjs";
import { createOwnedProcessTerminator } from "../src/owned-process-termination.mjs";

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test("failed Source mapping cleanup is retained, concurrent close joins, and explicit retry succeeds", async () => {
  const identity = createNodeIdentity(), sharePath = "\\\\fixture-host\\approved-source";
  const credentialEnvelope = sealSpsHostProjectShareCredential({ sharePath, username: "fixture_node",
    password: "fixture-only-password-123456789", transportPublicKey: identity.transportPublicKeyPem });
  let attempts = 0;
  const cleanup = deferred();
  const route = await openSpsWorkspaceSourceRoute({ kind: "sps_workspace_source", sourceId: randomUUID(),
    sharePath, credentialAlgorithm: "rsa-oaep-sha256+a256gcm", credentialEnvelope }, identity.transportPrivateKeyPem, {
    platform: "win32", expectedSharePath: sharePath,
    runNetUse: async args => {
      if (!args.includes("/delete")) return { localPath: "Z:\\" };
      assert.ok(args.includes("/local:Z:"));
      if (++attempts === 1) throw new Error("fixture cleanup unavailable");
      await cleanup.promise;
    },
  });
  await assert.rejects(route.close(), /cleanup unavailable/);
  const retry = route.close();
  assert.equal(route.close(), retry);
  cleanup.resolve();
  await retry;
  await route.close();
  assert.equal(attempts, 2);
});

const command = id => ({ id, command: "agy", runtimeKind: "agy_cli", args: [], env: {}, timeoutMs: 10000 });
const canary = async () => ({ executable: process.execPath, args: ["-e", "process.exit(0)"] });

test("an unconfirmed tree termination retains Source ownership after its direct child exits", { timeout: 15000 }, async () => {
  const id = randomUUID(), ownership = Symbol("unconfirmed-termination"), completions = [];
  let leaseChecks = 0, sourceCloses = 0, ownedChild, stopped;
  const processTermination = createOwnedProcessTerminator({
    platform: "win32",
    terminateWindowsChild: async child => {
      ownedChild = child;
      stopped = new Promise(resolve => child.once("close", resolve));
      // Model taskkill failing after its fallback stops only the direct child.
      // This fixture owns this exact canary and never signals a supplied PID.
      child.kill();
      throw new Error("fixture tree termination was not confirmed");
    },
  });
  const options = { command: command(id), ownership, processTermination,
    hubUrl: "https://fixture.example", nodeId: "fixture", profile: {},
    resolveInvocation: async () => ({ executable: process.execPath, args: ["-e", "setInterval(() => {}, 1000)"] }),
    checkCommandLease: async () => ({ active: ++leaseChecks === 1 }),
    appendCommandEvent: async () => {}, completeCommand: async value => { completions.push(value); },
    openWorkspaceSourceRoute: async () => ({ workspacePath: process.cwd(), close: async () => { sourceCloses++; } }),
  };
  try {
    await assert.rejects(executeSpsNodeCommand(options), /Local command termination failed/);
    assert.ok(ownedChild, "the failure belongs to the exact spawned canary");
    await stopped;
    assert.equal(processTermination.isAlive(ownedChild), false);
    assert.equal(processTermination.hasUnconfirmedTermination(ownedChild), true);
    assert.equal(sourceCloses, 0, "direct-child exit does not authorize unmapping the Source");
    assert.deepEqual(completions, [], "Core receives no false execution completion");
    await assert.rejects(executeSpsNodeCommand(options), /duplicate active command ID/);
    assert.equal(await cancelSpsNodeCommand(id, "Wrong lifecycle", { ownership: Symbol("other") }), false);
    await assert.rejects(cancelSpsNodeCommand(id, "Retry retained cleanup", { ownership }), /Local command termination failed/);
    assert.equal(sourceCloses, 0);
  } finally {
    if (ownedChild && ownedChild.exitCode === null && ownedChild.signalCode === null) ownedChild.kill();
    await stopped;
  }
});

test("Source cleanup does not wait for a terminal process's pending Host completion response", { timeout: 15000 }, async () => {
  const id = randomUUID(), ownership = Symbol("pending-host-response"), closing = deferred(), response = deferred(), completing = deferred();
  const work = executeSpsNodeCommand({ command: command(id), ownership, hubUrl: "https://fixture.example", nodeId: "fixture", profile: {},
    resolveInvocation: canary, checkCommandLease: async () => ({ active: true }), appendCommandEvent: async () => {},
    completeCommand: async () => { completing.resolve(); await response.promise; },
    openWorkspaceSourceRoute: async () => ({ workspacePath: process.cwd(), close: async () => { closing.resolve(); } }),
  });
  try {
    await completing.promise;
    await closing.promise;
    assert.equal(await cancelSpsNodeCommand(id, "Disconnect pending completion", { ownership }), true);
  } finally { response.resolve(); await work; await cancelSpsNodeCommand(id, "Fixture cleanup", { ownership }); }
});

test("command cleanup failure retains the owned Source handle until an explicit scoped cleanup succeeds", { timeout: 15000 }, async () => {
  const id = randomUUID(), ownership = Symbol("source-owner");
  let allowCleanup = false, closeAttempts = 0;
  const completions = [];
  const options = { command: command(id), ownership, hubUrl: "https://fixture.example", nodeId: "fixture", profile: {},
    resolveInvocation: canary, checkCommandLease: async () => ({ active: true }), appendCommandEvent: async () => {},
    completeCommand: async input => { completions.push(input.completion.status); },
    openWorkspaceSourceRoute: async () => ({ workspacePath: process.cwd(), close: async () => {
      closeAttempts++; if (!allowCleanup) throw new Error("fixture Source cleanup unavailable");
    } }),
  };
  try {
    await assert.rejects(executeSpsNodeCommand(options), /Source cleanup unavailable/);
    assert.deepEqual(completions, ["succeeded"], "Execution completion and local cleanup are distinct");
    await assert.rejects(executeSpsNodeCommand(options), /duplicate active command ID/);
    await assert.rejects(cancelSpsNodeCommand(id, "Disconnect", { ownership }), /Source cleanup unavailable/);
    allowCleanup = true;
    assert.equal(await cancelSpsNodeCommand(id, "Retry cleanup", { ownership }), true);
    assert.equal(await cancelSpsNodeCommand(id, "Already cleaned", { ownership }), false);
    assert.equal(closeAttempts, 3);
  } finally { allowCleanup = true; await cancelSpsNodeCommand(id, "Fixture cleanup", { ownership }); }
});

test("cancelling a pending Source open retains ownership and cleans its late mapping before any process starts", { timeout: 15000 }, async () => {
  const id = randomUUID(), ownership = Symbol("pending-source"), opening = deferred(), mapping = deferred();
  let invoked = false, closed = false;
  const work = executeSpsNodeCommand({ command: command(id), ownership,
    hubUrl: "https://fixture.example", nodeId: "fixture", profile: {},
    openWorkspaceSourceRoute: async () => { opening.resolve(); return mapping.promise; },
    resolveInvocation: async () => { invoked = true; return canary(); },
    completeCommand: async () => {},
  });
  const rejectedWork = assert.rejects(work, /Disconnected while preparing Source/);
  try {
    await opening.promise;
    await assert.rejects(cancelSpsNodeCommand(id, "Disconnected while preparing Source", { ownership }), /cleanup is still pending/);
    mapping.resolve({ workspacePath: process.cwd(), close: async () => { closed = true; } });
    await rejectedWork;
    assert.equal(invoked, false);
    assert.equal(closed, true);
    assert.equal(await cancelSpsNodeCommand(id, "Already cleaned", { ownership }), false);
  } finally {
    mapping.resolve({ workspacePath: process.cwd(), close: async () => {} });
    await work.catch(() => {});
    await cancelSpsNodeCommand(id, "Fixture cleanup", { ownership });
  }
});

test("a Source mapping that finishes after the preflight deadline is cleaned without launching work", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const id = randomUUID(), ownership = Symbol("expired-source"), opening = deferred(), mapping = deferred(), cleaned = deferred();
  let invoked = false;
  const options = { command: command(id), ownership, hubUrl: "https://fixture.example", nodeId: "fixture", profile: {},
    openWorkspaceSourceRoute: async () => { opening.resolve(); return mapping.promise; },
    resolveInvocation: async () => { invoked = true; return canary(); }, completeCommand: async () => {},
  };
  const work = executeSpsNodeCommand(options);
  const failed = assert.rejects(work, /cleanup is still pending/);
  try {
    await opening.promise;
    t.mock.timers.tick(30000);
    await failed;
    await assert.rejects(executeSpsNodeCommand(options), /duplicate active command ID/);
    mapping.resolve({ workspacePath: process.cwd(), close: async () => { cleaned.resolve(); } });
    await cleaned.promise;
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(invoked, false);
    assert.equal(await cancelSpsNodeCommand(id, "Already cleaned", { ownership }), false);
  } finally {
    mapping.resolve({ workspacePath: process.cwd(), close: async () => {} });
    await work.catch(() => {});
    await cancelSpsNodeCommand(id, "Fixture cleanup", { ownership });
    t.mock.timers.reset();
  }
});

test("disconnect while Source authorization is pending cannot open the returned route later", async () => {
  const id = randomUUID(), ownership = Symbol("pending-route"), requested = deferred(), route = deferred();
  let mapped = false;
  const work = executeSpsNodeCommand({ command: { ...command(id), workspaceSourceId: randomUUID() }, ownership,
    hubUrl: "https://fixture.example", nodeId: "fixture", profile: { connectionKind: "remote" },
    claimWorkspaceSourceRoute: async () => { requested.resolve(); return route.promise; },
    openWorkspaceSourceRoute: async () => { mapped = true; return null; }, completeCommand: async () => {},
  });
  const rejected = assert.rejects(work, /Disconnected before Source authorization/);
  try {
    await requested.promise;
    assert.equal(await cancelSpsNodeCommand(id, "Disconnected before Source authorization", { ownership }), true);
    route.resolve({ kind: "sps_workspace_source" });
    await rejected;
    assert.equal(mapped, false);
  } finally {
    route.resolve(null); await work.catch(() => {});
    await cancelSpsNodeCommand(id, "Fixture cleanup", { ownership });
  }
});

test("cancellation after preflight resolution prevents the prepared child from spawning", { timeout: 15000 }, async () => {
  const fixture = await createWorkspaceE2eFixture();
  const directory = fixture.directory;
  const marker = path.join(directory, "child-started"), id = randomUUID(), ownership = Symbol("spawn-boundary");
  let cancelOperation, sourceClosed = false;
  const work = executeSpsNodeCommand({ command: { ...command(id), workspaceSourceId: randomUUID() }, ownership,
    hubUrl: "https://fixture.example", nodeId: "fixture", profile: { connectionKind: "remote" },
    claimWorkspaceSourceRoute: async () => ({ kind: "sps_workspace_source" }),
    openWorkspaceSourceRoute: async () => ({ workspacePath: directory, close: async () => { sourceClosed = true; } }),
    resolveInvocation: async () => ({ executable: process.execPath,
      args: ["-e", `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'started')`] }),
    checkCommandLease: async () => {
      // Let the lease check finish the preflight promise, then queue disconnect
      // between Promise.race resolution and the command-runner continuation.
      queueMicrotask(() => queueMicrotask(() => {
        cancelOperation = cancelSpsNodeCommand(id, "Disconnected at spawn boundary", { ownership });
      }));
      return { active: true };
    },
    appendCommandEvent: async () => {}, completeCommand: async () => {},
  });
  try {
    await assert.rejects(work, /Disconnected at spawn boundary/);
    assert.ok(cancelOperation, "disconnect was scheduled at the preflight/spawn boundary");
    assert.equal(await cancelOperation, true);
    await assert.rejects(fs.access(marker), { code: "ENOENT" });
    assert.equal(sourceClosed, true);
  } finally {
    await work.catch(() => {});
    await cancelSpsNodeCommand(id, "Fixture cleanup", { ownership });
    await fixture.remove();
  }
});
