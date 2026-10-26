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
