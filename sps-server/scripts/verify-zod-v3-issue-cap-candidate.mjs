import assert from "node:assert/strict";
import { cp, lstat, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");
const coreRoot = path.join(repoRoot, "external/sps-core");
const installed = await realpath(path.join(coreRoot, "server/node_modules/zod"));
const tempBase = await realpath(os.tmpdir());
const tempRoot = await mkdtemp(path.join(tempBase, "sps-zod-v3-installed-check-"));
const verifiedTempRoot = await realpath(tempRoot);
assert.equal(verifiedTempRoot, tempRoot);
assert.equal(path.dirname(verifiedTempRoot), tempBase);
assert.match(path.basename(verifiedTempRoot), /^sps-zod-v3-installed-check-/);
const copied = path.join(tempRoot, "zod");
const LIMIT = 100;
const OVERFLOW_MESSAGE = "Too many validation issues; additional issues omitted.";

function recursiveIssueCount(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return 0;
  seen.add(value);
  if (Array.isArray(value)) return value.reduce((total, entry) => total + recursiveIssueCount(entry, seen), 0);
  let total = typeof value.code === "string" && Array.isArray(value.path) ? 1 : 0;
  for (const key of ["unionErrors", "argumentsError", "returnTypeError", "issues"]) {
    total += recursiveIssueCount(value[key], seen);
  }
  return total;
}

function trackedArray() {
  let reads = 0;
  const value = new Array(250);
  for (let index = 0; index < value.length; index++) {
    Object.defineProperty(value, String(index), {
      configurable: true,
      enumerable: true,
      get() { reads++; return "valid"; },
    });
  }
  return { value, reads: () => reads };
}

async function verifyEarlySizeRejection(label, z) {
  for (const constraint of ["max", "length"]) {
    const tracked = trackedArray();
    let childCalls = 0;
    let parentCalls = 0;
    const result = z.array(z.string().transform(value => {
      childCalls++;
      return value;
    }))[constraint](10).refine(() => { parentCalls++; return true; }).safeParse(tracked.value);
    assert.equal(result.success, false, `${label} must reject the oversized ${constraint} array`);
    assert.equal(result.error.issues.length, 1);
    assert.equal(result.error.issues[0].code, "too_big");
    assert.equal(result.error.issues[0].maximum, 10);
    assert.equal(result.error.issues[0].type, "array");
    assert.equal(result.error.issues[0].exact, constraint === "length");
    assert.equal(tracked.reads(), 0, `${label} must not read oversized array elements`);
    assert.equal(childCalls, 0, `${label} must not transform oversized array elements`);
    assert.equal(parentCalls, 0, `${label} must abort parent effects for oversized arrays`);

    const asyncTracked = trackedArray();
    let asyncChildCalls = 0;
    let asyncParentCalls = 0;
    const asyncResult = await z.array(z.string().transform(async value => {
      asyncChildCalls++;
      return value;
    }))[constraint](10).refine(() => { asyncParentCalls++; return true; }).safeParseAsync(asyncTracked.value);
    assert.equal(asyncResult.success, false);
    assert.equal(asyncResult.error.issues.length, 1);
    assert.equal(asyncResult.error.issues[0].code, "too_big");
    assert.equal(asyncResult.error.issues[0].maximum, 10);
    assert.equal(asyncResult.error.issues[0].type, "array");
    assert.equal(asyncResult.error.issues[0].exact, constraint === "length");
    assert.equal(asyncTracked.reads(), 0, `${label} must not read oversized async array elements`);
    assert.equal(asyncChildCalls, 0, `${label} must not run async child transforms`);
    assert.equal(asyncParentCalls, 0, `${label} must abort async parent effects`);
  }

  class TrackedSet extends Set {
    iterations = 0;
    values() { this.iterations++; return super.values(); }
  }
  for (const async of [false, true]) {
    const value = new TrackedSet(Array.from({ length: 250 }, (_, index) => `value-${index}`));
    let childCalls = 0;
    let parentCalls = 0;
    const schema = z.set(z.string().transform(entry => {
      childCalls++;
      return entry;
    })).max(10).refine(() => { parentCalls++; return true; });
    const result = async ? await schema.safeParseAsync(value) : schema.safeParse(value);
    assert.equal(result.success, false);
    assert.equal(result.error.issues.length, 1);
    assert.equal(result.error.issues[0].code, "too_big");
    assert.equal(result.error.issues[0].maximum, 10);
    assert.equal(result.error.issues[0].type, "set");
    assert.equal(value.iterations, 0, `${label} must not iterate an oversized Set`);
    assert.equal(childCalls, 0, `${label} must not transform oversized Set elements`);
    assert.equal(parentCalls, 0, `${label} must abort oversized Set parent effects`);
  }
}

try {
  const manifest = JSON.parse(await readFile(path.join(installed, "package.json"), "utf8"));
  assert.equal(manifest.version, "3.25.76");
  const patchPath = path.join(coreRoot, "patches/zod@3.25.76.patch");
  const patchHash = crypto.createHash("sha256").update(await readFile(patchPath)).digest("hex");
  const lock = await readFile(path.join(coreRoot, "pnpm-lock.yaml"), "utf8");
  assert.ok(lock.includes(`zod@3.25.76: ${patchHash}`), "lockfile does not register the actual Zod patch hash");

  const esmTypes = await readFile(path.join(installed, "v3/types.js"), "utf8");
  const cjsTypes = await readFile(path.join(installed, "v3/types.cjs"), "utf8");
  const esmParseUtil = await readFile(path.join(installed, "v3/helpers/parseUtil.js"), "utf8");
  const cjsParseUtil = await readFile(path.join(installed, "v3/helpers/parseUtil.cjs"), "utf8");
  for (const [name, source] of [["ESM", esmTypes], ["CJS", cjsTypes]]) {
    assert.ok(source.includes('Symbol("zod.issueBudget")'), `${name} runtime does not use a module-private budget key`);
    assert.ok(source.includes("const createParams = () =>"), `${name} function wrappers do not allocate budgets per invocation`);
    assert.ok(source.includes("limit: 99"), `${name} function wrapper does not reserve room for its outer issue`);
  }
  for (const [name, source] of [["ESM", esmParseUtil], ["CJS", cjsParseUtil]]) {
    assert.ok(source.includes("const issueLimit = budget.limit ?? MAX_RETAINED_ISSUES"), `${name} runtime does not enforce nested budget limits`);
  }

  // Verify a copied installation, without rewriting package files or importing an edit tree.
  await cp(installed, copied, { recursive: true, dereference: true });
  const z3 = await import(pathToFileURL(path.join(copied, "v3/index.js")).href);
  const rootZ3 = await import(pathToFileURL(path.join(copied, "index.js")).href);
  const require = createRequire(path.join(copied, "package.json"));
  const cjsZ3 = require("./v3/index.cjs");
  const cjsRootZ3 = require("./index.cjs");
  const sizeGuardEntrypoints = [["root ESM", rootZ3.z], ["v3 ESM", z3.z],
    ["root CommonJS", cjsRootZ3.z], ["v3 CommonJS", cjsZ3.z]];
  for (const [label, entrypoint] of sizeGuardEntrypoints) {
    await verifyEarlySizeRejection(label, entrypoint);
  }
  const payload = Array.from({ length: 10_000 }, () => ({ invalid: true }));

  const sync = z3.z.array(z3.z.string()).safeParse(payload);
  assert.equal(sync.success, false);
  assert.equal(recursiveIssueCount(sync.error), LIMIT);
  assert.equal(sync.error.issues.length, LIMIT);
  assert.deepEqual(sync.error.issues.at(-1), { code: "custom", path: [], message: OVERFLOW_MESSAGE });
  const constrained = z3.z.array(z3.z.string()).max(1).safeParse(payload);
  assert.equal(constrained.success, false);
  assert.equal(recursiveIssueCount(constrained.error), 1);
  assert.deepEqual(constrained.error.issues, [{
    code: "too_big", maximum: 1, type: "array", inclusive: true, exact: false,
    message: "Array must contain at most 1 element(s)", path: [],
  }]);

  const nestedUnion = z3.z.array(z3.z.union([z3.z.string(), z3.z.number()])).safeParse(payload);
  assert.equal(nestedUnion.success, false);
  assert.equal(recursiveIssueCount(nestedUnion.error), LIMIT);
  assert.ok(JSON.stringify(nestedUnion.error.issues).length < 100_000);
  const async = await z3.z.array(z3.z.string().refine(async () => false)).safeParseAsync(payload.slice(0, 2000));
  assert.equal(async.success, false);
  assert.equal(recursiveIssueCount(async.error), LIMIT);
  const asyncTrees = await z3.z.array(z3.z.array(z3.z.string().refine(async () => false)))
    .safeParseAsync(Array.from({ length: 20 }, () => Array.from({ length: 20 }, () => "bad")));
  assert.equal(asyncTrees.success, false);
  assert.equal(recursiveIssueCount(asyncTrees.error), LIMIT);

  const standard = await z3.z.array(z3.z.string())["~standard"].validate(payload);
  assert.ok("issues" in standard);
  assert.equal(recursiveIssueCount(standard.issues), LIMIT);
  const smallErrors = z3.z.array(z3.z.string()).safeParse([1, {}]);
  assert.equal(smallErrors.success, false);
  assert.deepEqual(smallErrors.error.issues, [
    { code: "invalid_type", expected: "string", received: "number", path: [0], message: "Expected string, received number" },
    { code: "invalid_type", expected: "string", received: "object", path: [1], message: "Expected string, received object" },
  ]);
  const callerBudget = z3.z.array(z3.z.string()).safeParse(payload, {
    issueBudget: { count: 0, truncated: false, rootIssues: [] },
  });
  assert.equal(callerBudget.success, false);
  assert.equal(recursiveIssueCount(callerBudget.error), LIMIT);

  const noisyBranch = z3.z.object({ tag: z3.z.string() }).superRefine((_value, ctx) => {
    for (let index = 0; index < 150; index++) ctx.addIssue({ code: "custom", path: ["branch", index], message: `branch-${index}` });
  });
  const successfulAlternative = z3.z.union([noisyBranch, z3.z.any()]).safeParse({ tag: "valid fallback" });
  assert.equal(successfulAlternative.success, true);
  const caught = z3.z.array(z3.z.string()).catch(["default"]).safeParse(payload);
  assert.deepEqual(caught, { success: true, data: ["default"] });
  const lateOnlyIssue = z3.z.array(z3.z.any().superRefine((_value, ctx) => {
    ctx.addIssue({ code: "custom", message: "per item" });
  })).superRefine((_value, ctx) => ctx.addIssue({ code: "custom", message: "late root issue" }))
    .safeParse(Array.from({ length: 200 }, () => "bad"));
  assert.equal(lateOnlyIssue.success, false);
  assert.equal(recursiveIssueCount(lateOnlyIssue.error), LIMIT);

  const syncFunction = z3.z.function().args(z3.z.array(z3.z.string())).returns(z3.z.array(z3.z.string()))
    .implement(value => value);
  for (let call = 0; call < 105; call++) {
    let error;
    try { syncFunction(payload); } catch (caughtError) { error = caughtError; }
    assert.ok(error instanceof z3.ZodError);
    assert.ok(recursiveIssueCount(error) > 0 && recursiveIssueCount(error) <= LIMIT);
  }
  assert.deepEqual(syncFunction(["valid"]), ["valid"]);
  const asyncFunction = z3.z.function().args(z3.z.array(z3.z.string())).returns(z3.z.promise(z3.z.array(z3.z.string())))
    .implement(async value => value);
  for (let call = 0; call < 3; call++) {
    let error;
    try { await asyncFunction(payload); } catch (caughtError) { error = caughtError; }
    assert.ok(error instanceof z3.ZodError);
    assert.ok(recursiveIssueCount(error) > 0 && recursiveIssueCount(error) <= LIMIT);
  }
  assert.deepEqual(await asyncFunction(["valid"]), ["valid"]);

  const root = rootZ3.z.array(rootZ3.z.string()).safeParse(payload);
  assert.equal(root.success, false);
  assert.equal(recursiveIssueCount(root.error), LIMIT);
  const cjs = cjsZ3.z.array(cjsZ3.z.string()).safeParse(payload);
  assert.equal(cjs.success, false);
  assert.equal(recursiveIssueCount(cjs.error), LIMIT);
  const cjsRoot = cjsRootZ3.z.array(cjsRootZ3.z.string()).safeParse(payload);
  assert.equal(cjsRoot.success, false);
  assert.equal(recursiveIssueCount(cjsRoot.error), LIMIT);

  const valid = z3.z.array(z3.z.string()).safeParse(Array.from({ length: 10_000 }, () => "valid"));
  assert.equal(valid.success, true);
  assert.equal(valid.data.length, 10_000);
  console.log(JSON.stringify({ version: manifest.version, patchHash, maxIssues: LIMIT,
    syncIssues: sync.error.issues.length, constrainedIssues: constrained.error.issues.length,
    nestedUnionTreeIssues: recursiveIssueCount(nestedUnion.error), asyncIssues: recursiveIssueCount(async.error),
    standardIssues: recursiveIssueCount(standard.issues), cjsIssues: recursiveIssueCount(cjs.error),
    cjsRootIssues: recursiveIssueCount(cjsRoot.error), asyncNestedTreeIssues: recursiveIssueCount(asyncTrees.error),
    repeatedSyncFunctionCalls: 105, repeatedAsyncFunctionCalls: 3, postErrorCallsValid: true,
    lowErrorContract: smallErrors.error.issues.length, validUnionFallback: successfulAlternative.success,
    catchDefault: caught.success, validLargeArray: valid.success,
    sizeGuardEntrypoints: sizeGuardEntrypoints.map(([label]) => label) }, null, 2));
} finally {
  const current = await lstat(tempRoot);
  const resolved = await realpath(tempRoot);
  assert.equal(current.isDirectory(), true);
  assert.equal(current.isSymbolicLink(), false);
  assert.equal(resolved, verifiedTempRoot);
  assert.equal(path.dirname(resolved), tempBase);
  assert.match(path.basename(resolved), /^sps-zod-v3-installed-check-/);
  await rm(resolved, { recursive: true, force: false });
}
