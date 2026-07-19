import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const dockerfilePath = fileURLToPath(new URL("./Dockerfile", import.meta.url));
const composePath = fileURLToPath(new URL("./docker-compose.yml", import.meta.url));
const runtimeEntrypointPath = fileURLToPath(new URL("./sps-hub-entrypoint.sh", import.meta.url));
const dockerfile = await readFile(dockerfilePath, "utf8");
const compose = await readFile(composePath, "utf8");
const runtimeEntrypoint = await readFile(runtimeEntrypointPath, "utf8");
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

assert.match(productionStage, /ENTRYPOINT \["sps-hub-entrypoint\.sh"\]/);
assert.equal(
  productionStage.includes("/usr/local/bin/docker-entrypoint.sh /usr/local/bin/sps-hub-entrypoint.sh"),
  true,
  "SPS Hub image must normalize Windows CRLF entrypoints before Linux starts them",
);
assert.match(productionStage, /CMD \["node"/);
assert.match(compose, /SPS_REQUIRE_NODE_EXECUTION: "true"/);
assert.match(compose, /PAPERCLIP_PUBLIC_URL:/);
assert.match(runtimeEntrypoint, /baseUrlMode: "explicit"/);
assert.match(runtimeEntrypoint, /PAPERCLIP_PUBLIC_URL must be an HTTPS URL/);
