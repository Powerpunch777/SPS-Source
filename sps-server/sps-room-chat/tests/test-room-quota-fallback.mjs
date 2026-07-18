import assert from "node:assert/strict";

process.env.PAPERCLIP_ROOM_CHAT_TEST = "1";
const {
  isProviderQuotaError,
  parseAgyFallbackEnvelope,
  runAgyRoomFallback,
  setAgyClientFactoryForTest
} = await import("../dist/worker.js");

const companyId = "company-fallback";
const issue = { id: "room-cto", companyId, projectId: "project-fallback" };
const agent = {
  id: "agent-cto",
  name: "CTO",
  role: "cto",
  adapterType: "codex_local",
  adapterConfig: {},
  instructions: "Create Worker Tasks only through the provided Paperclip tools."
};
const worker = { id: "worker-code", name: "Code Worker", role: "code-worker", status: "idle", adapterType: "antigravity_local", runtimeConfig: { heartbeat: { maxConcurrentRuns: 3 } } };
const state = { checkpoint: { summary: "Implementation is in progress." }, runtime: { activity: { status: "working", steps: [] } } };
const prompts = [];
let turn = 0;
let fallbackRoomRuntime = null;
const originalFetch = globalThis.fetch;

globalThis.fetch = async (url) => {
  const pathname = new URL(String(url)).pathname;
  if (pathname === `/api/companies/${companyId}/agents`) return new Response(JSON.stringify([agent, worker]), { status: 200 });
  throw new Error(`Unexpected fallback request: ${pathname}`);
};

setAgyClientFactoryForTest(({ roomRuntime }) => {
  fallbackRoomRuntime = roomRuntime;
  return ({
  kind: "agy_print",
  startTurn: ({ prompt }) => {
    prompts.push(prompt);
    turn += 1;
    const text = turn === 1
      ? JSON.stringify({ type: "tool_call", name: "paperclip.list_workers", arguments: {} })
      : JSON.stringify({ type: "final", message: "Code Worker is ready, so I can assign the next implementation Task." });
    return {
      turnId: `agy-fallback-${turn}`,
      completion: Promise.resolve({ items: [{ type: "agentMessage", text }] })
    };
  },
  stop: () => {}
  });
});

const result = await runAgyRoomFallback({}, {
  runtime: {
    paperclipApiUrl: "http://127.0.0.1:3100",
    enableTaskAssignment: true,
    agyFallbackCommand: "agy",
    agyFallbackModel: "gemini-3.1-pro-high"
  },
  companyId,
  issue,
  agent,
  state,
  workingDirectory: process.cwd(),
  preparedText: "Continue implementation and inspect available Workers.",
  stagedAttachments: []
});

assert.equal(result.provider, "agy");
assert.equal(result.fallbackFrom, "codex");
assert.deepEqual(fallbackRoomRuntime.extraArgs, ["--print-timeout", "2h"]);
assert.match(result.items[0].text, /Code Worker is ready/);
assert.equal(prompts.length, 2);
assert.match(prompts[0], /paperclip\.list_workers/);
assert.match(prompts[1], /Code Worker/);
assert.equal(isProviderQuotaError(Object.assign(new Error("You've hit your usage limit"), { data: { code: "rate_limit" } })), true);
assert.equal(isProviderQuotaError(new Error("spawn EPERM")), false);
assert.deepEqual(parseAgyFallbackEnvelope('```json\n{"type":"final","message":"done"}\n```'), { type: "final", message: "done" });

setAgyClientFactoryForTest(null);
globalThis.fetch = originalFetch;
console.log("PASS Codex quota fallback continues through Agy and keeps SPS tools behind the existing Room authorization handler");
