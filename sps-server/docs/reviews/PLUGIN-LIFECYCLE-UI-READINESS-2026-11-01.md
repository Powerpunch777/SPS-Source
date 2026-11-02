# Plugin Lifecycle UI Readiness Review

Date: 2026-11-01

This is development evidence, not Core completion or Stable qualification.
No installed app, user profile, external project or Production state was changed.

## Failure and Correction

Source `bd4505a` CI run `41308329567`, Windows job `124853261985`, failed in
packaged Host plugin lifecycle acceptance: the re-enable control was not found.
The API had reported the Workspace activation disabled while the captured UI
still displayed `Workspace: Enabled` and `Stop using`. An API state observation
does not establish that React Query has rendered the corresponding control.

The harness now observes the selected plugin row's Workspace state and exactly
one matching visible, connected, enabled control before each activation click.
It waits at most 30 seconds and fails if the expected control never appears.
It does not issue repeated clicks, reload the page to hide a failure, modify
lifecycle state by API, or relax the post-click API assertions. This follows the
same readiness principle as [Playwright's actionability checks](https://playwright.dev/docs/actionability).
The product activation API, SDK and UI implementation were not changed.

Focused tests cover stale rendered state, another plugin's control, pending
mutation controls, hidden/disconnected/disabled/ambiguous controls, bounded
failure, and preservation of a single actual UI re-enable action.

## Local Verification

- `node --test test/host-plugin-use-control.test.mjs test/host-plugin-lifecycle-desktop-e2e.test.mjs`:
  6/6 pass on Node 26.4.0.
- `npm run test:ci` on Node 24.22.1: serial 2/2 and remaining 2,078 total /
  2,075 pass / three unavailable Windows 8.3-alias skips. Aggregate 2,080 total /
  2,077 pass / 3 skips / 0 fail. This includes the real owned-Core channel test.
- Source-only `node scripts/smoke-host-plugin-lifecycle-desktop.mjs` on
  Node 24.22.1: actual UI install, enable, disable, re-enable, uninstall cancel,
  uninstall confirm assertions passed. Main exited gracefully; CDP/mock Identity
  and exact temporary-data cleanup were confirmed. The standalone harness
  deliberately exits **76**, not success: independent owning-Job/descendant
  closure remains unqualified. A packaged Windows CI run must supply that proof.

An earlier full `npm run test:ci` on Node 26.4.0 failed the real owned-Core test
while shutting down embedded PostgreSQL, with Windows exit 3221226505 and
`UV_HANDLE_CLOSING` assertion. That is a recorded failed runtime combination,
not a pass, and the later Node 24 result does not prove Node 26 support.
Investigating or explicitly constraining that runtime remains separate work.

The Source `0cf4cb8` CI in progress while this change was tested is a prior-head
run; none of its results qualify this new harness revision. No new installer,
physical two-PC or final signed-package evidence is claimed here.
