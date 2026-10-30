# Native connectivity SDK: current request — 2026-10-27

The public SDK now offers the additive, unreleased
`createSpsRuntimeClient(transport).connectivity.current()` operation. Core's
worker context also exposes `ctx.sps.connectivity.current()`. This first facade
reads evidence for the current invocation only. It does not create connections,
enumerate saved targets, approve devices or start Node/AI execution. Native Plugin
UI/assets/events, connection subscription and physical two-PC qualification remain
unfinished. This is not an npm publication or a supported Native product release.

## Contract and trusted source

`sps.connectivity.current` takes exactly `{}` over RPC and no JavaScript arguments.
The dedicated `sps.connectivity.read` capability and a current, canonical Workspace
invocation are mandatory. The Core handler rejects target fields and accessors
before the generic company-scope helper can read them. Workers receive only an
opaque host-created invocation ID; the Native observation callback stays in Core
memory and is never serialized or accepted from Worker JSON.

Core's Native reader derives Host ID, user and device from authenticated Main proof,
the real session and current approved certificate/Workspace authorization. The
runtime checks current session/device, Plugin activation/dependencies/readiness,
selected shell/widget and lifecycle before returning an observation. WorkerManager
checks the active invocation and authority around the callback and result delivery.
Completion, revocation and cancellation invalidate subsequent reads.

The exact seven public fields are `state`, `transport`, `hostId`, `workspaceId`,
`authorization`, `evidence` and `observedAt`. A Native observation has `verified`,
`native_tls`, a Host UUID, the invocation Workspace UUID, `authorized`,
`authenticated_request` and a canonical UTC timestamp. A regular scoped invocation
without Native evidence returns `unavailable`, a null Host, `unknown` authorization
and `none` evidence. Missing/invalid/global invocation scope is denied.

`verified` describes an authenticated request, not a persistent open socket, future
availability or an independent execution grant. The response excludes addresses,
ports, device/user IDs, certificates, pins, cookies, keys, Secrets and other targets.
The public facade validates and freezes the closed DTO, rejecting extra fields,
getters, invalid UUIDs/timestamps and inconsistent status/evidence combinations.

## Compatibility and composition

The existing registered-handler support snapshot advertises the operation. Public
`readSpsHostSupport` recognizes it; missing, older and unknown reports do not acquire
support by version inference. Callers inspect reported operations before using the
feature. No fallback uses Tailscale, plaintext, arbitrary sockets or Host authority.
An ordinary invocation reporting Native unavailable can still use its separately
authorized existing workflow. Model, Agent, Source and Node permissions remain
independent. No SDK Core primitive or general administrator API was added.

Core app composition uses its existing worker manager and handler factory. This
increment does not load Plugin code into the retained Native Workspace renderer or
relax that renderer's CSP. Public Plugin relay and isolated UI integration remain
the next product step. The SDK package version stays unreleased source; the exact
Core/SDK gitlinks and support matrix identify the development candidate.

## Scoped checks and corrections

No full local suite, full workspace build or manual full CI rerun was started.

- Public SDK selected checks initially passed 6/8. Both failures were the new
  validator returning a null-prototype DTO where a plain DTO was expected. A frozen
  plain projection fixed this; only the two failed cases were rerun and passed.
- Core SDK handler tests initially passed 4/5. The in-process RPC test incorrectly
  expected an extra result wrapper. Its corrected named case passed separately.
- Actual owned Core worker process loaded the public SDK runtime, used the gated
  handler and host-only callback, received only public fields and denied revoked
  authority. That case and the corrected scheduled-Job case both passed. The raw
  fixture exercises real WorkerManager stdio plus the public facade; a separate
  in-process test exercises Core's worker-context facade.
- Registered Host support tests passed 3/3, including actual owned worker restart
  after handler removal. These prove registration rather than live backend health.
- Five Parent Enrollment composition tests passed with a valid Host-bound issuer
  fixture. The scheduled-Job assertion now checks the intended company ID because
  RPC serializes Company dates as strings.
- Desktop selected fixes initially passed 2/3. Invitation timestamps now stay valid
  on the runner's date; state waits replace scheduling assumptions. A revoke fixture
  returns one row, not two; correcting that predicate made the failed named case
  pass. Main wiring checks now reflect scoped controller integration while keeping
  the raw enrollment client out of preload/renderer.
- A new real-DB Native observation case initially timed out during PostgreSQL
  preparation. A retry reached the case but failed fixture cleanup deadlines;
  neither run is counted as passing. The owned pool drain is now explicitly bounded
  before pg_ctl shutdown and cleanup has a bounded separate budget.
- The first packed SDK consumer check timed out; no pass is inferred. The helper
  now names each subprocess stage and cancels its owned child on test cancellation.
  Scoped Core types initially resolved stale generated SDK declarations; the scoped
  configuration now maps the changed SDK/shared sources instead of rebuilding all
  workspace packages. Final follow-up results are appended below.

Final follow-up:

- Scoped changed-service/SDK/shared source and selected test types passed. One
  intermediate fixture widened string literals; the test now preserves its DTO
  literals. No generated SDK build was used to conceal stale source types.
- Packed consumer passed 1/1 in 23.6 seconds using offline npm cache and explicitly
  supplied local TypeScript 5.9.3. It generated/installed the actual tarball, checked
  declarations and executed the JavaScript facade. Earlier attempts included a
  missing SDK-local compiler and a 60-second total budget expiry at the typed stage;
  the owned-child cancellation remained effective. The combined pack/install/type/
  runtime test now has a bounded 120-second budget. SDK's declared dev dependency
  version is unchanged; this local result does not claim a TypeScript 5.7.3 run.
- The single real-DB case passed with natural owned database cleanup after the
  bounded pool/cleanup fix (1 passed, 7 unselected, 163.1 seconds including startup).
  It verifies current evidence and rejects reads after invocation completion and
  Plugin deactivation. Its worker manager remains a substitute; the separate real
  worker test does not constitute a joined Main/TLS/Plugin UI acceptance test.

Logs are task-local `native-connectivity-sdk*.log`, `native-connectivity-core-sdk*.log`,
`native-connectivity-worker-integration.log`, `native-connectivity-host-support.log`,
`native-connectivity-desktop*.log`, `native-connectivity-core-runtime.log`,
`native-connectivity-db-*.log` and `native-connectivity-types*.log`. The exact final
Core and SDK revisions are pinned in the support matrix and generated candidate.

## Outstanding qualification

Current full CI is not claimed green. Latest reviewed prior tuple Source `92f1423`
run `40430640733` failed Desktop fixtures, Core fixtures and Zod High 1243066; this
increment repairs the identified fixtures without weakening production policy.
The Zod major migration remains deferred and no advisory exception was added.
Issuer rotation, expired/lost-key trust recovery, real provider/Identity execution,
Native Node/Source, signed install/update/restore and physical two-PC LAN remain.
Native stays off by default and Tailscale remains the supported release transport.
