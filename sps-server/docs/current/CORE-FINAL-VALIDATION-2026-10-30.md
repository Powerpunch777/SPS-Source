# SPS Core final validation checklist

Updated: 2026-10-31. This is a working checklist, not a Core completion or Stable
release declaration. The scope is set by
[Core completion policy](CORE-COMPLETION-POLICY-ko.md). Core remains private,
SDK public; AI is optional. New Builder features, public Marketplace, and
deferred Native development are excluded.

## Revision And Preservation

- Starting Source: `a7246667584615edcb8ed71dfc16a983bac455a6`.
- Core: `b17fb830138b4acde96aa7b5c911f7e8cccfa698` (earlier evidence names its prior revision explicitly).
- SDK: `61a929f6c783f78e5af603682de1543c7e24abc0`.
- Desktop: `0.4.137` development candidate, not a new Stable release.
- Work continues in `codex/sps-core-final-validation`. Older uncommitted Native
  changes in the original checkout remain untouched. Tests use owned temporary
  profiles, not the installed user profile.

## Current Evidence Summary

The following correction supersedes the earlier d8 snapshot below. Intermediate
Source `d9e58b9` push `41182439329` and PR `41182443867` both completed their
Windows source/packaged/current-installer gates with natural Job closure.
Their separate mandatory legacy jobs failed at `initial-window`, before
ordinary uninstall; forced cleanup was rejected and reinstall skipped. These
are not complete recovery passes. Source `01695d2` push `41183095007` and PR
`41183097779` then failed the new local-Form component at `initial-backup` after
the one-second provider-read bound was made terminal too early. All17
non-Windows jobs passed on that push. A new compiled delayed-query regression
first reproduced the premature failure and now passes while observing the same
query inside the original 15-second UI/overall deadline, without retries or a
longer budget. Known unavailable-dialog/window-deadline/query-deadline reasons
are fixed non-sensitive diagnostics, never passing outcomes.

A separate real Main defect is now reproduced and corrected: a rejected
Workspace navigation previously remained permanently reused on later open
requests. Existing authentication/session/Host fences now run before replacing
only that failed window. Two new regressions failed before the fix. Actual
isolated Main transfer additionally passed a native owned-socket navigation
failure, retained failed window, requested retry and authenticated persisted
project recovery. It still passes the full preceding transfer/review/account
fence/restart/natural-exit/EOF/temporary-cleanup workflow. This does **not**
attribute the earlier pending-navigation CI hang to this rejected-load defect.
See [retry evidence](../reviews/WORKSPACE-NAVIGATION-RETRY-2026-10-31.md).

Latest full local `npm run test:ci`: serial2/2 plus1839total/1836pass/three
unavailable-8.3-alias skips, aggregate1841total/1838pass/3skip/0fail, exit0.
Production dependency policy: two Low and one reviewed Moderate; full graph:
three Low and two reviewed Moderate. Both have zero Critical/High, with no High
exception; minimatch reviews expire 2026-11-07. Syntax and diff-check pass.
Push `41190991746` at `e33ac03` failed the native-socket acceptance because
Chromium returned real `ERR_SOCKET_NOT_CONNECTED` (`-15`); its test predicate
only knew `-101`/`-324`. The fixture now recognizes only these three explicit
native variants; cancellation/unknown/forged rejections still fail. The actual
source transfer, full preceding review/restart/account-fence stages and natural
cleanup passed again after this test-only correction and helper extraction.

PR run `41190996517`/Windows `124507591880` passed all17 non-Windows jobs,
including all9 Core Linux shards/full typecheck/build. Its Windows job passed
source acceptances and packaged execution/Workspace/Preview/Host lifecycle,
built its unsigned candidate, and completed the current installer gate with
natural whole-Job closure. Its installed Source merge is
`a0418d624e807d78613068114f3bbdbfe38fab87`, installer SHA256
`ac26827e8c5eecbbc47996d88fd66e2d1923517690a97ec48b46420f18a7ada5`.
Nine opaque records/five package artifacts/three isolated first frames passed;
the mandatory legacy job124517885192 is still live in operator-upgrade recovery
at observation. This is the earlier e33 merge candidate, not the new
uncommitted in-place-migration acceptance. It is not an overall/recovery pass.

Same-profile **source** Main acceptance now passes without import/restore:
the owned historical157 cluster and v11 Desktop state become176/v13, both
Workspace projects/JSON/timestamps/file hashes survive, and the existing real
DPAPI account/signing key still decrypt after restart. The same test is now
mandatory inside the hosted current-installer gate after candidate replacement,
bound to installed EXE/ASAR/archive hashes and loaded runtime baseline. Its
**installed mode has not run yet** and cannot be credited to earlier e33 CI.
Local installed invocations are refused; no user profile is a test target.

