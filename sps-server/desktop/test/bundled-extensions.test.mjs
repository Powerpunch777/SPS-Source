import test from "node:test";
import assert from "node:assert/strict";
import { areSpsBundledExtensionsEnabled, disabledSpsExtensionStatus } from "../src/bundled-extensions.mjs";

test("keeps bundled SPS extensions disabled by default", () => {
  assert.equal(areSpsBundledExtensionsEnabled({}), false);
  assert.equal(areSpsBundledExtensionsEnabled({ SPS_ENABLE_BUNDLED_EXTENSIONS: "false" }), false);
});

test("allows a deliberate developer opt-in for bundled extension work", () => {
  assert.equal(areSpsBundledExtensionsEnabled({ SPS_ENABLE_BUNDLED_EXTENSIONS: "true" }), true);
  assert.equal(areSpsBundledExtensionsEnabled({ SPS_ENABLE_BUNDLED_EXTENSIONS: " TRUE " }), true);
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
