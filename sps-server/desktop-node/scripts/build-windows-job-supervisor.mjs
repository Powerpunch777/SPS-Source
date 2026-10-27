import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { access, mkdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform !== "win32") throw new Error("The Windows Job Object helper must be built on Windows.");

const run = promisify(execFile);
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(packageRoot, "native", "windows-job-supervisor", "WindowsJobSupervisor.cs");
const output = path.join(packageRoot, "native", "windows-job-supervisor", "bin", "SpsWindowsJobSupervisor.exe");
const compiler = path.join(process.env.WINDIR ?? "C:\\Windows", "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe");
await access(source);
await access(compiler);
await mkdir(path.dirname(output), { recursive: true });
await run(compiler, [
  "/nologo", "/optimize+", "/platform:x64", "/target:exe", "/reference:System.Web.Extensions.dll",
  `/out:${output}`, source,
], { windowsHide: true, timeout: 30000, maxBuffer: 16384 });
const bytes = await readFile(output);
if (bytes.length < 4096) throw new Error("Windows command supervisor build output is incomplete.");
console.log(JSON.stringify({ artifact: "SpsWindowsJobSupervisor.exe", bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") }));
