import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { createWorkspaceE2eChildTracker } from "./workspace-e2e-child-tracker.mjs";
import { createRunnerRecoveryReferencePackage } from "./runner-recovery-reference-package.mjs";
import { runnerRecoveryArguments } from "./runner-recovery-launch.mjs";

const desktop = path.resolve(import.meta.dirname, "..");
const exec = promisify(execFile);
const terminal = value => ["succeeded", "failed", "cancelled"].includes(value.status);

/** Real Core/SDK + isolated Electron/DPAPI + native Job-owned fixture CLI.
 * Main's actual poll routine is executed, but this is not Main startup/Member UI,
 * a real model/provider CLI, a physical remote computer, or SMB qualification.
 */
export async function runRunnerRecoveryAcceptance({ call, temporaryRoot, unrelatedCompanyId }) {
  assert.equal(process.platform, "win32");
  const container = path.join(temporaryRoot, "runner-recovery");
  await mkdir(container);
  const bin = path.join(container, "bin");
  await mkdir(bin);
  const executable = path.join(bin, "ollama.exe");
  const compiler = path.join(process.env.WINDIR, "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe");
  await exec(compiler, ["/nologo", "/platform:x64", "/target:exe", `/out:${executable}`,
    path.join(desktop, "scripts", "windows-e2e", "HarmlessRunnerFixture.cs")],
  { shell: false, windowsHide: true, timeout: 30_000, maxBuffer: 1024 * 1024 });
  const company = await call("/api/companies", { method: "POST", body: { name: "Isolated Runner recovery" } });
  const fixture = await createRunnerRecoveryReferencePackage(path.join(container, "reference-plugin"));
  await call("/api/plugins/install", { method: "POST", body: { packageName: fixture.directory, isLocalPath: true } });
  const plugin = (await call("/api/plugins")).find(row => row.pluginKey === fixture.manifest.id);
  assert.equal(plugin?.status, "ready");
  for (const companyId of [company.id, unrelatedCompanyId]) {
    await call(`/api/plugins/${plugin.id}/companies/${companyId}/activation`, { method: "PUT", body: { enabled: true } });
  }
  const data = async (key, params = {}, companyId = company.id) => (await call(`/api/plugins/${plugin.id}/data/${key}`,
    { method: "POST", body: { companyId, params } })).data;
  const action = async (key, params) => (await call(`/api/plugins/${plugin.id}/actions/${key}`,
    { method: "POST", body: { companyId: company.id, params } })).data;
  const nodes = new Map();
  const token = randomBytes(32).toString("hex");
  let bridgeFailure;
  const observer = { lostClaim: null, replayClaim: null, lostCompletion: null, replayCompletion: null, cancelled: null };
  const reply = (res, value) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(value)); };
  const bridge = createServer(async (req, res) => {
    try {
      assert.equal(req.method, "POST");
      assert.equal(req.url, `/runner-recovery/${token}`);
      let raw = "";
      for await (const chunk of req) {
        raw += chunk;
        assert.ok(Buffer.byteLength(raw) <= 256 * 1024);
      }
      const message = JSON.parse(raw);
      assert.ok(["runner-a", "runner-b"].includes(message.role));
      if (message.kind === "register") {
        assert.equal(nodes.has(message.role), false);
        const node = await call(`/api/companies/${company.id}/sps-nodes`, { method: "POST", body: {
          displayName: `Isolated ${message.role}`, publicKey: message.publicKey,
          transportPublicKey: message.transportPublicKey, platform: "win32", appVersion: "0.4.137",
          capabilities: [{ kind: "ollama", label: "Harmless fixture CLI" }],
        } });
        nodes.set(message.role, { id: node.id, publicKey: message.publicKey, grant: null, run: null, mode: null,
          claims: [], completions: [], outputs: [], phases: new Set() });
        return reply(res, { nodeId: node.id, companyId: company.id });
      }
      const node = nodes.get(message.role);
      assert.ok(node);
      if (message.kind === "approve") {
        const approved = await call(`/api/sps-nodes/${node.id}/approve`, { method: "POST", body: {} });
        assert.equal(approved.status, "active");
        return reply(res, { status: approved.status });
      }
      if (message.kind === "ready") {
        assert.equal(node.phases.has(message.phase), false);
        node.phases.add(message.phase);
        if (["claim-loss", "success", "failure", "cancel"].includes(message.phase)) {
          const runners = await data("runner-list");
          const runner = runners.find(row => row.nodeId === node.id && row.kind === "ollama");
          assert.ok(runner?.id);
          node.grant = await action("grant-upsert", { subjectKey: `runner-${message.role}`, nodeId: node.id,
            runnerProfileId: runner.id, workspaceSourceId: null });
          node.mode = message.phase === "cancel" ? "hold" : message.phase === "failure" ? "failure" : "success";
          node.nonce = randomUUID();
          node.run = await action("run-dispatch", { executionGrantId: node.grant.id,
            args: ["--sps-runner-fixture", node.mode, node.nonce], timeoutMs: 20_000 });
          assert.equal(node.run.status, "queued");
        }
        return reply(res, { ready: true });
      }
      assert.equal(message.kind, "request");
      assert.equal(message.method, "POST");
      const prefix = `/api/sps-nodes/${node.id}/`;
      assert.ok(message.path.startsWith(prefix));
      const suffix = message.path.slice(prefix.length);
      assert.match(suffix, /^(?:heartbeat|claim-protocol|(?:commands|plugin-runs)\/claim-next|plugin-runs\/[a-f0-9-]{36}\/(?:events|lease|complete))$/);
      const value = await call(message.path, { method: message.method, body: message.body });
      if (suffix === "plugin-runs/claim-next" && value?.work) {
        assert.equal(value.work.id, node.run.id);
        node.claims.push({ phase: message.phase, requestId: message.body.claimRequestId, runId: value.work.id });
        if (message.phase === "claim-loss") {
          assert.equal(observer.lostClaim, null);
          observer.lostClaim = node.claims.at(-1);
          res.writeHead(200, { "content-type": "application/json" });
          return res.end('{"truncated":');
        }
        if (message.phase === "completion-loss") observer.replayClaim = node.claims.at(-1);
      }
      if (suffix.endsWith("/events")) {
        node.outputs.push({ runId: node.run.id, nonce: node.nonce, sequence: message.body.sequence,
          stream: message.body.stream, body: message.body.body });
        if (message.phase === "cancel" && message.body.stream === "stdout" && message.body.body.includes(node.nonce)) {
          assert.equal(observer.cancelled, null);
          observer.cancelled = await action("run-cancel", { runId: node.run.id });
        }
      }
      if (suffix.endsWith("/complete")) {
        const completion = { phase: message.phase, runId: node.run.id, nonce: message.body.nonce,
          status: value.status, digest: value.completionReceiptDigest,
          exitCode: message.body.exitCode, timedOut: message.body.timedOut };
        node.completions.push(completion);
        if (message.phase === "completion-loss") {
          // The executor can retry its final report within this same process.
          // Lose every response in this phase, not only the first attempt.
          if (observer.lostCompletion) {
            assert.equal(completion.runId, observer.lostCompletion.runId);
            assert.equal(completion.digest, observer.lostCompletion.digest);
          } else observer.lostCompletion = completion;
          res.writeHead(200, { "content-type": "application/json" });
          return res.end('{"truncated":');
        }
        if (message.phase === "recover") observer.replayCompletion = completion;
      }
      reply(res, value);
    } catch (error) {
      bridgeFailure ??= error;
      if (!res.headersSent) res.writeHead(500, { "content-type": "application/json" });
      res.end('{"error":"Runner recovery bridge rejected the operation."}');
    }
  });
  await new Promise(resolve => bridge.listen(0, "127.0.0.1", resolve));
  const endpoint = `http://127.0.0.1:${bridge.address().port}/runner-recovery/${token}`;
  const tracker = createWorkspaceE2eChildTracker();
  const reports = [];
  const phase = async (role, name) => {
    const root = path.join(container, role);
    await mkdir(root, { recursive: true });
    const env = { ...process.env, SPS_DESKTOP_E2E: "1" };
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.NODE_OPTIONS;
    const child = spawn(path.join(desktop, "node_modules", "electron", "dist", "electron.exe"),
      runnerRecoveryArguments({ entry: path.join(desktop, "scripts", "runner-recovery-electron.mjs"),
        root, phase: name, executable, endpoint }),
      { cwd: desktop, env, shell: false, windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"] });
    tracker.track(child);
    let output = "", errors = "";
    child.stdout.on("data", chunk => { output += chunk; });
    child.stderr.on("data", chunk => { errors += chunk; });
    const result = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Runner recovery Electron did not finish within its observation bound.")), 55_000);
      child.once("error", error => { clearTimeout(timer); reject(error); });
      child.once("close", (code, signal) => { clearTimeout(timer); resolve({ code, signal }); });
    });
    if (bridgeFailure) throw bridgeFailure;
    assert.deepEqual(result, { code: 0, signal: null }, `Runner component ${name} did not exit normally: ${errors.slice(-800)}`);
    const lines = output.split(/\r?\n/).filter(line => line.startsWith('{"runnerRecoveryComponent":'));
    assert.equal(lines.length, 1);
    const report = JSON.parse(lines[0]);
    assert.equal(report.phase, name);
    assert.equal(report.realWindowsSafeStorage, true);
    assert.equal(report.actualMainStartup, false);
    assert.match(report.actualMainPollSha256, /^[a-f0-9]{64}$/);
    reports.push(report);
    return report;
  };
  try {
    await phase("runner-a", "claim-loss");
    const a = nodes.get("runner-a");
    assert.ok(observer.lostClaim);
    assert.equal(a.outputs.length, 0);
    await phase("runner-a", "completion-loss");
    assert.equal(observer.lostClaim.requestId, observer.replayClaim.requestId);
    assert.equal(observer.lostClaim.runId, observer.replayClaim.runId);
    assert.ok(observer.lostCompletion?.digest);
    assert.equal((await data("run-get", { runId: a.run.id })).status, "succeeded");
    const outputCount = a.outputs.length;
    await phase("runner-a", "recover");
    assert.equal(observer.lostCompletion.digest, observer.replayCompletion.digest);
    assert.notEqual(observer.lostCompletion.nonce, observer.replayCompletion.nonce);
    assert.equal(a.outputs.length, outputCount, "Final-report recovery replayed the CLI output");
    await phase("runner-b", "success");
    const b = nodes.get("runner-b");
    assert.notEqual(a.id, b.id);
    assert.notEqual(a.publicKey, b.publicKey);
    assert.notEqual(a.grant.runnerProfileId, b.grant.runnerProfileId);
    assert.equal((await data("run-get", { runId: b.run.id })).status, "succeeded");
    await assert.rejects(data("run-get", { runId: a.run.id }, unrelatedCompanyId), /not found|scope|company|Workspace/i);
    await phase("runner-b", "failure");
    assert.equal((await data("run-get", { runId: b.run.id })).status, "failed");
    assert.equal(b.completions.at(-1).exitCode, 7);
    assert.equal(b.completions.at(-1).timedOut, false);
    await phase("runner-b", "cancel");
    assert.ok(observer.cancelled);
    const stopped = await data("run-get", { runId: b.run.id });
    assert.ok(terminal(stopped));
    assert.equal(stopped.status, "cancelled");
    assert.equal(b.completions.at(-1).timedOut, false, "Cancellation must not be a command timeout");
    assert.notEqual(b.completions.at(-1).exitCode, 9, "The held fixture must not finish on its own");
    for (const node of nodes.values()) {
      const runs = Map.groupBy(node.outputs, row => row.runId);
      for (const [runId, outputs] of runs) {
        const stdout = outputs.filter(row => row.stream === "stdout").map(row => row.body).join("");
        const messages = stdout.split(/\r?\n/).filter(Boolean).map(row => JSON.parse(row));
        assert.equal(messages.filter(row => row.phase === "started").length, 1, "Fixture process started more than once");
        assert.ok(messages.every(row => row.fixture === 1 && row.nonce === outputs[0].nonce));
        assert.equal(messages.filter(row => row.phase === "finished").length, runId === b.run.id ? 0 : 1);
      }
    }
    const evidence = await tracker.waitForOutputEnd(5000);
    assert.deepEqual(evidence, { children: 6, exited: 6, orderly: 6, outputEnded: 12, outputFailed: 0 });
    assert.equal(new Set(reports.map(row => row.actualMainPollSha256)).size, 1);
    console.log(JSON.stringify({ runnerRecoveryAcceptance: "passed", actualCoreSdk: true,
      windowsSafeStorageAcrossRestarts: true, independentNodeIdentities: 2,
      actualNativeFixtureExecutions: 4, claimResponseLossRecovered: true, completionResponseLossRecovered: true,
      nonzeroProcessFailureConfirmed: true,
      duplicatedExecution: false, nativeCancellationConfirmed: true,
      actualMainPollSha256: reports[0].actualMainPollSha256,
      actualMainStartup: false, physicalComputersQualified: false, providerCliQualified: false,
      fixtureCliSha256: createHash("sha256").update(await readFile(executable)).digest("hex"), ...evidence }));
  } finally {
    await new Promise(resolve => { bridge.close(resolve); bridge.closeAllConnections(); });
    // The surrounding owned Job must still reject any live or forced cleanup.
    tracker.dispose();
  }
}