Source4d8f324 push41194200983 and PR41194205284 then failed their new regular-Node
native preparation at postgres-start; all17 non-Windows jobs completed but no
installer was built. That failure is not waived. The test now uses the existing
same-user/non-admin reduced-token launcher with the full native preparation and
additional natural-Job-closure requirement. Fixed phase/admin-banner diagnostics
do not change failure to success. Local actual reduced-token test passes; final
new-HEAD hosted confirmation is required. Original admin-refusal causality is
unproved because the earlier raw output was not retained.

New exact-HEAD hosted validation remains required. Real installed in-place
DB/state/credential migration is still an evidence gap until that gate passes;
opaque installer canaries plus source scenarios cannot close it. See
[installed migration audit](../reviews/INSTALLED-MIGRATION-EVIDENCE-GAP-2026-10-31.md).
No installed app/profile, original dirty Native checkout, Production, Core or
SDK was changed by this follow-up. Core completion remains unproven.

### Earlier d8 Snapshot

This summary supersedes the historical observations below; it does not declare
Core or Stable completion. Source `d8a6c699` push Verify `41176105464` passed
all17 non-Windows jobs and the new joined Runner/No-AI source acceptance, but
Windows `124463887020` then failed ordinary Main transfer at the post-restore
restart Workspace wait. Job cleanup was natural; no installer was built.
PR Verify `41176116088` passed that transfer and the complete Windows job
`124463917330`, including current-package install/replacement/repair/uninstall/
reinstall and retained-data checks. Its actual installer is unsigned merge
`a689e4bc44637212ceb1004ec9920c75f90a89e6`, tree
`2928a5cff57d17c42b54b6147c13985ff9e9318a` (equal to the `d8a6c699` tree), SHA256
`9e2bfed1892d7f4903fd21dbd00a44e5539f3ca07fed1427ed2c40785995fd8f`.
The downstream legacy job `124474167470` passed historical installation and
automatic-replacement-failure preservation, then failed the explicit recovery
GUI before ordinary uninstall; forced cleanup was rejected and reinstall
skipped. Thus the overall PR run failed and cannot waive the push failure.
Native-versus-
Playwright window observations now preserve this failure for diagnosis without
changing Main, waits, permissions or success conditions. Actual local Main
transfer passes, including a normal native/tracked snapshot, do not reproduce
or resolve it. See [restart observation](../reviews/OWNER-VAULT-WINDOW-OBSERVATION-2026-10-31.md).

Earlier completed PR Verify `41169709122` at Source
`a0c04af12a6b6bcbfbf0bede41672139cc347eee` passed all17 non-Windows jobs,
including all9 Linux shards/full Core typecheck/build, public SDK, Identity and
bundle/security-policy checks. Its Windows job `124444808130` passed source
Main/No-AI/Native/transfer/historical restore and packaged execution, Workspace,
Preview and Host plugin lifecycle. It then **failed NSIS assembly** with warning
6000 (`installationDir` used before its declaration), so current installer
preservation was not run and the downstream legacy job failed missing input.

The hook now reads the old target using electron-builder's existing registry
helpers and refuses an absent target. The original failed uninstall code,
silent failure and explicit default-No confirmation remain unchanged. A fixture
with the actual declaration order and NSIS `-WX` compiles both production hooks
with the actual recovery helper, without executing Setup. The completed Windows
build above qualifies this assembly correction; complete legacy recovery still
requires a successful new hosted result.

Runner response-loss recovery now also has actual Core/public-SDK + Electron
DPAPI/state-file restart + native harmless CLI component evidence. Both lost
claim/final responses recover without duplicate execution; independent Node
keys, exit-7 failure, cancellation and foreign-Workspace denial are checked.
This invokes the exact Main poll routine, **not Main startup or a Member UI**.
See [scope and commands](../reviews/RUNNER-RECOVERY-COMPONENT-2026-10-31.md).

Actual installed old-version recovery remains incomplete. The prior current
unsigned package lifecycle success below is separate; it cannot qualify the
new helper path, signed update, physical PCs or installed default-profile DB.
The actual initial Form component reproduced a test-driver failure reading a
WinForms owner-drawn checkbox through `BM_GETCHECK`. Reading accessibility
`TogglePattern` instead, with the original click and all button interlocks,
passed the real check/uncheck/Cancel workflow. Production cleanup is unchanged.
Local `npm run test:ci` exited0: serial2/2 plus1810total/1807pass/three
unavailable-8.3-alias skips, aggregate1812total/1809pass/three skips and zero
failures. This does not replace a new final-HEAD Windows installer gate. See
[UI-driver scope and failed hosted recovery](LEGACY-RECOVERY-UI-DRIVER-2026-10-31.md).

