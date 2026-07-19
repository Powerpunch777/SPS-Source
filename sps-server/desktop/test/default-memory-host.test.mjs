import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import {
  createSpsDefaultMemoryConfig,
  defaultMemoryVaultLayout,
  ensureSpsDefaultMemoryConfig,
  spsDefaultMemoryUrl,
} from "../src/default-memory-host.mjs";

test("SPS Default Memory config stays inside the Owner Vault", () => {
  const config = createSpsDefaultMemoryConfig({
    ownerVaultRoot: "C:\\SPS\\owner-vault",
    port: 31880,
    token: "test-token",
  });
  const layout = defaultMemoryVaultLayout("C:\\SPS\\owner-vault");
  assert.equal(config.dataDir, layout.dataDir);
  assert.equal(config.journalRoot, layout.journalsDir);
  assert.equal(spsDefaultMemoryUrl(config), "http://127.0.0.1:31880");
});

test("SPS Default Memory initializes one stable local config", async () => {
  const files = new Map();
  const directories = new Set();
  const fsApi = {
    async readFile(entry) {
      const value = files.get(entry);
      if (value === undefined) {
        const error = new Error("missing");
        error.code = "ENOENT";
        throw error;
      }
      return value;
    },
    async mkdir(entry) { directories.add(entry); },
    async writeFile(entry, value) { files.set(entry, value); },
    async rename(from, to) {
      files.set(to, files.get(from));
      files.delete(from);
    },
  };
  const ownerVaultRoot = path.join("C:", "SPS", "vault");
  const first = await ensureSpsDefaultMemoryConfig({
    ownerVaultRoot,
    fsApi,
    findPort: async () => 31881,
    randomToken: () => "stable-token",
  });
  const second = await ensureSpsDefaultMemoryConfig({ ownerVaultRoot, fsApi });

  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.config.security.token, "stable-token");
  assert.equal(second.config.server.port, 31881);
  assert.equal(directories.has(first.layout.root), true);
});
