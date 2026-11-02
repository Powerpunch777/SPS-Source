import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { cp, lstat, mkdir, readFile, readdir, realpath, symlink } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { createWorkspaceE2eFixture } from "./workspace-e2e-fixture.mjs";

// Trusted source-test operator only. Never installed or exposed through Plugin IPC.
const desktop = path.resolve(import.meta.dirname, "..");
const sdk = path.resolve(desktop, "../../external/sps-plugin-sdk");
const buildOnly = process.argv[2] === "--build-only";
const liveDesign = process.argv[2] === "--live-design";
const liveMemory = process.argv[2] === "--live-memory";
const liveQuestion = process.argv[2] === "--live-question";
const liveCtos = process.argv[2] === "--live-ctos";
const liveBaseline = process.argv[2] === "--live-baseline";
const liveWorkstreams = process.argv[2] === "--live-workstreams";
assert.deepEqual(process.argv.slice(2), buildOnly ? ["--build-only"] : liveDesign ? ["--live-design"] : liveMemory ? ["--live-memory"] : liveQuestion ? ["--live-question"] : liveCtos ? ["--live-ctos"] : liveBaseline ? ["--live-baseline"] : liveWorkstreams ? ["--live-workstreams"] : [], "Only --build-only or --live-design or --live-memory or --live-question or --live-ctos or --live-baseline or --live-workstreams is accepted.");
const supplied = process.env.SPS_BUILDER_SOURCE_ROOT;
assert.equal(process.platform, "win32");
assert.ok(typeof supplied === "string" && path.isAbsolute(supplied), "Set an absolute SPS_BUILDER_SOURCE_ROOT.");
assert.ok(!process.env.SPS_DESKTOP_E2E_BINARY && !process.env.SPS_BUILDER_LIVE_CANCEL,
  "This acceptance does not use installed binaries or cancellation probes.");
