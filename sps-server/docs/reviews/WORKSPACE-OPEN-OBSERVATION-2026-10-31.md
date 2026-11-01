# Workspace Open Observation

This is diagnostic work, not a claimed fix of an intermittent hang.

Exact Sourcea8529be run41153008422/job124393577346 passed its normal source
transfer/export/fresh-Host restore, data/file preservation, inactive official
bundle review, explicit approval and first restart. The fourth Main's explicit
`openWorkspace()` call then reached its unchanged360-second acceptance bound.
All owned processes and output streams subsequently closed naturally; the job
failed. The output did not locate the wait within Identity/session setup, Node
registration or BrowserWindow navigation.

Source7e462f2, unchanged Core/approval implementation, later passed normal Main
transfer, interruption recovery, historical schema upgrade and historical backup
through Main. Its Windows job remained live during packaged qualification at
this observation. A later pass does not explain or erase the preceding failure.

The existing Main open path now emits fixed phase names only for already
isolated `SPS_DESKTOP_E2E=1` processes. A wrapping1..65535 operation sequence
distinguishes overlapping automatic/manual requests without identifying a user.
Phases bracket existing Identity/session, Node and navigation awaits; reuse has
a distinct marker. No URL, token, cookie, path, account, plugin name or error text
is included. Production logging stays off. This adds no IPC, authority, retry,
navigation shortcut or deadline change and does not serialize or change opens.

The acceptance requires an actual Main navigation-complete marker as well as
all original data/approval/restart/process-cleanup assertions. On failure its
existing bounded application-output tail can locate the last fixed phase.

The real extracted Main function's deterministic VM tests passed11/11, including
production silence, fixed-only output, bounded sequence wrap, unchanged auth/
ownership denials and window reuse. This is unit evidence with fake windows,
not actual Electron UI qualification. Full local Desktop1696total/1694pass/two
unavailable-8.3-alias skips/zero failures. A first real isolated source transfer
with this Main tracing passed; the final assertion-bearing rerun also exited0,
including the `fixed-workspace-open-phase-diagnostics-observed` phase, all four
Main processes/EOFs, declined/accepted review and owned temporary cleanup. It
uses fixture Identity and a local process scan, not physical devices or external
whole-Job qualification. No installed profile or Production Identity was touched.

## Independent Account-Lifecycle Race

Review of the instrumented path found a separate, reproducible defect: account,
profile or Host authority could change while Identity, Node registration or
navigation was awaited. The old request could then create/show a stale window.
This is not established as the cause of the earlier fourth-Main timeout.

The existing read-scope contract is now captured before those awaits and checked
after each. Ready-to-show and late navigation completion reject an invalidated
scope. Cleanup destroys only the request's captured stale window, not a newer
global window; renderer beforeunload cannot veto that stale-window destruction.
Ordinary network failures retain the existing current-window behavior. No new
API, SDK, IPC, retry, timeout, authority or account policy is added.

Six deterministic regressions failed before this production correction. After
correction, the extracted real Main/scope selection passed18/18; the wider
account-controller, read-scope and authentication-handler selection passed55/55.
These are VM/unit results with fake windows, not physical or installed evidence.

The source transfer acceptance additionally exercises the actual Main with a
test-only gate after one real BrowserWindow navigation. It uses real fixture
sign-out/sign-in to the same account, an actual renderer unload veto, and a newer
authenticated Core window; only the old completion is delayed. Identity, Core,
cookies and IPC are not replaced by that gate. The helper requires the launched
E2E Main's exact temporary profile and restores the prototype/listener on exit.

The first integration attempt failed in Playwright's automatic handling of
Electron's mirrored beforeunload notification (`No dialog is showing`), before
qualification. The Node caller exited1; a following process scan found no
remaining fixture processes. Its temporary fixture was retained, not declared
cleaned or passed. Explicit test-side dialog handling now prevents automatic
acceptance. A second attempt reached the real scope rejection/stale-window
destruction but failed when Playwright tried to resolve the old, already-dead
WebContents. That attempt remained a failed acceptance and completed its normal
cleanup. The helper now waits for the single surviving same-origin CDP page
after separately identifying the retained window in Main; it does not resolve
the destroyed page or suppress application errors.

Final `npm run test:e2e:owner-vault-transfer` exited0, including
`real-sign-out-sign-in-discards-only-stale-unload-vetoing-workspace`, all existing
export/restore/reapproval/data assertions, four Main exits/EOFs, and owned
temporary-data removal. The actual old renderer vetoed ordinary close; releasing
its delayed completion destroyed only that old window, while the newer visible
window successfully read the original project through the authenticated Core
API. Four additional helper tests reject non-E2E or mismatched-profile use before
BrowserWindow access and remove their dialog listener on rejection.

Final `node --test --test-reporter=tap test/*.test.mjs` exited0:1707total,
1705passed,two unavailable-8.3-alias skips,zero failures. The actual source test
uses fixture Identity and a local fixture-process scan, not an installed signed
package, physical two-PC proof, Production Identity or hosted whole-Job evidence.

