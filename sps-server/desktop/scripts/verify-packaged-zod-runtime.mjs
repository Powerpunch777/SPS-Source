import assert from "node:assert/strict";
import { lstat, readFile, realpath } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const EXPECTED_ZOD_VERSION = "3.25.76";
const ISSUE_LIMIT = 100;
const OVERFLOW_MESSAGE = "Too many validation issues; additional issues omitted.";
const VERIFY_CHILD_ARGUMENT = "--verify-packaged-zod-child";

function assertInside(root, target, label) {
  const relative = path.relative(root, target);
  assert.ok(relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative), `${label} resolves outside the packaged runtime`);
}

async function verifyInFreshProcess(runtimeRoot) {
  const serverPackage = path.join(runtimeRoot, "node_modules", "@paperclipai", "server", "package.json");
  const serverReal = await realpath(serverPackage);
  assertInside(runtimeRoot, serverReal, "Core server package");
  const serverManifest = JSON.parse(await readFile(serverReal, "utf8"));
  if (serverManifest.name !== "@paperclipai/server") {
    throw new Error(`Packaged Core server manifest has unexpected package name: ${serverManifest.name ?? "unknown"}.`);
  }
  const serverRequire = createRequire(serverReal);
  const zodManifestPath = await realpath(serverRequire.resolve("zod/package.json"));
  assertInside(runtimeRoot, zodManifestPath, "Core server Zod dependency");
  const zodManifest = JSON.parse(await readFile(zodManifestPath, "utf8"));
  if (zodManifest.name !== "zod" || zodManifest.version !== EXPECTED_ZOD_VERSION) {
    throw new Error(`Packaged Core server must resolve Zod ${EXPECTED_ZOD_VERSION}; found ${zodManifest.name ?? "unknown"}@${zodManifest.version ?? "unknown"}.`);
  }
  const zodRoot = path.dirname(zodManifestPath);
  const [rootEsm, v3Esm] = await Promise.all([
    import(pathToFileURL(path.join(zodRoot, "index.js")).href),
    import(pathToFileURL(path.join(zodRoot, "v3", "index.js")).href),
  ]);
  const rootCjs = serverRequire("zod");
  const v3Cjs = serverRequire("zod/v3");
  const entries = [["root ESM", rootEsm.z], ["v3 ESM", v3Esm.z], ["root CommonJS", rootCjs.z], ["v3 CommonJS", v3Cjs.z]];
  for (const [label, z] of entries) {
    if (!z || typeof z.array !== "function" || typeof z.string !== "function") {
      throw new Error(`Packaged Core server Zod ${label} entrypoint is not usable.`);
    }
    const valid = z.array(z.string()).safeParse(["valid", "input"]);
    if (!valid.success || valid.data.length !== 2) {
      throw new Error(`Packaged Core server Zod ${label} entrypoint rejected valid input.`);
    }
    const invalid = z.array(z.string()).safeParse(Array.from({ length: 250 }, () => 1));
    if (invalid.success || invalid.error.issues.length !== ISSUE_LIMIT
      || invalid.error.issues.at(-1)?.code !== "custom"
      || invalid.error.issues.at(-1)?.message !== OVERFLOW_MESSAGE) {
      throw new Error(`Packaged Core server Zod ${label} entrypoint does not enforce the ${ISSUE_LIMIT}-issue budget.`);
    }

    function trackedArray() {
      let reads = 0;
      const value = new Array(250);
      for (let index = 0; index < value.length; index++) {
        Object.defineProperty(value, String(index), { configurable: true, enumerable: true,
          get() { reads++; return 1; } });
      }
      return { value, reads: () => reads };
    }
    for (const [constraint, schema] of [
      ["max", z.array(z.string()).max(10)],
      ["exact length", z.array(z.string()).length(10)],
    ]) {
      const tracked = trackedArray();
      const result = schema.safeParse(tracked.value);
      if (result.success || tracked.reads() !== 0
        || !result.error.issues.some(issue => issue.code === "too_big" && issue.type === "array")) {
        throw new Error(`Packaged Core server Zod ${label} entrypoint read array elements before rejecting the over-limit ${constraint}.`);
      }
    }

    const trackedSet = (() => {
      let reads = 0;
      class TrackedSet extends Set {
        values() { reads++; return super.values(); }
      }
      return { value: new TrackedSet(Array.from({ length: 250 }, (_, index) => `value-${index}`)), reads: () => reads };
    })();
    const setResult = z.set(z.string()).max(10).safeParse(trackedSet.value);
    if (setResult.success || trackedSet.reads() !== 0
      || !setResult.error.issues.some(issue => issue.code === "too_big" && issue.type === "set")) {
      throw new Error(`Packaged Core server Zod ${label} entrypoint iterated Set values before rejecting an over-limit Set.`);
    }

    const asyncTracked = trackedArray();
    let transformCalls = 0;
    const asyncResult = await z.array(z.string().transform(async value => {
      transformCalls++;
      return value;
    })).max(10).safeParseAsync(asyncTracked.value);
    if (asyncResult.success || asyncTracked.reads() !== 0 || transformCalls !== 0
      || !asyncResult.error.issues.some(issue => issue.code === "too_big" && issue.type === "array")) {
      throw new Error(`Packaged Core server Zod ${label} entrypoint executed an async child transform before rejecting an over-limit array.`);
    }
  }
  return { version: zodManifest.version, issueLimit: ISSUE_LIMIT, entrypoints: entries.map(([label]) => label) };
}

export async function verifyPackagedZodRuntime(runtimeRoot) {
  if (typeof runtimeRoot !== "string" || runtimeRoot.trim().length === 0 || !path.isAbsolute(runtimeRoot)) {
    throw new TypeError("A non-empty absolute packaged Owner Host runtime root is required.");
  }
  const rootInfo = await lstat(runtimeRoot);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) {
    throw new Error("Packaged Owner Host runtime root must be a real directory.");
  }
  const runtimeReal = await realpath(runtimeRoot);
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), VERIFY_CHILD_ARGUMENT, runtimeReal], {
    cwd: runtimeReal,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  return await new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      try { child.kill(); } catch { /* Only this verifier child. */ }
      reject(new Error("Packaged Core Zod verification timed out."));
    }, 120_000);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", chunk => { stdout = `${stdout}${chunk}`.slice(-4096); });
    child.stderr.on("data", chunk => { stderr = `${stderr}${chunk}`.slice(-4096); });
    child.once("error", error => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", code => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`Packaged Core Zod verification failed (${code}): ${stderr.trim() || stdout.trim() || "no diagnostic output"}`));
        return;
      }
      try { resolve(JSON.parse(stdout)); }
      catch { reject(new Error("Packaged Core Zod verifier returned an invalid result.")); }
    });
  });
}

if (process.argv[2] === VERIFY_CHILD_ARGUMENT) {
  const runtimeRoot = process.argv[3];
  try {
    const result = await verifyInFreshProcess(path.resolve(runtimeRoot ?? ""));
    process.stdout.write(JSON.stringify(result));
  } catch (error) {
    process.stderr.write(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  }
}
