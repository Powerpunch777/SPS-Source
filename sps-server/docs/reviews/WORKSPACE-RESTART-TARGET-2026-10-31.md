# Workspace Restart Target Observation

This is an open acceptance defect, not a corrected startup or release claim.

## Authoritative Hosted Failures

Exact Sourcec2c71c969dfed236e9743ab4b192dc8a4d8ef071, Coreb17fb83,
SDK61a929f, Verify push41162672579/job124423434422 and PR41162676604/
job124423446745 both passed the serial native45-second probe, all Desktop unit
fixtures, bootstrap, secure-storage and independent Settings prerequisites.
Their actual No-AI source acceptance failed at `workspace_restart`, before
subsequent installer or packaged qualification.

The last page had the expected reference-plugin route but an empty body. CDP
accepted `Page.navigate` and one `Runtime.evaluate`, then closed within180ms
(push) /230ms (PR), with zero pending requests. The45-second page wait expired.
Main output had one opening whose load had started and a later opening whose
load completed. The existing account/session/profile/Host-generation fence can
legitimately retire stale windows, but the log does not prove which condition
caused this target to disappear. Do not infer a connection, company-selector,
account, Chromium or backend cause from those phases alone.

Both failures were nonzero and natural owned-process cleanup was retained.
They are not a passing app restart, a reason to extend a timeout, or permission
to accept the next arbitrary page without verifying its authority and state.

## Local Contrast

`SPS_DESKTOP_E2E_SOURCE=1 npm run test:e2e:runtime-discovery` subsequently
completed using the unchanged c2c71c9 Main source in this worktree, with unrelated
uncommitted non-executing legacy-residue work. It passed actual signed Registry
v1/v2 install/update, real failed-v3 activation rollback, explicitly confirmed
v1 rollback, A/B state and capability denial, UI-less Worker, public runtime/
Agent-descriptor methods, fake loopback model grant/idempotency/cancellation,
reference UI restart and independent Core Settings recovery. No real provider,
CLI or Agent was dispatched. All3 Main processes exited0, all6 stdout/stderr
streams ended, and owned temporary data was removed; caller exit0.

This is local functional/Main/output cleanup, not whole-descendant, physical,
installed-byte, clean-candidate or hosted equivalence. It did not reproduce the
hosted target loss and does not waive either failure.

## Narrow Follow-Up

Keep all authorization and stale-window destruction behavior unchanged. Add
E2E-only fixed phases for ready-to-show, shown, closed and captured-window
discard. At a rejected scope, classify only the existing static error category:
account, Host context, Host instance, connection, or unclassified. Never log
the account, profile, URL, PID, cookie, token or error text. Production tracing
stays silent, and no wait/retry/reconnect or confirmation bypass is introduced.

Actual extracted Main and tracing/ownership tests24/24 passed, including stale
same-account epoch, newer-window preservation and unload veto. A current-HEAD
hosted reproduction is still required to identify the cause before changing
the product fence or acceptance target-selection logic.

Final full local `npm run test:ci` exited0: serial observer2/2, remaining242-file
stage1739total/1736pass/three unavailable-8.3-alias skips/zero failures;
aggregate1741total/1738pass/three skips. No installed profile or Production
Identity was involved. Current-HEAD hosted tracing is pending, not a fix claim.

## Exact Hosted Boundary and Readiness Follow-Up

Sourcebe40e0c push41164222213/job124428172046 reproduced the same restart
failure. The new fixed phases now identify `scope-host-instance-changed` at
the first restarted window's ready-to-show callback, followed by captured
window discard/closure. Opening2 then completed its load and showed a current
window. The retired CDP socket closed at113ms with no pending requests. This
confirms scope-driven target retirement, not which underlying Host field
changed or that a product authority fence should be relaxed. The same-HEAD PR
job124428183760 passed the No-AI restart and later source/packaged scenarios;
at observation it is still running the current installer gate, not fully passed.

The No-AI restart acceptance now preserves its existing Host-target wait, then
uses one shared45-second document/navigation/state deadline. Before navigating
it requires a committed nonempty document, visibility hint, the narrow existing
Main-only current-Workspace account bridge, exact prior server origin and
expected account email. It does not treat Electron visibility alone as proof
of a shown/authorized window. Unqualified closed targets may be retired only
within that same deadline and bounded count; a live evaluation error, wrong
account, signed-out state, malformed result or duplicate/foreign debugger target
fails rather than falling back. A closed target ID is never reopened. It does
not replay navigation/actions, restart the app, reset a deadline, change Main
behavior or waive any subsequent A/B persistence/capability assertions.

Readiness and actual-callsite partition/deadline contracts22/22 passed. Actual
isolated source runtime-discovery acceptance passed with the new selection:
retired-unqualified-target count0 locally, all prior functional checks,3 Main
exits0/6 output EOFs/owned TEMP removal and caller0. This local run again did
not reproduce hosted retirement; current-HEAD hosted confirmation remains
required. The new helper is only acceptance code, not a new product bridge or
authority to use an arbitrary replacement Workspace.

Final full local suite after the native/catalog and readiness changes:
`npm run test:ci` serial2/2 plus1783total/1780pass/three unavailable-8.3-alias
skips/zero failures in245remaining files; aggregate1785total/1782pass/three
skips, exit0. This does not substitute for the next exact-HEAD hosted result.
