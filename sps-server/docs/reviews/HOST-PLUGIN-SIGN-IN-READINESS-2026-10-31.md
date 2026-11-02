# Host Plugin Sign-In Readiness

Exact Source766e7ff Windows job124403974896 passed packaged execution control,
Workspace surfaces and preview, then failed the Host plugin lifecycle fixture
because its first sign-in click saw a disabled `#start-sps-account` button.
Seeing text containing `SPS` did not prove that the initial status render was
finished. This is a fixture readiness defect, not evidence that authentication
or the plugin lifecycle itself failed at that point.

The fixture now waits for the real account state and the actual sign-in control:
visible, connected, enabled, not aria-busy/disabled and stable across an animation
frame. A pending account transition is awaited; an already settled signed-in
account is not clicked. Otherwise exactly one ordinary click starts the existing
state/PKCE fixture callback. It never enables a disabled button, invokes a private
controller, changes account state or skips callback verification after a click.
The existing45-second readiness bound is not increased.

Three extracted-helper tests passed: loading-to-ready/single click,
pending-to-signed-in/no click, and readiness timeout/no click. The actual local
source Electron run then completed install/enable/disable/re-enable/cancelled
uninstall/confirmed uninstall functional assertions, graceful Desktop closure
and temporary cleanup. Its npm caller exited1 because the standalone script
requires the external owned-Job pending-exit qualification; this is explicitly
**not** an overall E2E pass. Packaged hosted final-HEAD proof is still required.

Separately, Source0c6c68d PR41158123651/job124409351976 failed the harmless
PowerShell availability/exit observer's45-second bound during the broad Desktop
unit suite. The same push's unit suite passed. It is an intermittent test-environment
observation, not a proven deadlock or a passed result. Windows verification now
runs the exact same full `test/*.test.mjs` set with at most four competing test
files; no test or assertion is removed and the native45-second/installer18-minute
bounds are unchanged. Resource contention is a hypothesis to reduce, not an
established explanation or a reason to accept timeouts.

Full local `node --test --test-concurrency=4 --test-reporter=spec
test/*.test.mjs` passed1721of1723, two unavailable-8.3-alias skips, zero failures,
exit0. The final snapshot-input hardening was additionally rechecked in a13/13
focused selection. This scheduling change must still prove itself on hosted CI.

The actionability principle follows the official
[Playwright guidance](https://playwright.dev/docs/actionability). SPS retains its
existing bounded CDP harness rather than adding a second automation framework.
