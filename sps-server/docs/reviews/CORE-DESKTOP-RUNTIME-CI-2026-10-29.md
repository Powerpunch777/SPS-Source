# Core/Desktop runtime and Windows CI verification — 2026-10-29

Status: progress toward Core completion. This is not a Stable or physical
multi-device acceptance record. New solution-plugin and Builder development
must wait for a separate user instruction after the Core/Desktop report.

## Tested candidates

Initial evidence below uses Core `a01b395e9cd0688db62d75f2fd8465dbdb6f307c`.
The later input-order follow-up uses Core `b4c2bc6f0e2a63a62f9b5ef8873581f520ad9385`,
as distinguished in the final section. Public SDK
`61a929f6c783f78e5af603682de1543c7e24abc0` is unchanged throughout this record.

Source `07f927e0c8fb53ad4249d615a5a9ff576dd9f26a` passed both automatic
[push40825997374](https://github.com/Powerpunch777/SPS-Source/actions/runs/40825997374)
and [PR40826005109](https://github.com/Powerpunch777/SPS-Source/actions/runs/40826005109):
**18/18 jobs successful** in each run. This includes full Linux type/build,
all nine Core regression shards, compatibility/security and Windows Desktop/Node.
The Windows job covers No-AI source usage, Workspace execution control across
source and packaged restarts, packaged runtime/supervisor, Workspace surfaces,
preview and Host plugin lifecycle. These results belong to that exact Source.

The completed push Windows job's detailed log contains eight acceptance-wrapper
`ownedJobEmpty:true` / `ownedJobCleanup:"natural"` results. Five Workspace Main
shutdown reports have `graceful:true`, `exitConfirmed:true`, exit code0 and no
forced-stop request. One reports `closeRequestFailed:true`; its actual exit and
later natural Job-empty proof still passed. Workspace temporary-directory
cleanup completed on its first attempt. This is CI process/cleanup evidence;
it is not a two-computer or customer-installation test.

Source `298cac740b542f3b83859ea166aa20d7c2c36402` additionally saves the generated
Room worker produced by the required runtime build. Plugin source, manifest and
version are unchanged. The output now embeds patched Zod4.6.6/v3 and current
Core claim/Workspace schema contracts. Its new automatic push40829380687 and
PR40829387752 need separate final results; older green checks are not reused as
proof of those heads.

## Actual local deployment output

The existing runtime was from an older Source/Core/SDK tuple and was rebuilt.
`npm run prepare:owner-host-runtime` completed successfully on Windows with
Node24.16.0/pnpm11.9.0, producing:

- Source298cac740b542f3b83859ea166aa20d7c2c36402, Core a01b395e, SDK61a929f;
  all three baseline dirty flags false, Desktop0.4.137 development-candidate.
- Runtime format8; bundled Node24.16.0 independently executed successfully.
- Archive172332348 bytes, SHA-256
  `3dd0ecdd4c21f8b3ac32e73090e34410d7ca00ed75feecc7c6977a1b506ef08e`.
- Expanded runtime28783 files /579617673 bytes. Runtime manifest SHA-256
  `19cc6e24c527b00d580b020e98d3586095162393f7ec00fef7dbac7c7795a85a`.
- Actual deployed Zod4.6.6 passed issue/resource checks. Source/dist migration
  SQL0174–0176, their snapshots and journal have matching hashes.

Optional cpu-features compilation reported an unavailable compiler during
deployment; the optional dependency did not fail the command. This does not
qualify a native compiler installation. CI uses Node22 and its independently
prepared bytes; local Node24 output is not presented as the CI artifact.

The actual runtime standalone smoke subsequently **passed**: health and desktop
transport restrictions, static/baseline UI, bundled compatibility, public SDK
worker/Host conformance, internal Registry install/update/rollback, package
dependency impact review and authoring-package compatibility. It used a fresh
owned temporary database, memory service and synthetic access proof. The real
database applied current migrations. No customer data or credentials changed.

That smoke's fixtures needed corrections discovered by actual execution:

- Health can precede sequential bundle installation. A bounded helper now waits
  for all required bundle rows while rejecting malformed, duplicate or failed
  rows. Its focused tests passed3/3; existing health and functional assertions
  remain. It does not change Core admission or extend the Electron deadline.
- The existing authoring package already declares seven tools; the stale exact
  five-tool expectation now checks all seven. No new plugin tool was implemented.
- This compatibility fixture deliberately selects the authoring bundle, whose
  approved manifest declares default-enabled. The old contradictory default-off
  assertion is replaced by declared-default checks plus explicit Workspace
  disable/bridge403/re-enable checks. Memory and Room default-off checks remain.
  Core's contract preserves package defaults; ordinary neutral Desktop behavior
  is independently covered by the No-AI CI path.

The standalone smoke is functional evidence. Its legacy process-stop harness
does not substitute for the CI wrapper's owned-Job and natural-close proof.
Unpacked local Windows packaging/verification is a separate pending step.

## Unresolved or external evidence

- Local first-renderer bootstrap failed its existing10-second target deadline.
  Installed Electron package/version/EXE all43.8.3; RUN_AS_NODE is absent.
  Output-only diagnostics found a debugger target after the acceptance deadline.
  The deadline and assertions were not relaxed, and a late target is not a pass.
  Diagnostic cleanup also observed EBUSY. Those local failures remain recorded.
- Core PR27's inherited `commitperclip PR Review` check fails because repository
  `COMMITPERCLIP_KEY` is absent. No key was fabricated and no check was removed.
  This is distinct from the Source product CI results above.
- Latest exact-head CI, local unpacked verification, signed installer/update/
  rollback/restore, physical Host/Member/Runner Tailscale/SSH and remaining Core
  contract evidence are still required before any full completion claim.

Public Marketplace, new Builder/solution-plugin implementation, new Native work
and complete untrusted-code OS containment remain outside this increment.
Existing SDK/data/security and approved-package compatibility are retained.

## Later ownership and input-order follow-up

The actual unpacked runtime prepare/build and functional install/update/rollback
smoke completed successfully. Archive Source298cac7/Corea01b395e, all clean,
is172332348bytes with SHA256
`3dd0ecdd4c21f8b3ac32e73090e34410d7ca00ed75feecc7c6977a1b506ef08e`.
Source298cac7 push40829380687 also completed all18CI jobs successfully.
Its unsigned development unpacked build predates the fixes below; it does not
qualify the newer candidate. The standalone packaged verifier is still extracting
that archive and has not returned a terminal result.

Source3c9a65b corrected the stale activation source assertions while retaining
all other coverage and adding explicit disable403 checks;3focused files passed
16/16. Its push40833647355 subsequently exposed a Linux workspaces B failure:
the existing bidirectional process-session proxy returned code0 and empty stdout
instead of `out:hello\n`. This failure is not waived as a flaky test.

- Source703db18 fixes a preparation-lock defect reproduced with a small fixture:
  the prior implementation reclaimed a16minute-old lock even with a live owner.
  The fix requires a definitely absent owner (`ESRCH`), preserves live/unknown/
  invalid owners and rechecks file identity before removal. Existing timeouts,
  archive validation and resource limits are retained. Two focused files passed
 20/20 without skips, including the before/after regression and malformed lock.
- Coreb4c2bc6f fixes input publication that allowed EOF to overtake earlier data.
  It serializes frames, reuses existing atomic temporary-file publication and
  joins uploads before stop cleanup. Failed normal input/EOF remains failed;
  cleanup can separately attempt EOF after the failure settles. Six controlled
  promise tests and adapter-utils typecheck passed. Linux integration tests are
  retained and still require updated-candidate CI. See Core
  `doc/SPS-PROCESS-SESSION-INPUT-ORDER.md` for bounds and provider limits.

Current candidate Core/gitlink/documentation must agree before the next runtime
build. Final new-candidate CI and rebuilt packaged-app evidence remain pending.
The local Electron bootstrap failure above remains unresolved.

Code inspection also confirms a separate outstanding package-recovery boundary:
UUID staging roots can be active artifacts referenced by `plugins.packagePath`.
Upgrade rollback retains the old package snapshot in process memory, not a
durable operation journal. Restart recovery and safe artifact retirement must
preserve current, rollback and still-running-worker references. Directory age or
the word "staging" does not authorize deleting these artifacts.
