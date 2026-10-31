# Withdrawn Installer Recovery Policy

User decision: 2026-10-31. Scope: the withdrawn, unsigned historical Desktop
`0.4.86` only. This does not change the general automatic-update requirement or
make a failed old-version replacement successful.

## Product Behavior

- A failed old uninstaller keeps its nonzero outcome. Do not hide the failure,
  overwrite the old program, delete its files, or start a fallback automatically.
- For exact `0.4.86`, a non-silent Setup failure explains the data-preserving
  reinstall route. Silent update failure must return its original error instead
  of waiting on an invisible dialog. Other versions keep the ordinary fatal
  uninstall-error handling.
- The user first backs up SPS data and any work saved inside the program's
  installation folder. They then choose uninstall in Windows Installed Apps,
  without requesting deletion of app data, and run the current Setup themselves.
- Do not instruct users to delete SPS AppData, the Host Vault, project folders,
  credentials or source folders. A backup can contain sensitive information and
  must be kept private. A running or busy old installation is not forcibly
  removed by a recovery script.
- This is a user-guided recovery route, not a new unattended recovery installer
  or a claim that the old binary can be repaired in place.

## Required Evidence

1. Keep two separate, mandatory hosted Windows gates. The existing `desktop`
   job runs `installer-current-preservation`: install the current package,
   replace it with the same package, verify repair, perform ordinary uninstall
   and reinstall, and check package hashes, isolated first frame and retained
   data. It does not use the withdrawn installer as its current-package test.
2. The separate clean-hosted-VM `legacy-installer-recovery` job consumes the
   private installer inputs uploaded by the same workflow run and attempt. It
   requires the real pinned old installation, an actual candidate NSIS
   replacement exit 2, byte-for-byte unchanged complete old program tree and
   all ten inert sentinels, ordinary old uninstall, then same-candidate
   reinstall with five installed-artifact hashes, isolated first frame and
   retained-data checks. The ordinary uninstall prerequisite and time-bound
   schema-2 checkpoint are stages of this recovery gate, not a substitute for
   its upgrade-failure and reinstall checks.
3. Either gate failing is a workflow failure. The recovery job uses
   `needs: desktop` with `if: !cancelled()` so it still gathers independent recovery
   diagnostics when the desktop gate fails; a missing same-attempt artifact
   also fails the job. Timeouts, signals, unexpected exits, missing files or
   changed bytes never count as the required old-installer exit-2 preservation.
4. Keep native runner guards and their original per-step 8/18-minute bounds;
   do not raise them. The new recovery job has a 55-minute overall bound for
   separately bounded prepare (10), replacement (20), ordinary uninstall
   (10), and reinstall (10) workflow steps, plus setup. Retain hosted-only
   checks, canonical owned paths, restricted token/private desktop/owned Job
   and natural process-tree closure.
5. No automatic fallback is permitted. These gates do not qualify a signed
   installer, a previous-Stable/default-profile upgrade, application-data
   migration, physical-device behavior or production recovery. Never launch
   the withdrawn old Main or run installers on a developer's installed
   profile. Building guidance or passing a prerequisite alone is not release
   evidence.

## Earlier Evidence (Chronological)

Both supported NSIS hooks compile with the exact-version recovery guidance
(38967-byte compile-only fixture, no warnings, never executed). Silent mode
still returns the original failure. Current-package replacement is additionally
measured before the old input; the original historical gate still fails closed.

A separate hosted-only `historical-standard-recovery` diagnostic retains the
original long fixture path, uses the old uninstaller's ordinary semantics (no
`--updated`, KEEP or delete-data flag), and requires nine retained opaque user
records plus one external project record and complete program removal. Its
eight-minute child/ten-minute job bounds, same-user reduced token, private
desktop, owned Job and natural-cleanup requirement remain intact. This is only
the ordinary-uninstall prerequisite, explicitly not a completed reinstall or
automatic-upgrade proof. Hosted execution is still pending.

