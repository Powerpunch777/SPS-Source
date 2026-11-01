# Desktop Artifact Admission And Owned Port

This is an incremental Core-goal development check, not complete artifact
cleanup, physical two-device acceptance, a signed installation or Stable.
Core is `6187255e7635a386759eebc6cfa6bdb42254930e`; public SDK remains
`61a929f6c783f78e5af603682de1543c7e24abc0`. Installed apps/profiles, original
dirty checkout, external projects and Production are unchanged.

## Desktop Admission

One private process-local coordinator now covers runtime materialization,
Registry package/source mutation, current-app bundle review/staging, developer
project connection/removal and whole gated build/apply/rollback/package work,
Preview fixture/reload/restart lifecycle, and transfer export. The existing
Owner Vault gate uses this same instance for starts, account/Host changes and
restore, including its private permitted activation. Preview also uses it.

Activity is registered before delegated work begins and is retained until the
actual promise settles. Nested ordinary activity remains allowed; this does not
serialize independent writers. Maintenance rejects current activity immediately
without waiting, draining Workers or stopping other Plugins. During its callback
new activity rejects before touching files, invalidating account state or
advancing a connection generation. Errors/results propagate unchanged.

`waitForIdle` joins only the scopes present when called. It is not a closed
admission boundary, process termination, filesystem ownership or authorization.
Existing per-project, Preview, restore and package lifetime controls remain.
No renderer/SDK capability, deletion endpoint, maintenance button, background
collector, Source grant or OS containment was introduced.

Core's separate maintenance coordinator/reference reader is not yet joined to
this Desktop coordinator. Do not describe this increment as an implemented
cross-process fence or complete reference composition. Current ownership/file
inventories, account/Host-bound review, removal and Settings UI remain required.

## Reproduced Startup Defect

Running two isolated source app harnesses concurrently exposed a real endpoint
race: configured HTTP31311, but the admitted Core silently selected31312 while
Desktop continued using31311. The other listener rejected the wrong Desktop
proof; it did not grant cross-profile access. This transfer attempt failed and
was not accepted. Its exact fixture was observed read-only; a normal debugger
close was attempted, whose client reported failure. The owning harness then
confirmed its Main/Job cleanup and removed only its fixture. No PID-wide user
process cleanup was performed. Subsequent app acceptance runs are sequential.

Owned Desktop Core now probes its configured port before opening/initializing
the database, and rejects `SPS_DESKTOP_PORT_UNAVAILABLE` instead of moving its
endpoint. A later bind race still rejects at the actual listen; probing does not
reserve a port. Ordinary standalone Core keeps its existing fallback. The CLI
doctor may create ordinary configured directories before server entry; this is
not a claim of zero whole-launcher filesystem effects.

The Owner manager also returns promptly if its admitted child fails/exits and
an unrelated listener answers. It keeps that service unowned, does not kill it,
and reports an endpoint conflict. Main refuses activation/company/team effects
on that marked conflict. Preexisting-listener behavior without this new failed-
startup diagnostic remains unchanged.

## Verification

- Actual Main wrapper execution under VM-controlled admission, Owner Vault and
  Preview composition and original lifecycle selection:45/45. Existing export
  tests now use the real coordinator instead of an absent fixture dependency.
  A first full run failed those missing test bindings; it was not a product pass.
- Final `node scripts/run-desktop-ci-tests.mjs`: serial2/2 plus1974total/1971pass,
  three actually unavailable8.3 alias skips; aggregate1976total/1973pass, zero
  failures. Includes actual Windows owned Core startup refusal below.
- Core `pnpm exec vitest run server/src/__tests__/server-startup-feedback-export.test.ts server/src/__tests__/sps-owned-listen-port.test.ts server/src/__tests__/sps-workspace-plugin-host.test.ts`:
  31/31 across3files; all30 workspace typechecks and full build passed.
  The startup regression failed before correction, resolving on the wrong port.
- `node --test test/owner-host-start-binding.test.mjs test/owner-host-port-conflict.windows.test.mjs test/plugin-artifact-main-admission.test.mjs`:
  21/21. The actual configured Core CLI runs in the existing Windows owned Job,
  refuses a real occupied loopback listener, leaves that listener running and
  preserves exact existing database sentinel bytes/membership, with no PG_VERSION
  initialization. The manager and Job close before exact temporary cleanup.
  An initial stronger no-directory assertion failed because the CLI doctor
  creates the directory; the final test verifies data preservation/absence of
  initialization instead of claiming no directory access.
- Owner manager/restore/activation/export/Main admission selection83/83; the
  new failed-child/foreign-listener regression also failed before correction.
- Main syntax and `git diff --check` passed.

Final sequential `node scripts/smoke-plugin-preview-desktop.mjs` passed actual
gates/staging/activation, Preview/production coexistence, Member/mobile/error
fixture, renderer-only crash, account sign-out with refused Preview port and
retained data. Main exited0 gracefully; CDP/temp Postgres/mock Identity/exact
temporary data cleanup completed. Final
`node scripts/smoke-owner-vault-transfer-desktop.mjs` also passed actual Main
export/empty-Host restore, package and current-bundle reapproval, A/B data,
typed row/attachment, restarts, real account ABA and explicit navigation retry;
tracked Main/output/temp cleanup passed. Whole-descendant qualification remains
false in that harness. Mock Identity/source checks cannot qualify signed
installers, physical devices, abnormal Main-loss or live SQL-crash windows.

Prior Source609d453/Core21f2feb Verify41295817469 completed its Windows
Desktop/Node job124816334023 and all17 non-Windows jobs successfully. Mandatory
legacy recovery124822741864 was still in progress at this observation. These
prior tuple results do not qualify this newer Core/Source increment.

## Next Cross-Process Step

Acquire Desktop admission before the current Core reference/maintenance scope,
using only the exact owned Core generation and private parent channel. Join all
Desktop Preview/restore/staging references with the existing Core sources;
unknown or stale participants must deny the entire operation. No paths reach
ordinary HTTP diagnostics, renderer views or SDK permissions.

Do not release either side merely because observation timed out or an RPC reply
was lost while a mutation could remain live. Shutdown/recovery must join or
confirm the exact owned Core Job before clearing uncertain authority. Existing
running Workers stay alive; list/review must not drain them. Only after this
composition is proven may Host review/selection/removal be wired into Settings.

The read-only notebook SSH retry timed out. It made no remote installation,
process, file, account or Serve changes. A prior inert controller's cleanup is
still unconfirmed; no new remote trial may assume absence.
