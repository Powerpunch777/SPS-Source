import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  installSpsAgentRuntimePack,
  listSpsAgentRuntimePacks,
  spsAgentRuntimePackEnvironment,
} from "../src/agent-runtime-packs.mjs";

async function makePack(root, { id = "codex-acp", version = "1.0.0", command = "bin/codex-acp.cmd" } = {}) {
  await fs.mkdir(path.join(root, "bin"), { recursive: true });
  await fs.writeFile(path.join(root, command), "@echo off\r\n", "utf8");
  await fs.writeFile(path.join(root, "sps-agent-runtime-pack.json"), JSON.stringify({
    format: 1,
    id,
    label: "Codex ACP",
    version,
    commands: { "codex-acp": command },
  }), "utf8");
}

test("installs an explicit Agent Runtime pack into the app-managed cache", async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "sps-desktop-pack-"));
  const source = path.join(temporary, "source");
  const target = path.join(temporary, "target");
  try {
    await makePack(source);
    const installed = await installSpsAgentRuntimePack({ sourceRoot: source, root: target });
    assert.equal(installed?.id, "codex-acp");
    assert.equal(installed?.complete, true);
    assert.deepEqual((await listSpsAgentRuntimePacks({ root: target })).map((pack) => pack.commands), [["codex-acp"]]);
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
});

test("refuses an Agent Runtime pack whose command escapes the selected folder", async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "sps-desktop-pack-"));
  try {
    await makePack(path.join(temporary, "source"), { command: "../outside.cmd" });
    await assert.rejects(
      installSpsAgentRuntimePack({ sourceRoot: path.join(temporary, "source"), root: path.join(temporary, "target") }),
      /incomplete or has an unsafe command path/,
    );
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
});

test("exposes the product-neutral Core runtime-pack environment contract", () => {
  assert.deepEqual(spsAgentRuntimePackEnvironment({ root: "C:/SPS/packs", nodeCommand: "C:/SPS/node.exe" }), {
    PAPERCLIP_AGENT_RUNTIME_PACKS_DIR: path.resolve("C:/SPS/packs"),
    SPS_OWNER_HOST_NODE: "C:/SPS/node.exe",
  });
});
