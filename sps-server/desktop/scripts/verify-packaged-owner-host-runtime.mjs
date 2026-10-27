import { access, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { materializeSpsOwnerHostRuntimePackage } from "../src/owner-host-runtime-package.mjs";
import { verifyPackagedZodRuntime } from "./verify-packaged-zod-runtime.mjs";
import { spawnWindowsJobSupervisor } from "../../desktop-node/src/windows-job-supervisor.mjs";
import { prepareWindowsHostJob } from "../../desktop-node/src/windows-host-job.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(scriptDirectory, "..");
const desktopVersion = JSON.parse(await readFile(path.join(desktopRoot, "package.json"), "utf8")).version;
const packageRoot = path.join(desktopRoot, "dist", "win-unpacked", "resources", "sps-owner-host-runtime-package");
const runtimeRoot = path.resolve(process.env.SPS_PACKAGED_OWNER_HOST_RUNTIME_ROOT
  || path.join(desktopRoot, "dist", ".verified-owner-host-runtime", desktopVersion));
if (!process.env.SPS_PACKAGED_OWNER_HOST_RUNTIME_ROOT) {
  await materializeSpsOwnerHostRuntimePackage({ packageRoot, targetRuntimeRoot: runtimeRoot });
}

const requiredFiles = [
  "sps-owner-host-runtime.json",
  "sps-release-baseline.json",
  "sps-owner-host-bootstrap.mjs",
  "bin/node.exe",
  "dist/index.js",
  "ui-dist/index.html",
  "memory-sidecar/memory-sidecar.mjs",
  "sps-default-memory/dist/manifest.js",
  "sps-plugin-discovery/dist/manifest.js",
  "sps-room-chat/dist/manifest.js",
  "node_modules/@paperclipai/server/package.json",
  "node_modules/@paperclipai/server/dist/services/default-agent-instructions.js",
  "node_modules/@paperclipai/server/dist/onboarding-assets/default/AGENTS.md",
  "node_modules/@paperclipai/server/dist/onboarding-assets/ceo/AGENTS.md",
  "node_modules/@paperclipai/server/dist/onboarding-assets/ceo/HEARTBEAT.md",
  "node_modules/@paperclipai/server/dist/onboarding-assets/ceo/SOUL.md",
  "node_modules/@paperclipai/server/dist/onboarding-assets/ceo/TOOLS.md",
  "node_modules/@paperclipai/skills-catalog/dist/src/canonical-bytes.js",
  "node_modules/@sps/mcp-server/package.json",
  "node_modules/@sps/mcp-server/dist/marketplace-assistant-stdio.js",
  "node_modules/acpx/node_modules/@agentclientprotocol/sdk/package.json",
  "node_modules/@embedded-postgres/windows-x64/dist/index.js",
  "node_modules/embedded-postgres/dist/index.js",
];

const missing = [];
for (const relativePath of requiredFiles) {
  try {
    await access(path.join(runtimeRoot, relativePath));
  } catch {
    missing.push(relativePath);
  }
}

if (missing.length > 0) {
  throw new Error(
    `The packaged SPS Owner Host runtime is incomplete at ${runtimeRoot}. Missing: ${missing.join(", ")}`,
  );
}

const supervisorPath = path.join(desktopRoot, "dist", "win-unpacked", "resources", "sps-windows-job-supervisor", "SpsWindowsJobSupervisor.exe");
await access(supervisorPath);
const supervisor = spawnWindowsJobSupervisor({
  executable: path.join(runtimeRoot, "bin", "node.exe"),
  args: ["-e", 'process.stdout.write("sps-packaged-job-ok\\n")'],
  cwd: runtimeRoot,
  env: { SYSTEMROOT: process.env.SYSTEMROOT ?? "C:\\Windows", WINDIR: process.env.WINDIR ?? "C:\\Windows" },
}, { helperPath: supervisorPath });
let supervisorOutput = "";
supervisor.stdout.on("data", chunk => { supervisorOutput = (supervisorOutput + chunk.toString("utf8")).slice(-1024); });
supervisor.stderr.resume();
supervisor.stdin.end();
await supervisor.supervisorReady;
const supervisedExit = await supervisor.waitForOwnedJobTermination();
if (supervisedExit.type !== "exit" || supervisedExit.activeProcesses !== 0 || supervisedExit.code !== 0
    || supervisorOutput !== "sps-packaged-job-ok\n") {
  throw new Error("The packaged Windows command supervisor did not confirm a clean owned process tree.");
}
console.log("Verified the packaged Windows Job Object supervisor with the bundled Node runtime.");

const hostGatePath = path.join(desktopRoot, "dist", "win-unpacked", "resources", "sps-owner-host-job", "owner-host-job-gate.mjs");
await access(hostGatePath);
const hostJob = await prepareWindowsHostJob({ helperPath: supervisorPath, gateModulePath: hostGatePath });
let hostProbe;
try {
  hostProbe = hostJob.spawn(path.join(runtimeRoot, "bin", "node.exe"), ["-e", `
    const fs = require('node:fs');
    const { spawn } = require('node:child_process');
    const { Worker } = require('node:worker_threads');
    if (Object.keys(process.env).some(key => key.startsWith('SPS_OWNER_HOST_JOB_'))
      || process.execArgv.some(value => value.includes('owner-host-job-gate.mjs'))) process.exit(71);
    process.on('message', message => {
      if (message?.kind !== 'sps.packaged.host-job.ping') return process.exit(72);
      const descendant = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
      descendant.unref();
      const worker = new Worker("require('node:worker_threads').parentPort.postMessage('ok')", { eval: true });
      worker.once('message', value => process.send({ kind: 'sps.packaged.host-job.pong', worker: value }));
    });
    let shutdown = '';
    const stop = fs.createReadStream(null, { fd: 4, autoClose: true });
    stop.setEncoding('utf8');
    stop.on('data', chunk => { shutdown += chunk; });
    stop.once('end', () => {
      if (shutdown !== 'sps.owner-host.shutdown/v1\\n') return process.exit(73);
      process.disconnect();
      process.exit(0);
    });
  `], {
    cwd: runtimeRoot, windowsHide: true, shell: false,
    stdio: ["ignore", "pipe", "pipe", "ipc", "pipe"],
    env: { SYSTEMROOT: process.env.SYSTEMROOT ?? "C:\\Windows", WINDIR: process.env.WINDIR ?? "C:\\Windows" },
  });
  hostProbe.stdout.resume(); hostProbe.stderr.resume();
  let timer;
  const pong = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error("Packaged Owner Host IPC verification timed out.")), 15_000);
    hostProbe.once("message", message => {
      if (message?.kind === "sps.packaged.host-job.pong" && message.worker === "ok") resolve();
      else reject(new Error("Packaged Owner Host IPC verification returned an invalid result."));
    });
    hostProbe.once("error", () => reject(new Error("Packaged Owner Host probe could not start.")));
  });
  void pong.catch(() => {});
  try {
    await hostProbe.supervisorReady;
    hostProbe.send({ kind: "sps.packaged.host-job.ping" });
    await pong;
  } finally { clearTimeout(timer); }
  hostProbe.stdio[4].end("sps.owner-host.shutdown/v1\n");
  const hostExit = await hostProbe.waitForOwnedJobTermination();
  if (hostExit.type !== "exit" || hostExit.activeProcesses !== 0 || hostExit.code !== 0) {
    throw new Error("The packaged Owner Host did not confirm its owned process tree exit.");
  }
} finally {
  await hostJob.dispose();
}
console.log("Verified packaged Owner Host job admission, Node IPC, worker preload isolation and private shutdown pipe.");

