# Zod v3 Bundle Security Review

Date: 2026-10-26.
Status: **Published Zod 4.6.6 leaves v3 behavior unchanged; the v4 patch also does not cap unbounded arrays.**

## Finding

The GitHub advisory lists versions before 4.6.6 and describes memory exhaustion
from retaining an issue per invalid element for array schemas without length
constraints. The upstream fix at `a0ebf97` is explicitly a v4 fix. Its patch
changes only `packages/zod/src/v4/` files: it adds array, map, and set
upper-bound checks before element parsing in the v4 interpreter and compiled
path. It does not change v3.

I inspected the published npm tarball for 4.6.6 directly:

- Tarball: <https://registry.npmjs.org/zod/-/zod-4.6.6.tgz>
- Published integrity: `sha512-4UmzQUF5fxvfcYHlbjBmejU+w+hbDnWFx4aS8kBx7nPBHcO2SqPbpAG8snbdg+Xse4pRefR98hgjFgIMCI/UhA==`
- Package metadata exports distinct `./v3` and `./v4` entry points.
- `package/v3/types.js` checks `.max()` and records an oversized-array issue,
  then still maps every element through `_parseSync` / `_parseAsync` and merges
  those element issues.
- `package/v4/core/schemas.js` includes the new `capSize` pre-parse gate.

The advisory wording and patch scope do not fully match: the patch checks
declared upper bounds before traversing oversized constrained collections. It
does not impose an issue cap or input-size limit on an unbounded array. A
bounded 10,000-element check of `z.array(z.string())` produced **10,000 issues
in both v3 and v4**. Therefore the published v4 fix alone does not eliminate
the advisory's stated unbounded-array condition.

## Bounded Reproduction

Using only 10,000 invalid elements, the published artifact produced:

```text
v3 constrained: success=false issues=10001
v4 constrained: success=false issues=1
v3 unbounded: issues=10000
v4 unbounded: issues=10000
```

The bounded test command, run from the directory containing the extracted
`package/` tree, was:

```sh
node --input-type=module -e 'import { createRequire } from "node:module"; const require=createRequire(import.meta.url); const z3=require("./package/v3/index.cjs"); const z4=require("./package/v4/index.cjs"); const input=Array.from({length:10000},()=>({bad:true})); for (const [name,z] of [["v3 constrained",z3],["v4 constrained",z4]]) { const r=z.array(z.string()).max(1).safeParse(input); console.log(name, "success="+r.success, "issues="+(r.success?0:r.error.issues.length)); } for (const [name,z] of [["v3 unbounded",z3],["v4 unbounded",z4]]) { const r=z.array(z.string()).safeParse(input); console.log(name, "issues="+(r.success?0:r.error.issues.length)); }'
```

This shows v3 does not stop parsing after a declared upper-bound failure, v4
does, and both retain one issue per invalid element when no upper bound exists.
The test is deliberately bounded and does not estimate worst-case memory use.

## Primary References

- [GitHub advisory GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)
- [Upstream fix commit patch a0ebf97](https://github.com/colinhacks/zod/commit/a0ebf97.patch)
- [Published npm Zod 4.6.6 tarball](https://registry.npmjs.org/zod/-/zod-4.6.6.tgz)

## Remediation Options

1. Move affected validation call sites to `zod/v4`, after characterizing
   schema API, error shape, and inferred-type compatibility. Also bound every
   network-facing collection and request body; v4's patch does not cap
   unbounded arrays.
2. If v3 source contracts must remain, maintain a reviewed v3 package patch
   with an issue-accumulation cap / early stop that also covers unbounded
   arrays, rather than only porting the v4 declared-max gate. Test sync and
   async parsing, nested schemas, transforms, error shape, and MCP peer
   integration against the exact published dependency.
3. A version-only upgrade to 4.6.6 while retaining `zod/v3` imports is not
   remediation. A request-size perimeter limit is only a complete mitigation
   if every untrusted parse path enforces it before parsing at a sufficiently
   low configured ceiling.

No package manifest, lockfile, or product source was changed for this review.
