# Native Member certificate renewal — 2026-10-27

Approved Members can explicitly renew a currently valid certificate with their
existing protected key and current SPS session. Core Settings exposes certificate
dates and a renewal action; no credential, CSR, certificate, pin or path reaches
the renderer. Native remains optional and initially disabled.
Core implementation: `aac0286597798fe85446a664a4a772ca8025aa4d`.

## Contract

- The default 90-day Member leaf is eligible during its final 30 days, bounded
  by one third of its actual/configured lifetime. Renewal must extend expiry and
  fit the current issuer. Expired, revoked and early requests preserve credentials
  and fail. No expired-trust grace period or automatic enrollment is introduced.
- Main accepts one fixed authenticated JSON POST and forwards the actual fresh
  TLS peer through the owned child channel. Core binds the current session to
  the same Host/user/approved device and registered certificate. Main verifies
  the original CSR's SPKI before invoking its protected issuer.
- Migration 0168 adds certificate lineage under the immutable device. A locked
  transaction returns one stored result per predecessor and CSR, checks session
  and lifecycle around signing/publication, and bounds signing time/capacity.
  Both registered leaves remain usable while valid; parent revocation denies
  every leaf. Renewal grants no Workspace membership or Plugin permission.
- Windows protection stores each renewal in a create-only encrypted companion.
  The original pending key, issued file and saved Host target stay intact. Reads
  reconstruct at most 256 verified generations; only the final current credential
  is returned for transport. Historical validation is confined to reconstruction.
- Original enrollment ID and invitation expiry remain unchanged. Reconciliation
  accepts an exact registered current renewal of that device, even after the
  invitation TTL and original leaf expire. A matching public key alone is never
  sufficient. Account/frame/process changes reject late operations.

## Focused evidence

No full local Core/Desktop suite or workspace build was run for this increment.
Logs and temporary typecheck configuration are outside the repository in `g/work`.

- Source transport/controller: five affected files, 112/112 passed, exit 0.
- Source protected storage/signer/Settings: initial affected-file run had 79 passes
  and one failed new assertion (`assert.rejects` used for a synchronous input
  rejection). The corrected named renewal test passed separately, 1/1. The
  initial run remains a failed run; it is not relabeled as 80/80.
- Settings renderer/Main contract: two affected files, 31/31 passed, exit 0.
- Scoped renewal server modules and their imports: TypeScript exit 0. A second
  scoped check including the five affected Core test files also exited 0.
- Migration numbering/safety: exit 0; historical baseline findings remain.
- Core private boundaries: the first four-file run passed 38/39; the new session
  test incorrectly expected HTTP 403 for the existing enrollment error's 409
  when its mock rejected a missing TLS certificate. The corrected named case
  passed, but that retry failed overall on the default 10-second DB cleanup hook.
  The Windows DB hook now explicitly allows 30 seconds. The final named retry
  with CLI `--hookTimeout 180000` passed, 1/1 with eight unselected cases skipped,
  exit 0. That retry does not qualify the ordinary 30-second hook budget. No
  other files were rerun for that fixture correction.
- First joined run: Electron renewal, replay, protected publication, original
  invitation reconciliation and UI operations completed, but the run exited 1.
  The fixture revoked the device before expecting the membership-only empty
  discovery result. It also disposed signer IPC before requesting child shutdown,
  causing the natural-exit timeout. The fixture now checks membership first,
  restores membership before independently testing parent revocation, and keeps
  signer IPC available until the child finishes its explicit cleanup. This run
  remains a failure; final joined result is recorded below.

Final joined run (owned session 90475) exited 0. The actual Main signer/Core
renewal returned the same stored certificate for repeated old-credential requests;
the database contained one renewal row with unchanged base certificate/key.
Windows DPAPI publication preserved the original issued bytes and key, and the
expired invitation's original enrollment reconciled using the renewed leaf.
The actual Electron/SPA window read Workspace/Dashboard/Inbox and persisted
read/archive/restore. Membership loss was checked independently; with membership
restored, parent revocation denied both fingerprints. Main, owned Core child and
the temporary DB then closed naturally. No Agent, Plugin or Node was created.
Log: `g/work/native-renewal-joined-window-final.log`.

Previously pushed Source `6e4309ad` CI runs 40415423121 and 40415432194 completed
with failure. Inspection of the first run identifies the production dependency
security policy step in the compatibility job. These are separate CI results;
focused renewal passes do not clear the security gate or certify full CI.

The explicit joined command, from `external/sps-core`, is:

```powershell
pnpm --filter @paperclipai/db exec tsx ../../../../sps-server/desktop/scripts/smoke-native-workspace-channel.mjs --isolated-native-workspace-channel --with-native-renewal
```

The joined mode uses temporary actual Windows DPAPI credentials, Electron and
the existing bundled Core UI, real TLS 1.3 and the owned Core child, a temporary
real PostgreSQL database, and production renewal/reconciliation paths. Only
Identity-provider token exchange is substituted with a precreated real Core
session. Host signing keys are isolated in Main fixture memory. This does not
qualify a production Identity provider, an installed build or physical LAN.

## Remaining qualification and rollback

Host server-leaf renewal/pin distribution, issuer rotation, explicit expired
trust recovery, Native Source/Node, isolated Plugin UI/actions/live events, real
AI/provider execution, signed installation/update/restore and two physical
Windows PCs remain. The active Zod High gate is unresolved; no waiver or release
approval is implied. Marketplace policy and Plugin Builder structure are unchanged.

Rollback disables optional Native composition and retains original credentials,
renewal history and Workspace data. The additive migration does not rewrite
existing device registrations. An older Core cannot authorize renewed leaves;
disabling Native is the safe rollback boundary. No firewall, OS trust store,
customer credential or installed application was changed.
