import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { lstat, mkdtemp, readFile, rm } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";

if (process.platform !== "win32") throw new Error("This development canary requires Windows.");
const run = promisify(execFile);
async function assertDirectoryAncestors(directory) {
  let current = path.resolve(directory);
  for (;;) {
    const stat = await lstat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Canary helper storage must not use linked directories.");
    const parent = path.dirname(current);
    if (parent === current) return;
    current = parent;
  }
}
const source = path.join(import.meta.dirname, "AppContainerCanary.cs");
await assertDirectoryAncestors(os.tmpdir());
const build = await mkdtemp(path.join(os.tmpdir(), "sps-appcontainer-helper-"));
const id = randomUUID().replaceAll("-", "");
const executable = path.join(build, "AppContainerCanary.exe");
const compiler = path.join(process.env.WINDIR ?? "C:\\Windows", "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe");
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
let attempted = false;
let cleaned = false;
try {
  await run(compiler, ["/nologo", "/optimize+", "/platform:x64", `/out:${executable}`, source], { windowsHide: true, timeout: 30000 });
  let output;
  attempted = true;
  try { output = await run(executable, ["--run", id], { windowsHide: true, timeout: 120000, maxBuffer: 16384 }); }
  catch (error) { if (error.stdout) output = { stdout: error.stdout }; else throw error; }
  const result = JSON.parse(output.stdout.trim());
  cleaned = result.cleanupSucceeded === true;
  console.log(JSON.stringify({ ...result, helperSourceSha256: hash(await readFile(source)), helperBinarySha256: hash(await readFile(executable)), operatingSystem: os.release() }, null, 2));
  if (result.passed !== true || result.cleanupSucceeded !== true) process.exitCode = 2;
} finally {
  if (attempted && !cleaned) {
    const recovery = await run(executable, ["--cleanup", id], { windowsHide: true, timeout: 30000, maxBuffer: 16384 });
    if (JSON.parse(recovery.stdout.trim()).cleanupSucceeded !== true) throw new Error("Canary cleanup requires attention; no success claimed.");
  }
  if (path.dirname(build) !== path.resolve(os.tmpdir()) || !path.basename(build).startsWith("sps-appcontainer-helper-")) throw new Error("Invalid canary cleanup target.");
  await assertDirectoryAncestors(build);
  await rm(build, { recursive: true, force: true });
}
