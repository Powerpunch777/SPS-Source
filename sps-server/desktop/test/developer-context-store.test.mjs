import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  clearDeveloperContextLink,
  getDeveloperContextLink,
  loadDeveloperContextLinks,
  normalizeDeveloperContext,
  setDeveloperContextLink,
} from "../src/developer-context-store.mjs";

const COMPANY_ID = "11111111-1111-4111-8111-111111111111";
const PLUGIN_ID = "io.sps.example-plugin";
const CONTEXT_ID = "22222222-2222-4222-8222-222222222222";
const PROJECT_ID = "dev-33333333-3333-4333-8333-333333333333";
const UPDATED_AT = "2026-10-24T12:34:56.789Z";
const BASE_CONTEXT = { companyId: COMPANY_ID, pluginId: PLUGIN_ID, contextId: CONTEXT_ID };
const LINK_KEYS = ["companyId", "pluginId", "contextId", "projectId", "updatedAt"];
const LINK_UNAVAILABLE_CODES = new Set(["EACCES", "EINVAL", "EPERM", "ENOTSUP", "UNKNOWN"]);

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "sps-developer-context-store-"));
  const vaultRoot = path.join(root, "OwnerVault");
  await mkdir(vaultRoot);
  return { root, vaultRoot, directory: path.join(vaultRoot, "developer-mode"), storePath: path.join(vaultRoot, "developer-mode", "context-links.json") };
}

async function withFixture(run) {
  const current = await fixture();
  try {
    await run(current);
  } finally {
    await rm(current.root, { recursive: true, force: true });
  }
}

function link(context = BASE_CONTEXT, projectId = PROJECT_ID, updatedAt = UPDATED_AT) {
  return { ...context, projectId, updatedAt };
}

async function writeStore(storePath, store) {
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(storePath, typeof store === "string" ? store : JSON.stringify(store), "utf8");
}

async function makeDirectoryLinkOrSkip(t, target, linkPath) {
  try {
    await symlink(target, linkPath, process.platform === "win32" ? "junction" : "dir");
  } catch (error) {
    if (LINK_UNAVAILABLE_CODES.has(error.code)) {
      t.skip(`Directory symlinks/junctions are unavailable: ${error.code}`);
      return false;
    }
    throw error;
  }
  return true;
}

test("normalizes only the exact company/plugin/context tuple", () => {
  assert.deepEqual(normalizeDeveloperContext(BASE_CONTEXT), BASE_CONTEXT);
  assert.deepEqual(normalizeDeveloperContext({
    companyId: "AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE",
    pluginId: PLUGIN_ID,
    contextId: "FFFFFFFF-AAAA-4BBB-8CCC-DDDDDDDDDDDD",
  }), {
    companyId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    pluginId: PLUGIN_ID,
    contextId: "ffffffff-aaaa-4bbb-8ccc-dddddddddddd",
  });
  for (const invalid of [
    null,
    [],
    { ...BASE_CONTEXT, label: "not persisted" },
    { companyId: COMPANY_ID, pluginId: PLUGIN_ID },
    { ...BASE_CONTEXT, companyId: "not-a-uuid" },
    { ...BASE_CONTEXT, contextId: "not-a-uuid" },
    { ...BASE_CONTEXT, pluginId: "Uppercase.plugin" },
    { ...BASE_CONTEXT, pluginId: "ab" },
    { ...BASE_CONTEXT, pluginId: "a".repeat(129) },
  ]) {
    assert.throws(() => normalizeDeveloperContext(invalid));
  }
});

test("stores and retrieves only exact scoped keys with canonical timestamps", async () => {
  await withFixture(async ({ vaultRoot, storePath }) => {
    const first = await setDeveloperContextLink({ vaultRoot, context: BASE_CONTEXT, projectId: PROJECT_ID, now: new Date(UPDATED_AT) });
    const otherContext = { ...BASE_CONTEXT, contextId: "44444444-4444-4444-8444-444444444444" };
    const otherPlugin = { ...BASE_CONTEXT, pluginId: "io.sps.other-plugin" };
    const otherCompany = { ...BASE_CONTEXT, companyId: "55555555-5555-4555-8555-555555555555" };
    await setDeveloperContextLink({ vaultRoot, context: otherContext, projectId: PROJECT_ID, now: UPDATED_AT });
    await setDeveloperContextLink({ vaultRoot, context: otherPlugin, projectId: PROJECT_ID, now: UPDATED_AT });
    await setDeveloperContextLink({ vaultRoot, context: otherCompany, projectId: PROJECT_ID, now: UPDATED_AT });

    assert.deepEqual(first, link());
    assert.deepEqual(await getDeveloperContextLink({ vaultRoot, context: BASE_CONTEXT }), link());
    assert.equal(await getDeveloperContextLink({ vaultRoot, context: { ...BASE_CONTEXT, contextId: "66666666-6666-4666-8666-666666666666" } }), null);
    const loaded = await loadDeveloperContextLinks({ vaultRoot });
    assert.equal(loaded.schemaVersion, 1);
    assert.equal(loaded.bindings.length, 4);
    assert.deepEqual(Object.keys(loaded.bindings[0]).sort(), [...LINK_KEYS].sort());
    assert.equal(await readFile(storePath, "utf8").then(text => Buffer.byteLength(text, "utf8") <= 128 * 1024), true);
  });
});

