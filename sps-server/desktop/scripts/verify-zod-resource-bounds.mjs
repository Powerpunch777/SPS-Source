import assert from "node:assert/strict";

function virtualArray(value, length = 100_000_000) {
  let reads = 0;
  const input = new Proxy([], {
    get(target, key, receiver) {
      if (key === "length") return length;
      if (typeof key === "string" && /^\d+$/.test(key)) {
        // A broken guard must fail without exhausting the verifier's memory.
        if (++reads > 1024) throw new Error("Zod collection read bound exceeded");
        return value;
      }
      return Reflect.get(target, key, receiver);
    },
  });
  return { input, reads: () => reads };
}

function assertSizeIssue(result, kind, label) {
  assert.equal(result.success, false, `${label} must reject an oversized ${kind}`);
  assert.ok(result.error.issues.some(issue => issue.code === "too_big"
    && (issue.type ?? issue.origin) === kind && issue.maximum === 10), `${label} lost size issue metadata`);
}

export async function verifyZodSizeGuards(label, z) {
  for (const async of [false, true]) {
    for (const constraint of ["max", "length"]) {
      const tracked = virtualArray("valid", 250);
      let childCalls = 0, parentCalls = 0;
      const element = async ? z.string().transform(async value => { childCalls++; return value; })
        : z.string().transform(value => { childCalls++; return value; });
      const schema = z.array(element)[constraint](10).refine(() => { parentCalls++; return true; });
      const result = async ? await schema.safeParseAsync(tracked.input) : schema.safeParse(tracked.input);
      assertSizeIssue(result, "array", label);
      assert.equal(!!result.error.issues[0].exact, constraint === "length");
      assert.equal(tracked.reads(), 0, `${label} read array elements before rejecting the over-limit ${constraint}`);
      assert.equal(childCalls, 0, `${label} executed a child transform for an oversized array`);
      assert.equal(parentCalls, 0, `${label} executed parent effects for an oversized array`);
    }
    let iterations = 0, childCalls = 0, parentCalls = 0;
    class TrackedSet extends Set {
      values() { iterations++; return super.values(); }
      [Symbol.iterator]() { iterations++; return super[Symbol.iterator](); }
    }
    const value = new TrackedSet(Array.from({ length: 250 }, (_, index) => String(index)));
    const element = async ? z.string().transform(async item => { childCalls++; return item; })
      : z.string().transform(item => { childCalls++; return item; });
    const schema = z.set(element).max(10).refine(() => { parentCalls++; return true; });
    const result = async ? await schema.safeParseAsync(value) : schema.safeParse(value);
    assertSizeIssue(result, "set", label);
    assert.equal(iterations, 0, `${label} iterated Set values before rejecting an over-limit Set`);
    assert.equal(childCalls, 0);
    assert.equal(parentCalls, 0);
  }
}

export async function verifyZodV3CollectionBounds(label, z) {
  const boundResults = [];
  for (const async of [false, true]) {
    const tracked = virtualArray(async ? "bad" : 1);
    const schema = z.array(async ? z.string().refine(async () => false) : z.string());
    const result = async ? await schema.safeParseAsync(tracked.input) : schema.safeParse(tracked.input);
    assert.equal(result.success, false);
    assert.equal(result.error.issues.length, 100, `${label} does not enforce the 100-issue budget`);
    assert.equal(result.error.issues.at(-1)?.message, "Too many validation issues; additional issues omitted.");
    assert.ok(tracked.reads() <= (async ? 128 : 100), `${label} traversed invalid array input after issue exhaustion`);
    let setReads = 0, mapReads = 0;
    class TrackedSet extends Set { *values() { for (const value of super.values()) { setReads++; yield value; } } }
    class TrackedMap extends Map { *entries() { for (const pair of super.entries()) { mapReads++; yield pair; } } }
    const set = new TrackedSet(Array.from({ length: 250 }, (_, index) => index));
    const map = new TrackedMap(Array.from({ length: 250 }, (_, index) => [index, index]));
    const setSchema = z.set(z.string()), mapSchema = z.map(z.string(), z.string());
    const setResult = async ? await setSchema.safeParseAsync(set) : setSchema.safeParse(set);
    const mapResult = async ? await mapSchema.safeParseAsync(map) : mapSchema.safeParse(map);
    assert.equal(setResult.success, false);
    assert.equal(mapResult.success, false);
    assert.ok(setReads <= 128, `${label} traversed invalid Set input after issue exhaustion`);
    assert.ok(mapReads <= 128, `${label} traversed invalid Map input after issue exhaustion`);
    const validNumbers = Array.from({ length: 250 }, (_, index) => index);
    const alternatives = z.array(z.union([z.string(), z.number()]));
    assert.deepEqual(async ? await alternatives.parseAsync(validNumbers) : alternatives.parse(validNumbers), validNumbers);
    boundResults.push({ async, arrayReads: tracked.reads(), setReads, mapReads });
  }
  return boundResults;
}
