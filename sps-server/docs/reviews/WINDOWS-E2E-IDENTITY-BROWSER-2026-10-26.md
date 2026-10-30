# Windows E2E mock Identity browser ownership

Source run `40287971084` identified all nine residual owned-Job processes as
`msedge.exe`; the three Desktop Main instances exited orderly and six output
streams ended. The owned-Job natural-empty gate correctly rejected cleanup.

The Workspace source E2E clicked the real SPS sign-in button, which opened the
mock Identity URL through the operating system browser. The mock completed its
loopback redirect but Edge remained running. The fixture now injects a scoped
Identity opener only when both existing E2E and loopback-Identity flags are set
and the configured Identity origin is HTTP loopback. Exact authorize path,
query, state, S256 challenge, device ID and literal loopback callback are checked
before a fixed same-origin capture POST. Cross-origin capture and redirects
are rejected. Normal Identity and general external URLs retain the system opener.

The harness consumes the one captured authorization URL and follows the actual
mock authorization redirect to the existing state/PKCE callback. The mock token
endpoint now checks the verifier and device ID before consuming the code. It
does not fabricate a logged-in result or bypass Core authentication.

Focused opener/Identity/account tests passed 25/25. A direct source runtime
discovery run completed this sign-in without Edge, passed runtime assertions
and Host restart, then failed in the final independent Native recovery phase
on CDP evaluation/close deadlines. Both Main processes subsequently exited
orderly with code 0 and all four output streams ended. That is partial evidence,
not full E2E or owned-Job qualification. Hosted CI and the recovery timeout
remain required; no cleanup gate, deadline or process-kill acceptance was relaxed.

Follow-up adds fixed Native recovery subphase markers and closes the owned CDP
WebSocket on malformed responses, command/open deadlines or disposal. Pending
calls reject and remove their listeners/timers on socket close. Five focused
mock-WebSocket tests cover these boundaries without running another Desktop.
The 8-second open and 10-second command deadlines and actual process/output
exit checks are unchanged. A separate stale HTML assertion now recognizes the
dynamic listener status element while still requiring its default-off content.

Source `b39744a` hosted run `40294574829` passed the No-AI Workspace/runtime
discovery and owned-Job natural cleanup gate. The later packaged Preview failed
before Host creation: its separate mock Identity did not implement the new
capture endpoint, while the isolated packaged launch also enabled the two E2E
flags. The same omission existed in the Host plugin lifecycle harness.

Both packaged fixtures now use a shared, test-only authorization helper that
accepts the exact loopback capture, validates S256/device/state, and follows the
real Desktop callback before waiting for login. The mock consumes the code only
after verifier/device matching. A real loopback HTTP test exercises the normal
Desktop sign-in factory and callback with no browser invocation; malformed
cross-origin capture is denied. This corrects the harness regression without
changing product Identity behavior, Preview/Builder architecture or exit gates.
Packaged Preview and Host lifecycle still need their complete hosted runs.