const packagedZod = await verifyPackagedZodRuntime(runtimeRoot);
console.log(`Verified packaged Core Zod ${packagedZod.version} issue budget (${packagedZod.issueLimit} records).`);
const [runtimeManifest, releaseBaseline, windowsPostgresModule, embeddedPostgresModule] = await Promise.all([
  readFile(path.join(runtimeRoot, "sps-owner-host-runtime.json"), "utf8").then(JSON.parse),
  readFile(path.join(runtimeRoot, "sps-release-baseline.json"), "utf8").then(JSON.parse),
  readFile(path.join(runtimeRoot, "node_modules", "@embedded-postgres", "windows-x64", "dist", "index.js"), "utf8"),
  readFile(path.join(runtimeRoot, "node_modules", "embedded-postgres", "dist", "index.js"), "utf8"),
]);

if (
  runtimeManifest.format < 8
  || runtimeManifest.releaseBaseline?.desktopVersion !== releaseBaseline.desktopVersion
  || runtimeManifest.releaseBaseline?.core?.revision !== releaseBaseline.core?.revision
) {
  throw new Error("The packaged SPS Owner Host runtime is missing a matching release baseline.");
}

if (!Array.isArray(runtimeManifest.agentRuntimePacks) || runtimeManifest.agentRuntimePacks.length < 2) {
  throw new Error("The packaged SPS Owner Host runtime is missing its explicit Agent Runtime pack contract.");
}

