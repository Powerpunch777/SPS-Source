# Desktop Host Choice Acceptance Readiness

Reviewed: 2026-10-31 KST. Prior Source `8d67c08baa0e4606bb4dd9b9983abc525fe99a69`,
Core `258800f0d931932d855e275ed7cfab2c1bf0a080`, public SDK
`61a929f6c783f78e5af603682de1543c7e24abc0`, Desktop 0.4.137 development candidate.

PR run `41073142664`, Windows job `124122179695`, failed packaged execution-
control acceptance while waiting for a Workspace. The final setup screen still
offered fresh-Host choice, with no Core process startup in the captured output.
This does not prove slow Core startup, an installer problem or a product
authentication failure. The ordinary exact-Source push passed that same step;
the different run outcomes are retained rather than rerunning over the failure.

The shared CDP acceptance used an issued mock authorization code and loose
visible `Create`/`Server` text as readiness. Code issuance is earlier than
Desktop's complete account transition. The script could therefore dispatch its
one creation click before sign-in was settled. Main's normal current-account
requirements must not be weakened to make that timing pass.

The script now reads public Desktop status and requires signed-in true,
pending false, no selected profile, and the actual visible/nonbusy/enabled
creation control before clicking it once. The existing 45-second preparation
deadline is unchanged. The generic page poll now awaits an asynchronous
predicate, so Promise(false) cannot be mistaken for readiness. It does not
retry Host creation, invoke Main creation directly, mutate account state or
replace UI/authorization handlers.

Focused readiness/CDP/surface contract tests passed 15/15. A deterministic
asynchronous-predicate regression requires one false result and one wait before
the true result. Pending-account, missing-account flag, selected-profile,
hidden/busy/disabled/missing control cases all remain false.

Actual source `SPS_DESKTOP_E2E_SOURCE=1 node
scripts/smoke-workspace-surfaces-desktop.mjs --execution-control` exited 0 with
real sign-in/click/Core startup, retained Windows Job ownership, actual UI pause/
stop/stale-revision rejection, another Workspace unchanged, persisted stopped
state across Main/Core restart, and explicit resume. Both Main processes exited
naturally with four output EOFs and no failed streams; the owned fixture scan
and removal passed. No installed profile, installer, real provider or remote
Runner was used. Exact new-HEAD packaged Windows evidence is still required.

Final full Desktop `node --test --test-reporter=spec test/*.test.mjs`: 1644
total, 1642 passed, two unavailable-8.3-alias skips, zero failures, exit 0.