Window semantics follow the official
[Electron BrowserWindow contract](https://www.electronjs.org/docs/latest/api/browser-window):
ordinary close may be vetoed by a renderer, whereas destroy closes the captured
window without emitting beforeunload. This does not change normal user close
handling or independently prove every account-window lifecycle scenario.

## 2026-11-01 Concurrent Opens And Retained Window Scope

Source `fc56bca60559df950a81124470e04e3d88018296`, Verify `41281563181`,
Windows job `124774354651`, is terminal failure. Actual Main export/fresh-Host
restore retained the typed row and attachment. After restart an explicit
`openWorkspace()` reached the unchanged 360-second bound. Fixed phases show
operation 2 starting navigation while operations 1 and 3 reuse that in-flight
window; they do not establish why the native navigation never completed.
Cleanup reported natural Job emptiness. The dependent legacy job failed before
execution because this failed Windows attempt produced no installer inputs.
It is neither a new legacy acceptance nor a reversal of the previous exact
Source `38fb384` installed/recovery success.

The initial local rerun passed the original transfer/review/restart/account-
fence/retry assertions. That does not explain or erase the CI failure. A new
read-only observation wraps failed explicit opens, not just the later window
lookup, so another failure reports bounded native/tracked window state. It
retains the original open request, error and deadline without replaying it.
Locations, account details and raw error payloads are excluded.

Independent deterministic tests reproduced three incorrect behaviors: a second
open could return success before the first navigation completed, miss its
failure, and create duplicate Core sessions. One valid account/Host scope now
shares its pending open promise through the actual navigation outcome. Every
caller still passes the original sign-in/ownership checks. An obsolete scope
cannot join or clear a newer pending operation, and failure still requires an
explicit retry rather than automatic navigation replay.

A same-origin account-change regression then exposed retained-window reuse
across scopes. Main now records the scope of each Workspace window. Only a
still-current window is reusable; an obsolete captured window is destroyed
before the newer scope opens, including when its renderer vetoes ordinary
close. This is not a change to normal user close behavior or a relaxation of
the existing Desktop/Core session proof.

The first three regressions failed before coalescing. The new cross-account
regression failed before window-scope tracking. After correction the focused
eight-file selection passed 77/77 with no skips. These are unit/VM tests,
including real extracted Main functions, not physical or installed evidence.
Actual final-source Electron and exact-tuple hosted verification remain
required; this correction is not a proven root-cause fix for the CI timeout.

The final local source Electron transfer exited0 after the window-scope
correction. It retained both Workspace states and the Vault attachment,
required independent approval for restored Registry/current-app bundle code,
survived two target restarts, and exercised real sign-out/sign-in with an unload
veto and an explicit failed-navigation retry. All four owned Main processes and
their output closed, and the exact temporary fixture was removed after the
existing cleanup checks. Identity was a local fixture; this is not signed,
installed, physical two-device or external whole-Job acceptance.

An intermediate actual run remained a failure: its deliberately destroyed
local test socket produced native `ERR_CONNECTION_ABORTED` (-103), outside
the test's previously observed code variants. The retry helper now recognizes
that specific observed native connection error and additionally requires the
owned failing server to have accepted a connection. It still requires the
exact main-frame URL failure, IPC rejection, preserved failed window, and
subsequent explicit successful authenticated retry; generic abort/timeouts,
DNS and unrelated errors remain rejected. The
[Chromium error contract](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/net/base/net_error_list.h)
identifies -103 as a connection failure, distinct from generic user abort -3.
The corrected final run passed all those assertions. No failed attempt is
reclassified as a pass and the original 360-second open bound is unchanged.

Final `node scripts/run-desktop-ci-tests.mjs` exited0: isolated serial native
probe2/2, remaining274files1919total/1916pass/3unavailable8.3-alias skips/0fail;
aggregate1921total/1918pass/3skips. The focused eight-file command was
`node --test test/workspace-open-phase-tracing.test.mjs test/owner-vault-window-observation.test.mjs test/historical-profile-progress.test.mjs test/workspace-open-account-fence-acceptance.test.mjs test/workspace-navigation-retry-acceptance.test.mjs test/workspace-auth-ipc-lifecycle.test.mjs test/workspace-read-scope.test.mjs test/desktop-account-controller.test.mjs`.
The actual UI command was `SPS_DESKTOP_E2E_SOURCE=1 SPS_DESKTOP_E2E_HOST_READY_TIMEOUT_MS=360000 node scripts/smoke-owner-vault-transfer-desktop.mjs`
(environment syntax is platform-specific). All tests used isolated fixtures,
not an existing user installation. Exact new Source/Core hosted acceptance is
still required.

## 2026-11-01 Installed Company-Selection Regression

Source2c9338d push Verify41284190569/Windows124782040958 is a new terminal
failure, not the earlier fc56 navigation timeout. Fresh/replacement installs
passed, and actual installed historical157-to176/v11-to13 migration/data checks
completed. Before Workspace visibility, two opens reported stale-window and
connection-scope rejection while startup selected the Owner company. Cleanup
reported natural Job emptiness; the failed acceptance is retained as failure.

The entire profile fingerprint was too strict for the Host-wide window. The
correction omits only the Owner `companyId` selection from this window's scope;
default data reads and Member company routing still bind that field. Account,
epoch, Host manager/generation/readiness, team context and all other profile
fields remain fenced. A deterministic Owner selection-during-load regression
failed before correction. Additional Member and Owner routing/auth/source
mutation regressions still reject stale windows; the Main/controller selection
passed38/38, including ready-Host manager/start-time invalidation after selection.
The final Desktop CI runner passed serial2/2 plus1921/1924 with three unavailable
8.3 skips (aggregate1923/1926); no failure or cancellation occurred.

Actual local source Main historical in-place acceptance then exited0 in33071ms:
visible authenticated Workspace, both companies' retained projects, real DPAPI
account/key preservation and restart all passed, followed by owned process and
temporary-data cleanup. Command: `SPS_DESKTOP_E2E_SOURCE=1 node scripts/smoke-historical-managed-vault-desktop.mjs`
(set the environment using the shell's native syntax). It uses mock Identity,
does not install the app, and does not qualify a signed or physical candidate.
No native deadline, authorization rule or failure classification was relaxed.
