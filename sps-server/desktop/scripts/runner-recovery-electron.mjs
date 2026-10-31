import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { app, safeStorage } from "electron";
import { canonicalNativeSmokeDirectorySync } from "../src/native-identity-smoke-paths.mjs";
import { parseRunnerRecoveryArguments } from "./runner-recovery-launch.mjs";

// Isolated component integration: the real Main poll routine, not Main startup
// or a Member UI. It cannot run without a caller-owned Workspace E2E fixture.
const readPackage = createRequire(import.meta.url);
async function run() {
let stage = "arguments";
let watchdog;
let cancelCommands = async () => {};
try {
  assert.equal(process.platform, "win32");
  assert.equal(process.env.SPS_DESKTOP_E2E, "1");
  const { root: inputRoot, phase, executable, endpoint: bridgeText } =
    parseRunnerRecoveryArguments(process.argv, fileURLToPath(import.meta.url));
  stage = "paths";
  const root = canonicalNativeSmokeDirectorySync(inputRoot);
  assert.ok(["runner-a", "runner-b"].includes(path.basename(root)));
  const container = path.dirname(root);
  const fixture = path.dirname(container);
  assert.equal(path.basename(container), "runner-recovery");
  assert.ok(path.basename(fixture).startsWith("sps-workspace-surfaces-e2e-"));
  assert.equal(path.dirname(fixture), canonicalNativeSmokeDirectorySync(os.tmpdir()));
  assert.equal(canonicalNativeSmokeDirectorySync(path.dirname(executable)), path.join(container, "bin"));
  assert.equal(path.basename(executable), "ollama.exe");
  const bridge = new URL(bridgeText);
  assert.equal(bridge.protocol, "http:");
  assert.equal(bridge.hostname, "127.0.0.1");
  assert.match(bridge.pathname, /^\/runner-recovery\/[a-f0-9]{64}$/);
  assert.ok(bridge.port && !bridge.username && !bridge.password && !bridge.search && !bridge.hash);
  const data = path.join(root, "electron-data");
  const workspace = path.join(root, "work");
  mkdirSync(data, { recursive: true });
  mkdirSync(workspace, { recursive: true });
  assert.equal(canonicalNativeSmokeDirectorySync(data), data);
  assert.equal(canonicalNativeSmokeDirectorySync(workspace), workspace);
  assert.equal(app.isReady(), false);
  app.setPath("userData", data);
  app.disableHardwareAcceleration();
  stage = "ready";
  watchdog = setTimeout(() => {
    void cancelCommands().finally(() => app.exit(2));
  }, 45_000);
  await app.whenReady();
  assert.equal(process.versions.electron, readPackage("../package-lock.json").packages["node_modules/electron"].version);
  assert.equal(safeStorage.isEncryptionAvailable(), true);
  const encrypt = text => safeStorage.encryptString(text).toString("base64");
  const decrypt = value => safeStorage.decryptString(Buffer.from(value, "base64"));
  const { emptyState, loadState, saveState } = await import("../src/state.mjs");
  const { createSpsNodeCompletionOutbox, SpsNodeCompletionOutboxError } = await import("../src/node-completion-outbox.mjs");
  const { createSpsNodeClaimJournal, SpsNodeClaimJournalError } = await import("../src/node-claim-journal.mjs");
  const { createSpsNodeCommandPollGate, claimNextSpsNodeWork, executionTransportForSpsNodeWork } = await import("../src/node-command-poller.mjs");
  const { createSpsNodeConnectionLifetime } = await import("../src/node-connection-lifecycle.mjs");
  const client = await import("../../desktop-node/src/hub-client.mjs");
  const { createNodeIdentity } = await import("../../desktop-node/src/identity.mjs");
  const { executeSpsNodeCommand, cancelSpsNodeCommands } = await import("../../desktop-node/src/command-runner.mjs");
  cancelCommands = () => cancelSpsNodeCommands("The owned Runner recovery fixture is closing.");
  let state = await loadState(data, { strictVersion: true });
  if (!state.identity) {
    state = emptyState();
    const generated = createNodeIdentity();
    state.identity = { publicKeyPem: generated.publicKeyPem, encryptedPrivateKey: encrypt(generated.privateKeyPem),
      transportPublicKeyPem: generated.transportPublicKeyPem, encryptedTransportPrivateKey: encrypt(generated.transportPrivateKeyPem),
      algorithm: generated.algorithm, transportAlgorithm: generated.transportAlgorithm };
    await saveState(data, state);
  }
  const identity = { ...state.identity, privateKeyPem: decrypt(state.identity.encryptedPrivateKey),
    transportPrivateKeyPem: decrypt(state.identity.encryptedTransportPrivateKey) };
  const request = async body => {
    const response = await fetch(bridge, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(body), signal: AbortSignal.timeout(20_000) });
    assert.equal(response.status, 200);
    return response;
  };
  const exchange = async body => (await request(body)).json();
  stage = "registration";
  if (!state.nodeId) {
    const registered = await exchange({ kind: "register", role: path.basename(root),
      publicKey: identity.publicKeyPem, transportPublicKey: identity.transportPublicKeyPem });
    state.nodeId = registered.nodeId;
    state.profile = { hubUrl: "https://runner-recovery.invalid", connectionKind: "remote", authMode: "sps-identity",
      companyId: registered.companyId, displayName: "Isolated Runner component", defaultWorkspacePath: workspace };
    state.nodeStatus = "pending";
    await saveState(data, state);
  }
  const fetchImpl = async (url, options = {}) => {
    const target = new URL(url);
    assert.equal(target.origin, state.profile.hubUrl);
    assert.ok(target.pathname.startsWith(`/api/sps-nodes/${state.nodeId}/`));
    return request({ kind: "request", role: path.basename(root), phase,
      method: options.method ?? "GET", path: target.pathname,
      body: options.body === undefined ? null : JSON.parse(options.body) });
  };
  await client.sendSpsNodeHeartbeat({ ...state.profile, nodeId: state.nodeId, identity, fetchImpl });
  const approved = await exchange({ kind: "approve", role: path.basename(root) });
  assert.equal(approved.status, "active");
  state.nodeStatus = approved.status;
  await saveState(data, state);
  await exchange({ kind: "ready", role: path.basename(root), phase });
  const accountSubject = "isolated-runner-recovery-account";
  const nodeCompletionOutbox = createSpsNodeCompletionOutbox({
    readEncrypted: () => state.encryptedNodeCompletionOutbox,
    writeEncrypted: async value => { state.encryptedNodeCompletionOutbox = value; await saveState(data, state); },
    encrypt, decrypt,
  });
  const nodeClaimJournal = createSpsNodeClaimJournal({
    readEncrypted: () => state.encryptedNodeClaimJournal,
    writeEncrypted: async value => { state.encryptedNodeClaimJournal = value; await saveState(data, state); },
    encrypt, decrypt,
  });
  const connection = createSpsNodeConnectionLifetime();
  connection.begin();
  let executions = 0;
  const signed = name => options => client[name]({ ...options, fetchImpl });
  const nodeRuntimeStatus = {};
  const sandbox = {
    state, nodeConnectionLifetime: connection, commandPollGate: createSpsNodeCommandPollGate(), nodeRuntimeStatus,
    structuredClone, JSON, Date, Boolean, Error, SpsNodeCompletionOutboxError, SpsNodeClaimJournalError,
    SpsHubRequestError: client.SpsHubRequestError, nodeCompletionOutbox, nodeClaimJournal,
    canRunSpsNodeCommands: status => status === "active",
    currentDesktopAccountSubject: () => accountSubject, currentDesktopSessionEpoch: () => 1,
    currentIdentity: () => identity, requireSpsCoreRequestAccess: async () => ({}),
    getSpsNodeClaimProtocol: signed("getSpsNodeClaimProtocol"),
    claimSpsNodeCommand: signed("claimSpsNodeCommand"), claimSpsPluginNodeRun: signed("claimSpsPluginNodeRun"),
    completeSpsNodeCommand: signed("completeSpsNodeCommand"), completeSpsPluginNodeRun: signed("completeSpsPluginNodeRun"),
    appendSpsPluginNodeRunEvent: signed("appendSpsPluginNodeRunEvent"),
    checkSpsPluginNodeRunLease: signed("checkSpsPluginNodeRunLease"),
    claimNextSpsNodeWork, executionTransportForSpsNodeWork,
    isSpsTechnicalMemberAccessRemoved: () => false,
    safeNodeCommandFailure: () => "The isolated Runner execution did not complete.",
    executeSpsNodeCommand: async options => {
      executions++;
      return executeSpsNodeCommand({ ...options,
        hostEnvironment: { ...process.env, HOME: root, USERPROFILE: root, APPDATA: data, LOCALAPPDATA: data },
        resolveInvocation: async (command, args) => {
          assert.equal(command, "ollama");
          assert.equal(args[0], "--sps-runner-fixture");
          assert.equal(args.length, 3);
          assert.match(args[2], /^[a-f0-9-]{36}$/);
          return { executable, args };
        },
      });
    },
  };
  const main = await readFile(new URL("../src/main.mjs", import.meta.url), "utf8");
  const begin = main.indexOf("async function pollNodeCommands() {");
  const end = main.indexOf("function scheduleCommandPolling()", begin);
  assert.ok(begin >= 0 && end > begin);
  const routine = main.slice(begin, end);
  sandbox.globalThis = sandbox;
  vm.runInNewContext(`${routine}\nglobalThis.runPoll = pollNodeCommands;`, sandbox, { filename: "actual-main-runner-poll.mjs" });
  stage = "poll";
  await sandbox.runPoll();
  stage = "reload";
  state = await loadState(data, { strictVersion: true });
  const count = (value, key) => value ? JSON.parse(decrypt(value))[key].length : 0;
  const claims = count(state.encryptedNodeClaimJournal, "records");
  const completions = count(state.encryptedNodeCompletionOutbox, "receipts");
  const expected = { "claim-loss": [0, 1, 0], "completion-loss": [1, 0, 1],
    recover: [0, 0, 0], success: [1, 0, 0], failure: [1, 0, 0], cancel: [1, 0, 0] }[phase];
  process.stderr.write(`[runner-recovery-check] ${JSON.stringify({ phase, executions, claims, completions,
    commandPollError: nodeRuntimeStatus.commandPollError ?? null })}\n`);
  assert.deepEqual([executions, claims, completions], expected);
  const raw = await readFile(path.join(data, "sps-desktop-state.json"), "utf8");
  assert.equal(raw.includes("PRIVATE KEY"), false);
  assert.equal(raw.includes(identity.privateKeyPem), false);
  clearTimeout(watchdog);
  const report = { runnerRecoveryComponent: true, phase, executions, claims, completions,
    realWindowsSafeStorage: true, actualMainStartup: false, actualMainPollSha256: createHash("sha256").update(routine).digest("hex") };
  await new Promise(resolve => process.stdout.write(`${JSON.stringify(report)}\n`, resolve));
  app.quit();
} catch {
  clearTimeout(watchdog);
  await cancelCommands().catch(() => {});
  await new Promise(resolve => process.stderr.write(`Runner recovery component failed at ${stage}.\n`, resolve));
  app.exit(1);
}
}

// Let Electron finish evaluating its ESM entry before waiting for app.ready.
void run();
