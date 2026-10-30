import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, lstat, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  appendPluginPreviewDiagnostic,
  clearPluginPreviewDiagnostics,
  listPluginPreviewDiagnostics,
  MAX_PLUGIN_PREVIEW_DIAGNOSTICS,
  pluginPreviewDiagnosticsLayout,
  redactPluginPreviewDiagnosticMessage,
} from "../src/plugin-preview-diagnostics.mjs";

const PROJECT_A = "dev-123e4567-e89b-12d3-a456-426614174000";
const PROJECT_B = "dev-123e4567-e89b-12d3-a456-426614174001";
const BUILD_A = "build-123e4567-e89b-12d3-a456-426614174000";
const BUILD_B = "build-123e4567-e89b-12d3-a456-426614174001";

test("keeps actionable render errors while removing local paths and credentials", () => {
  const message = redactPluginPreviewDiagnosticMessage(
    "ReferenceError: React is not defined\n at C:\\Users\\fixture\\dist\\ui\\index.js:4:2 Bearer fixtureSecret123456",
  );
  assert.ok(message.startsWith("ReferenceError: React is not defined"));
  assert.ok(message.includes("[local-path]"));
  assert.ok(!message.includes("fixtureSecret"));
  assert.ok(!message.includes("C:\\Users"));
});

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "sps-preview-diagnostics-"));
  return { root, ownerVault: path.join(root, "owner-vault") };
}

function event(overrides = {}) {
  return {
    projectId: PROJECT_A,
    buildId: BUILD_A,
    pluginId: "local.preview-test",
    phase: "runtime",
    level: "info",
    code: "PREVIEW_STARTED",
    message: "Preview started.",
    timestamp: "2026-07-31T12:00:00.000Z",
    ...overrides,
  };
}

test("retains only the newest bounded preview diagnostics", async () => {
  const entry = await fixture();
  try {
    for (let index = 0; index < MAX_PLUGIN_PREVIEW_DIAGNOSTICS + 5; index += 1) {
      await appendPluginPreviewDiagnostic({
        ownerVault: entry.ownerVault,
        event: event({ code: `EVENT_${index}`, message: `event ${index}`, timestamp: `2026-07-31T12:00:${String(index % 60).padStart(2, "0")}.000Z` }),
      });
    }
    const events = await listPluginPreviewDiagnostics({ ownerVault: entry.ownerVault, filters: { limit: MAX_PLUGIN_PREVIEW_DIAGNOSTICS } });
    assert.equal(events.length, MAX_PLUGIN_PREVIEW_DIAGNOSTICS);
    assert.equal(events[0].code, "EVENT_204");
    assert.equal(events.at(-1).code, "EVENT_5");
  } finally {
    await rm(entry.root, { recursive: true, force: true });
  }
});

test("redacts credentials, connection URLs, and local paths before persisting", async () => {
  const entry = await fixture();
  try {
    const stored = await appendPluginPreviewDiagnostic({
      ownerVault: entry.ownerVault,
      event: event({
        message: "token=abc123 Authorization: BearerSecret password: hunter2 Bearer standaloneSecret123 github_pat_abcdefghijklmnop eyJabcdefghijk.abcdefghijk.abcdefghijk postgres://admin:pass@localhost:5432/sps C:\\Users\\young\\secret.txt \\server\\share\\file /home/alice/project/.env /custom/build/output",
      }),
    });
    assert.match(stored.message, /token=\[redacted\]/i);
    assert.match(stored.message, /Authorization=\[redacted\]/i);
    assert.match(stored.message, /password=\[redacted\]/i);
    assert.match(stored.message, /postgres:\/\/\[redacted\]/i);
    assert.equal(stored.message.includes("hunter2"), false);
    assert.equal(stored.message.includes("C:\\Users"), false);
    assert.equal(stored.message.includes("\\\\server"), false);
    assert.equal(stored.message.includes("/home/alice"), false);
    assert.equal(stored.message.includes("standaloneSecret123"), false);
    assert.equal(stored.message.includes("github_pat_"), false);
    assert.equal(stored.message.includes("eyJabcdefghijk"), false);
    assert.equal(stored.message.includes("/custom/build"), false);
    assert.match(stored.message, /\[local-path\]/);
  } finally {
    await rm(entry.root, { recursive: true, force: true });
  }
});

test("fails closed for malformed ledgers and symlink or junction paths", async () => {
  const entry = await fixture();
  try {
    const layout = pluginPreviewDiagnosticsLayout({ ownerVault: entry.ownerVault });
    await mkdir(layout.root, { recursive: true });
    await writeFile(layout.ledgerPath, "{bad-json", "utf8");
    await assert.rejects(listPluginPreviewDiagnostics({ ownerVault: entry.ownerVault }), /not valid JSON/);

    await rm(layout.root, { recursive: true, force: true });
    const outside = path.join(entry.root, "outside");
    await mkdir(outside);
    await symlink(outside, layout.root, process.platform === "win32" ? "junction" : "dir");
    await assert.rejects(appendPluginPreviewDiagnostic({ ownerVault: entry.ownerVault, event: event() }), /symbolic link or junction/);
    assert.equal((await lstat(outside)).isDirectory(), true);
  } finally {
    await rm(entry.root, { recursive: true, force: true });
  }
});

test("filters newest-first diagnostics and clears the persisted ledger", async () => {
  const entry = await fixture();
  try {
    await appendPluginPreviewDiagnostic({ ownerVault: entry.ownerVault, event: event({ code: "FIRST", phase: "runtime", level: "info" }) });
    await appendPluginPreviewDiagnostic({ ownerVault: entry.ownerVault, event: event({ projectId: PROJECT_B, buildId: BUILD_B, pluginId: "local.other", code: "SECOND", phase: "worker", level: "warn" }) });
    await appendPluginPreviewDiagnostic({ ownerVault: entry.ownerVault, event: event({ code: "THIRD", phase: "worker", level: "error" }) });
    const filtered = await listPluginPreviewDiagnostics({
      ownerVault: entry.ownerVault,
      filters: { projectId: PROJECT_A, phase: "worker", level: "error" },
    });
    assert.deepEqual(filtered.map((item) => item.code), ["THIRD"]);
    await assert.rejects(listPluginPreviewDiagnostics({ ownerVault: entry.ownerVault, filters: { phase: "nope" } }), /filter phase/);
    assert.deepEqual(await clearPluginPreviewDiagnostics({ ownerVault: entry.ownerVault }), { cleared: true });
    assert.deepEqual(await listPluginPreviewDiagnostics({ ownerVault: entry.ownerVault }), []);
  } finally {
    await rm(entry.root, { recursive: true, force: true });
  }
});

test("serializes concurrent appends without losing diagnostics", async () => {
  const entry = await fixture();
  try {
    await Promise.all(Array.from({ length: 40 }, (_, index) => appendPluginPreviewDiagnostic({
      ownerVault: entry.ownerVault,
      event: event({
        code: `CONCURRENT_${index}`,
        message: `concurrent event ${index}`,
      }),
    })));
    const events = await listPluginPreviewDiagnostics({
      ownerVault: entry.ownerVault,
      filters: { limit: 40 },
    });
    assert.equal(events.length, 40);
    assert.equal(new Set(events.map((item) => item.code)).size, 40);
  } finally {
    await rm(entry.root, { recursive: true, force: true });
  }
});
