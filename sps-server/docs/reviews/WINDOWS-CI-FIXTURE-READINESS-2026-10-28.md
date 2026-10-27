# Windows CI fixture readiness and dependencies

These are test-harness corrections. Production cancellation, authorization,
supervisor deadlines and TLS requirements are unchanged.

## Running-command cancellation

Source `ab849a2`, run `40548353897`, Windows job `122344997693` reached the final
Desktop Node suite: 103 passed, one failed and seven were cancelled. The failed
test was `cancels a running local command when this Desktop Node disconnects`.
Its fixed 80 ms delay could cancel during Windows supervisor startup, where
rejection is the correct behavior, instead of cancelling an already running
command as the test intended.

The test now waits for an actual child stdout marker to reach its mock Hub,
observes rejection immediately, bounds readiness, and cleans up its own command
on failure. Marker detection handles split output chunks. The separate test for
cancellation during startup remains unchanged.

Focused verification after the final marker change: both tests passed (2/2,
zero cancellations); task log `desktop-node-disconnect-focused-2026-10-28.log`.

## Fake supervisor lifetime

The seven cancelled cases belong to the separate
`desktop-node/test/windows-job-supervisor-wrapper.test.mjs` file. Their failure
was pending promises after the event loop resolved. Do not attribute these to
the other file's failed command test: the default Node test runner isolates
files in separate processes.

These mocks have no real socket/process handles to keep Node alive while
production deliberately uses unreferenced deadlines. A test-scoped referenced
interval now models that lifetime and is cleared by the test context. No
production timer was made referenced. The isolated baseline passed locally, so
the CI cancellation was not locally reproduced; after the guard all seven
cases passed without cancellation.

## Native TLS fixture tool discovery

Source `d501cf1`, run `40595340629`, Windows job `122509721911` failed step 8:
twelve Native TLS tests failed in their shared fixture hook because OpenSSL
could not be found. No product assertion ran. Duplicate run `40595348128` passed
the same step; that does not erase the dependency failure in the first run.

The test helper now derives the known Git for Windows MinGW/MSYS locations from
a bounded, shell-free `git --exec-path` response and checks both standard Git
OpenSSL paths. Every candidate must still pass bounded `openssl version`
verification. Missing OpenSSL still fails; no TLS assertion is skipped, no tool
is installed and no workflow or environment is modified.

Helper syntax and the focused certificate validation test passed (1/1).
These scoped checks are not a full Desktop/Node suite or a green CI result.
The Zod security hold and final exact-tuple release requirements remain.
