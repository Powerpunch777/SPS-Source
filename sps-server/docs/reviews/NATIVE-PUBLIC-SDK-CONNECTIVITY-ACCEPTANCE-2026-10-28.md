# Native public SDK connectivity acceptance

Status: the scoped joined case passed locally (session `93475`, exit `0`).
Source baseline is `11f4555` plus the acceptance changes. Core remains
`df7436dc87484370e9c9b81b91882a2626452f3c`; public SDK remains
`607b48a4edaed1db7132a01719431ffce5852964` (unreleased `0.11.0`).

## Missing evidence addressed

The existing Native Plugin acceptance used a handwritten JSON-RPC worker. The
public SDK worker/runtime tests used mock transports. Neither alone established
that a plugin importing the public package could read the Core-owned Native
snapshot through the real enrolled Member transport and Desktop renderer.

The provider already exists in Core's `sps-native-plugin-runtime.ts`; this change
does not add a duplicate provider or change its authority checks.

## Joined case

From `external/sps-core`:

```powershell
pnpm --filter @paperclipai/db exec tsx ../../../../sps-server/desktop/scripts/smoke-native-workspace-channel.mjs --isolated-native-workspace-channel --with-native-plugin-sdk
```

The optional mode preserves existing counter/action, execution-control, Node,
default and No-AI modes. It creates a temporary package with the public SDK's
unchanged `package.json` and worker/runtime/platform/profile import closure,
using package exports rather than a replacement transport implementation.
Its worker uses `defineSpsPlugin`, `runSpsWorker`, `defineSpsPlatformContract`
and `createSpsRuntimeClient().connectivity.current()`.

The manifest declares exactly `ui.dashboard.contribute` and
`sps.connectivity.read`. It grants no model, agent, execution or state-write
capability. The fixture checks that no Agent or Node is created.

The path includes a fresh actual Core DB membership/session/device grant,
enrolled Member HTTPS mTLS, signed Native Workspace proof, owned private Core
channel, current-invocation callback and actual SDK worker. It first validates
the direct client result, then uses an actual Electron Native Plugin window
and Windows DPAPI-backed temporary credentials to render the same public data.

Both checks require exactly the seven public keys, the expected Host/Workspace,
`verified`, `native_tls`, `authorized`, `authenticated_request`, and canonical
UTC-millisecond `observedAt`. The renderer checks that owner/Workspace bridges,
Node globals and service workers are unavailable. This is renderer isolation;
the Core worker still runs as the ordinary OS user.

The required authorization sequence is:

1. Render a verified SDK snapshot and validate renderer isolation.
2. Disable the fixture Plugin and reject data access and asset loading.
3. Re-enable only that fixture activation and positively read the SDK again.
4. Suspend membership and reject the SDK call; restore membership and positively
   read the same Host/Workspace again.
5. Revoke the device while membership is active and reject the same SDK call.

Direct negative calls require the client's response-validation error rather
than accepting a transport timeout or unavailable connection. Existing raw
discovery/shell denial assertions remain. UI checks use only the public safe
unavailable message, including Electron's fixed IPC wrapper, and asset `404`.

## Execution record

- Root session `98123`: **EXIT1**. Reached the Plugin window but the transport
  callback overwrote its diagnostic stage; this run does not prove the full case.
- Root session `69551`: **EXIT1**. Core SDK snapshot, renderer snapshot and
  renderer isolation checks passed; Plugin deactivation timed out. The new test
  mode was omitted from the parent's existing deactivation message handler.
  The handler now uses the shared Plugin-integration mode. No production
  authorization or deadline was changed to address that test-harness error.
- Root session `55251`: **EXIT1** after the Core SDK, renderer and both Plugin
  deactivation denials passed. A subsequent redundant `exchange()` on an already
  prepared client was correctly rejected. The fixture now reuses the same valid
  session after Plugin reactivation. A denied request clears that session, so
  membership restoration requires a new exchange before its positive barrier.
- Root session `65662`: **EXIT1** after the UI checks passed. The fixture omitted
  a fresh exchange after membership denial; the client correctly clears its
  session on any failed request. The fixture now retains the session across
  Plugin reactivation, and exchanges again only after membership denial/restoration.
  This run also reported an unconfirmed PostgreSQL shutdown and preserved its
  test data. Its observed PostgreSQL process was later absent; that does not
  establish safe removal of the retained directory.
- Root session `93475`: **EXIT0**. The complete scoped case passed: actual
  public package worker, Core Native snapshot, Electron renderer, Plugin
  deactivation/data/asset denial, reactivation positive barrier, membership
  suspension/restore and device-revocation denial, with Agent/Node counts zero.
  The sequence follows the client's actual fail-closed session lifecycle.
  Main/Core/worker disposal and temporary DB/fixture cleanup completed without
  a cleanup error. Earlier failed runs remain separate evidence.

Task-local logs preserve each run separately:
`native-public-sdk-joined-2026-10-28.log`,
`native-public-sdk-joined-phased-2026-10-28.log`, and
`native-public-sdk-joined-fixed-2026-10-28.log`. The session-reuse case is logged in
`native-public-sdk-joined-session-reuse-2026-10-28.log`.
The final lifecycle case is logged separately as
`native-public-sdk-joined-auth-lifecycle-2026-10-28.log`.
The same command is now a required Windows CI step after prepared Native Host
management. Its remote result is pending; the local pass does not establish a
green CI or qualify a newly installed package.
Diagnostics use fixed milestones, allowed error categories and snapshot-presence/
state fields; they do not return raw provider errors, credentials or private DTOs.

## Limits

Identity-provider token exchange is substituted with a real fixture DB session.
The transport is loopback; physical two-PC LAN, actual Identity deployment,
installed/signed packages and update/restore are separate requirements. This
does not prove OS worker/Vault/filesystem isolation, CLI compatibility, SDK
event streams or a green full CI/release. Those remain required product work.
