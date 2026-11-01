# Preview Account And Restore Ownership

This is a source-only development acceptance, not a signed installation,
physical two-device test, SQL-crash qualification or complete artifact cleanup.
Core remains `ffc9bc8a4bff84d2c8a13858e726693a714d0d7f`; public SDK remains
`61a929f6c783f78e5af603682de1543c7e24abc0`. Production, installed user profiles,
original checkouts and external projects were not changed.

## Corrected Preview Lifecycle

Actual Main function regressions reproduced four defects before correction:
retained-data stops swallowed uncertain closure; a non-stopped manager could
lose ownership; removal used the current Vault rather than the captured one;
and failed removal discarded the stopped owner. Startup is now registered
before manager.start can spawn/await. Simultaneous project starts reject rather
than overwrite the only owner. Errors and uncertain owners remain observable.
Foreign-port diagnostics are recorded even when closure cannot be confirmed.

Quit joins admitted preparation and prevents a later spawn. Account/Host and
restore invalidation await Preview closure before changing context; captured
account, Vault and monotonic connection generation reject stale/ABA preparation.
Confirmed removal uses the original Vault and releases only after cleanup.
This process-local gate is not a cross-process maintenance fence or deletion
permission. It does not implement the unfinished Settings cleanup screen.

The restore runner exposes private immutable references captured before spawn.
Missing, relative, noncanonical, control-bearing or unsupported UNC/device paths
make the entire read unavailable, never an available partial list. References
remain until authenticated owned-Job/helper closure. Even synchronous spawn
failure remains conservatively uncertain and blocks replacement; restart or
confirmed cleanup is required, not an invented absence proof. Path strings are
not filesystem identity/inventory or ownership authorization.

## Local Verification

- `node scripts/run-desktop-ci-tests.mjs`: serial2/2 plus1945total/1942pass,
  three actually unavailable8.3 skips; aggregate1947total/1944pass, zero failures.
- `node --test test/preview-e2e-failure-diagnostics.test.mjs test/plugin-preview-main-lifecycle.test.mjs test/plugin-preview-operation-gate.test.mjs test/owner-host-restore-runner.test.mjs test/owner-host-restore-runner.windows.test.mjs`:
  32/32, no skips, including three actual native Windows owned-Job restore tests.
- `node scripts/smoke-plugin-preview-desktop.mjs`: actual Core form, isolated
  developer gates, Preview/production coexistence, mobile/Member/error fixture,
  archive, renderer-only crash, diagnostics and actual sign-out passed. The
  exact Preview target disappeared, its captured loopback health port refused
  connections and its config/data remained. Desktop exited0 gracefully; CDP,
  temporary Postgres, mock Identity and exact temporary data cleanup completed.
- `node scripts/smoke-owner-vault-transfer-desktop.mjs`: actual Main export,
  empty-Host package restore, separate Workspace records, explicit Registry and
  current official-bundle reapproval, restart, typed row/attachment, real account
  ABA and explicit native navigation retry passed. All tracked Main/output/temp
  cleanup passed. Whole-descendant qualification remains false in this harness.
- Main syntax and `git diff --check` passed. Production/full-graph audit policies
  passed with0Critical/High; respectively3/5 advisories remain, including1/2
  reviewed Moderate entries expiring2026-11-07. This is not zero vulnerabilities.

Two initial added sign-out smoke attempts failed when the CDP evaluation was
invalidated by the real setup-document reload. They are failures, not accepted
runs. The final test tolerates only known document/context-transition errors,
still requires signed-out state plus actual server/target closure, and sends
Browser.close through the retained setup target instead of a destroyed Workspace.
The new finite failure phase is retained without exposing arbitrary exception
text. The final source E2E above passed after these corrections.

## Remaining Work

Desktop/Core combined reference fencing, original/current inventory comparison,
Host-bound review/confirmation, removal and Settings UI remain incomplete.
Packaged abnormal Main loss, actual Plugin SQL/activation crash windows and the
current two-PC Runner sequence remain required. Older hosted tuple passes do not
qualify this Source increment. A possibly idle notebook trial controller remains
unconfirmed after SSH connectivity was lost; no remote app/Serve was started in
that retry and no further trial should assume it has been cleaned up.
