import { mkdir, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";

const runtimeRoot = path.resolve(process.env.SPS_HOST_RUNTIME_ROOT || "");
const electronBinary = path.resolve(process.env.SPS_HOST_ELECTRON_BINARY || "");

if (!runtimeRoot || runtimeRoot === path.resolve(".")) {
  throw new Error("Set SPS_HOST_RUNTIME_ROOT to the packaged SPS Host runtime.");
}
if (!electronBinary || electronBinary === path.resolve(".")) {
  throw new Error("Set SPS_HOST_ELECTRON_BINARY to the SPS Desktop executable.");
}

const temporaryRoot = path.join(os.tmpdir(), `sps-host-smoke-${process.pid}-${Date.now()}`);
const configPath = path.join(temporaryRoot, "config.json");
const port = 31_207;
const databasePort = 54_337;

const config = {
  $meta: { version: 1, updatedAt: new Date().toISOString(), source: "onboard" },
  database: {
    mode: "embedded-postgres",
    embeddedPostgresDataDir: path.join(temporaryRoot, "db"),
    embeddedPostgresPort: databasePort,
  },
  logging: { mode: "file", logDir: path.join(temporaryRoot, "logs") },
  server: {
    deploymentMode: "local_trusted",
    exposure: "private",
    bind: "loopback",
    host: "127.0.0.1",
    port,
    allowedHostnames: [],
    serveUi: true,
  },
  auth: { baseUrlMode: "auto", disableSignUp: false },
  telemetry: { enabled: false },
  storage: { provider: "local_disk", localDisk: { baseDir: path.join(temporaryRoot, "storage") } },
  secrets: {
    provider: "local_encrypted",
    strictMode: false,
    localEncrypted: { keyFilePath: path.join(temporaryRoot, "secrets", "master.key") },
  },
};

async function waitForHealth() {
  for (let attempt = 0; attempt < 360; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
        signal: AbortSignal.timeout(1_000),
      });
      const body = await response.json();
      if (response.ok && body?.status === "ok") return body;
    } catch {
      // The embedded database and HTTP server need a short first-start window.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("The packaged SPS Host did not become healthy within 180 seconds.");
}

await mkdir(temporaryRoot, { recursive: true });
await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

const child = spawn(
  electronBinary,
  ["--import", "tsx", "-e", "await import('./dist/index.js')", "run", "--instance", "smoke", "--config", configPath],
  {
    cwd: runtimeRoot,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", PAPERCLIP_TELEMETRY_DISABLED: "1" },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  },
);

let output = "";
child.stdout.on("data", (chunk) => { output += chunk.toString(); });
child.stderr.on("data", (chunk) => { output += chunk.toString(); });
const childExited = new Promise((resolve) => child.once("exit", resolve));

let passed = false;
try {
  const health = await waitForHealth();
  passed = true;
  console.log(`Packaged SPS Host smoke test passed on http://127.0.0.1:${port} (${health.status}).`);
} finally {
  if (child.exitCode == null) child.kill();
  await Promise.race([
    childExited,
    new Promise((resolve) => setTimeout(resolve, 3_000)),
  ]);
  if (child.exitCode && child.exitCode !== 0) {
    console.warn(`Packaged Host exited with ${child.exitCode}: ${output.slice(-2_000)}`);
  } else if (!passed) {
    console.warn(`Packaged Host did not become healthy: ${output.slice(-2_000)}`);
  }
  if (passed || process.env.SPS_HOST_SMOKE_KEEP !== "1") {
    await rm(temporaryRoot, { recursive: true, force: true });
  } else {
    console.warn(`Preserved failed smoke data at ${temporaryRoot}`);
  }
}