The historical replacement test now captures a bounded complete program-tree
content digest before the attempt. On error it requires the same canonical root
identity, names, regular-file bytes, empty directories, historical registration
and all user sentinels before reporting preservation; it then rethrows the
original failure. Links/hardlinks, filesystem races, incomplete inventories or
exceeded bounds fail rather than qualify. There is still no automatic recovery.

Focused installer/safety/recovery contracts20/20, snapshot/flow9/9 and full local
Desktop1723total/1721pass/two unavailable-8.3-alias skips/zero failures passed.
The complete
separate recovery flow, retained-installation hash proof and actual hosted
recovery outcome are not yet qualified. No installed local app/profile was used.
Merely approving this policy or compiling guidance is not release evidence.

## Two-Stage Prerequisite Follow-Up (Earlier Evidence)

Source397c014 diagnostic41159578592/job124413905847 failed its480-second total
bound. Old installation returned0 after409347ms, and all nine user sentinels plus
the external project still matched at that point. The ordinary uninstaller had
only about61seconds left; its captured execution-policy command was pending at
the deadline. Forced cleanup124 was rejected. There is **no** observed ordinary
uninstall completion or post-uninstall preservation proof from that attempt.

The separate recovery prerequisite now runs prepare and complete as two ordered
steps on the same disposable hosted VM. Each remains bounded at eight minutes
by its native owner and ten minutes by its workflow step. The recovery job's
overall bound is now explicitly twenty minutes for those two steps and setup;
the original diagnostic eight-minute and full installer eighteen-minute gates
are unchanged. The prior timeout is not reclassified as a successful test.

Prepare writes only a private, exclusive, bounded checkpoint in that VM's TEMP
after installation0, exact old registration/bytes and sentinel hashes. The next
step runs only after the first owner's natural Job closure succeeds. Complete
requires a canonical checkpoint, exact keys, pinned old installer hash, thirty-
minute lifetime, direct owned fixture basename/root identity, unchanged old
uninstaller/ASAR bytes and all ten sentinel hashes before ordinary uninstall.
No arbitrary target directory is accepted. A second completion cannot reuse a
consumed checkpoint. This is local test continuity, not a signed release or
physical-device attestation, and the checkpoint is never an uploaded artifact.

Both stages remain hosted-only before OS inspection or mutation; production
recovery still requires the user's separate Windows uninstall/reinstall actions.
After ordinary uninstall the complete program directory and registration must
be absent while every retained byte still matches. Even a successful prerequisite
will explicitly leave candidate reinstall and automatic/previous-Stable upgrade
unqualified. Full local Desktop1724total/1722pass/two environment skips/zero
failures and the focused stage/guard selection13/13 passed. Actual new-stage
hosted results and the subsequent full reinstall flow remain required.

Related evidence: [historical failure](../reviews/INSTALLER-CIM-DIAGNOSTIC-2026-10-31.md),
[completion checklist](CORE-FINAL-VALIDATION-2026-10-30.md).

## Latest Policy and Status (2026-10-31)

