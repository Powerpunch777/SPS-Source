import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";

const read = relative => readFile(new URL(relative, import.meta.url), "utf8");

test("the cross-repository proof smoke requires its explicit isolated mode and stays outside Main", async () => {
  const scriptPath = fileURLToPath(new URL("../scripts/smoke-native-workspace-proof.mjs", import.meta.url));
  await assert.rejects(promisify(execFile)(process.execPath, [scriptPath], {
    windowsHide: true, timeout: 15_000,
  }), failure => {
    assert.equal(failure.code, 2);
    assert.match(failure.stderr, /explicit isolated Native Workspace proof contract command/);
    return true;
  });
  const main = await read("../src/main.mjs");
  assert.doesNotMatch(main, /smoke-native-workspace-proof/);
  const script = await read("../scripts/smoke-native-workspace-proof.mjs");
  assert.match(script, /process\.argv\.length !== 3 \|\| process\.argv\[2\] !== "--isolated-native-workspace-proof"/);
  assert.doesNotMatch(script, /createDb|startEmbeddedPostgresTestDatabase|createServer|\.listen\(/);
  assert.match(script, /createSpsNativeWorkspaceRequestSigner/);
  assert.match(script, /createSpsNativeWorkspaceProofVerifier/);
  assert.ok(script.indexOf("process.exit(2)") < script.indexOf('await import("../src/native-identity-certificates.mjs")'));
  assert.match(script, /new X509Certificate\(member\.certificatePem\)\.raw/);
  assert.match(script, /new X509Certificate\(hostIdentity\.server\.certificatePem\)\.raw/);
});

test("Linux Core verification runs the bounded signer-verifier protocol gate", async () => {
  const workflow = await read("../../../.github/workflows/sps-verify.yml");
  const client = workflow.indexOf("--isolated-native-enrollment-client");
  const member = workflow.indexOf("--isolated-native-member-controller");
  const ingress = workflow.indexOf("--isolated-native-parent-ingress");
  const proof = workflow.indexOf("--isolated-native-workspace-proof");
  assert.ok(client >= 0 && member > client && ingress > member && proof > ingress);
  assert.match(workflow, /Verify Main TLS and parent IPC enrollment[^\r\n]*/);
  const step = workflow.slice(workflow.lastIndexOf("      - name:", proof), workflow.indexOf("\n  room-plugin:", proof));
  assert.match(step, /timeout-minutes: 3/);
  assert.match(workflow, /pnpm --filter @paperclipai\/db exec tsx \.\.\/\.\.\/\.\.\/\.\.\/sps-server\/desktop\/scripts\/smoke-native-workspace-proof\.mjs --isolated-native-workspace-proof/);
});

test("the Workspace channel gate uses real Core authorization and requires explicit isolated startup", async () => {
  const script = await read("../scripts/smoke-native-workspace-channel.mjs");
  const child = await read("../scripts/fixtures/native-workspace-channel-child.mjs");
  const workflow = await read("../../../.github/workflows/sps-verify.yml");
  const main = await read("../src/main.mjs");
  assert.doesNotMatch(main, /smoke-native-workspace-channel/);
  assert.match(script, /process\.argv\[2\] !== "--isolated-native-workspace-channel"/);
  for (const evidence of ["startEmbeddedPostgresTestDatabase", "attachSpsNativeWorkspaceParentChannel",
    "createSpsNativeHostIngress", "devices.revoke", "await database.cleanup()", 'minVersion: "TLSv1.3"']) {
    assert.ok(script.includes(evidence), evidence);
  }
  assert.match(child, /createSpsNativeWorkspaceChannel/);
  const position = workflow.indexOf("      - name: Verify Native Workspace TLS and owned Core channel");
  assert.ok(position > 0);
  const step = workflow.slice(position, workflow.indexOf("\n  room-plugin:", position));
  assert.match(step, /timeout-minutes: 5/);
  assert.match(step, /smoke-native-workspace-channel\.mjs --isolated-native-workspace-channel/);
  assert.doesNotMatch(step, /continue-on-error|\|\| true/);
});
