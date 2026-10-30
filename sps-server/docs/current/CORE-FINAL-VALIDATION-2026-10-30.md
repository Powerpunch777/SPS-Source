# SPS Core final validation checklist

Updated: 2026-10-30. This is a working checklist, not a Core completion or Stable
release declaration. The scope is set by
[Core completion policy](CORE-COMPLETION-POLICY-ko.md). Core remains private,
SDK public; AI is optional. New Builder features, public Marketplace, and
deferred Native development are excluded.

## Revision And Preservation

- Starting Source: `a7246667584615edcb8ed71dfc16a983bac455a6`.
- Core: `258800f0d931932d855e275ed7cfab2c1bf0a080` (earlier evidence names its prior revision explicitly).
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