test("updates one binding and clears only its exact scope", async () => {
  await withFixture(async ({ vaultRoot }) => {
    const other = { ...BASE_CONTEXT, pluginId: "io.sps.other-plugin" };
    await setDeveloperContextLink({ vaultRoot, context: BASE_CONTEXT, projectId: PROJECT_ID, now: UPDATED_AT });
    await setDeveloperContextLink({ vaultRoot, context: other, projectId: PROJECT_ID, now: UPDATED_AT });
    const updatedProjectId = "dev-77777777-7777-4777-8777-777777777777";
    await setDeveloperContextLink({ vaultRoot, context: BASE_CONTEXT, projectId: updatedProjectId, now: "2026-10-25T00:00:00.000Z" });

    assert.equal((await loadDeveloperContextLinks({ vaultRoot })).bindings.length, 2);
    assert.deepEqual(await getDeveloperContextLink({ vaultRoot, context: BASE_CONTEXT }), link(BASE_CONTEXT, updatedProjectId, "2026-10-25T00:00:00.000Z"));
    assert.equal(await clearDeveloperContextLink({ vaultRoot, context: BASE_CONTEXT }), true);
    assert.equal(await getDeveloperContextLink({ vaultRoot, context: BASE_CONTEXT }), null);
    assert.deepEqual(await getDeveloperContextLink({ vaultRoot, context: other }), link(other));
    assert.equal(await clearDeveloperContextLink({ vaultRoot, context: BASE_CONTEXT }), false);
  });
});

test("serializes concurrent updates so no distinct context binding is lost", async () => {
  await withFixture(async ({ vaultRoot }) => {
    const contexts = Array.from({ length: 24 }, (_, index) => ({
      companyId: COMPANY_ID,
      pluginId: PLUGIN_ID,
      contextId: `00000000-0000-4000-8000-${(index + 1).toString(16).padStart(12, "0")}`,
    }));
    await Promise.all(contexts.map((context, index) => setDeveloperContextLink({
      vaultRoot,
      context,
      projectId: PROJECT_ID,
      now: new Date(Date.parse(UPDATED_AT) + index),
    })));

    const loaded = await loadDeveloperContextLinks({ vaultRoot });
    assert.equal(loaded.bindings.length, contexts.length);
    assert.deepEqual(new Set(loaded.bindings.map(binding => binding.contextId)), new Set(contexts.map(context => context.contextId)));
  });
});

test("allows updates at capacity but rejects an additional context", async () => {
  await withFixture(async ({ vaultRoot, storePath }) => {
    const bindings = Array.from({ length: 256 }, (_, index) => link({
      companyId: COMPANY_ID,
      pluginId: PLUGIN_ID,
      contextId: `00000000-0000-4000-8000-${(index + 1).toString(16).padStart(12, "0")}`,
    }));
    await writeStore(storePath, { schemaVersion: 1, bindings });
    const existingContext = { companyId: COMPANY_ID, pluginId: PLUGIN_ID, contextId: bindings[0].contextId };
    await setDeveloperContextLink({ vaultRoot, context: existingContext, projectId: PROJECT_ID, now: UPDATED_AT });
    assert.equal((await loadDeveloperContextLinks({ vaultRoot })).bindings.length, 256);
    await assert.rejects(setDeveloperContextLink({
      vaultRoot,
      context: { companyId: COMPANY_ID, pluginId: PLUGIN_ID, contextId: "99999999-9999-4999-8999-999999999999" },
      projectId: PROJECT_ID,
      now: UPDATED_AT,
    }), /at capacity/);
  });
});

test("returns an empty store for a missing file and clear does not create its parent", async () => {
  await withFixture(async ({ vaultRoot, directory, storePath }) => {
    assert.deepEqual(await loadDeveloperContextLinks({ vaultRoot }), { schemaVersion: 1, bindings: [] });
    assert.equal(await getDeveloperContextLink({ vaultRoot, context: BASE_CONTEXT }), null);
    assert.equal(await clearDeveloperContextLink({ vaultRoot, context: BASE_CONTEXT }), false);
    await assert.rejects(fs.stat(directory), { code: "ENOENT" });
    await assert.rejects(fs.stat(storePath), { code: "ENOENT" });
  });
});

