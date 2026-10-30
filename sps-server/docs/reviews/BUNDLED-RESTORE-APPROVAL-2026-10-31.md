# Restored Bundled Plugin Approval

Date: 2026-10-31. Desktop 0.4.137 remains a development candidate. Core
`b3da12970d41419d2d3536fe86ea7a3d33c8699d`, public SDK
`61a929f6c783f78e5af603682de1543c7e24abc0`. This is source-app evidence, not
installed-byte, production Identity or physical two-PC qualification.

## Confirmed Policy And Correction

Every restored plugin requires explicit new-Host approval, including an official
copy supplied by the current app. Restoring package bytes/data does not restore
execution approval. External local-folder code is not copied and must be
reselected. Review means metadata, capabilities and compatibility plus Host
consent, not an external security audit.

Three regressions were first reproduced: bundled startup imported/reactivated
disabled, uninstalled-with-retained-path and pending-upgrade records. Core now
checks declarative identity before executable manifest import and leaves all
three states inactive. Active approved bundle refresh and initial activation
remain supported. Unidentified legacy bundles wait if inactive records might
refer to them. No Core API, SDK, database status or migration was added.

The existing Settings > Plugins > Open signed Registry review screen now lists
restored current-app copies separately. Only Main's fixed bundle paths and
pathless uninstalled records can enter this flow; the renderer cannot provide
a directory. Main rechecks the current account/Host scope. Static SDK inspection,
packing and staging do not import code or approve anything. The normal exact-
version Registry confirmation remains required to start it. These copies are
labelled local current-app provenance, not falsely publisher-signed releases.

Build-time sidecars bind current metadata to manifest bytes. Main never invokes
their generator or imports executable manifests to populate the review list.
Packaging regenerates sidecars after trusted builds. The Room digest was also
corrected to the public SDK's sorted-capabilities digest. A real reapproval
attempt exposed Default Memory's external SDK import after relocation; its
existing Worker protocol is now bundled from the pinned Core SDK at build time.
The production runtime no longer depends on a former source-tree SDK link.

## Local Evidence

- Core bootstrap: `pnpm --filter @paperclipai/server exec vitest run
  src/services/bundled-plugin-bootstrap.test.ts
  src/__tests__/bundled-plugin-bootstrap.test.ts --pool=forks --isolate`, 20/20.
  Includes a real manifest import marker and preservation of ordinary refresh.
- Core UI: `pnpm --filter @paperclipai/ui exec vitest run
  src/pages/SpsExtensionsManager.test.tsx --pool=forks --isolate`, 4/4. Empty
  settings no longer claim absent/restored plugins are still starting.
- All 30 workspace type checks and full Core build passed. Existing generated
  CSS, third-party annotation and chunk-size warnings remain.
- `pnpm check:token-gates` failed with 116 existing findings in other files
  (79 color, 36 arbitrary-value, 1 font-size). Neither edited UI file appears
  in that output. This global check is not reported as passing.
- `npm run check` in Default Memory and static sidecar validation passed.
- Production dependency policy: two Low findings, zero Critical/High, no
  exceptions. This is not a claim of zero vulnerabilities.

`SPS_DESKTOP_E2E_SOURCE=1 node scripts/smoke-owner-vault-transfer-desktop.mjs`
exited 0 after four real isolated Main processes. It exported and restored a
reviewed Registry package, two distinct Workspace data states, a typed project
and attachment. A former-Host local canary with the Memory bundle ID remained
uninstalled/pathless before review, after unrelated approval and after restart.
The real current-app Memory package was then statically staged; declining the
normal confirmation kept it uninstalled. Explicit approval recovered the same
plugin ID and real provider manifest, and another Main restart kept it ready
without importing the former local canary. Other Workspace plugin data remained
unchanged. All Main exits/output EOFs, fixture process scan and temporary cleanup
qualified. Identity is a loopback fixture; whole-descendant OS Job qualification
is separately owned by hosted CI.

Earlier attempts are not passes: the observer initially assumed JSONL instead
of Core's pretty-log metadata; the first positive attempt found the actual
external-SDK dependency; a later final assertion lacked its `lstat` import.
All were corrected before the successful run. Native picker fixtures are now
restored after export/restore so later approvals use their real dialog path.

Exact final-HEAD Linux/Windows/packaged CI remains required. No installed app,
real user Vault, Production Identity, signing key or physical PC was changed.
