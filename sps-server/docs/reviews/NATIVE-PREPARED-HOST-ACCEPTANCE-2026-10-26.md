# Prepared Native Host Source Acceptance

Date: 2026-10-25/26 KST (overnight continuation).
Status: **source-tested real Main/Core local management; Native LAN unsupported**.

Core `7233ff8852d77c1d915f5a1263f09d670738fa8b`; SDK remains
`d4d69208480fc618b2055378b85d183aea422d50`. The containing Source commit records
the source-only follow-up to `d63d8ca4756d309f58b96f015539a4f10716b59a`.
Desktop remains unreleased 0.4.137. No installation/update was performed.

## Actual App Test

The new `test:e2e:native-management` mode reuses the existing isolated Workspace
Electron harness, mock signed Identity issuer and real temporary Core database:

1. Sign into the fixture and create the real Owner Host through the existing
   application flow. Verify zero Agents and the neutral Workspace entry.
2. Gracefully stop Desktop/Core before preparing the fixture. A separate Electron
   script uses actual Windows `safeStorage` and the unchanged create-only Native
   identity store/certificate validator. It writes only inside the already-owned
   temporary profile, with exact canonical temp/prefix/Vault identity guards.
   Root and Vault must already exist; normal protected-store/cache subdirectories
   may be created inside that profile. It creates no arbitrary Vault, listener or
   OS trust entry. Existing credentials are never overwritten. Public output contains only Host ID,
   server pin, LAN OFF and actual Electron/Node versions.
3. Use the existing recovery-store contract to disable plugin code at next
   startup. Start actual Desktop in independent Core Settings. Validate its real
   protected identity status/server pin against the fixture; no Workspace bridge
   is exposed in the Settings window.
4. Use normal **Open workspace**, starting actual Main-owned Core with its Native
   binding and current Owner session. The Workspace remains Agent-free. Plugin
   contributions are rejected with actual HTTP **423/plugin_recovery_active**.
5. An ordinary Workspace renderer with its valid session receives **403** on
   `/api/sps/member-devices/status`: it does not own Main's separate Host proof.
6. Use **Refresh devices** in the actual Settings renderer. Main/Core return
   exactly `{state:"available",lanEnabled:false,devices:[]}`. The displayed Host
   status is running, not the earlier deferred-recovery snapshot.
7. Gracefully stop and repeat in another Desktop process using the same protected
   store and temporary database. All the above binding/authority assertions hold.
   The owned processes and temporary test data are cleaned up afterward.

Both phases passed locally with **Electron 43.7.7 / Node 24.21.0**. Locked CI uses
43.8.3; the local version is recorded, not substituted for that gate. This is a
real Windows DPAPI/Main/Core source integration with mock Identity issuance,
not real Google OAuth or a signed installer. The database may retain installed
plugin records; plugin execution is disabled globally, not a claim of erased
records. There is no physical Member device or Native ingress.

This deliberately does **not** automate a security confirmation or expose a
test-only Main/IPC method. Fixture creation before Main launches is not evidence
that the user-facing Prepare identity confirmation flow passed. There are no
pending devices, so real enrolled-device approve/revoke dialogs are untested.

## Bugs Fixed

- **Stale Host card:** Open workspace previously discarded the current returned
  status. Its narrow Settings handler/preload now return the normal status DTO,
  allowing the existing renderer action flow to update the Host card. Regression
  checks require a running/not-deferred state after the real action.
- **OpenAPI omission:** exact Core `129d20b53` PR run `40203519699` finished
  **13/15**, failing serialized shard 4/4 and its aggregate. The actual failing
  assertion was missing `GET /api/sps/member-devices/status` in OpenAPI. Source
  `d63d8ca` CI also failed that shard. The route is now documented with its exact
  two-field public response, no-store behavior, SPS Identity cookie plus both
  local proofs, no Authorization header and 503 unavailable behavior. The exact
  coverage assertion stays enabled; no route exclusion or gate relaxation.

