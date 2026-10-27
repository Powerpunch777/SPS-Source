# Native Plugin and Source execution — 2026-10-27

Starting tuple: Source `47885ee2cc653c4712135c23bcc49cb3fad175ce`, Core
`74de85829057a11783fd640d9ddefc37909cfa91`, SDK
`607b48a4edaed1db7132a01719431ffce5852964`. The containing Source commit pins
the final Core revision through its gitlink/support matrix. Native remains a
development opt-in/default off, Tailscale remains the release transport.

## Behavior

Native Node can claim the existing neutral Plugin execution queue with no Agent
registration. The real Core uses the registered Plugin manifest, execution grant,
approved Node, runner and current Source authority; the transport grants none
of these automatically. Worker/Plugin workflow meaning stays outside Core.

For Source-backed work, a lease now checks the currently active Source's exact
canonical path against the run's recorded `cwdHint`, along with its active
Workspace/Source/Node grant and supported credential algorithm. Route change or
clearing invalidates subsequent lease/output/completion authority. The failure
update targets that run ID rather than every same-subject run on the Node.
This preserves an unrelated sibling using another Source. Revocation is observed
by the existing bounded lease polling, not an instantaneous network kill.

The same check applies to retained Agent commands using legacy Host Project
Shares: current share path must match both the captured descriptor and `cwdHint`,
and current grant/envelope authority remains valid. Per-command failures affect
that command ID. Explicit administrative Node/Agent bulk revocation retains its
existing behavior. Route-test regressions cover both execution lanes.

Desktop Source sessions now retain cleanup ownership on failure. Concurrent close
calls join; an explicit retry can complete cleanup. Windows removal is scoped to
the recorded local drive and expected remote path. A changed mapping is preserved;
successful removal is checked before the helper reports completion. A whole-Host
remote-path removal fallback is not used.

The command runner retains an owned command if Source mapping preparation or
cleanup is still pending, even after its process exits. A slow mapping that
finishes after the preparation deadline is cleaned before that command record
is released. A late Source authorization reply after cancellation cannot start a
new mapping. Cleanup failure remains an error, with the handle available for
exact scoped retry; it is not reported as completed Desktop drain.

The runner rechecks cancellation after its asynchronous preflight resolves and
immediately before the synchronous spawn boundary. A cancellation in the final
Promise continuation cannot unmap the Source and then let prepared work start.

Execution completion and local resource cleanup are distinct: a process result
already committed on the Host is not rewritten merely because removing its
local drive later fails. The Native controller reports unavailable and gates
replacement while its owned cleanup is unconfirmed. Global Desktop shutdown
still deliberately joins cleanup for all owned commands.

After confirmed process exit, Source cleanup starts independently of pending
output/completion delivery to the Host. Otherwise a revoked/unreachable Host can
delay releasing the local mapping. The same cleanup promise is joined at the
end; a failed close is not automatically hidden by a second close attempt.

## Evidence

No full local build/suite or manual full CI rerun.

- Native neutral Plugin joined run31325 exited0, using the existing Core TSX
  smoke with `--with-native-plugin-node`. A real registered Plugin manifest and
  persisted grant enable claim/lease/events/completion after fixture Host approval.
  Agent count stays0. Revoking the execution grant cancels a second real owned
  canary process; foreign Workspace and revoked Node requests are denied. Owned
  Core/DB/temp cleanup passed. Log:
  `g/work/native-plugin-node-smoke-2026-10-27-final.log`.
- This neutral run deliberately has no Source. Executable/workspace are injected
  owned Node/temp canaries; Identity exchange, approval and capsule storage are
  fixtures. It does not qualify actual CLI/provider authentication, Plugin UI,
  DPAPI, SMB, physical LAN or installed operation. Its extra generic Agent-mode
  console marker was removed afterward and syntax checked without repeating the
  acceptance for an output-only edit.
- New Source lifecycle file: first3passed, then4passed including a fake-clock
  preparation deadline, plus the later named pending-authorization case1passed.
  Logs `native-source-lifecycle-focused.log`, `native-source-lifecycle-final.log`,
  `native-source-late-route.log` in outer work. These use real fixture encryption
  and a real owned process where needed, with injected SMB mapping. No real OS
  share/mapping/account/firewall was changed.
- Selected existing Source-envelope/Plugin-route/duplicate-ID cases passed5,
  `native-source-runner-compat-focused.log`. Actual scoped ownership regression
  passed3 after the runner changes, `native-source-ownership-regression.log`.
- Static lifecycle review found a final Promise preflight-to-spawn cancellation
  gap. The synchronous spawn-boundary recheck fixes it. A named regression queues
  disconnect at that boundary and confirms no canary child-start marker, joined
  scoped cancellation and Source closure. The final fixture uses the existing
  identity/containment-checked temporary workspace cleanup helper.
- Final combined Source lifecycle file passed6/6, terminal29540,
  `native-source-lifecycle-complete.log`; the final named spawn regression also
  passed at terminal48662. Existing private-channel CI contract file passed3/3
  after adding the three bounded automatic integration steps. Local broad checks
  were not repeated to obtain those results.
