import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const dockerfilePath = fileURLToPath(new URL("./Dockerfile", import.meta.url));
const dockerfile = await readFile(dockerfilePath, "utf8");
const productionStart = dockerfile.indexOf("FROM base AS production");

assert.notEqual(productionStart, -1, "SPS Hub Dockerfile must have a production stage");

const productionStage = dockerfile.slice(productionStart);
for (const providerRuntime of [
  "@anthropic-ai/claude-code",
  "@openai/codex",
  "opencode-ai",
  "@google/gemini-cli",
]) {
  assert.equal(
    productionStage.includes(providerRuntime),
    false,
    `Public SPS Hub must not ship ${providerRuntime}; provider CLIs execute on approved Desktop Nodes.`,
  );
}

assert.match(productionStage, /ENTRYPOINT \["docker-entrypoint\.sh"\]/);
assert.match(productionStage, /CMD \["node"/);
