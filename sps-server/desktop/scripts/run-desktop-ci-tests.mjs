import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const isolatedFile = "installer-command-exit-observation.test.mjs";
const desktop = fileURLToPath(new URL("..", import.meta.url));

export function desktopCiTestPlan(names) {
  assert.ok(Array.isArray(names) && names.length > 1, "Missing Desktop CI test files.");
  assert.ok(names.every(name => typeof name === "string" && /^[A-Za-z0-9][A-Za-z0-9_.-]*\.test\.mjs$/.test(name)),
    "Invalid Desktop CI test filename.");
  const sorted = [...new Set(names)].sort();
  assert.equal(sorted.length, names.length, "Duplicate Desktop CI test file.");
  assert.ok(sorted.includes(isolatedFile), "Missing mandatory owned-command observation test.");
  // Run the unchanged 45-second native probe without competing test processes.
  // Every other discovered test still runs, at the existing file concurrency.
  return [
    { name: "owned-command-observation", concurrency: 1, files: [`test/${isolatedFile}`] },
    { name: "remaining-desktop-tests", concurrency: 4, files: sorted.filter(name => name !== isolatedFile).map(name => `test/${name}`) },
  ];
}

async function runNodeTests(args) {
  const child = spawn(process.execPath, args, { cwd: desktop, shell: false, windowsHide: true, stdio: "inherit" });
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal }));
  });
}

export async function runDesktopCiTests(names, run = runNodeTests) {
  for (const stage of desktopCiTestPlan(names)) {
    const args = ["--test", `--test-concurrency=${stage.concurrency}`, ...stage.files];
    assert.ok(args.reduce((length, argument) => length + argument.length + 3, 0) < 24_000,
      "Desktop CI test arguments exceed the bounded Windows command line.");
    console.log(JSON.stringify({ desktopCiTestStage: stage.name, files: stage.files.length, concurrency: stage.concurrency }));
    const result = await run(args);
    assert.ok(result && (result.signal === null || typeof result.signal === "string"), "Missing Desktop CI test process result.");
    if (result.signal !== null) return 1;
    assert.ok(Number.isInteger(result.code) && result.code >= 0 && result.code <= 0xffffffff,
      "Invalid Desktop CI test process exit.");
    if (result.code !== 0) return result.code;
  }
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const entries = await readdir(new URL("../test", import.meta.url), { withFileTypes: true });
  const tests = entries.filter(entry => entry.name.endsWith(".test.mjs"));
  assert.ok(tests.every(entry => entry.isFile() && !entry.isSymbolicLink()), "Desktop CI test entry is not a regular file.");
  process.exitCode = await runDesktopCiTests(tests.map(entry => entry.name));
}
