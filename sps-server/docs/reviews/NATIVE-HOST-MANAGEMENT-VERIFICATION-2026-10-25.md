# Native Local Host Device Management Verification

Date: 2026-10-25 KST. Status: **implemented/source-tested; Native LAN unsupported**.

Core: `129d20b53299de0277696f10c966e1cab71aca9d`.
SDK unchanged: `d4d69208480fc618b2055378b85d183aea422d50`.
Desktop remains unreleased 0.4.137. The containing Source commit identifies this
increment; no installer, update asset or installed runtime was replaced.

## Product Wiring

- Desktop opts only its directly owned Core child into local management when the
  current account/Vault has a prepared, valid Native Host identity. Core inspects
  the owned Main IPC channel for public Host/server metadata and binds the exact
  configured Owner user. No HTTP Host selector or supplied certificate enrolls a
  device. Existing certificate-string request routes are omitted in this product
  composition and retained only in explicit legacy test/composition mode.
- The real SPS Identity cookie, actor and startup-bound Owner must agree. Both
  per-launch local Desktop proofs are required. Authorization/Bearer credentials,
  implicit Board, legacy admin roles, remote requests and another matching valid
  user session cannot substitute. Device management needs no Workspace membership.
- Local status/list/events/approve/revoke are mounted; the list/event projection
  is bounded to 200 rows, not a paginated fleet inventory. Read and mutation
  transactions recheck exact session/user/expiry and parent availability around
  their work. Failed final guards roll back state and audit together. Actual
  logout invalidates a previously captured transaction authorizer.
- Preparing keys does not restart Core automatically. An explicit Host restart
  mounts management. Main compares its current protected Host ID and server pin
  with Core before using the route. Account/Vault generation changes and channel
  loss invalidate old operations; no automatic rebind is claimed.
- The independent trusted Core Settings window exposes only public device
  ID/name/status/certificate hash/expiry/revision. Narrow preload actions accept
  one device ID, not URLs, credentials, certificates or grants. User confirmation
  is captured inside the Main-private operation and bound to the same account,
  Host, generation and exact device metadata; it is not merely a boolean passed
  to a later operation. Cancellation never mutates. Stale confirmation or window
  changes fail closed. Prior device data and late results are cleared on Host
  status refresh/failure.
- Native LAN remains OFF. No listener, firewall, OS certificate store, invite,
  Member enrollment caller, certificate renewal or remote stream revocation is
  activated. Device approval does not create Workspace/Plugin/Node/Agent/CLI/Source
  authority. No SDK or database migration is added.

## Defects Found During Integration

The first cross-layer identity test failed: Desktop initially encoded the Owner
subject hash as hex, but the existing Core identity maps it with Base64URL. That
would reject the legitimate Owner. Desktop now uses the unchanged Core mapping,
with both an actual Core login assertion and a Desktop startup-contract test.

Independent review found an unbound confirmation window and stale renderer
device metadata after Host-refresh failure. Both received regression tests. These
are source-level safety fixes, not a claim of hardware/process attestation.

## Verification

From `external/sps-core`:

```text
npx --offline pnpm@11.9.0 exec vitest run server/src/__tests__/sps-native-host-management.test.ts server/src/__tests__/sps-native-host-management-session.test.ts server/src/__tests__/sps-member-device-routes.test.ts server/src/__tests__/sps-member-devices.test.ts server/src/__tests__/sps-identity.test.ts server/src/__tests__/sps-native-parent-signer.test.ts server/src/__tests__/sps-native-parent-enrollment.test.ts
npx --offline pnpm@11.9.0 -r typecheck
npx --offline pnpm@11.9.0 build
npx --offline pnpm@11.9.0 --filter @paperclipai/server typecheck
```

All seven focused files pass: **58/58**. The real temporary PostgreSQL tests use
mock signed RSA/JWKS identity issuance, actual Core login/session/logout and DB
transactions. Parent IPC replies are fixtures. The two real-session management
tests create no Workspace or membership. They are not actual Google OAuth or
an enrollment/mTLS/physical-PC test. Full workspace typecheck/build and the final
server typecheck pass; existing CSS and large-chunk warnings remain.

From `sps-server/desktop`:

