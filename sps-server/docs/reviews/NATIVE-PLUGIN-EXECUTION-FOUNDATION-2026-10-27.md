# Native Plugin execution foundation — 2026-10-27

This document records the earlier Core execution and Desktop private-channel
foundation. The follow-up now opens declared shell pages and Dashboard widgets in
separate sandboxed Native Plugin windows, with relative module chunks, CSS/assets,
and scoped data/action calls. The joined Electron/Core/DB acceptance passed with
exit 0; this is not a release qualification. See the current
[Native Plugin UI integration record](NATIVE-PLUGIN-UI-2026-10-27.md) for scope,
evidence and remaining limits. The retained-authority Workspace renderer still
does not load Plugin code or the ordinary SlotMount.

## Ownership and authorization

The private fixed `POST /sps-native/v1/plugin-runtime` retains the original six-field
data/action request and adds revision-bound describe/asset operations. Requests are
bounded canonical JSON. Workspace, session and peer certificate come from the
authenticated Main channel, never the body. Main signs the actual method, target,
body, content type, cookie and peer DER. Other POST targets are denied. No Owner
credential or generic API proxy is introduced; existing GET and Inbox PATCH
restrictions remain.

Core resolves the real Identity session, approved current device/certificate and
Workspace membership in short authorization transactions. The app supplies a lazy
adapter using its existing worker manager after composition is ready. Worker RPC
runs outside database locks, allowing nested Host writes without deadlock.
Admission, nested Host RPC/stream notifications and result delivery recheck current
authority. Plugin readiness, activation/dependencies, recovery mode and the actual
selected shell or user's dashboard widget are checked independently. Action actor
and requested-permission intersection reuse the ordinary UI bridge's shared helper;
caller params cannot choose an actor or override the authorized Workspace.

The optional worker authority is internal and is never serialized in the SDK.
Opaque guarded invocation IDs reserve `sps-guarded:`; stale or malformed reserved
IDs fail closed without retaining an ever-growing history. Legacy explicit
unguarded calls retain their behavior. Abort closes admission and delivery, while
pending RPC accounting stays until actual response, timeout or worker exit. This
does not roll back already committed Plugin effects; actions are not retried.
Native runtime admission is limited to two active invocations. JSON snapshots and
responses are bounded and reject getters, cycles and non-JSON values.

The extracted UI module loader owns per-instance Blob URLs and preserves existing
React/JSX and public/legacy SDK aliases. Ordinary slots use the extracted helper.
This does not relax the Native Workspace CSP or give Plugin code retained Main IPC.

## Scoped verification

No full local test suite, workspace build or full repository type check ran.

- Core shared authority, proof and private HTTP boundaries: 27/27 passed.
- Actual owned worker process: seven selected guard/legacy cases passed. After
  replacing lifetime tombstones with the reserved ID prefix, the four new guard
  cases passed again; the remaining tests were unselected.
- Real temporary PostgreSQL: seven Native runtime cases and one private-reader
  case passed (8 passed, 7 unselected). The runtime test uses a worker-manager
  substitute; the reader test uses a runtime substitute. The actual worker is
  exercised separately. These are not a joined Native Plugin UI acceptance test.
- UI loader: 3/3 passed. The combined two-file run also had a worker startup
  timeout before slots collected; retrying only slots passed 5/5.
- Desktop parent channel: 17/17 passed after correcting a test syntax error and
  a plain-params validation bug. The initial two-file run reported 9 passed and
  2 failures (parent syntax plus one proof assertion); the mistaken negative
  assertion was corrected and its named case passed separately. A
  valid fixed-route proof may sign an opaque body; schema validation belongs to
  the parent channel and Core runtime.

- Seven selected ordinary action/data-route compatibility cases passed, with
  66 other cases unselected. Earlier runs had six failures and then seven cold
  import timeouts. Independent suite mock initialization and a complete active
  dependency fixture fixed the pre-existing reliance on other tests running first.
  Module imports now happen in a bounded setup hook; request timeouts remain five
  seconds. One intermediate attempt collected no tests because the new hook import
  was missing. No production behavior workaround was added.
- Scoped UI types passed after adding the existing Desktop ambient declaration
  to the temporary scoped configuration and removing Node Buffer use from the new
  browser test. Scoped Core production types passed. Initial scoped test typing
  exposed incomplete Company/manifest fixtures and numeric tuple/HTTP test-helper
  typing; those fixtures and helper annotations were corrected. Final scoped
  Core service/import-graph and six selected test-file type checks passed. This
  does not qualify the complete app/index startup composition or a full UI build.

## Remaining work

The separate ephemeral Plugin renderer, fixed surface scope, authenticated
runtime/assets relay and data/action adapters are implemented. The separate joined
Electron/Core/DB scenario passed UI data/action persistence, deactivation denial
and natural cleanup; its evidence and substituted Identity boundary are recorded
in the current UI review linked above, separately from these earlier checks.
Streams, Host navigation/notifications and other SDK operations require explicit
product integration. Full SDK compatibility, issuer rotation, expired-trust
recovery, Native Source/Node, real AI execution, production Identity, signed
update/restore, physical two-PC LAN and current full CI/security qualification
remain. Marketplace policy, Plugin Builder architecture, public SDK and stored
user data are unchanged.
