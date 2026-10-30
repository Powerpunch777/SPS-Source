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
| Interrupted transfer | Local source pass; CI pending | Abrupt Main exit after real Vault promotion, retained account receipt/data, exact owned exit/output closure, explicit original-account reopening, restart; not just extracted-function tests. See [acceptance record](../reviews/OWNER-VAULT-MAIN-ACCEPTANCE-2026-10-30.md). |
| Windows integration gate | Implemented; remote evidence pending | Normal and interrupted transfer modes use the existing reduced-token/owned-Job CI wrapper on disposable hosted Windows. Both require natural Job emptiness rather than self-certified descendant cleanup. Wrapper and full Desktop tests pass locally; new remote modes remain unqualified until their exact HEAD runs. |
| Workspace and Plugin lifecycle | Existing implementation and parent CI evidence | Reconfirm exact final HEAD tests for scoped data/config/permissions, disable/remove/rollback/recovery, owned worker termination. New business workflows are not required. |
| Source and Runner control | Existing implementation and parent CI evidence | Keep claim receipt/journal/outbox, grants, stop/lease/revocation and no blind uncertain replay; distinguish fixture results from physical computers. |
| Installer preservation | Earlier candidate CI evidence only | Exact new HEAD fresh install/reinstall/uninstall-preserve/reinstall on isolated hosted Windows runner. Existing local SPS installation is never a test target. |
| Previous-version update and data migration | Not qualified | Approved old/new installer tuple, real data/credential preservation, normal installed launch, update failure and rollback behavior. Same-version inert-sentinel repair is not this evidence. |
| Transfer sensitivity wording | Corrected; contents retained | The user selected retaining potentially sensitive snapshot contents with accurate warnings. Separate credential/key-directory exclusions and post-restore sanitation remain unchanged; the app states that SPS does not encrypt the transfer. See [sensitivity audit](../reviews/OWNER-VAULT-EXPORT-SENSITIVITY-2026-10-30.md). |
| Core full regression and security | Final HEAD pending | Exact revision Linux shards/typecheck/build, Desktop/Node/SDK/Identity checks and dependency policy gate. A passing parent run is not a new HEAD pass. |
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
