# Zod v3 Issue-Budget Mitigation

Date: 2026-10-26
Status: implemented in the Core dependency graph; full CI and separate release-audit review remain outstanding. This patch does not clear or waive the Zod advisory.

## Finding and scope

Core’s validation dependencies resolve Zod 3.25.76. The Plugin SDK publicly
exports `z` from `zod`, and Core, Shared, MCP Server, and the SDK consume the v3
API. Migrating those schemas and preserving the public SDK contract would be a
broad change.

The official [GHSA-mrhx-c7xc-m3w5 advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)
describes unbounded issue accumulation while validating arrays. The upstream
[a0ebf97 patch](https://github.com/colinhacks/zod/commit/a0ebf97.patch) changes
only v4 and gates collections with declared upper bounds before visiting
elements. That does not bound diagnostics for unbounded v3 arrays.

## Registered Core patch

Core registers an exact-version pnpm package patch for Zod 3.25.76 in
`external/sps-core/patches/zod@3.25.76.patch`; the generated patch hash is
`98ab5563b76cf600adedfa38d3d1eb4619c837b7eec2f16d1f3f16c0560afa9f`.
The workspace and lockfile register this hash. The lock retains Better Auth’s
existing `better-call@1.3.7(zod@4.6.6)` peer selection.

The patch caps each parse’s retained issue tree at 100 records across nested
schemas, unions, async validation, Standard Schema, and CommonJS. One root
custom issue says when further diagnostics were omitted. The internal budget is
passed through a module-private Symbol, so callers cannot supply or reset it
through Zod’s public parse options. `ZodFunction` creates a fresh budget per
invocation and reserves one nested record for its outer argument/return issue;
repeated failures do not poison later calls.

The patch preserves the public `zod` and `zod/v3` imports and TypeScript schema
types. Valid inputs and failures with at most 99 ordinary diagnostics retain
their existing issue data. More invalid inputs have intentionally truncated
error detail. This limits issue-object creation and retained error memory; it
does not make validation constant-time. Zod still visits input elements and may
allocate per-element parse results or promises. Request-size ceilings and
collection bounds remain necessary for CPU and general input memory.

## Verification

[`verify-zod-v3-issue-cap-candidate.mjs`](../../scripts/verify-zod-v3-issue-cap-candidate.mjs)
now verifies the installed patched package without modifying its files. It
checks that the registered lock hash matches the patch artifact, copies the
installed package into an identity-checked temporary directory, and tests the
copied root and v3 ESM/CommonJS entrypoints. The bounded cases include sync and
async arrays, nested union issue counts, Standard Schema, caller-supplied
`issueBudget` resistance, exact low-error paths/messages, valid union fallback,
`.catch`, late refinements, 105 repeated sync function failures, repeated async
function failures, later valid calls, and a valid 10,000-element array. It then
identity-checks and removes only its owned temporary copy.

Focused Core test command:

```text
pnpm exec vitest run server/src/__tests__/sps-validation-compatibility.test.ts server/src/__tests__/zod-v3-issue-budget.test.ts
```

Latest result: 2 files passed, 13 tests passed. The installed-package verifier
also completed with exit code 0 after registration. Full local Core typecheck
and build passed. Hosted Source run 40307373086 also passed the Linux build,
all nine Core test shards and three actual Native integration gates at Core
1d5ddcf7. Final Source/Windows CI and the separate security gate remain required.

Desktop runtime preparation now also verifies the deployed Core server's exact
Zod dependency immediately after `pnpm deploy`; packaged runtime verification
repeats that check. Each check uses a fresh Node process and canonical paths
contained by the explicit runtime root, preventing cached modules or a source
checkout dependency from substituting for the deployed package. Root and v3
ESM/CommonJS entrypoints must accept valid inputs and enforce the 100-record
diagnostic ceiling. This confirms the mitigation reaches the selected runtime;
it does not resolve the advisory or replace full artifact qualification.

The runtime verifier and packaging contract suite passed 18/18, including
replacement at the same package path, a checkout junction escaping the runtime,
missing dependency/server manifest and wrong Zod version. A subsequent exact
Core manifest-name rejection test passed separately. These fixture tests copy
the actually installed patched Core dependency and require the frozen Core
dependencies to be installed first. Full deployed/package execution is still
required; these are not signed artifact or installation results.

The optimized helper fixture copies the unchanged published manifest and root
ESM/CommonJS entries plus the complete v3 subtree, including locales/helpers.
It omits unrelated v4/source trees: 55 files/~460 KB instead of 596 files/~3.6 MB.
All eight helper cases passed again, in 11.56 seconds on the local machine.
No production package or verifier coverage was removed by this fixture change.

## Existing security gate

The SPS release audit maps dependency findings to exact package/advisory policy
entries. It does not verify pnpm patch provenance or patch behavior. Registering
a package patch therefore does not make that audit accept the affected Zod 3
version. No exception or gate waiver is part of this change, and the High
advisory remains unresolved in the audit until a separately reviewed gate can
verify the exact patched artifact, integrity, regression evidence, and shipped
dependency graph, or an upstream version recognized as fixed is adopted.
