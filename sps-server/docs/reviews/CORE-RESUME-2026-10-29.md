# Core resume: current Zod mitigation evidence — 2026-10-29

The user resumed Core work after the dependency/parallel-work checkpoint.
Builder implementation, new Native work and full untrusted OS containment
remain outside this increment. Root owns security/recovery decisions; Luna
agents performed bounded file, dependency and existing-test inventories.

## Change

`scripts/verify-zod-v3-issue-cap-candidate.mjs` still expected 100 child issues
for an array exceeding `.max(1)`. The current patch intentionally rejects that
array before parsing its elements, producing one size issue instead. The stale
expectation prevented this verifier from recording evidence for the current
patch.

The verifier now checks that exact size error and also probes all four installed
entrypoints: root/v3 ESM and root/v3 CommonJS. Over-limit arrays (`max` and exact
length) and Sets must not read elements or execute child transforms or parent
effects, in synchronous and asynchronous parsing. Existing unbounded-input
issue limits, nested union errors, Standard Schema, per-invocation function
budgets, low-volume diagnostics and valid-input checks remain intact.

This changes verification code only. No dependency version, patch, audit policy,
Core/SDK API, database, installed application or customer data was changed.

## Actual checks

Local runtime: Node `24.16.0`, pnpm `11.9.0`, Windows. Source CI uses Node 22;
these local results are not Node 22 CI or a new installer acceptance result.

| Check | Result |
| --- | --- |
| Core `pnpm install --frozen-lockfile --offline --ignore-scripts` | Success; already up to date, no lock changes |
| Core `pnpm --filter @paperclipai/server exec vitest run src/__tests__/zod-v3-issue-budget.test.ts src/__tests__/sps-validation-compatibility.test.ts --maxWorkers=1` | 2 files, 17 tests passed; about 42 seconds |
| Source `node --check sps-server/scripts/verify-zod-v3-issue-cap-candidate.mjs` | Success |
| Source `node sps-server/scripts/verify-zod-v3-issue-cap-candidate.mjs` | Success; patch hash `82d58282a08d684b253417bf277f6fef5ca2eed4e0dddce73a0c37ccf1fac79d`; constrained issues 1, unbounded/nested issues capped at 100, all four early-size-guard entrypoints passed |
| Desktop `node --test test/verify-packaged-zod-runtime.test.mjs` | 10 tests passed; about 21 seconds |

The packaged-runtime tests copy the current dependency into isolated temporary
fixtures. They include negative cases for removed array/Set guards, a removed
issue cap, dependency escape via a junction, missing packages and altered
manifest identity/version. They do not prove a newly packaged Desktop installer.

Core remains `40199c6e55e956c31381e2377860baa78bc7cabb`, SDK remains
`61a929f6c783f78e5af603682de1543c7e24abc0`; Source parent is
`73d5c09e293f9cdb31318ab7f18dca5022e04803`. The historical `98ab5563…`
installed-patch log is not reused as proof for the current `82d58282…` patch.

## Still open

The mitigation is not full advisory remediation or release clearance. The
[reviewed advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) still
lists the retained package version as affected. No audit waiver, severity
change or fake version was introduced. Production/development audit and full
Core regression/build were not repeated because this increment changed no
dependency or Core runtime code.

The existing major-migration impact review records compatibility/authorization
limits. A move to a new package major must preserve real consumers, including
the internal SDK's runtime `z` export; simply selecting a v3 compatibility
subpath from a newer package is not proof of remediation. See
[the impact review](ZOD-MIGRATION-IMPACT-2026-10-24.md).

Remote claim-response recovery, its durable empty-result receipt and local
execution-entry journal remain unimplemented. The next independent work path
is to fix that protocol before splitting server and client implementation.
Keep unknown executions pending rather than replaying them or claiming exit
from administrative status alone. Existing completion outbox behavior remains
separate from claim recovery.

No full local suite, Source push, new remote CI, release or installed-app
replacement was performed in this increment.
