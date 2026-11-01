import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { resolveDesktopDevelopmentNodeCommand } from "../src/development-mode.mjs";

test("uses the actual Node executable without a PATH lookup or an Electron fallback", async () => {
  assert.equal(resolveDesktopDevelopmentNodeCommand({ command: process.execPath }), await realpath(process.execPath));
});

test("resolves an ordinary file symlink to the path actually used for launch", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sps-development-node-"));
  try {
    const executable = path.join(root, process.platform === "win32" ? "node.exe" : "node");
    const link = path.join(root, process.platform === "win32" ? "node-link.exe" : "node-link");
    await writeFile(executable, "ordinary file", "utf8");
    try {
      await symlink(executable, link, "file");
    } catch (error) {
      if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) {
        t.skip(`File symlinks are unavailable on this host (${error.code}).`);
        return;
      }
      throw error;
    }

    assert.equal(resolveDesktopDevelopmentNodeCommand({ command: link }), await realpath(executable));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("leaves packaged and unspecified development Node commands unset", () => {
  assert.equal(resolveDesktopDevelopmentNodeCommand({ packaged: true, command: "invalid" }), undefined);
  assert.equal(resolveDesktopDevelopmentNodeCommand({}), undefined);
  assert.equal(resolveDesktopDevelopmentNodeCommand({ command: undefined }), undefined);
});

test("rejects malformed, relative, noncanonical, missing, and directory commands", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sps-development-node-invalid-"));
  try {
    const directory = path.join(root, "folder");
    await mkdir(directory);
    const missing = path.join(root, process.platform === "win32" ? "missing.exe" : "missing");
    const noncanonical = `${root}${path.sep}folder${path.sep}..${path.sep}${process.platform === "win32" ? "missing.exe" : "missing"}`;
    for (const command of [null, 1, "", "node", "./node", "bad\npath", "bad\0path", noncanonical, missing, directory]) {
      assert.throws(() => resolveDesktopDevelopmentNodeCommand({ command }), undefined, String(command));
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("launcher pins its running Node executable after inherited environment values", async () => {
  const source = await readFile(new URL("../scripts/dev-desktop.mjs", import.meta.url), "utf8");
  assert.match(source, /\.\.\.process\.env,[\s\S]*?SPS_DESKTOP_DEV:\s*"1",[\s\S]*?SPS_DESKTOP_DEVELOPMENT_NODE:\s*process\.execPath/);
  assert.doesNotMatch(source, /SPS_DESKTOP_DEVELOPMENT_NODE:\s*["']node(?:\.exe)?["']/);
  const fixture = await readFile(new URL("../scripts/smoke-workspace-surfaces-desktop.mjs", import.meta.url), "utf8");
  assert.match(fixture, /\.\.\.process\.env,\s*\.\.\.\(packagedBinary \? \{\} : \{ SPS_DESKTOP_DEVELOPMENT_NODE: process\.execPath \}\)/);
});
