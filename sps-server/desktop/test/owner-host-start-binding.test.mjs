import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";

const source = await readFile(new URL("../src/main.mjs", import.meta.url), "utf8");
const start = source.indexOf("async function startOwnerHostWithContext(");
const end = source.indexOf("async function bootstrapOwnerHost(", start);
assert.ok(start > 0 && end > start);

function fixture(status) {
  const calls = [];
  const context = { ownerHostInstanceGeneration: 0, backgroundStartupDeferred: true, ownerHostStatus: {},
    ensureOwnerHostManager: async () => ({ url: "http://127.0.0.1:31310", layout: { root: "owned-vault" }, defaultMemory: null }),
    ownerHostManager: { start: async () => status }, disabledSpsExtensionStatus: () => ({ state: "disabled" }),
    isTeamAccessEnabled: () => { calls.push("team-check"); return false; }, state: {},
    activateOwnerHostProfile: async () => { calls.push("activate"); },
    ownerHostIsReady: () => true,
    ensureInitialOwnerHostCompany: async () => { calls.push("company"); },
    synchronizeReadyTeamWorkplane: async () => { calls.push("synchronize"); },
  };
  runInNewContext(`${source.slice(start, end)}\nthis.start=startOwnerHostWithContext;`, context);
  return { context, calls };
}

test("Main cannot activate, establish company state or repair team access after an owned endpoint conflict", async () => {
  for (const activate of [true, false]) {
    const f = fixture({ state: "running-existing", owned: false,
      lastError: "SPS Owner Host could not acquire its configured endpoint; another service is running there." });
    await assert.rejects(f.context.start({ activate, expectedSubject: "owner" }), /configured endpoint/);
    assert.deepEqual(f.calls, []);
    assert.equal(f.context.ownerHostStatus.owned, false);
  }
});

test("an ordinary owned ready Host preserves the existing activation sequence", async () => {
  const f = fixture({ state: "running", owned: true, lastError: null });
  const result = await f.context.start({ activate: true, expectedSubject: "owner" });
  assert.equal(result.state, "running");
  assert.deepEqual(f.calls, ["team-check", "activate", "company", "synchronize"]);
});
