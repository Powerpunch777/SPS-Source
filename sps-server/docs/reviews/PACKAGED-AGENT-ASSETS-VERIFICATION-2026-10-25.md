# Packaged Agent Assets Verification

Date: 2026-10-25 KST. Status: **asset fix passes hosted Agent registration; full packaged Preview still fails later**.

Parent Source checkpoint: `48a35262cba726c46bb630b6eff4b52528c5da57`.
Core remains `ed45c51c3070fa9688a5cdbbe45a78b74dc48dbc`, SDK remains
`d4d69208480fc618b2055378b85d183aea422d50`. The containing Source commit
identifies this follow-up. Desktop remains unreleased 0.4.137.

## Observed CI

Source `48a35262` push run `40197294957`, Windows job `121180789920`, completed
with 16/18 overall jobs successful. All nine Linux Core shards/full Linux
typecheck/build succeeded. Windows Desktop units, bootstrap, actual safeStorage
reload, seven Settings scenarios, runtime preparation, No-AI source and packaged
Workspace surfaces succeeded. Packaged Preview still failed at real Assistant
registration; the subsequent Host plugin lifecycle/Node steps did not execute.
The other failing job is the held Zod High gate, not a waived audit result.

The real Native storage output records Electron **43.8.3**, Node **24.22.0**,
`realWindowsSafeStorage=true`, `memberIssuedCredentialProtected=true` and
`sameMemberCertificateAfterRestart=true`. This qualifies the issued companion's
create/separate-process reload on that Windows runner, not two actual PCs or
Native enrollment/approval/LAN. It supersedes the earlier local runtime mismatch
only for those exact CI bytes.

The new failure summary reported `unavailable` and the Workspace reported
`serverErrorVisible=true`; the exact server exception is still unavailable.
Consequently the packaging defect below is confirmed independently, but is not
yet proven to be the sole cause of that CI 500. No updater-404 or PostgreSQL
cleanup symptom is substituted for a demonstrated primary cause.

## Confirmed Packaging Gap

Desktop preparation previously called the server TypeScript compiler directly.
The server's official build is `tsc && node scripts/copy-build-assets.mjs`.
That second step copies `onboarding-assets` and `built-ins` into `dist`.
The real `loadDefaultAgentInstructionsBundle` reads files relative to its built
module; a clean TypeScript-only output can therefore load the module but fail
Agent registration with `ENOENT`. An already-populated local `dist` masks it.

The follow-up invokes the existing server package build in dependency order,
checks all five default/CEO instruction assets, then compares deployed bytes
with the corresponding Core source assets. No workflow rule, default prompt,
Agent permission, schema, Core revision or SDK contract changes.

The final runtime verifier requires the built loader and five files and executes
that actual loader for both roles using the bundled Node. It retains the existing
ACPX import test. A stale/missing instruction package cannot silently pass this
runtime gate. This does not prove every other asset-consuming route is complete.

## Verification

From `sps-server/desktop`:

```text
node --test test/owner-host-agent-assets.test.mjs test/owner-host-runtime-build.test.mjs
npm test
npm run prepare:owner-host-runtime
$env:SPS_PACKAGED_OWNER_HOST_RUNTIME_ROOT = (Resolve-Path -LiteralPath '.owner-host-runtime').Path
node scripts/verify-packaged-owner-host-runtime.mjs
```

- Focused **11/11**: a real temporary transpiled Core consumer first fails
  `ENOENT`, then the unmodified Core asset-copy script makes exact default/CEO
  contents loadable. Its owned temporary-tree cleanup validates canonical path,
  directory identity and absence of links before removal.
- Desktop **768 total / 767 pass / 0 fail / 1 pre-existing skip**.
- Runtime preparation and actual deployed-loader verification pass locally.
  Preparation reports an optional `cpu-features` compiler detection failure but
  exits successfully; no compiler, runtime dependency or OS ACL is installed or
  changed to hide that warning. Existing CSS/large-chunk warnings remain.
- Generated plugin `dist` changes from rebuilding current pinned dependencies
  are excluded from the source patch; the prepared runtime still contains the
  just-rebuilt artifacts. This is a development diagnostic build with dirty
  Source provenance, not a release-qualified tuple.

The standalone development unpacked build explicitly uses existing Electron
**43.7.7**, output `dist/local-agent-assets-check`, without replacing the
installed application or locked 43.8.3 runtime. It is unsigned. It must not be
published, used as an updater asset or described as final-candidate acceptance.
Its actual Preview test result is recorded separately after process completion.

The parent then ran:

```text
npx --offline electron-builder --win dir --publish never --config.electronDist=node_modules/electron/dist --config.electronVersion=43.7.7 --config.directories.output=dist/local-agent-assets-check
$env:SPS_DESKTOP_E2E_BINARY = (Resolve-Path -LiteralPath 'dist/local-agent-assets-check/win-unpacked/SPS Desktop.exe').Path
npm run test:e2e:plugin-preview
```

The development unpacked Preview E2E **passed**, including real separate Agent
registration/folders, Builder handoff, context isolation, failed-preview feedback,
coexisting production/Preview windows, package verification, Preview-only crash
and diagnostics, and successful process/PostgreSQL/temp cleanup. The app.asar SHA-256
is `9ac42aed7c23d92c044611cab8dcccec6e7f077588acbd634d48091bb0f2ede5`.
The embedded runtime manifest records parent Source `48a35262` with
`sourceDirty:true`, Core `ed45c51c`, SDK `d4d69208`. It is a useful local packaged
behavior result, **not** an immutable candidate, signed installer, locked 43.8.3
test or reduced-token hosted runner acceptance. No update asset was published.

## Unchanged Gates

Follow-up Source `99c3b77a2813bbcd959152182b56f65deab08e44`, push run
`40200786146`, completed with 16/18 jobs successful. Windows packaged Preview
now successfully registers both independent Agents and opens Registry/Builder.
It fails later on `configured-different` versus `configured-match` and also
fails PostgreSQL cleanup; Host lifecycle/Node steps are skipped. The confirmed
asset omission is fixed, but this is not a full packaged acceptance pass.
The [local management increment](NATIVE-HOST-MANAGEMENT-VERIFICATION-2026-10-25.md)
records the exact failure digest and canonical fixture-path follow-up. Its new
Source/Core revision needs fresh CI; this previous result cannot qualify it.

Current-head Windows packaged CI, held Zod High `1243066` (no exception), main and
independent review, production Identity rollout, code signing and identical final
signed bytes on two Windows PCs remain required. Native LAN stays OFF; no
customer keys/data, external listener, firewall or OS trust changes were made.