## Historical Work Log

The table and observations below preserve earlier failures and intermediate
evidence. Their earlier next-step labels are not current completion claims.

| Area | Status | Next Required Evidence |
| --- | --- | --- |
| Normal Main transfer | Local source pass | Actual export, fresh-profile import/promotion/activation, typed project and storage file, graceful restart. See [acceptance record](../reviews/OWNER-VAULT-MAIN-ACCEPTANCE-2026-10-30.md). |
| Interrupted transfer | New intermittent 409 found and corrected locally | `0fe5158` PR run `41046346885` failed a duplicate recovery acceptance despite existing membership. Exact Identity access is now verified before and after scoped recovery; arbitrary 409/403 is not ignored. Actual isolated crash/reopen/project-file/restart acceptance exited 0 after correction. Final-HEAD hosted Job proof is pending. See [idempotency record](../reviews/HOST-MEMBERSHIP-IDEMPOTENCY-2026-10-30.md). |
| Windows integration gate | Native process probe passed hosted CI; fixture correction pending | `2c5ceef` push `41050065257` job `124043625525` passed the native query in the real CI private window station. A separate mocked-helper test then failed its noncanonical temp path; the fixture now uses the canonical parent, without relaxing production checks. Focused 9/9 and full Desktop 1592/1594 passed locally after correction. The complete installer flow still needs final-HEAD CI. See [timeout record](../reviews/INSTALLER-CI-HANG-2026-10-30.md). |
| Workspace and Plugin lifecycle | Actual source signed update/failed-activation rollback/manual rollback/restart passed locally | Real Registry UI, Core DB and public SDK Worker preserved A/B state through v1 to v2, real failing v3 initialization, recovery to v2, reviewed exact-v1 rollback and Host restart. Existing install/disable/remove and journal unit tests are separate; no schema downgrade is claimed. Final-HEAD hosted proof remains pending. See [acceptance](../reviews/PLUGIN-PACKAGE-LIFECYCLE-ACCEPTANCE-2026-10-30.md). |
| Source and Runner control | Existing implementation and parent CI evidence | Keep claim receipt/journal/outbox, grants, stop/lease/revocation and no blind uncertain replay; distinguish fixture results from physical computers. |
| Installer preservation | Fresh install/uninstall passed on earlier candidate; historical replacement timed out | Exact `ed83ab7` run `41051299729` passed fresh install/five artifact hashes/isolated first frame, ordinary uninstall and nine retained records, then pinned 0.4.86 install. Candidate replacement of that historical version did not finish before the unchanged whole-test deadline. Failure is 124 with forced owned-Job cleanup, not an overall pass. Owned-process diagnostics are added before installer timeout to distinguish remaining children. Existing local SPS is never a test target. See [record](../reviews/INSTALLER-CI-HANG-2026-10-30.md). |
| Previous-version update and data migration | Real historical DB scenario passed locally and reached all hosted assertions; hosted gate failed its exit protocol | Run `41054220112` completed pinned 157-to-176 migrations, 12-row preservation, reapply and pre-upgrade backup restoration, and the owner observed natural Job emptiness. The vendor hook changed pending exit 76 to 0, so the step failed. Evidence is now flushed before explicit pending exit after all cleanup; the real-hook regression passes, but corrected final-HEAD hosted proof remains pending. Actual old installed DB/default-profile startup/signed update/automatic app rollback remain distinct. See [schema acceptance](../reviews/HISTORICAL-CORE-SCHEMA-ACCEPTANCE-2026-10-30.md) and [installer scope](../reviews/HISTORICAL-INSTALLER-UPGRADE-2026-10-30.md). |
| Updater handoff and download | Corrected; targeted evidence only | Actual pinned-library error events no longer strand shutdown. Native update quit cancellation and provider/hash/stale-download cases are covered; actual installer execution/rollback remain separate. See [handoff verification](../reviews/DESKTOP-UPDATE-HANDOFF-2026-10-30.md). |
| Runtime replacement failure | Destructive legacy fallback reproduced and corrected; 59 focused checks passed | Failed promotion restores the previous runtime or retains both copies when uncertain. Stable Node no longer deletes the old file/metadata first. Full Desktop rerun: 1607/1609, two skips. A preceding intermittent config-save test failure remains unattributed. These are runtime recovery fixes, not automatic app/schema downgrade. See [verification](../reviews/LEGACY-RUNTIME-ROLLBACK-2026-10-30.md). |
| Concurrent Owner config updates | Lost updates reproduced separately and corrected locally | Before correction, actual filesystem diagnostics lost one of two fields in 100/100 concurrent pairs; after the canonical-Vault queue, both were retained in 100/100. Focused config and queue checks passed 21/21, and actual isolated source Main transfer/restart exited 0. This is process-local serialization, not a cross-process lock. See [verification](../reviews/OWNER-CONFIG-UPDATE-SERIALIZATION-2026-10-30.md). |
| Historical backup through actual Main | New ordinary source acceptance passed locally | A pinned old-schema backup entered actual Main fresh-Host restore, sanitizer and Host startup. Both historical Workspace projects, Unicode description and storage bytes remained; the fixture-bound actual DB had 176 migrations and unchanged history after current-Main restart. Final caller exit 0. This is not installed in-place update provenance. See [acceptance](../reviews/HISTORICAL-CORE-MAIN-RESTORE-2026-10-30.md). |
| Status responsiveness | Optional npm wait reproduced and corrected locally | Status polling no longer starts/awaits npm detection; explicit probes remain awaited and deduplicated. Actual isolated Settings/Quit and source No-AI restart flow passed locally. Historical CDP timeout attribution and final-HEAD CI are separate. See [responsiveness verification](../reviews/DESKTOP-STATUS-RESPONSIVENESS-2026-10-30.md). |
| Transfer sensitivity wording | Corrected; contents retained | The user selected retaining potentially sensitive snapshot contents with accurate warnings. Separate credential/key-directory exclusions and post-restore sanitation remain unchanged; the app states that SPS does not encrypt the transfer. See [sensitivity audit](../reviews/OWNER-VAULT-EXPORT-SENSITIVITY-2026-10-30.md). |
| Installed Registry plugin transfer | User-approved V2 inclusion/new-Host review passed actual local Main acceptance | Core retires prior-Host activation/paths while preserving IDs/data. Managed file inventory and inert-stage rebasing preserve package bytes; v1 stays readable. Actual Main/Registry UI proved no import before review, same plugin ID, two distinct Workspace data canaries and restart. Final-HEAD hosted CI remains required. See [preservation review](../reviews/PLUGIN-TRANSFER-PRESERVATION-GAP-2026-10-30.md). |
| Core full regression and security | All 17 non-Windows jobs passed on `cd4174f`; latest Main-restore integration CI remains required | Run `41059503771` completed every non-Windows job including all nine Linux shards/full Core typecheck/build; Windows remained live in actual source transfer acceptance at the last observation. Updated local Desktop command `node --test test/*.test.mjs`: 1625 total, 1623 pass, two environment skips, zero failures. The new historical-Main restore requires its own final-HEAD CI. Fresh production audit: two Low; full graph: three Low; both zero Critical/High, no exceptions. This is not a full Windows or Stable pass. |
| Production Identity and signed physical release | Separate external gates | Production rollout, trusted code signing, identical-byte installation/update on Host and Member as required for release. Do not manufacture certificates or count source fixture Identity as production. |

