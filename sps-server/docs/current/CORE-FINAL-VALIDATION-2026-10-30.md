# SPS Core final validation checklist

Updated: 2026-10-30. This is a working checklist, not a Core completion or Stable
release declaration. The scope is set by
[Core completion policy](CORE-COMPLETION-POLICY-ko.md). Core remains private,
SDK public; AI is optional. New Builder features, public Marketplace, and
deferred Native development are excluded.

## Revision And Preservation

- Starting Source: `a7246667584615edcb8ed71dfc16a983bac455a6`.
- Core: `01fe9b16162fb8f6c0023e5efda30c1189094f10`.
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
| Workspace and Plugin lifecycle | Existing implementation and parent CI evidence | Reconfirm exact final HEAD tests for scoped data/config/permissions, disable/remove/rollback/recovery, owned worker termination. New business workflows are not required. |
| Source and Runner control | Existing implementation and parent CI evidence | Keep claim receipt/journal/outbox, grants, stop/lease/revocation and no blind uncertain replay; distinguish fixture results from physical computers. |
| Installer preservation | Historical upgrade added; acceptance failed, cause unqualified | The `377b4f0` installer step timed out twice without phase output, so not even the reached NSIS phase is established. New phase traces keep all guards and deadlines. The withdrawn `0.4.86` fixture is not a trusted Stable predecessor. Existing local SPS is never a test target. |
| Previous-version update and data migration | Pinned historical schema upgrade and pre-upgrade backup recovery passed locally | Real empty DB received 157 pinned old migrations and 12 representative rows, then all 19 new migrations; old-column values and repeat-apply history matched. Actual pre-upgrade backup restored into another empty DB and upgraded with matching data/history. Final caller exit 0; new hosted Job step pending. Actual old installed DB/default-profile startup/signed update/automatic app rollback remain distinct. See [schema acceptance](../reviews/HISTORICAL-CORE-SCHEMA-ACCEPTANCE-2026-10-30.md) and [installer scope](../reviews/HISTORICAL-INSTALLER-UPGRADE-2026-10-30.md). |
| Updater handoff and download | Corrected; targeted evidence only | Actual pinned-library error events no longer strand shutdown. Native update quit cancellation and provider/hash/stale-download cases are covered; actual installer execution/rollback remain separate. See [handoff verification](../reviews/DESKTOP-UPDATE-HANDOFF-2026-10-30.md). |
| Runtime replacement failure | Destructive legacy fallback reproduced and corrected; 59 focused checks passed | Failed promotion restores the previous runtime or retains both copies when uncertain. Stable Node no longer deletes the old file/metadata first. Full Desktop rerun: 1607/1609, two skips. A preceding intermittent config-save test failure remains unattributed. These are runtime recovery fixes, not automatic app/schema downgrade. See [verification](../reviews/LEGACY-RUNTIME-ROLLBACK-2026-10-30.md). |
| Status responsiveness | Optional npm wait reproduced and corrected locally | Status polling no longer starts/awaits npm detection; explicit probes remain awaited and deduplicated. Actual isolated Settings/Quit and source No-AI restart flow passed locally. Historical CDP timeout attribution and final-HEAD CI are separate. See [responsiveness verification](../reviews/DESKTOP-STATUS-RESPONSIVENESS-2026-10-30.md). |
| Transfer sensitivity wording | Corrected; contents retained | The user selected retaining potentially sensitive snapshot contents with accurate warnings. Separate credential/key-directory exclusions and post-restore sanitation remain unchanged; the app states that SPS does not encrypt the transfer. See [sensitivity audit](../reviews/OWNER-VAULT-EXPORT-SENSITIVITY-2026-10-30.md). |
| Core full regression and security | All 17 non-Windows jobs passed on `ed83ab7`; new historical-acceptance CI pending | Run `41051299729` completed every non-Windows job including all nine Linux shards/full Core typecheck/build; Windows was live in packaged Workspace acceptance. Updated local Desktop: 1602 total, 1600 pass, two environment skips, zero failures. Fresh production audit: two Low; full graph: three Low; both zero Critical/High, no exceptions. This is not a full Windows or Stable pass. |
| Production Identity and signed physical release | Separate external gates | Production rollout, trusted code signing, identical-byte installation/update on Host and Member as required for release. Do not manufacture certificates or count source fixture Identity as production. |

## Execution Rules

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