assert.ok(liveWorkstreams ? !buildOnly && process.argv[2] === "--live-workstreams"
  && process.env.SPS_BUILDER_LIVE_CODEX === "1" && process.env.SPS_BUILDER_LIVE_WORKSTREAMS === "1"
  && process.env.SPS_BUILDER_LIVE_DESIGN === undefined && process.env.SPS_BUILDER_LIVE_MEMORY === undefined
  && process.env.SPS_BUILDER_LIVE_QUESTION === undefined && process.env.SPS_BUILDER_LIVE_CTOS === undefined
  && process.env.SPS_BUILDER_LIVE_BASELINE === undefined && process.env.SPS_BUILDER_LIVE_CANCEL === undefined
  && process.env.OPENAI_API_KEY === undefined && process.env.PAPERCLIP_CODEX_PROVIDERS === undefined
  && process.env.SPS_DESKTOP_E2E_BINARY === undefined
  : liveBaseline ? process.env.SPS_BUILDER_LIVE_CODEX === "1" && process.env.SPS_BUILDER_LIVE_BASELINE === "1"
  && process.env.SPS_BUILDER_LIVE_DESIGN === undefined && process.env.SPS_BUILDER_LIVE_MEMORY === undefined
  && process.env.SPS_BUILDER_LIVE_QUESTION === undefined && process.env.SPS_BUILDER_LIVE_CTOS === undefined
  && process.env.SPS_BUILDER_LIVE_WORKSTREAMS === undefined
  && process.env.SPS_BUILDER_LIVE_CANCEL === undefined && process.env.OPENAI_API_KEY === undefined
  && process.env.PAPERCLIP_CODEX_PROVIDERS === undefined && process.env.SPS_DESKTOP_E2E_BINARY === undefined
  : liveCtos ? process.env.SPS_BUILDER_LIVE_CODEX === "1" && process.env.SPS_BUILDER_LIVE_CTOS === "1"
  && !process.env.SPS_BUILDER_LIVE_CANCEL && !process.env.SPS_BUILDER_LIVE_DESIGN
  && !process.env.SPS_BUILDER_LIVE_MEMORY && !process.env.SPS_BUILDER_LIVE_QUESTION
  && process.env.SPS_BUILDER_LIVE_WORKSTREAMS === undefined
  && process.env.SPS_BUILDER_LIVE_BASELINE === undefined && !process.env.OPENAI_API_KEY && !process.env.PAPERCLIP_CODEX_PROVIDERS
  : liveMemory ? process.env.SPS_BUILDER_LIVE_CODEX === "1" && process.env.SPS_BUILDER_LIVE_MEMORY === "1"
  && !process.env.SPS_BUILDER_LIVE_DESIGN && !process.env.SPS_BUILDER_LIVE_QUESTION && !process.env.SPS_BUILDER_LIVE_CTOS
  && process.env.SPS_BUILDER_LIVE_WORKSTREAMS === undefined
  && process.env.SPS_BUILDER_LIVE_BASELINE === undefined && !process.env.OPENAI_API_KEY && !process.env.PAPERCLIP_CODEX_PROVIDERS
  : liveDesign ? process.env.SPS_BUILDER_LIVE_CODEX === "1" && process.env.SPS_BUILDER_LIVE_DESIGN === "1"
  && !process.env.SPS_BUILDER_LIVE_MEMORY && !process.env.SPS_BUILDER_LIVE_QUESTION && !process.env.SPS_BUILDER_LIVE_CTOS
  && process.env.SPS_BUILDER_LIVE_WORKSTREAMS === undefined
  && process.env.SPS_BUILDER_LIVE_BASELINE === undefined && !process.env.OPENAI_API_KEY && !process.env.PAPERCLIP_CODEX_PROVIDERS
  : liveQuestion ? process.env.SPS_BUILDER_LIVE_CODEX === "1" && process.env.SPS_BUILDER_LIVE_QUESTION === "1"
  && !process.env.SPS_BUILDER_LIVE_DESIGN && !process.env.SPS_BUILDER_LIVE_MEMORY && !process.env.SPS_BUILDER_LIVE_CTOS
  && process.env.SPS_BUILDER_LIVE_WORKSTREAMS === undefined
  && process.env.SPS_BUILDER_LIVE_BASELINE === undefined && !process.env.OPENAI_API_KEY && !process.env.PAPERCLIP_CODEX_PROVIDERS
  : !process.env.SPS_BUILDER_LIVE_CODEX && !process.env.SPS_BUILDER_LIVE_DESIGN && !process.env.SPS_BUILDER_LIVE_MEMORY && !process.env.SPS_BUILDER_LIVE_QUESTION && !process.env.SPS_BUILDER_LIVE_CTOS && process.env.SPS_BUILDER_LIVE_BASELINE === undefined && process.env.SPS_BUILDER_LIVE_WORKSTREAMS === undefined,
  "Live scope requires its matching mode and both explicit opt-ins, without API key/provider substitution or other live scopes.");