## Execution Rules

### Earlier Hosted Observations

- Sourcebe40e0c push124428172046 now confirms first restarted-window retirement
  at the existing `scope-host-instance-changed` fence; a later current opening
  loads/shows. The exact changed Host field is not proved and no fence changes.
  No-AI acceptance now retains its existing Host wait and uses one original45s
  deadline for current document/account/origin readiness, one navigation and
  full reference-state observation. Wrong-account/live errors stay failures;
  only unqualified retired targets may be dropped, never action replay. Tests
  22/22 and actual local source runtime-discovery/restart/recovery caller0/all3
  Main0/6EOF/owned TEMP cleanup passed. Local retired count0 does not reproduce
  hosted retirement. Full local CI aggregate1785total/1782pass/three alias skips/
  zero failures. New-HEAD hosted confirmation remains required; see the
  [updated observation](../reviews/WORKSPACE-RESTART-TARGET-2026-10-31.md).
- Pinned old-package inventory was obtained/reviewed and checked in as bounded
  hash-pinned metadata, not user data/executable bytes. Native handle-bound
  residue verification/removal passed19 actual isolated scenarios (20tests),
  including long paths, decline/throw, links/ADS/writers/root replacement and
  unknown insertion refusal; catalog2/2 passed. Still no production helper UI,
  authorization/integration or complete legacy recovery pass. See the
  [native foundation](../reviews/LEGACY-RESIDUE-NATIVE-2026-10-31.md).