The two gates above are mandatory and independent. The desktop job now names its
existing current-package gate `installer-current-preservation`. The new
`legacy-installer-recovery` job is a separate clean hosted VM and downloads the
exact private installer-input artifact named with this workflow's run ID and
attempt. GitHub documents artifacts as a way to pass data between jobs in one
workflow ([workflow artifact documentation](https://docs.github.com/en/actions/how-tos/writing-workflows/choosing-what-your-workflow-does/storing-and-sharing-data-from-a-workflow)).
That documents artifact transport only; it does not establish authenticity,
release signing, physical-device evidence or production qualification.

The recovery stages share a private, time-bound schema-2 checkpoint with
explicit `installed` -> `upgrade-failed` -> `uninstalled` transitions. The
upgrade stage must observe the real candidate NSIS process exit 2 and verify
the complete old program snapshot plus ten sentinels is unchanged before
ordinary uninstall. Reinstall must use the same candidate, verify five
installed artifact hashes, an isolated first frame and retained bytes. Missing
artifact or any failed gate remains a failure; `needs: desktop` with
`!cancelled()` allows the separate recovery diagnostics to run after a desktop
failure.

Current execution status: the ordinary-prerequisite hosted job
`124417311115` for `9e06fca` completed **FAILED**. Prepare installed the pinned
input with exit 0 after 232631ms, verified all ten retained records and closed
its Job naturally. Complete observed ordinary uninstall exit 0 after 70045ms
and all ten unchanged records, then failed a post-removal assertion. That log
does not distinguish a remaining registration from a remaining program tree;
neither complete removal nor recovery is qualified. Both owners closed their
Jobs naturally. The follow-up reports only registration count, directory
absence and a bounded path-free remaining-tree census before the unchanged
post-removal assertions. It does not delete leftovers or turn exit 0 into a
complete-removal pass.

The same-Source desktop job `124417311137` failed before app acceptance: its
harmless PowerShell observer exceeded the unchanged 45-second native bound,
and five snapshot cleanup hooks confused Windows 8.3 TEMP aliases with their
long canonical names. The fixture now canonicalizes TEMP before creation and
retains its root identity/link checks; an actual-alias regression runs when
the OS exposes one. Observer failures retain safe fixed phase and owned-Job
diagnostics without logging the raw command or changing the deadline. Local
success does not establish the hosted timeout's cause.

The new workflow and runner changes have not been hosted-validated. Both gates
remain pending qualification. No automatic fallback is enabled, and none of
the excluded signed/previous-Stable/default-profile/migration/physical-device/
production cases is qualified.

Local final validation: `npm run test:ci` completed with 1730 total, 1727 pass,
three unavailable-Windows-8.3-alias skips, zero failures (41812ms). The focused
recovery/native/snapshot/observer selection completed with 42 total, 41 pass,
one unavailable-alias skip, zero failures. YAML parsing, JavaScript syntax and
`git diff --check` passed. These include harmless native process probes, not a
local installer invocation. An earlier full run exposed an existing literal
8-minute timeout-expression contract mismatch; its original expression was
restored before the final successful run, without changing its bound or test.

## Hosted Residue and CI Follow-Up

Source `c3c79c3` diagnostic41161957975/job124421238310 is terminal failure.
Prepare installed the old package with exit0 after313403ms, verified all ten
records and closed naturally. Ordinary uninstall returned0 after109288ms and
preserved all ten records. The new postconditions confirmed zero registrations
but a remaining program directory:46 regular files,61 directories, no links or
hardlinks, complete census, maximum absolute/relative length282/181 and46paths
over259characters. The complete-removal assertion correctly failed; the Job
closed naturally. These measurements do not identify the exact failed NSIS
instruction and do not qualify reinstall or permit leftover deletion.

The user is being asked separately whether to add explicitly confirmed removal
of only the old program residue, after backing up any work kept inside that
folder. No such feature, local cleanup or product-policy waiver has been
implemented while that decision is pending. AppData, Host Vault and external
projects remain outside any proposed program-residue scope.

The same Source's Verify41161958027 passed all17 non-Windows jobs, including
all nine Linux shards, full Core typecheck/build and security policies. Its
Windows job124421238364 failed two unit fixtures: a literal-LF search in the
new workflow contract on CRLF checkout, and the unchanged45-second harmless
PowerShell observer. That observer reached Node and created PowerShell; the
actual x64 availability command remained pending at45013ms. Cleanup124 was
forced and rejected. No timeout, app acceptance or installer pass is inferred.
The mandatory recovery job124421935981 then failed its missing same-attempt
artifact, because the failed desktop job had never built one. This is an
expected fail-closed dependency outcome, not executed recovery evidence.

Workflow contracts now use the installed YAML parser and test both LF/CRLF,
missing/reordered gates, wrong timeouts, broad artifact paths, caller-supplied
mode flags and conditional skips. The CI test command first runs the unchanged
observer file alone, then every other discovered test at file concurrency4.
The exact partition is tested against the full directory, with duplicates,
missing mandatory files, invalid names and either child failure rejected.
This removes competing test processes from that observation, not tests or
deadlines; whether contention caused the hosted delay remains unproven.

Final local `npm run test:ci` exited0: the serial stage passed2/2 and the full
remaining241-file stage had1730total/1727pass/three unavailable-8.3-alias skips/
zero failures (41455ms). Aggregate1732total/1729pass/three skips. Focused CI/YAML
contracts5/5 and `git diff --check` passed. No installer or installed user
profile was used. New-HEAD hosted validation remains required.

## Confirmed Residue Cleanup (User Decision)

The user subsequently approved an additional recovery step: only after the
user has reviewed the old target and backed up work stored inside it may the
remaining old program files be cleaned. No automatic cleanup follows an
update error. AppData, Host Vault, external projects and unknown user files
must not become cleanup targets. This supersedes the pending-decision note
above, not the failed uninstall evidence or the ordinary automatic-update gate.

Implementation is incremental and is **not yet an available cleanup feature**:

1. The pure `legacy-installer-residue-plan.mjs` validates two complete captured
   inventories, their canonical content hashes, unchanged root identity, exact
   old version, observed replacement failure, ordinary uninstall0, no registered
   install and no Desktop process. It permits only unchanged remaining files
   within the old expanded `resources/sps-owner-host-runtime` tree and its
   known parent directories. Unknown, added, changed, conflicting-case, escaped,
   malformed or oversized records fail with a fixed path-free error. A plan
   requires user confirmation and is neither authority nor a filesystem remover.
2. The clean hosted old-package prepare stage captures the pinned installer
   bytes before uninstall, writes a bounded package inventory containing only
   relative names/sizes/content hashes and the pinned installer SHA, then the
   owner must finish natural Job closure. A private two-day Actions artifact
   preserves only that inventory, never the checkpoint, root file identity,
   account, machine name, absolute path or AppData. The inventory is not yet
   obtained/reviewed/pinned for production. A live user's arbitrary snapshot
   cannot replace trusted original-package membership.
3. Next, bind the reviewed exact-package inventory, actual per-user old install,
   target directory identity and real backup/target confirmation in a separate
   installer recovery operation. Silent mode still exits nonzero. Cancellation
   must mutate nothing. Run ordinary uninstall, verify its outcome and retained
   data, then allow cleanup of matching original program residue only. Native
   file/ancestor handles must prevent link/reparse/root replacement races; do
   not substitute recursive deletion of a caller-provided path. New or changed
   files and uncertain process ownership stop recovery. No elevation or process
   killing is added implicitly.
4. Wire the real confirmation UI, native cleanup and explicit same-candidate
   reinstall; verify decline/cancel, linked/replaced targets, unknown files,
   retained data, five installed hashes, first frame and natural process closure
   in the disposable hosted environment. The existing old-uninstaller-only
   diagnostic remains a failure when residue survives; the approved additional
   cleanup must have its own actual evidence, not a waived absence assertion.

The planner, no-mutation snapshot compatibility and guarded inventory workflow
selection pass17/17 focused tests. Production confirmation, native deletion,
package-inventory trust/loading and complete recovered installation remain
unimplemented/unqualified at this checkpoint. No installed app or actual user
data was accessed. Core/SDK/API/schema and the deferred Native product scope
are unchanged; a Windows installer recovery helper is not Native LAN work.

Final local validation of this foundation: `npm run test:ci` exited0 with
serial2/2 plus1737total/1734pass/three unavailable-alias skips/zero failures in
the remaining242-file stage (aggregate1739total/1736pass/three skips). Both
workflow files parse and diff-check passes. Hosted inventory generation and
its artifact content/hash still need review; no cleanup executor is included.
