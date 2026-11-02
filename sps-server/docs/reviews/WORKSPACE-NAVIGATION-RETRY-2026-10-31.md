# Workspace Navigation Retry (2026-10-31)

## Defect and correction

The actual Main retained a current Workspace window after its `loadURL` promise
rejected. A later authenticated open request reused that failed window without
another navigation. Two new extracted-actual-Main regressions failed before the
correction: no replacement window was created, and the second queued navigation
failure was never reached. The signed-out denial regression already passed.

Main now records only rejected, still-current navigation windows in a WeakMap.
A later open request first repeats the existing account/profile/Host/session
checks. It then discards only the captured failed window and follows the normal
new-window navigation. There is no retry timer, new background open request,
request replay, timeout extension, authentication fallback or origin widening.
Successful or still-pending windows keep the original reuse behavior. The
captured destroy cannot close a newer window and cannot be vetoed by the failed
renderer. Repeated failures remain errors; a signed-out request touches no window.

This fixes a demonstrated **rejected-load retry** defect, not the unexplained
earlier `d8a6c69` hosted pending-navigation hang. The latter has no captured
rejection or native-vs-Playwright failure snapshot and remains unresolved.

## Actual Main acceptance

`SPS_DESKTOP_E2E_SOURCE=1 npm run test:e2e:owner-vault-transfer` exited 0 after
the correction. It still checks the real export/fresh-Host restore, managed
Registry bytes and both Workspace states, explicit restored-bundle review,
restart, account ABA/unload veto, ordinary Main exit, output EOF and owned-temp
cleanup. The new final stage additionally:

1. Proves the exact E2E profile, signed-in account and current loopback origin.
2. Creates an owned loopback-only TCP listener that immediately closes sockets.
3. Temporarily sends exactly one real `BrowserWindow.loadURL` to that listener;
   it returns the original native promise rather than manufacturing rejection.
4. Requires the native main-frame network error and real Main IPC rejection,
   with the failed window retained and no automatic second window.
5. Restores the original navigation method, requests opening again, and requires
   exactly one replacement, visible authenticated Workspace, unchanged account
   and the actual project's persisted row.
6. Restores only its token-owned listener/method hooks and closes its TCP server.

Earlier test development using request cancellation and Playwright routing did
not produce the intended native navigation failure. Those acceptance attempts
failed their original assertions and are not passes. The final owned-socket
fixture must observe a real native network failure; a rejected fixture promise
alone cannot qualify it. The extracted Main/account-fence selection passes
27/27; the acceptance safety guards pass 6/6.

References: [Electron loadURL](https://www.electronjs.org/docs/latest/api/browser-window#winloadurlurl-options),
[Electron WebRequest](https://www.electronjs.org/docs/latest/api/web-request).
No implementation code was copied from these references.

## Remaining scope

This is isolated source Main evidence with mock Identity, not an installed or
signed candidate, physical Member, Production Identity, normal user profile or
previous-Stable upgrade. Existing installed data, original dirty Native edits,
Core/SDK/API/schema and all authorization boundaries remain unchanged. A fresh
exact-HEAD hosted gate is still required; full legacy recovery remains failed
before ordinary uninstall. The separate installed in-place migration evidence
gap is recorded in [the audit](INSTALLED-MIGRATION-EVIDENCE-GAP-2026-10-31.md).

## Hosted network-error variant

Push run `41190991746`, Windows job `124507578637`, observed the same owned
TCP fixture as Chromium `ERR_SOCKET_NOT_CONNECTED` (`-15`), not the locally
observed reset/empty-response codes `-101`/`-324`. The initial acceptance omitted
`-15` and failed before its retained-window assertion. It is a failed run, not
an installer or legacy recovery pass; no installer input was produced there.

The fixture now records the actual main-frame error for its exact owned URL
and permits only those three explicit native error codes. Unknown errors,
abort/cancellation, numbers encoded as strings, and fabricated rejections still
cannot pass. A real IPC rejection, retained failed window, one explicit retry,
authenticated project read and natural Main cleanup are unchanged. The exact
source transfer command was rerun successfully after this change and helper
extraction. Focused retry guards are now 7/7.

The error definition was checked against Chromium's official
[network-error source](https://raw.githubusercontent.com/chromium/chromium/main/net/base/net_error_list.h).
No Chromium implementation was copied.
