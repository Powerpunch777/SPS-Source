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

## Ordered Work

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

### Latest Hosted Observations

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