```text
node --test test/developer-agent-folder.test.mjs test/plugin-preview-desktop-e2e.test.mjs test/core-settings-native-devices.test.mjs test/native-device-management-controller.test.mjs
npm test
npm run test:e2e:core-settings
$env:SPS_DESKTOP_E2E_SOURCE = '1'
npm run test:e2e:no-ai-checklist
npm run test:e2e:plugin-preview
npm run docs:security:check
npm run audit:release
```

The focused Desktop command passes **53/53**. Settings source Electron E2E passes
all seven existing fresh/corrupt/deferred modes with 620/1000px fit. Source
Preview E2E passes real Agent registration/folder comparison, Builder handoff,
isolated Preview, feedback, package validation, crash diagnostics and owned
process/temp cleanup, without a paid provider call. Final Desktop units pass:
**809 total / 808 pass / 0 fail / 1 existing skip**. The first post-pin run
correctly refused the still-old indexed Core gitlink; after staging the matching
gitlink, the unchanged baseline gate and full suite pass. No assertion was waived.

The final No-AI source Electron run also passes actual UI/state/events/Job,
A/B isolation, capability denial, Host restart and independent Native recovery.
Both restarted reference Workspaces stay Agent-free/backend-unconfigured.

The No-AI recovery assertion checks that the actual trusted Settings/Main route
returns `identity_required`, an empty list and `lanEnabled:false` before key
preparation, and that the actual Refresh devices control completes. This is not
an end-to-end approval of an enrolled device or proof that the entire Host has
zero installed/active plugins. The fixture has a separate No-AI reference plugin;
the independent Settings window does not load its UI.

Local Electron remains **43.7.7 / Node 24.21.0**, not locked CI **43.8.3**. These
source UI runs do not replace current-head locked-runtime/package evidence.

Security document generation/check passes. The fresh production audit is **FAIL**:
Zod High `1243066` remains held with no exception; Low `1119438` and `1241206` are
also reported. Core `check:token-gates` remains **FAIL, 116 findings** (79 color,
36 arbitrary values, 1 font-size); this increment changes no Core UI source.

## Previous CI Is Not This Increment

Source `99c3b77a2813bbcd959152182b56f65deab08e44`, push run `40200786146`, completed
with 16/18 jobs successful, not green. Its nine Linux shards and full Linux
typecheck/build pass. Windows units/bootstrap/actual Native safeStorage/Settings/
runtime preparation/No-AI/packaged Workspace pass. Packaged Preview now passes
real Agent registration, unlike the earlier 500, but fails the later configured
folder equality assertion. Its failure digest
`609c45e14126149ef52bcba1cb4200708efe069f7fdc543fe5c33da40b0e9540` exactly matches
`configured-different` versus expected `configured-match`. PostgreSQL cleanup
also times out; subsequent Host lifecycle/Node checks are skipped.

The Preview test now supplies `realpath(pluginDirectory)` for its positive
lexical comparison, matching the existing project registry's canonical path.
Windows TEMP may contain an 8.3 alias. A regression preserves the product rule
that different path spellings are not silently accepted as lexical equality.
This addresses a supported failure mechanism; the exact hosted path spelling
was not captured, so the next exact-head CI must establish resolution. No
timeout, security assertion or cleanup acceptance was relaxed.

## Remaining Acceptance

Follow-up: [prepared-Host source acceptance](NATIVE-PREPARED-HOST-ACCEPTANCE-2026-10-26.md)
now proves actual Main/Core binding and available empty devices after protected
fixture preparation, with plugin startup globally blocked, zero Agents, ordinary
renderer denial and another process restart. It does not automate the Native
security confirmation or enroll/approve a device. The following original gaps
remain except for that precisely scoped prepared-Host read path.

Prepared-Host actual Main-to-Core management and native confirmation/approval/
revoke UI acceptance, initial invite/session exchange/Member enrollment, complete
HTTP/WS ingress, renewal, Tailscale-free Source, and recovery/restore trust resets
still require integration/qualification. A post-mutation lifecycle invalidation
can report failure after a DB commit; no filesystem/DB rollback across Main is
claimed. Current requests do not attest a local process or TPM.

Exact-head Linux/Windows CI, UI token remediation, held Zod migration approval,
Core main/independent review, production Identity, code signing and the same
final signed installer on two distinct Windows PCs remain separate gates.
Marketplace policy attachment was reviewed only and is not applied here.
