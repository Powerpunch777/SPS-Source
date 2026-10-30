import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { mkdtemp, mkdir, symlink, rm, realpath } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import os from "node:os";
import { assertHostedInstallerCi, assertPlainDirectory, assertContained, nsisInvocation } from "../scripts/installer-ci-safety.mjs";

const authorized = { platform: "win32", env: { GITHUB_ACTIONS: "true", RUNNER_OS: "Windows", RUNNER_ENVIRONMENT: "github-hosted" }, args: ["--owned-job-cleanup-pending"] };
test("installer invocation refuses local/self-hosted/unowned contexts before any OS mutation", () => {
  assert.doesNotThrow(() => assertHostedInstallerCi(authorized));
  for (const key of Object.keys(authorized.env)) {
    assert.throws(() => assertHostedInstallerCi({ ...authorized, env: { ...authorized.env, [key]: undefined } }), /owned GitHub-hosted/);
  }
  assert.throws(() => assertHostedInstallerCi({ ...authorized, env: { ...authorized.env, RUNNER_ENVIRONMENT: "self-hosted" } }), /owned GitHub-hosted/);
  assert.throws(() => assertHostedInstallerCi({ ...authorized, args: [] }), /owned GitHub-hosted/);
  assert.throws(() => assertHostedInstallerCi({ ...authorized, args: [...authorized.args, "--force-run"] }), /owned GitHub-hosted/);
  assert.throws(() => assertHostedInstallerCi({ ...authorized, platform: "linux" }), /owned GitHub-hosted/);
});
test("NSIS paths with spaces use an exact silent unquoted final tail and never a shell or autorun", () => {
  const executable = "C:\\owned fixture\\candidate.exe", directory = "C:\\owned fixture\\SPS Desktop";
  for (const uninstall of [false, true]) {
    const invocation = nsisInvocation(executable, directory, { uninstall });
    assert.equal(invocation.executable, executable);
    assert.deepEqual(invocation.args, ["/S", "/currentuser", `${uninstall ? "_?=" : "/D="}${directory}`]);
    assert.equal(invocation.options.shell, false);
    assert.equal(invocation.options.argv0, `"${executable}"`);
    assert.equal(invocation.options.windowsVerbatimArguments, true);
  }
  for (const invalid of ["relative.exe", "/rooted-without-drive", 'C:\\bad"path', "C:\\bad\npath", "\\\\server\\share\\app.exe"]) {
    assert.throws(() => nsisInvocation(invalid, directory), /Invalid owned NSIS path/);
    assert.throws(() => nsisInvocation(executable, invalid), /Invalid owned NSIS path/);
  }
});
test("fixture validation rejects escape paths and junction ancestors", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sps-installer-safety-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const plain = path.join(root, "plain");
  await mkdir(plain);
  assert.equal(await assertPlainDirectory(plain), await realpath(plain));
  assert.doesNotThrow(() => assertContained(root, plain));
  assert.throws(() => assertContained(root, root), /escapes/);
  assert.throws(() => assertContained(root, path.resolve(root, "..", "other")), /escapes/);
  const linked = path.join(root, "linked");
  await symlink(plain, linked, process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(() => assertPlainDirectory(linked), /linked or non-directory/);
});
test("the real installer smoke rejects a local invocation without starting an installer", async () => {
  const env = { ...process.env };
  delete env.GITHUB_ACTIONS;
  delete env.RUNNER_ENVIRONMENT;
  delete env.RUNNER_OS;
  await assert.rejects(promisify(execFile)(process.execPath, [fileURLToPath(new URL("../scripts/smoke-installer-data-preservation.mjs", import.meta.url))],
    { env, windowsHide: true, timeout: 30000 }), error => {
    assert.equal(error.code, 1);
    assert.match(error.stderr, /requires the owned GitHub-hosted Windows CI launcher/);
    return true;
  });
});
