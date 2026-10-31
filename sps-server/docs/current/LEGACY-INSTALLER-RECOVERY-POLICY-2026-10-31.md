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