if (
  !runtimeManifest.acpxRuntimeCompatibility?.acpxVersion
  || !runtimeManifest.acpxRuntimeCompatibility?.sdkVersion
  || runtimeManifest.acpxRuntimeCompatibility?.sdkPackage
    !== "node_modules/acpx/node_modules/@agentclientprotocol/sdk/package.json"
) {
  throw new Error("The packaged SPS Owner Host runtime is missing its ACPX dependency closure contract.");
}

await new Promise((resolve, reject) => {
  const child = spawn(path.join(runtimeRoot, "bin", "node.exe"), [
    "--input-type=module",
    "--eval",
    [
      "import assert from 'node:assert/strict';",
      "await import('acpx/runtime');",
      "const { loadDefaultAgentInstructionsBundle } = await import('./node_modules/@paperclipai/server/dist/services/default-agent-instructions.js');",
      "for (const [role, expected] of [['default', ['AGENTS.md']], ['ceo', ['AGENTS.md', 'HEARTBEAT.md', 'SOUL.md', 'TOOLS.md']]]) {",
      "  const bundle = await loadDefaultAgentInstructionsBundle(role);",
      "  assert.deepEqual(Object.keys(bundle), expected);",
      "  assert.ok(Object.values(bundle).every(text => typeof text === 'string' && text.trim().length > 0));",
      "}",
    ].join("\n"),
  ], {
    cwd: runtimeRoot,
    stdio: ["ignore", "ignore", "pipe"],
    windowsHide: true,
  });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.once("error", reject);
  child.once("exit", (code) => {
    if (code === 0) resolve();
    else reject(new Error(`The packaged SPS Owner Host ACPX or Agent instructions runtime cannot load (${code}): ${stderr.trim()}`));
  });
});

if (
  runtimeManifest.windowsPostgresUnicodePathCompatibility?.version !== "18.1.0-beta.16"
  || !windowsPostgresModule.includes("SPS_EMBEDDED_POSTGRES_BINARY_DIR")
) {
  throw new Error("The packaged SPS Owner Host runtime is missing Windows PostgreSQL Unicode-path compatibility.");
}

if (!embeddedPostgresModule.includes("if (platform() === 'win32') return;")
  || embeddedPostgresModule.split("yield ensureBinIsExecutable(postgres);").length !== 3
  || !embeddedPostgresModule.includes("yield ensureBinIsExecutable(initdb);")) {
  throw new Error("The packaged SPS Owner Host runtime is missing Windows-safe PostgreSQL executable-mode handling.");
}

console.log(`Packaged SPS Owner Host runtime verification passed: ${runtimeRoot}`);