Source `d63d8ca` push run `40203667695` then finished **15/18**. Windows packaged
Preview passed all functional assertions, including the canonical folder check,
but PostgreSQL process and temporary-data cleanup timed out; its final exit was
failure, and Host lifecycle/Node steps were skipped. The other failing jobs were
OpenAPI shard 4/4 and the held Zod gate. This is not accepted as a packaged pass.
The cleanup follow-up requests normal Desktop shutdown before closing CDP or
forcing the process tree, retaining the strict PostgreSQL/data cleanup gate.
Windows normal stop previously used `child.kill("SIGINT")`, which does not
deliver Core's JavaScript signal handler on Windows. A directly owned Core now
accepts a fixed stop-only inherited pipe command, bounded to 64 bytes and
accepted once at EOF. Its marker and initial direct parent IPC connection are
required before mounting. Native authority is revoked and IPC disconnected
first; the separate pipe survives logout, never reattaches signing and grants
no HTTP/Plugin/Node/Source capability. Concurrent normal stops share the drain;
an explicit force stop can still escalate. Core uses its existing drain and
embedded PostgreSQL shutdown, with the existing bounded force fallback.

Real Node child-process tests cover both the final IPC message ordering and
stop-only pipe use after actual IPC disconnect. Invalid/oversized/errored input,
EOF, disposal and late stream errors are tested separately. Startup interruption
before the pipe attaches is not qualified as graceful shutdown. Main exit alone
is not DB-cleanup proof. The hosted result must be rechecked on this exact
follow-up; local behavior alone does not prove the restricted runner is fixed.