- The Node result codec now preserves valid Unicode inside JSON data (including
  BOM/replacement characters in names/output), while fatal UTF-8 decoding,
  canonical JSON and leading-BOM rejection remain. The affected protocol file
  passed5/5, `native-node-unicode-protocol.log`. Transport framing must not reject
  otherwise valid user content merely because it contains those characters.
- Desktop CI's remaining stale Workspace DOM child-count expectation now checks
  its current Workspace/Node action labels and refresh clearing. The one named
  renderer case passed; prior CI failure is not hidden by deleting coverage.
- The first small Core Source typecheck exited2. Its custom configuration omitted
  the existing Express actor augmentation; inclusion of the legacy route test
  additionally exposed four fixture typing errors. Their malformed-input intent
  is retained with an explicit boundary cast, complete manifest fields and typed
  history cursors. A corrected scoped check and actual Source joined evidence
  are tracked separately; the first failure is preserved in
  `native-source-authority-types.log`.
- The corrected custom type configuration's second run54385 also exited2 on two
  remaining fixture type errors. Both were corrected, then the additional legacy
  Share guard was added. Root's final check25369 used the current affected files
  and proper augmentation and exited0 with no diagnostics, recorded in
  `native-source-authority-types-final.log`. No failed check is counted as a
  pass, and no full workspace typecheck is implied.
- Source joined attempts exposed fixture defects before acceptance: undefined
  local `decrypt`, PEM trailing-newline comparison, and comparison against an
  envelope `version` field omitted by the decrypt helper's public result. The
  first redirected log was accidentally overwritten; its transcript is explicitly
  labelled reconstructed from captured terminal output. Later failures have
  distinct log files. Credential comparison uses a fixed safe boolean assertion,
  rather than dumping either plaintext fixture credential object on mismatch.
- Source retry91649 reached a running Source-backed canary but failed at the
  path-change step because the fixture's `eq` import was scoped to an earlier
  block. Its aggregate failure also includes embedded PostgreSQL pg_ctl shutdown
  exit1; the later absence of matching processes does not turn that cleanup into
  a pass. The distinct original `native-plugin-source-smoke-2026-10-27-retry1.log`
  is retained. Scope was corrected before a subsequent isolated attempt.
- Source retry71408 passed signed route/RSA decrypt, path-change lease termination,
  real canary cancellation and sibling preservation, but failed the final revoked
  Node reconnect assertion. It also failed pg_ctl cleanup. This exposed a real
  controller defect: reconnect returned an existing launch's cached state after
  Member approval without rechecking current Node authority. Main now performs
  a signed heartbeat before returning the existing launch. Member recovery remains
  device-only; the fixture was not changed to manufacture Node revocation denial.
  The affected controller file passed9/9 after the fix, terminal24755,
  `native-node-reconnect-authority.log`. A new joined acceptance is separate from
  those passing lifecycle assertions and earlier failed cleanups.
- Source retry35202 exited1: the Source A path change failed its run, but its
  local mapping close was not observed within the fixture's five-second check.
  Cleanup again reported pg_ctl exit1/category other. No full Source acceptance
  is claimed. Inspection then identified output/completion delivery preceding
  local Source cleanup; cleanup now starts after confirmed process exit without
  waiting for those Host responses. The affected lifecycle file passed7/7 at
  terminal77890, including a terminal child with its Host response held pending.
  Log `native-source-cleanup-delivery-final.log`. The joined Source scenario has
  not been rerun after this fix; its current end-to-end result remains failed.

Current follow-up Core revision is `b29988d76040a19b6ee11390ac25ea861451e8d5`.
The Source snapshot containing this review is still a draft development candidate.

## Exact prior-head CI evidence

Source `47885ee` hosted runs40467958971 and40467965490 passed full Core Linux
types/build and all9 Core Linux test shards. Native Node runtime4 actual tests
passed in server1/3 (jobs122067844107 /122067866013); ordinary Node routes28
actual tests passed in serialized3/4 (jobs122067844185 /122067865779). This is
stronger evidence than the earlier local Windows DB-start timeouts, which remain
failed zero-assertion runs. It does not automatically verify the new Source edits.

Those runs separately failed production security on Zod High1243066 (unwaived)
and the Desktop renderer assertion repaired here. The compatibility job's later
Node check was skipped after the security failure; Node route evidence above
comes from the actual serialized test shard. Do not claim current complete CI
or security acceptance.

## Remaining product qualification

The signed Source route must be exercised with real Windows SMB file access on
physical Host/Member/Node, including credential rotation, path/grant revocation,
network loss, cleanup interruption and app restart recovery. An injected mapping
or encrypted-envelope test cannot replace that. Mapping ownership checks are
process-local drive/path checks, not an OS sandbox or proof about arbitrary
external replacement/descendants. Source provisioning interrupted before the
mapping result and restart recovery remain separate qualification.

Full Native SDK events/navigation, Workspace-wide durable pause/stop/resume,
Worker/CLI OS isolation, trust-loss/CA rotation recovery, actual optional AI
consumer/provider/backend, production Identity, signed installation/update/restore
and exact-tuple release gates remain. Historical Zod major-migration hold and
existing security policy are preserved. Marketplace policy and Builder structure
are excluded. No release/merge/npm publish or customer data/trust change.
