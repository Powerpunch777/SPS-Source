# Actual Signed Plugin Update And Rollback Acceptance

Date: 2026-10-30. Development source Electron evidence, not installed release proof.

## Missing Evidence

The existing Host lifecycle Desktop script covers install, enable, disable,
re-enable, uninstall cancellation and uninstall confirmation. Its occasional
capability-review branch is not proof of a package update. Core lifecycle unit
tests exercise the real manager with mocked registry/loader/workers. The real
PostgreSQL operation-journal tests independently prove durable phases and
reconciliation, but do not start the complete lifecycle and real Worker.
Combining those separate green checks does not establish integrated rollback.

## Added Acceptance

The existing isolated No-AI Desktop scenario now creates three disposable
packages with the public SDK. They share a plugin identity and capability set:
healthy versions 0.1.0/0.2.0 and version 0.3.0 whose actual SDK initialize
handler throws a fixed fixture error. The bundled Worker exposes its own loaded
version through a data handler; a database version label alone is insufficient.

The public SDK CLI packs each archive and signs releases plus the private
Registry index with new fixture-only Ed25519 keys. The actual Host Registry
form registers that temporary local source. Static inspection must leave all
Core lifecycle records unchanged. Every stage's archive SHA must match the
generated package, and every application uses the real exact-text confirmation
dialog. Unknown dialogs are rejected; no confirmation or authorization bypass
is added to the app.

The actual Electron UI/Main/Core routes, PostgreSQL and Worker then exercise:

1. Install the reviewed v1 package and explicitly activate it in Workspaces A/B.
2. Save an item in A through the actual Worker action/event APIs; B stays empty.
3. Apply reviewed v2, require a new artifact path and a v2 Worker response, and
   compare complete persisted state in A/B.
4. Apply v3. The real owned Core log must contain the fixed initialization
   failure and plugin ID in newly appended output, not merely a generic UI
   error. Require ready v2 again at its previous artifact path and compare data.
5. Explicitly re-apply the already registered exact v1 stage through Host UI.
   Require v1 Worker behavior and unchanged A/B state. Unrelated packages must
   retain their IDs, versions and statuses.
6. Restart the real Desktop/Host through the existing No-AI harness and require
   the rolled-back version, real Worker behavior and both Workspace states again.

The existing state/events/Jobs, scope/capability denial, UI-less Worker,
Agent-free assertions and independent Settings/recovery flow remain in place.
No real provider, external AI, installed user profile or customer Registry is
used. The owned fixture and its keys are removed by existing identity-checked
cleanup after the real Main processes exit.

## Observed Results

The final ordinary command was run without dependency synchronization:

```powershell
$env:SPS_DESKTOP_E2E_SOURCE = '1'
node scripts/smoke-workspace-surfaces-desktop.mjs --no-ai-checklist
```

The parent independently observed caller exit 0, all update/failure/rollback
and restart messages, three natural Main exits, six natural output EOFs,
zero failed streams, no forced stop, successful fixture process scan and
identity-checked data removal. This is local source acceptance, not externally
owned whole-Job qualification or two physical computers. The same No-AI mode is
already required by the hosted Windows workflow; corrected final-HEAD CI is
separate and still required.

The first attempt stopped before updates because the copied checklist's event
subscription used its original plugin ID while the lifecycle fixture used a new
ID. The fixture now binds its declared event to that same manifest ID. This was
not a Core event-delivery defect or passing evidence. A later preliminary full
test run found an exact-source helper boundary assertion stale after adding
optional CDP dialog handling; it was updated, with an actual mock-socket test
that accepts the expected dialog and rejects an unrelated one.

Focused package/signature checks passed 19/19, including actual generated Worker
initialization/version responses and archive tampering rejection. CDP checks
passed 8/8. Final full Desktop: 1,621 total, 1,619 passed, two environment
skips, zero failures, caller exit 0. The native launcher timeout/ownership suite
also passed 19/19 after adding the pre-termination owned-process diagnostic.

## Limits

These fixtures declare no plugin SQL migrations. Automatic rollback is proved
only for an activation failure without possible schema changes, and explicit
Host rollback only for those compatible fixture packages. Migrating candidates
remain subject to the existing backup/review/quarantine policy; no old-code
activation against potentially changed schema or in-place SQL downgrade is
claimed. This is not crash/power-loss coverage, installed-byte proof, signing
qualification, a malicious-code sandbox or a two-PC release test.
