import test from "node:test";
import assert from "node:assert/strict";
import { areSpsBundledExtensionsEnabled, disabledSpsExtensionStatus } from "../src/bundled-extensions.mjs";

test("keeps official SPS extensions enabled by default", () => {
  assert.equal(areSpsBundledExtensionsEnabled({}), true);
  assert.equal(areSpsBundledExtensionsEnabled({ SPS_ENABLE_BUNDLED_EXTENSIONS: "false" }), false);
});

test("accepts an explicit extension mode", () => {
  assert.equal(areSpsBundledExtensionsEnabled({ SPS_ENABLE_BUNDLED_EXTENSIONS: "true" }), true);
  assert.equal(areSpsBundledExtensionsEnabled({ SPS_ENABLE_BUNDLED_EXTENSIONS: " TRUE " }), true);
  assert.equal(areSpsBundledExtensionsEnabled({ SPS_ENABLE_BUNDLED_EXTENSIONS: " FALSE " }), false);
});

test("reports disabled extensions without a fake runtime endpoint", () => {
  assert.deepEqual(disabledSpsExtensionStatus(), {
    state: "disabled",
    url: null,
    startedAt: null,
    lastError: null,
    vaultPath: null,
  });
});
