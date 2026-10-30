import assert from "node:assert/strict";
import test from "node:test";
import { createSpsNodeUsageCollector } from "../src/usage-collector.mjs";

const validUsage = {
  opus: {
    inputTokens: 10,
    cacheCreationInputTokens: 2,
    cacheReadInputTokens: 3,
    outputTokens: 4,
  },
};

function resultLine(modelUsage, extra = {}) {
  return JSON.stringify({ type: "result", modelUsage, ...extra });
}

function pushLine(collector, value) {
  collector.push(`${JSON.stringify(value)}\n`);
}

test("collects a result split across byte chunks without corrupting UTF-8", () => {
  const collector = createSpsNodeUsageCollector("claude_cli");
  const line = Buffer.from(`${resultLine(validUsage, { message: "caf\u00e9" })}\n`, "utf8");
  const split = line.indexOf(Buffer.from("\u00e9", "utf8")) + 1;
  collector.push(line.subarray(0, split));
  collector.push(line.subarray(split, line.length - 1));
  collector.push(line.subarray(line.length - 1));

  assert.deepEqual(collector.finish(), {
    schemaVersion: 1,
    source: "claude_model_usage_v1",
    inputTokens: 12,
    cachedInputTokens: 3,
    outputTokens: 4,
  });
});

test("preserves explicit zero metrics and accepts a final record without a newline", () => {
  const collector = createSpsNodeUsageCollector("claude_cli");
  collector.push(resultLine({ opus: {
    inputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
    outputTokens: 0,
  } }));

  assert.deepEqual(collector.finish(), {
    schemaVersion: 1,
    source: "claude_model_usage_v1",
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
  });
});

test("a complete result without a usage ledger and truncated JSON clear stale usage", () => {
  const missingLedger = createSpsNodeUsageCollector("claude_cli");
  missingLedger.push(`${resultLine(validUsage)}\n`);
  missingLedger.push('{"type":"result"}\n');
  assert.equal(missingLedger.finish(), null);

  const truncated = createSpsNodeUsageCollector("claude_cli");
  truncated.push(`${resultLine(validUsage)}\n`);
  truncated.push('{"type":"result","modelUsage":{"opus":');
  assert.equal(truncated.finish(), null);
});

test("malformed JSON-like lines and invalid UTF-8 clear a prior report", () => {
  const collector = createSpsNodeUsageCollector("claude_cli");
  collector.push(`${resultLine(validUsage)}\n{"type":"result",broken}\n`);
  assert.equal(collector.finish(), null);

  const invalidUtf8 = createSpsNodeUsageCollector("claude_cli");
  invalidUtf8.push(`${resultLine(validUsage)}\n`);
  invalidUtf8.push(Buffer.from([0xff, 0x0a]));
  assert.equal(invalidUtf8.finish(), null);
});

test("ordinary non-JSON output does not clear a prior report", () => {
  const collector = createSpsNodeUsageCollector("claude_cli");
  collector.push(`${resultLine(validUsage)}\n`);
  collector.push("Claude CLI footer text\n");

  assert.deepEqual(collector.finish(), {
    schemaVersion: 1,
    source: "claude_model_usage_v1",
    inputTokens: 12,
    cachedInputTokens: 3,
    outputTokens: 4,
  });
});

test("invalid ledgers and invalid entries clear the prior report instead of being skipped", () => {
  const invalidLedgers = [
    undefined,
    null,
    [],
    {},
    { opus: {} },
    { opus: null },
    Object.fromEntries(Array.from({ length: 65 }, (_, index) => [`model-${index}`, validUsage.opus])),
  ];

  for (const modelUsage of invalidLedgers) {
    const collector = createSpsNodeUsageCollector("claude_cli");
    collector.push(`${resultLine(validUsage)}\n`);
    pushLine(collector, { type: "result", ...(modelUsage === undefined ? {} : { modelUsage }) });
    assert.equal(collector.finish(), null);
  }

  const malformedMetrics = createSpsNodeUsageCollector("claude_cli");
  malformedMetrics.push(`${resultLine({
    opus: { ...validUsage.opus, inputTokens: "10" },
    sonnet: { ...validUsage.opus, outputTokens: -1 },
  })}\n`);
  assert.deepEqual(malformedMetrics.finish(), {
    schemaVersion: 1,
    source: "claude_model_usage_v1",
    inputTokens: null,
    cachedInputTokens: 6,
    outputTokens: null,
  });

  const partialMetrics = createSpsNodeUsageCollector("claude_cli");
  partialMetrics.push(`${resultLine({
    first: { inputTokens: 1, cacheCreationInputTokens: 2, cacheReadInputTokens: 3, outputTokens: 4 },
    second: { inputTokens: Number.MAX_SAFE_INTEGER + 1, cacheCreationInputTokens: 1, cacheReadInputTokens: 5, outputTokens: 6 },
  })}\n`);
  assert.deepEqual(partialMetrics.finish(), {
    schemaVersion: 1,
    source: "claude_model_usage_v1",
    inputTokens: null,
    cachedInputTokens: 8,
    outputTokens: 10,
  });
});