- Sourcec2c71c9 Windows push124423434422 and PR124423446745 passed the complete
  local-contract/native-probe suite after its isolated scheduling, then failed
  the actual No-AI source restart observation. Both saw the reference route
  with an empty body and a CDP socket close within180/230ms. Main reported a
  later Workspace load completion, but the cause of the target retirement is
  not proved. A new actual isolated local source No-AI/runtime-discovery run
  completed all Registry lifecycle/failed activation/manual rollback/A-B state,
  runtime/model/Agent descriptor capability checks, restart and independent
  recovery assertions; all3 Mains exited0,6 output streams ended and owned
  temporary data was removed. That local exit0 is not whole-descendant/physical
  or hosted equivalence. E2E-only fixed readiness/closure/discard/scope-category
  phases now aid diagnosis without altering any fence, wait or target choice.
  Focused24/24 and final local aggregate1741total/1738pass/three alias skips/
  zero failures passed. The CI restart failure remains open, not waived; see
  the [target observation](../reviews/WORKSPACE-RESTART-TARGET-2026-10-31.md).
- User approved explicit backup/target confirmation before cleaning only
  verified old program residue. First implementation is a non-deleting content
  planner and bounded machine-identity-free inventory capture on the clean
  pinned-package hosted fixture. Focused17/17 passed; the private catalog must
  still be obtained/reviewed/pinned, and real confirmation/native handle-bound
  removal/reinstall must be implemented and accepted. No recursive or local
  installed-data cleanup was added. See the [recovery implementation steps](LEGACY-INSTALLER-RECOVERY-POLICY-2026-10-31.md).
- Sourcec3c79c3 Verify41161958027 passed all17 non-Windows jobs, including nine
  Linux shards/full Core build/security policies. Windows job124421238364
  failed literal-LF workflow inspection on CRLF and a real harmless PowerShell
  command still pending at45013ms. The separate legacy job correctly failed
  missing input after Windows never built its artifact. YAML contracts now
  parse structurally and reject equivalent negative cases; the unchanged45s
  observer runs alone before ALL other tests at concurrency4. Partition and
  child-failure tests forbid silent omissions/retries/deadline changes. Final
  local CI stages2/2 plus1730total/1727pass/three unavailable-alias skips gave
  aggregate1732total/1729pass/three skips/zero failures. Actual new-HEAD hosted
  results remain required, not a proven contention fix.
- Sourcec3c79c3 diagnostic41161957975/job124421238310 now proves the ordinary
  uninstall residue category: exit0, all10 records unchanged, zero registration,
  but46files/61dirs remain, maxabsolute282/relative181 with46paths over259.
  Complete-removal assertion FAILED; Job cleanup was natural. This is not a
  successful recovery. User confirmation is requested before any feature that
  removes residual program files; nothing was deleted or relaxed. See the
  [recovery policy](LEGACY-INSTALLER-RECOVERY-POLICY-2026-10-31.md).
- Source9e06fca ordinary-prerequisite job124417311115 failed after old install0
  (232631ms), ordinary uninstall0 (70045ms) and all ten retained hashes matched.
  The post-removal assertion failed; that log cannot distinguish remaining
  registration from remaining files. No complete-removal/reinstall pass is
  claimed. Follow-up adds safe counts/census before unchanged assertions, not
  automatic leftover deletion. Windows job124417311137 also failed before app
  acceptance: harmless observer45s timeout and five snapshot cleanup-hook8.3
  alias mismatches. TEMP canonicalization and actual-alias regression address
  the latter; bounded observer phase/Job output aids diagnosis, not a timeout
  waiver. Normal current-install/replacement/repair/uninstall/reinstall is now
  a mandatory independent gate. A second mandatory clean-VM gate consumes the
  same private run/attempt package and verifies actual legacy failure/preserved
  tree/data, ordinary uninstall and exact candidate reinstall/first frame. Its
  sequential stages keep8/18min native bounds within55min overall; the default
  historical automatic test remains available and fatal. Actual new-HEAD
  results remain required. Final local `npm run test:ci`:1730total/1727pass/three
  unavailable-8.3-alias skips/zero failures; no local installer was executed.
  See the [recovery policy](LEGACY-INSTALLER-RECOVERY-POLICY-2026-10-31.md).