const source = await realpath(supplied);
assert.ok((await lstat(source)).isDirectory() && !(await lstat(supplied)).isSymbolicLink());
const pkg = JSON.parse(await readFile(path.join(source, "package.json"), "utf8"));
assert.equal(pkg.name, "@sonparkserver/my-plugin-builder");
const revision = pkg.devDependencies["@sonparkserver/plugin-sdk"].match(/^github:Powerpunch777\/sps-plugin-sdk#([0-9a-f]{40})$/)?.[1];
assert.ok(revision, "Builder must pin the public SDK by full commit.");
const exec = promisify(execFile);
const git = async (...args) => (await exec("git", args, { windowsHide: true, timeout: 15_000 })).stdout.trim();
assert.equal(await git("-C", sdk, "rev-parse", "HEAD"), revision);
assert.equal(await git("-C", sdk, "status", "--porcelain"), "", "The SDK source must be clean.");
const fixture = await createWorkspaceE2eFixture();
const root = path.join(fixture.directory, "builder");
let completed = false;

async function assertPlainTree(file) {
  const stat = await lstat(file);
  assert.ok(!stat.isSymbolicLink() && (stat.isDirectory() || stat.isFile() && stat.nlink === 1), "Only plain Builder source inputs are copied.");
  if (stat.isDirectory()) for (const name of await readdir(file)) await assertPlainTree(path.join(file, name));
}

async function node(args) {
  await fixture.assertCurrent();
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: root, shell: false, windowsHide: true, stdio: "inherit",
      env: { ...process.env, SPS_BUILDER_CORE_DESKTOP: desktop, SPS_DESKTOP_E2E_BINARY: "", SPS_DESKTOP_DEV: "" } });
    child.once("error", reject);
    child.once("close", (code, signal) => code === 0 && signal === null ? resolve() : reject(new Error(`Isolated Builder phase failed (${code}, ${signal}).`)));
  });
  await fixture.assertCurrent();
}

try {
  await mkdir(root);
  for (const name of ["package.json", "package-lock.json", "tsconfig.json", "THIRD_PARTY_NOTICES.md", "README.md", "src", "test", "scripts", "docs"]) {
    const input = path.join(source, name);
    await assertPlainTree(input);
    await fixture.assertCurrent();
    await cp(input, path.join(root, name), { recursive: true, errorOnExist: true, force: false });
  }
  const modules = path.join(root, "node_modules");
  await mkdir(modules);
  // Reuse unchanged installed dependencies, replacing only the fixture's SDK link.
  // The original Builder/DEV dependency directories are never written.
  for (const entry of await readdir(path.join(source, "node_modules"), { withFileTypes: true })) {
    if (entry.name === "@sonparkserver" || !entry.isDirectory()) continue;
    await symlink(await realpath(path.join(source, "node_modules", entry.name)), path.join(modules, entry.name), "junction");
  }
  const scope = path.join(modules, "@sonparkserver");
  await mkdir(scope);
  await symlink(sdk, path.join(scope, "plugin-sdk"), "junction");
  await node([path.join(modules, "typescript/bin/tsc"), "--noEmit"]);
  await node(["scripts/build.mjs"]);
  const tests = (await readdir(path.join(root, "test"))).filter(name => /\.test\.(?:ts|mjs)$/.test(name)).sort().map(name => `test/${name}`);
  await node(["--experimental-strip-types", "--test", ...tests]);
  await node([path.join(sdk, "cli/sps-plugin.mjs"), "validate", ".", "--json"]);
  await node([path.join(sdk, "cli/sps-plugin.mjs"), "test", ".", "--json"]);
  if (!buildOnly) await node(["scripts/test-core-host.mjs", ...(liveWorkstreams ? ["--live-workstreams"] : [])]);
  assert.equal(await git("-C", sdk, "rev-parse", "HEAD"), revision);
  assert.equal(await git("-C", sdk, "status", "--porcelain"), "");
  completed = true;
} finally {
  if (completed) await fixture.remove();
  else console.error(`Preserve isolated Builder fixture for diagnosis: ${fixture.directory}`);
}
console.log(JSON.stringify({ kind: "source-builder-conditional-state", sdkRevision: revision,
  mode: buildOnly ? "build-only" : liveDesign ? "source-app-live-design" : liveMemory ? "source-app-live-memory" : liveQuestion ? "source-app-live-question" : liveCtos ? "source-app-live-ctos" : liveBaseline ? "source-app-live-baseline" : liveWorkstreams ? "source-app-live-workstreams" : "source-app",
  isolatedBuild: true, actualSourceHost: !buildOnly, mockIdentity: !buildOnly, liveAi: liveDesign || liveMemory || liveQuestion || liveCtos || liveBaseline || liveWorkstreams,
  userDevDependenciesChanged: false, installedBuild: false, signedRelease: false, temporaryDataRemoved: true }));
