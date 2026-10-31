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