- Source397c014 standard recovery prerequisite41159578592/job124413905847
  failed480s after old installation0 took409347ms; ordinary uninstall had only
  about61s, with a policy child still pending. Forced cleanup124 is rejected,
  not preservation or recovery success. A separate two-step same-VM prerequisite
  now fences prepare/complete via a bounded private canonical checkpoint and
  each step's natural owned-Job closure. Each child remains8min/step10min;
  the new recovery job is explicitly20min, original diagnostic/full installer
  gates remain8/18min. Full local Desktop1724total/1722pass/two environment skips/
  zero failures; focused13/13. Actual new hosted results and complete candidate
  reinstall remain pending; see the [recovery policy](LEGACY-INSTALLER-RECOVERY-POLICY-2026-10-31.md).
- Follow-up adds complete bounded old-program snapshot comparison on failed
  replacement; an unchanged tree/data/registration is required before reporting
  preservation, and the failure is still rethrown. Restored bytes are not inferred
  from counts alone. Host-plugin acceptance now waits for the actual enabled
  sign-in control before one click; source functional lifecycle and local cleanup
  passed, but its standalone pending-Job exit is not an overall E2E pass. Exact
  full local Desktop at concurrency4:1723total/1721pass/two environment skips/
  zero failures; no native deadline changed. See the
  [fixture verification](../reviews/HOST-PLUGIN-SIGN-IN-READINESS-2026-10-31.md).
- User decision2026-10-31 permits explicitly user-guided, data-preserving
  reinstall recovery for withdrawn0.4.86 after automatic replacement failure.
  Failure stays nonzero and no fallback/deletion starts automatically. Supported
  NSIS hooks compile with guidance; normal current-package replacement is now
  measured independently before the old input. A separate guarded hosted
  ordinary-uninstall/data-preservation prerequisite is prepared, not qualified.
  Full local Desktop1713total/1711pass/two environment skips/zero failures.
  See the [recovery policy](LEGACY-INSTALLER-RECOVERY-POLICY-2026-10-31.md).
- Exact Source0c6c68d push41158119102 has passed all17 non-Windows jobs and actual
  normal Main transfer (including the account-lifecycle fence), crash recovery
  and legacy state migration at observation; Windows remains live. PR41158123651
  instead failed the harmless PowerShell observation fixture's45-second bound,
  before app acceptance. No timeout is accepted as a pass. Source766e7ff Windows
  failed a packaged Host plugin fixture's attempt to click the still-disabled
  sign-in control; source tracing alone did not correct that acceptance race.
  These remain distinct from the actual legacy-uninstaller failure.
- A separate reproduced async Workspace-open race is corrected using the
  existing account/session/profile/Host read scope. Six regressions failed
  before correction; focused18/18 and related55/55 now pass. Actual isolated
  Main transfer additionally passed real same-account sign-out/sign-in, renderer
  unload veto, old-completion rejection, destruction of only the stale window,
  and continued authenticated project access in the newer window. Full local
  Desktop1707total/1705pass/two environment skips/zero failures. This does not
  establish the cause of the earlier intermittent fourth-Main timeout or qualify
  the pending final-HEAD hosted/installed tests. See the
  [Workspace observation](../reviews/WORKSPACE-OPEN-OBSERVATION-2026-10-31.md).
- Source766e7ff diagnostic41156378560 is terminal: original job124403974704
  returned uninstall2/unchanged282-character census; compact job124403974605
  returned uninstall0 with max257/zero paths over259. Both captured process
  checks completed and whole Jobs closed naturally. Different runner image
  versions prevent a fully controlled causal claim. Neither diagnostic qualifies
  candidate replacement or long paths; the original full gate is unchanged.
  See the [comparison record](../reviews/INSTALLER-CIM-DIAGNOSTIC-2026-10-31.md).
- Source7e462f2's short diagnostic41153852056 failed after actual captured
  availability0/policy0/process-query1, followed about4.9s later by uninstall2.
  Census stayed unchanged; a stuck captured query is not that attempt's cause,
  but the later file/initialization failure remains unknown. A separate fixed
  compact-path control is prepared without changing the original full gate or
  its path/deadline. Sourcea8529be Windows failed a fourth-Main Workspace reopen;
  7e462f2 later passed normal/crash/historical source restore, but its whole
  Windows job remains live. Fixed E2E-only open phases are now instrumented, not
  claimed as a hang fix. Real local assertion-bearing transfer/reapproval/restart
  passed; full Desktop1696total/1694pass/two environment skips/zero failures.
  See [Workspace observation](../reviews/WORKSPACE-OPEN-OBSERVATION-2026-10-31.md).