test("rejects malformed schema, unknown fields, duplicate scopes, and invalid timestamps", async () => {
  await withFixture(async ({ vaultRoot, storePath }) => {
    const valid = { schemaVersion: 1, bindings: [link()] };
    const malformed = [
      { ...valid, extra: true },
      { schemaVersion: 2, bindings: [link()] },
      { schemaVersion: 1, bindings: [link({ ...BASE_CONTEXT, label: "not allowed" })] },
      { schemaVersion: 1, bindings: [link(), link()] },
      { schemaVersion: 1, bindings: [link(BASE_CONTEXT, "not-a-project")] },
      { schemaVersion: 1, bindings: [link(BASE_CONTEXT, PROJECT_ID, "2026-02-30T00:00:00.000Z")] },
      { schemaVersion: 1, bindings: [link(BASE_CONTEXT, PROJECT_ID, "2026-10-24T12:34:56Z")] },
      { schemaVersion: 1, bindings: [link({ ...BASE_CONTEXT, companyId: "AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE" })] },
    ];
    for (const value of malformed) {
      await writeStore(storePath, value);
      await assert.rejects(loadDeveloperContextLinks({ vaultRoot }), undefined, JSON.stringify(value));
    }
    await writeStore(storePath, "{ malformed json");
    await assert.rejects(loadDeveloperContextLinks({ vaultRoot }));
  });
});

test("validates set input before writing and rejects noncanonical timestamps", async () => {
  await withFixture(async ({ vaultRoot, directory }) => {
    await assert.rejects(setDeveloperContextLink({ vaultRoot, context: { ...BASE_CONTEXT, prompt: "not allowed" }, projectId: PROJECT_ID }));
    await assert.rejects(setDeveloperContextLink({ vaultRoot, context: BASE_CONTEXT, projectId: "project-anywhere" }));
    await assert.rejects(setDeveloperContextLink({ vaultRoot, context: BASE_CONTEXT, projectId: PROJECT_ID, now: "2026-10-24T12:34:56Z" }));
    await assert.rejects(fs.stat(directory), { code: "ENOENT" });
  });
});

test("rejects an oversized store before parsing it", async () => {
  await withFixture(async ({ vaultRoot, storePath }) => {
    await writeStore(storePath, Buffer.alloc(128 * 1024 + 1, 0x20).toString("utf8"));
    await assert.rejects(loadDeveloperContextLinks({ vaultRoot }), /exceeds 128 KiB/);
  });
});

test("rejects non-regular or symlinked store files", async t => {
  await withFixture(async ({ vaultRoot, storePath, root }) => {
    await mkdir(path.dirname(storePath), { recursive: true });
    await mkdir(storePath);
    await assert.rejects(loadDeveloperContextLinks({ vaultRoot }), /regular file/);
    await rm(storePath, { recursive: true });

    const outsidePath = path.join(root, "outside.json");
    await writeFile(outsidePath, JSON.stringify({ schemaVersion: 1, bindings: [] }));
    try {
      await symlink(outsidePath, storePath, "file");
    } catch (error) {
      if (LINK_UNAVAILABLE_CODES.has(error.code)) {
        t.skip(`File symlinks are unavailable: ${error.code}`);
        return;
      }
      throw error;
    }
    await assert.rejects(setDeveloperContextLink({ vaultRoot, context: BASE_CONTEXT, projectId: PROJECT_ID, now: UPDATED_AT }), /regular file/);
    await assert.rejects(loadDeveloperContextLinks({ vaultRoot }), /regular file/);
  });
});

test("rejects a linked developer-mode parent and never writes through it", async t => {
  await withFixture(async ({ vaultRoot, directory, root }) => {
    const outsideDirectory = path.join(root, "outside-developer-mode");
    await mkdir(outsideDirectory);
    if (!await makeDirectoryLinkOrSkip(t, outsideDirectory, directory)) return;

    await assert.rejects(setDeveloperContextLink({ vaultRoot, context: BASE_CONTEXT, projectId: PROJECT_ID, now: UPDATED_AT }), /real directory|escapes/);
    await assert.rejects(loadDeveloperContextLinks({ vaultRoot }), /real directory|escapes/);
    assert.deepEqual(await readdir(outsideDirectory), []);
  });
});

test("rejects a non-directory vault root instead of treating it as a missing store", async () => {
  await withFixture(async ({ root }) => {
    const fileRoot = path.join(root, "not-a-directory");
    await writeFile(fileRoot, "file");
    await assert.rejects(loadDeveloperContextLinks({ vaultRoot: fileRoot }), /real directory/);
  });
});
