# Native Plugin surface windows — 2026-10-27

Native Workspace can now request an installed Plugin's selected shell page or
Dashboard widget in a separate sandboxed renderer. Plugin code is not loaded into
the retained Native Workspace renderer. This development increment connects
declared React exports, relative module chunks, CSS/assets and scoped data/action
calls. It is not full Plugin SDK feature coverage or a Native release qualification.

## Product flow and boundaries

The Workspace bridge accepts only `{pluginId,surface,surfaceId}`. Main derives
Host and Workspace from the calling window, checks its exact main frame/URL and
current account generation, and opens a separate ephemeral Plugin partition. That
window exposes only `bootstrap()`, `getData(key,params)` and
`performAction(key,params)`. It has no Workspace, Desktop, Owner or raw IPC bridge.
Closing the parent, changing account or shutting down closes children and their
asset servers; in-flight operations carry cancellation and bounded deadlines.

Core describes only the currently selected shell or the current user's declared
widget. A shell resolves an actual declared page (matching its default route where
possible); no arbitrary export or URL is invented. Missing renderable declarations
fail safely. Descriptor, asset and runtime calls carry a registry revision and
recheck session/device/certificate/Workspace plus Plugin readiness, activation,
dependencies and surface selection. Worker/file I/O runs outside authorization
transaction locks. Legacy private six-field data/action requests remain compatible.

The only added transport is the existing fixed authenticated
`POST /sps-native/v1/plugin-runtime`, with bounded describe/asset/data/action DTOs.
A Workspace header is a selector, not authority: Main signs the selected Workspace
with the exact request, actual TLS peer DER and cookie; Core reauthorizes it. No
ordinary API proxy, browser credential forwarding or Tailscale-authentication
exception is introduced. Every network operation uses fresh exact-pinned TLS 1.3.
The saved-credential controller queues bounded Plugin work without retrying
mutations; canceled or changed-account queued work never dispatches.

## Module and file delivery

Core reads only declared UI files under the installed package. It rejects unsafe
paths, symbolic links, non-files, package/UI-root escapes and changed path/handle
identities; the directory chain is rechecked around reads. Files are limited to
4 MiB and an explicit MIME allowlist; only asset envelopes can use the bounded
6 MiB transport response. CSS enumeration is limited to 256 directory entries and
32 top-level stylesheets. Payloads include canonical base64url and SHA-256, which
Main validates before serving bytes. Dev proxies, HTML and source maps are excluded.

The Plugin window has its own exact-cookie loopback asset origin. Only its opt-in
mode relays `/plugin/<safe-relative-path>`; ordinary Workspace assets and CSP keep
their existing policy. Plugin CSP permits self/blob modules and self connections,
while denying workers, frames, objects, forms and external origins. A nonce inserted
in the trusted bundled index permits the import map. Known React/SDK aliases map to
owned shims; direct module imports preserve relative chunks and asset URLs.

The Native SDK adapter supports data/action hooks and a read-only Host context.
Widgets receive the existing widget/context/data/loading/error/refresh props.
Streams, Host navigation/notifications and unavailable Host-backed SDK components
report unsupported; they do not call ordinary Board APIs. Full SDK compatibility,
custom elements and additional Host services remain follow-up work.

## Focused evidence

No full local suite, full Core workspace build or manual full CI rerun ran.

- Safe asset service initial unit run: 4/4 passed. Further static review added
  bounded enumeration, full path-chain checks and exact read-size validation. Its
  two targeted cases passed after correcting a Windows canonical-case comparison.
- New Core Runtime describe/asset/revision and unsupported-shell assertions passed
  (2 passed, 8 unselected), but embedded PostgreSQL shutdown failed in teardown;
  that test process exited 1. An earlier run hit the default five-second test
  budget; only the new integration cases received a bounded 60-second budget.
  This is not reported as a passing complete Runtime test run.
- Source window/asset/preload selected run initially passed 8/9. A test wrongly
  rejected Plugin-owned params as a connection selector; corrected named retries
  passed. Bootstrap API naming was aligned with UI; optional action params have a
  separate passing preload case.
- Protocol/client/TLS ingress selection initially passed 4/5. The new Workspace
  UUID validator had been declared inside the body parser and was unavailable to
  header validation; moving that validator to module scope fixed the product bug.
  Only the failed ingress case was rerun and passed. Client coverage includes a
  300 KB asset envelope over actual fresh mTLS and exact fixed-target framing.
- Four existing private-parent Plugin cases passed. The private HTTP asset case
  passed with a larger asset response and confirmed ordinary data remains capped.
- Source FIFO cancellation/account-change and single-dispatch action cases passed
  after repairing the new test asset-path fixture and attaching rejection observers.
- UI selected coverage passed across named retries: Native Plugin entry 3 cases;
  module loader/Native SDK and Workspace entry cases. Initial worker startup
  timeouts collected no tests; a stale Workspace copy assertion was corrected and
  only that case rerun. Failed/timeout logs remain separate from passing evidence.
- Scoped changed Core and renderer types passed. Final hardened asset helper and
  its tests passed a separate scoped type check. Changed JavaScript was parsed
  without execution. No broad typecheck was substituted for these scoped results.
- UI package build passed; a second package build includes the final ordinary
  startup/service-worker/error-handling changes made during the first build. The
  final entry is `index-9f1SIp3o.js`. Existing CSS/Rollup/chunk-size warnings remain.

Joined Electron/Core/DB acceptance completed with exit 0 using
`smoke-native-workspace-channel.mjs --isolated-native-workspace-channel --with-native-plugin`.
The actual isolated Electron Plugin renderer imported the declared React export
through a relative JavaScript chunk and loaded CSS plus its relative SVG asset.
An owned real Plugin worker read count 0, executed an action, and persisted count 1
in the real database through the Core Plugin state handlers. Host deactivation
then denied another action and an asset fetch. Wrong-peer rejection, existing
Inbox read/archive/restore, account/parent cleanup and natural Main/Core/database
shutdown also passed. No AI Agent or Node was created. The Identity provider
exchange was substituted; this is source/loopback evidence and does not qualify
signed installation, production Identity, or physical two-PC LAN operation.
The completed terminal was `57653`; its log is retained outside the repository
as `g/work/native-plugin-joined-window.log`.

## Remaining qualification

Native is off by default and Tailscale remains the supported release transport.
Physical Windows two-PC LAN, signed installation/update/restore, production
Identity/provider execution, Native Source/Node, issuer rotation and expired/key-
lost trust recovery remain. Latest full CI/security is not claimed green; the
deferred Zod major migration and unwaived High gate are unchanged. Marketplace
policy and Plugin Builder structure are outside this change.