- Sourcea8529be push41153008422 has completed all17 non-Windows jobs, including
  all nine Linux shards, full Core typecheck/build and both security policies at
  Coreb17fb83. Its Windows job is still live at this observation; no complete
  Windows pass is claimed. A separate passive owned-command exit observer is
  prepared for the unchanged installer deadlines. Actual harmless Windows exit7
  and natural Job closure passed; full local Desktop1682total/1680pass/two
  environment skips/zero failures. These diagnostics do not qualify replacement.
- Source04f1cda push41151544581 is terminal failure, despite successful nine
  Linux shards/full Core build and1675/1677 Desktop tests (two environment
  skips). Core compatibility rejected a newly visible unreviewed Moderate;
  Windows runtime preparation lacked public-SDK esbuild build tools. The
  current follow-up patches the affected Storybook glob path, records one-week
  remaining matcher-path reviews and installs SDK build tools explicitly in all
  packaging jobs. Local Core all30 typechecks/build and Storybook build passed.
  Production audit now has2Low/1reviewedModerate; full graph3Low/2reviewedModerate,
  zero Critical/High in either, not zero vulnerabilities. See the
  [dependency review](../reviews/MINIMATCH-PATH-REVIEW-2026-10-31.md).
- Standalone diagnostic41151544506 is also terminal failure: historical
  uninstall exit2 after86260ms, with identical complete pre/post file censuses.
  Five of six separate PowerShell probes passed; x86 legacy timed out. No
  successful historical replacement or proof of path-length causality is claimed.
- New-Host approval now also covers the current app's official bundle copies.
  Core `b3da129` preserves inactive lifecycle states before manifest import.
  Actual isolated source Main transfer, declined/accepted Registry approval and
  two target restarts passed, including real relocated Default Memory code and
  unchanged other-Workspace data. Core bootstrap20/20, UI4/4, all30 type checks
  and full build passed. The unrelated global UI token gate remains failing,
  not silently waived. See [approval evidence](../reviews/BUNDLED-RESTORE-APPROVAL-2026-10-31.md).
- Exact Source `d3d0515`, run `41091696495`, is terminal failure in historical
  installer replacement despite all17 non-Windows and earlier source/packaged
  app scenarios passing. At 17:31:21 UTC the unchanged deadline found the old
  uninstaller and an x86 PowerShell command classified as execution-policy
  (without NoProfile/NonInteractive); forced cleanup124 was rejected. This is
  best-effort command metadata, not proof of the instruction blocking. The
  separate exact-source historical diagnostic `41091696529` instead returned
  old-uninstaller exit2 after56074ms and natural Job closure. Neither proves a
  successful upgrade. Bounded file-tree measurement is added for diagnosis.

- Exact Source `1cbc497c94f668b8e7e2825114ebf30971cd4109`, run `41078863800`,
  passed all 17 non-Windows jobs and the actual source/packaged app scenarios,
  but failed historical installer replacement with the old uninstaller and its
  PowerShell child still live at the unchanged deadline. This run had no hidden
  failure dialog. Fresh install/ordinary uninstall preserved all nine records;
  later repair/reinstall phases were not reached. The new narrow read-only
  PowerShell diagnosis does not bypass or qualify this failure. Full local
  Desktop after adding its contracts: 1647/1649, two 8.3-alias skips, zero failures.
  See [diagnostic scope](../reviews/INSTALLER-CIM-DIAGNOSTIC-2026-10-31.md).
- Exact Source `9c38ad9b668ed1a56d051196dcecdd5bb4061421`, push run
  `41060904764`, passed all 17 non-Windows jobs, including all nine Linux shards
  and full Core typecheck/build. Its Windows historical-backup-through-actual-
  Main step passed. Packaged Windows integration was still running at this
  observation; these results do not qualify the entire Windows job.
- Prior Source `cd4174f6a6071c8130cd7d22a3aae06142cbd965`, run
  `41059503771`, is terminal failure in historical installer replacement.
  Its real pre-timeout Job contained the current installer but no old
  uninstaller. A bounded, read-only owned-desktop window diagnostic is added
  for the next run; it is not an installer correction or successful acceptance.
  See the [timeout record](../reviews/INSTALLER-CI-HANG-2026-10-30.md).
- Local full Desktop validation after the owned-window diagnostic: 1627 total,
  1625 passed, two unavailable-8.3-alias skips and zero failures. This exercises
  a real harmless modal but never a local installer or real installed data.