test("returns null for overflowing totals and for a ledger with no usable metrics", () => {
  const overflow = createSpsNodeUsageCollector("claude_cli");
  overflow.push(`${resultLine({
    first: { inputTokens: 1, cacheCreationInputTokens: 2, cacheReadInputTokens: Number.MAX_SAFE_INTEGER, outputTokens: Number.MAX_SAFE_INTEGER },
    second: { inputTokens: 3, cacheCreationInputTokens: 4, cacheReadInputTokens: 1, outputTokens: 1 },
  })}\n`);
  assert.deepEqual(overflow.finish(), {
    schemaVersion: 1,
    source: "claude_model_usage_v1",
    inputTokens: 10,
    cachedInputTokens: null,
    outputTokens: null,
  });

  const allNull = createSpsNodeUsageCollector("claude_cli");
  allNull.push(`${resultLine({ opus: { inputTokens: -1, cacheCreationInputTokens: 0, cacheReadInputTokens: null, outputTokens: "4" } })}\n`);
  assert.equal(allNull.finish(), null);
});

test("the latest result replaces earlier usage and a missing or malformed ledger clears it", () => {
  const replaced = createSpsNodeUsageCollector("claude_cli");
  replaced.push(`${resultLine(validUsage)}\n${resultLine({ opus: {
    inputTokens: 20,
    cacheCreationInputTokens: 1,
    cacheReadInputTokens: 7,
    outputTokens: 9,
  } })}\n`);
  assert.deepEqual(replaced.finish(), {
    schemaVersion: 1,
    source: "claude_model_usage_v1",
    inputTokens: 21,
    cachedInputTokens: 7,
    outputTokens: 9,
  });

  for (const modelUsage of [undefined, { opus: null }]) {
    const cleared = createSpsNodeUsageCollector("claude_cli");
    cleared.push(`${resultLine(validUsage)}\n`);
    pushLine(cleared, { type: "result", ...(modelUsage === undefined ? {} : { modelUsage }) });
    assert.equal(cleared.finish(), null);
  }
});

test("discards oversized lines through newline and recovers for the next record", () => {
  const collector = createSpsNodeUsageCollector("claude_cli");
  collector.push(`${resultLine(validUsage)}\n`);
  const oversized = Buffer.concat([
    Buffer.from('{"type":"result","modelUsage":{"opus":{}},"padding":"'),
    Buffer.alloc(64 * 1024, 0x78),
    Buffer.from('"}\n'),
    Buffer.from(`${resultLine(validUsage)}\n`),
  ]);
  collector.push(oversized);

  assert.deepEqual(collector.finish(), {
    schemaVersion: 1,
    source: "claude_model_usage_v1",
    inputTokens: 12,
    cachedInputTokens: 3,
    outputTokens: 4,
  });

  const oversizedFinal = createSpsNodeUsageCollector("claude_cli");
  oversizedFinal.push(`${resultLine(validUsage)}\n`);
  oversizedFinal.push(Buffer.alloc(64 * 1024 + 1, 0x78));
  assert.equal(oversizedFinal.finish(), null);
});

test("stale reports clear on oversized, invalid UTF-8, and truncated JSON input, then recover", () => {
  const failures = [
    ["oversized", (collector) => collector.push(Buffer.concat([
      Buffer.from('{"type":"result","padding":"'),
      Buffer.alloc(64 * 1024, 0x78),
      Buffer.from('"}\n'),
    ]))],
    ["invalid UTF-8", (collector) => collector.push(Buffer.from([0xff, 0x0a]))],
    ["truncated JSON", (collector) => collector.push('  {"type":"result","modelUsage":\n')],
  ];
  const expected = {
    schemaVersion: 1,
    source: "claude_model_usage_v1",
    inputTokens: 12,
    cachedInputTokens: 3,
    outputTokens: 4,
  };

  for (const [label, pushFailure] of failures) {
    const stale = createSpsNodeUsageCollector("claude_cli");
    stale.push(`${resultLine(validUsage)}\n`);
    pushFailure(stale);
    assert.equal(stale.finish(), null, label);

    const recovered = createSpsNodeUsageCollector("claude_cli");
    recovered.push(`${resultLine(validUsage)}\n`);
    pushFailure(recovered);
    recovered.push(`${resultLine(validUsage)}\n`);
    assert.deepEqual(recovered.finish(), expected, label);
  }
});

test("does not collect usage for any other runtime", () => {
  for (const runtimeKind of ["codex_cli", "agy_cli", "gemini_cli", "opencode_cli", "pi_cli", "ollama", "lm_studio", null]) {
    const collector = createSpsNodeUsageCollector(runtimeKind);
    collector.push(`${resultLine(validUsage)}\n`);
    assert.equal(collector.finish(), null);
  }
});