The Windows signal and inherited-pipe behavior is documented by
[Node.js child process](https://nodejs.org/api/child_process.html#subprocesskillsignal)
and [stdio](https://nodejs.org/api/child_process.html#optionsstdio). This does not
turn application-level exit observations into hardware attestation.

## Reproducible Commands

From `external/sps-core`:

```text
npx --offline pnpm@11.9.0 exec vitest run server/src/__tests__/sps-owned-shutdown.test.ts server/src/__tests__/openapi-routes.test.ts server/src/__tests__/sps-native-host-management.test.ts server/src/__tests__/sps-native-host-management-session.test.ts server/src/__tests__/sps-member-device-routes.test.ts server/src/__tests__/sps-member-devices.test.ts server/src/__tests__/sps-identity.test.ts server/src/__tests__/sps-native-parent-signer.test.ts server/src/__tests__/sps-native-parent-enrollment.test.ts
npx --offline pnpm@11.9.0 -r typecheck
npx --offline pnpm@11.9.0 build
```

Before the owned-stop follow-up, **8 files / 65 tests passed**, as did full
workspace typecheck/build. Existing CSS and bundle warnings remain. Exact Core `28757d809` PR workflow
`40207609989` then completed **15/15 jobs successful**, including all general/
serialized test partitions, typecheck/build, canary dry run and browser E2E.
This fixes the earlier OpenAPI-shard failure on that Core revision. The separate
automated review workflow is not an independent approval; Core main inclusion
and current Source/Windows qualification remain distinct gates.

On the final owned-stop Core revision, the command above passes **9 files / 74
tests**, including nine owned-stop tests and two real Node child-process cases.
Full workspace typecheck and build pass. Exact Core PR workflow
`40213936061` completed **15/15 jobs successful** on `7233ff885`, including
all test partitions, typecheck/build, browser E2E and the aggregate. Core main
inclusion and independent review remain unqualified. This does not substitute
for Source's Windows job or a final signed installer.

From `sps-server/desktop`:

```text
node --test test/core-settings-controller.test.mjs test/core-settings-native-devices.test.mjs test/core-settings-native-renderer.test.mjs test/prepare-native-host-e2e-fixture.test.mjs
node --test test/windows-ci-e2e-runner.test.mjs test/workspace-surfaces-desktop-e2e.test.mjs
$env:SPS_DESKTOP_E2E_SOURCE = '1'
npm run test:e2e:native-management
npm run test:e2e:plugin-preview
npm test
npm run test:e2e:core-settings
npm run docs:candidate:check
npm run docs:security:check
```

- Native Settings/helper focused command: **30/30**; helper includes real
  isolated Electron safeStorage creation, not just a mock crypto substitute.
- CI wrapper/harness: **11/11**, retaining the reduced-token/job/window-station,
  no-shell and outside-CI refusal contracts.
- Desktop suite after owned-stop changes: **824 total / 823 pass / 0 fail / 1 existing skip**.
- Prepared Native source E2E: both separate-process phases pass after the Host
  card fix. Candidate/security generated-document checks pass.
- Settings final rerun: all **seven modes pass** after the status-card fix.
- Preview source app acceptance on the owned-stop code passes its actual Agent
  forms, Lead-folder checks, Builder context/feedback, isolated Preview, package
  and renderer-crash assertions. Final cleanup observes Main exit, completion of
  the temporary PostgreSQL cleanup command and temporary data removal. These
  observations are not a separate database termination attestation. The
  earlier hosted packaged failure remains a failure until fresh Windows CI.

Native-mode failures emit only a fixed stage and error-message digest, not raw
page/app logs. A fixed boolean/known-enum diagnostic snapshot now distinguishes
Settings target discovery, identity display and status capture without exposing
paths, account names, pins, device metadata or raw DTOs. Temporary-data cleanup failure fails this mode rather than issuing
a successful acceptance with only a warning. Existing other surface modes retain
their prior diagnostic contract; no original failure or gate is ignored.

The new Windows CI step runs the prepared-Host E2E through the existing restricted
same-user wrapper. It does not add privileges, shell execution, secrets, account
creation or firewall rules. A future exact-head green step is required before
calling this locked-runtime CI-qualified.

On Source `d062d1c`, hosted PR run `40215021041` Windows job `121234177049`
passed the prepared-Host source and packaged Workspace steps. Packaged Preview
then failed its WMI cleanup query despite functional assertions and graceful
Main exit passing. The [owned-Job cleanup follow-up](WINDOWS-PREVIEW-JOB-CLEANUP-2026-10-26.md)
does not turn this partial/failed job into accepted packaged evidence.

One local final-code attempt failed at the earlier broad `settings_launch` stage
with digest `3f5482b908f6615fd28b52af09e7715f0ba566c87cb5077eb9c0e5172fce0ce7`.
The next run, with finer redacted diagnostics and no product change, passed both
phases. Exact digest comparison identifies the failed operation as
`Timed out waiting for prepared Native Host settings. CDP targets: `, not an
identity/Owner assertion. The harness now allocates a different loopback CDP
port after each confirmed Desktop exit, avoiding reuse of the preceding
Chromium process's endpoint. This removes that dependency; an old-listener
collision is a plausible cause, not an observed socket-ownership fact. No
retry-until-green, assertion removal or timeout extension was added to CI.
The port-isolated local acceptance then passes both phases with final process/
data cleanup (same Electron 43.7.7 / Node 24.21.0). Fresh hosted diagnostics and
locked-runtime acceptance remain required; this is not broad flake elimination
or proof that every prior timeout was a port collision.

## Preserved Boundaries and Remaining Work

Keys and customer data, installed app/runtime, Tailscale/SMB support, public SDK,
Plugin lifecycle, workspace data and provider configuration are unchanged. Test
certificates are short-lived and not installed into Windows trust stores.

Initial invitation/session exchange, actual Member enrollment, user-confirmed
device approval/revocation and remote stream termination, complete HTTP/WS
ingress, renewal, restore trust-reset integration, Tailscale-free Source and
separate physical Windows PCs remain unqualified. No local app/UI test is a
substitute for the same final signed installer on two devices.

Held Zod High1243066 (no exception), existing UI token116 findings, exact-head
Linux/Windows CI, Core main/independent review, production Identity and code
signing remain gates. Public marketplace policy is still reviewed only.