- After the approved managed-plugin transfer change: 1640 total, 1638 passed,
  two unavailable-8.3-alias skips, zero failures. Actual local Main V2 package/
  two-Workspace restore/review/restart and separate pinned historical restore
  both exited 0. Core `ee400bc` full typecheck/build and sanitizer 15/15 passed;
  these do not replace final-HEAD hosted or installed-byte evidence.
- Latest installer diagnostic at Source `a7e5859`, run `41067242330`, failed
  after confirming an actual hidden old-uninstall error dialog in silent NSIS.
  Supported production NSIS hooks now exit nonzero instead of awaiting that
  dialog; the original uninstaller failure is still fatal. Focused 9/9 and full
  Desktop 1639/1641 (two 8.3-alias skips) passed, and real NSIS preprocessing
  passed without executing an installer. Actual new-HEAD assembly/error result
  and successful historical replacement remain required.
- Packaged PR run `41073142664` did not reach Host creation before its Workspace
  wait expired. Shared CDP acceptance now requires settled public sign-in and
  the actual visible idle Host-choice control before one click; no authorization
  or product startup check is bypassed. Actual source execution-control/restart
  acceptance exited 0; full Desktop 1642/1644, two 8.3-alias skips, zero failures.
  See [readiness record](../reviews/DESKTOP-HOST-CHOICE-ACCEPTANCE-2026-10-31.md).

1. Fix reproduced Core defects before adding optional features. Preserve existing
   API, SDK, capability, Source, credential and authentication boundaries.
2. Start with focused tests; use the real isolated Electron app for integrated
   behavior. Do not add production-only test privileges or confirmation bypasses.
3. Deliberate fault injection is allowed only in the launched test process and
   its exact temporary Vault. Expected nonzero exits must be independently
   observed, not treated as normal quits. Unknown or live processes fail cleanup.
4. Do not synchronize or replace checkout dependencies while its app is running.
5. Commit scoped increments and record exact local commands and CI revisions.
   Do not auto-merge or publish a candidate merely because tests were started.
6. Continue work that does not require the user. Ask before changing product
   decisions or touching installed data, production credentials, firewall,
   device approval, signing, or an actual physical-user test environment.

## Completion

Required Core behavior, data preservation, scoped security, and actual process
ownership/recovery must have current evidence. Failed, skipped, unavailable,
and historical evidence stay distinct. External release gates and deferred
features are reported separately, never silently removed. At Core completion,
report the remaining release conditions and stop before new plugin development.

## Current Recovery Follow-Up (2026-10-31)

The prior `be40` branch PR Verify `41164225978`, Windows job `124428183760`,
completed **SUCCESS** for current-package fresh install, replacement, repair,
ordinary uninstall and reinstall, with nine retained records, five installed
artifacts, isolated first frames and natural Job closure. The actual built
Source was merge `e29417790642139b0d9cde31918bce5be8004efe` (parents main
`d3777c155632f23349ac2243f3fc615cb8759643` and branch
`be40e0cf3290c8e5b9462d8b12e43c45f3af3910`), not the branch SHA. Installer
SHA256 was `317c63b9d525751dde2b0e39d5887f9c16d863f66658a47cef7825d935221eb5`.
This successful current-package gate does not establish full legacy recovery.

Native pinned-catalog/session and WinForms GUI code compiles. NSIS/payload
wiring now offers explicit default-No interactive recovery, preserves the
original failed Setup result and never opens recovery in silent mode. Both
production hooks compile against the actual x64 helper. The actual GUI against
an installed historical fixture remains unverified. Latest completed Verify
`41169709122` failed installer assembly before that fixture could run; see the
current summary above. No signed-build, physical-device,
previous-Stable or default-profile migration claim is made. See the
[recovery policy](LEGACY-INSTALLER-RECOVERY-POLICY-2026-10-31.md) for the
acceptance scope and security limits; full product recovery is not claimed.

The stable-tree full local rerun passed: serial2/2 plus1797total/1794pass/three
unavailable-8.3-alias skips/zero failures, aggregate1799total/1796pass/three skips.
Actual form layout, checkbox interlocks and Cancel were checked in a temporary
component fixture without registry/process/cleanup access; its inspected PNG
and sentinel fixture were then safely removed. A preceding in-development
form-fixture layout failure is retained in the recovery policy, not reclassified
as a pass. The same-attempt hosted recovery now requires real GUI Cancel and
default-No/decline preservation, ordinary uninstall0, explicit residue cleanup,
complete program absence and the existing same-candidate reinstall/first-frame
checks, without changing any native observation deadline. No hosted execution
of this new recovery path is claimed before its exact-HEAD result completes.
