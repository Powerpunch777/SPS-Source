# Native termination and bounded failure diagnostics — 2026-10-27

This increment follows Source `9aa0a7d9` and pins Core
`595e957715dcfd717015ffa7ca3a0c047f582dee`. SDK remains the unreleased source
`607b48a4edaed1db7132a01719431ffce5852964`. Native is still opt-in/default off;
the candidate and supported release transport do not change.

## Process and Source ownership

Windows `taskkill` now has a bounded five-second helper deadline. Only the
helper and exact directly owned child are fallback targets. Error, nonzero
exit or timeout rejects; raw helper diagnostics are not exposed. Late helper
events cannot turn a failure into success or become an unhandled error.

The owned-process terminator retains in-flight and failed attempts on their
child object. A failed attempt remains unconfirmed when its direct Windows
child exits: fallback termination of that child does not prove the whole tree
stopped. A live scope can retry; a terminal Windows child cannot trigger another
kill of its potentially reused PID. An unconfirmed terminal attempt remains a
cleanup failure, rather than being silently discarded or automatically retried.
This intentionally blocks reconnect/replacement through the existing controller
cleanup gate. It is not a new general descendant-discovery or OS sandbox claim.
Natural terminal-child behavior and POSIX owned process-group cleanup remain.

The runner awaits termination evidence before reporting completion. Failed
termination does not close a Source, release the active command ID or send a
false completion to Core. Timer and lease callbacks propagate termination
failure to the execution promise. Lease transport errors retain the existing
60-second allowance; a termination error is no longer swallowed as a network
error. Cancellation arriving during a lease response is checked again.

The terminator dependency is an internal constructor input, like existing
command execution dependencies. It is not read from the remote command, wire
payload, Plugin SDK or renderer. Both execution and later scoped cancellation
use the same per-run terminator.

## Diagnostics and ingress test contract

The Core test-PostgreSQL helper classifies stdout and stderr from independently
bounded, copied 4096-byte tails. Its error contains only category, exit code,
byte counts, owned PID-file state and child terminal stage. Known shutdown
timeout wording is classified without raising the deadline or ignoring failure.
Earlier unknown failures remain unknown; this does not change installed Host
database shutdown or authorize cleanup of unowned fixtures.

The Source joined fixture emits allowlisted stage/status/boolean/count diagnostics
if its existing mapping-close observation fails. Credentials, paths, IDs and
raw execution errors are excluded. A started canary is not called terminal
merely because its execution promise rejected.

The previous CI's no-client-certificate test uploaded a roughly 96-KiB body to
an endpoint that rejects before reading it. HTTP 401 or the specifically observed
`ECONNRESET` both deny that request; the test also verifies no additional private
dispatch. Valid authenticated success must still return 200 with the exact
payload and certificate evidence. The ingress implementation was not relaxed.

The remaining denial inputs use a small valid envelope so a missing session
reaches credential validation rather than failing on an empty body first.
Missing-cookie rejection keeps the existing HTTP 400 contract; no status-policy
change was made. An intermediate test incorrectly expected 401 and failed; its
log `native-ingress-denial-final-2026-10-27.log` is retained separately.

## Evidence and limits

- Core focused cleanup file: 12/12 PASS, terminal58164 EXIT0, including the final
  timeout classifier examples. No new database harness or full Core suite.
- Source ownership/lifecycle/Windows helper/termination-state files: 23/23 PASS,
  EXIT0, `native-owned-termination-retention-2026-10-27.log`. This includes a real
  owned Node canary whose simulated tree-helper failure stops only the direct
  child: Source close and Core completion remain absent, duplicate execution
  stays denied and scoped cleanup still rejects after direct-child exit.
- The preceding four-file run passed22/22 before that integration regression was
  added. Helper state tests use injected operations, while lifecycle/ownership
  tests separately use actual directly owned processes.
- Final Native ingress file: 23/23 PASS, EXIT0,
  `native-ingress-denial-corrected-2026-10-27.log`, after preserving the valid
  small-body missing-cookie case and correcting its expected status to 400.
- Earlier joined Source18889 EXIT0 is recorded in
  `native-source-diagnostic-acceptance-2026-10-27.log`: real TLS/Main/Core DB,
  Source/Node/Plugin grant and signed route, RSA envelope, path-change lease
  cancellation and sibling preservation, with a synthetic folder mapping.
  It started before the final termination-state changes and does not qualify
  them, actual SMB, production Identity, real AI/CLI authentication or two PCs.
- Current Core pin, support matrix and generated candidate are synchronized.
  Focused syntax/diff and Desktop Node source synchronization checks were used.
  No full local suite/build or manual hosted-CI rerun was requested.

Prior Source `9aa0a7d9` hosted CI passed Core types/build and all nine Linux test
shards. Completed run40477531498 failed the known unwaived Zod High release audit
and one Desktop ingress `ECONNRESET` test; later Desktop E2Es were skipped. That
result is not a passing CI claim for this newer tuple.

## Remaining qualification and rollback

Workspace-wide durable execution control, real Worker/CLI OS isolation, full
Native SDK and optional AI backend integration, trust-loss recovery, physical
Windows SMB/LAN, production Identity, signed install/update/restore and current
release gates remain. Unknown descendants after a failed tree termination cannot
be made safe by forgetting the failed handle; full Windows runtime containment
and recovery remain separate product work.

No customer data, trust, firewall, installed app, Marketplace policy or Builder
architecture change is part of this increment. Roll back with compatible Source
and Core pins, retaining device keys and recorded cleanup failures. No schema
downgrade, security waiver, major dependency migration, merge or release is added.

Coordinator with GPT-6 Luna high subagents, as requested.
