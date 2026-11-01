# Isolated Cross-Device Preparation

Date: 2026-11-01 KST. Development validation only; Core completion and Stable
release are not declared.

## Consent And Preservation

The user approved a temporary candidate and separate test profile on each PC,
with the notebook as Host and main PC as Runner. Only the notebook's currently
empty private Tailscale HTTPS Serve may temporarily change and must return to
empty afterward. Existing installed apps, real login/profile, AppData/Vault,
projects and the main PC's existing server/Serve remain untouched. No public
Funnel, administrator installation, firewall or Production change is authorized.

Read-only SSH used the existing pinned host key and explicit test key, with
BatchMode and StrictHostKeyChecking enabled. The notebook has Windows11x64,
Node24, Tailscale1.102.3, a usable compiler, about30GiB free temporary storage,
no running SPS/Node/Postgres, and empty Serve. Its installed0.4.104 is preserved.
No account name, address, tailnet name, raw SSH output or local absolute path is
included in this record. No remote candidate file, app or Serve change has run.

## Candidate Origin And Local Reproduction

- Source branch HEAD: `e35c900395c4759da267f5299a2f4b9160b877cf`.
- Source PR merge loaded by the candidate:
  `845be9724241583d038d6e2f7abe51fcccd1f3e9`.
- PR merge parents are main `d3777c155632f23349ac2243f3fc615cb8759643`
  and the Source branch HEAD above.
- Core: `b17fb830138b4acde96aa7b5c911f7e8cccfa698`.
- SDK: `61a929f6c783f78e5af603682de1543c7e24abc0`.
- Desktop: `0.4.137`, unsigned development candidate.
- Private workflow run `41209034863`, artifact `13045869406`,
  `sps-installer-input-41209034863-1`.
- GitHub artifact archive digest:
  `0dd9e3ca8c7481d64938f1bd91cd520dfd4899323247169be2e757754e3fd8a1`.
- Unpacked executable SHA256:
  `2674726f5cf65b8e5aca7643de110408392ccb747b013cc66f00942fd07828b0`.
- ASAR SHA256:
  `42d1b9e15a3f0232ae43f895985b69694d33f3e4681af71edcecd674fff7652c`.
- Host runtime archive SHA256:
  `73a9e30f867bbcd4d1531b7be5140f0f0217add2442c2d162d1ee9cd61c31323`.

An explicit `--owned-unpacked-candidate` mode runs the downloaded real binary
only in a canonical direct Temp child with fresh isolated data. It rejects an
installed application path before creating a fixture and does not set fake CI
variables or relax the hosted installer guard. Expected tuple and artifact
hashes are checked before startup; the actual loaded runtime baseline is also
compared. The caller must independently establish artifact origin and retain
the exact directory identity: a matching folder name/baseline is not proof of
creation or provenance.

The local run passed in about87seconds: actual Main encrypted the test account,
then closed; the same profile received pinned157-migration/v11 state; the real
candidate migrated to176/v13, preserved real DPAPI account/signing keys, checked
both Workspace projects/files, restarted and rechecked, then closed normally
and removed only its owned fixture. First cold Host readiness was about59seconds
after Main readiness. Installer/normal-user-profile/previous-Stable/signed/
Production/physical-two-PC qualification remains false. The e35 installed CI
failures are unresolved, not waived by this unpacked pass.

## Test Preparation Contract

The new `cross-device-*` scripts are operator-only test infrastructure, not a
product remote-control API. The candidate guard verifies a plain canonical
Temp hierarchy, exact clean expected tuple, bounded files, stable identity and
EXE/ASAR/runtime hashes. It does not trust a caller-supplied baseline as origin.

The control entry uses a fixed restricted Windows launcher mode and private
SSH stdio JSONL. Only that mode inherits stdin. The empty-session close probe
passed with reduced same-user privileges and natural whole-Job closure; it did
not start an app, listener or route. App sessions use the shipped native Job
supervisor, fresh role profiles and loopback-only debugging/mock Identity.
Mock Identity is explicitly not a real Google login or Production proof.

The first actual local controller trial failed: it observed the preload bridge
before the setup button's initial status render, and Browser.close only closed
windows rather than requesting normal tray-app quit. The30-second shutdown
bound failed; exact owned-Job forced cleanup was not accepted as a pass. An
independent process check found no remaining process for that test profile.

The corrected controller waits for completed setup rendering before its ONE
sign-in click, opens the existing Core Settings through the supported startup
argument, and uses its real Quit button. It verifies candidate/profile/debug
port through Browser.getBrowserCommandLine before acting on a CDP target. The
next actual local trial passed candidate startup, mock PKCE sign-in and natural
native whole-Job exit0/zero processes. No Host, Runner, sharing route or remote
machine was started by this local trial. Settings startup intentionally defers
automatic runtime bootstrap; this is not a normal-startup acceptance claim.

Local Desktop `test:ci` passed serial2/2 plus1866total/1863pass/three unavailable
8.3-alias skips, aggregate1868total/1865pass/3skip/0fail. After the final
controller readiness/normal-Quit changes, selected tests passed24/24.

Raw operator output can include test URLs or authorization data and must never
be uploaded as public evidence. A later sanitized result must bind the exact
candidate, both actual PCs, actual scenario outcomes and route/process cleanup.
Any timeout, unknown ownership, changed Serve snapshot or forced cleanup fails.

## Local Host Controller Follow-Up

The controller omitted the second public setup action: `createOwnerServer`
creates the Host, while `openWorkspace` is a separate setup button/action. An
API observation cannot assume that Host creation has opened an HTTP renderer.
The Host control now verifies the loaded baseline and explicitly opens the
Workspace before any API request. Focused controller/session tests passed9/9
with `node --test test/cross-device-control.test.mjs
test/cross-device-desktop-session.test.mjs` from the Desktop directory.

An actual local fresh-profile trial used the exact unpacked candidate and
EXE/ASAR/runtime hashes recorded above. Main was ready at2734ms, mock account
sign-in at3173ms, isolated Host running at77861ms, and authenticated
`GET /api/companies` at78273ms. The supported Core Settings Quit button then
produced native whole-Job natural exit0/zero active processes at79750ms.
Identity and only the recorded owned temporary tree were closed/removed by
82562ms; an independent process check found zero remaining owned executables.
The trial ended2026-10-31T21:22Z (2026-11-01KST).

Sharing remained disabled and the Host origin was loopback. This uses a mock
account, an older exact unpacked artifact and one physical computer. It is
NOT current-HEAD CI, installed historical-profile migration, real Google,
remote Runner, Serve or two-PC acceptance. No notebook file/app/route or
existing installation/profile was changed. The separate failed fixture was
preserved rather than adopted or deleted by the successful retry.

Reference: [Playwright Electron application lifecycle](https://playwright.dev/docs/api/class-electronapplication).
Closing a browser/window is not substituted for SPS's supported normal Quit
and native Job termination acceptance.

## Portable Reference Package Preparation

The public-SDK Runner reference fixture now has an actual portability test. It
copies exactly `package.json`, `dist/manifest.js` and `dist/worker.js` to a new
owned temporary distribution, checks regular-file identities and equal SHA256,
and removes the separate builder tree (including its development SDK junction)
before starting the copy. Neither `node_modules` nor `src` exists in the copied
distribution. Its child receives no inherited NODE_PATH/NODE_OPTIONS or SDK
environment and runs from the copied working directory.

The actual child initializes, exercises all eight declared runtime routes,
accepts shutdown, closes stdin, ends both output streams and exits naturally0.
The RPC host is a test responder, not a real Core or remote Runner. Both owned
temporary roots are checked against their captured dev/ino/birth identity before
cleanup; no product installation or external SDK target is deleted.

On Windows/Node26.4.0 the reference file passed2/2. Parent verification ran
`node --test test/runner-recovery-package.test.mjs
test/cross-device-control.test.mjs test/cross-device-desktop-session.test.mjs
test/runner-recovery-launch.test.mjs` from Desktop:13/13, no skips or failures.
This adds transport-fixture confidence, NOT physical-PC, real model/provider,
current installed migration or Host/Member acceptance.

The notebook was rechecked read-only on2026-11-01KST: Windows11x64/Node24.16.0,
Tailscale1.102.3, empty Serve, zero relevant SPS/Node/Postgres processes, about
33GiB temporary free storage. This is readiness only. No remote candidate file,
app, installation, login or Serve setting has been changed.

## Remaining Work

1. Installed migration passed on5117; extraction optimization and the remaining
   actual legacy confirmation fix still require exact revised-HEAD Windows
   acceptance. Retain original bounds and complete cleanup/reinstall checks.
2. Local candidate startup/sign-in/Host creation/Workspace API/normal close has
   passed as scoped above; qualify the revised candidate in CI before remote use.
3. Once CI permits, stage exact candidate bytes in recorded owned Temp roots;
   verify hashes again on both machines. Never replace installed apps.
4. Verify actual remote Runner registration, scoped execution, exit/failure,
   cancellation, lease/disconnect/reconnect and normal shutdown using harmless
   test commands only. Distinguish mock-account technical connectivity from
   real Member invitation/Google account acceptance.
5. Remove only the proven test Serve route and confirm empty notebook Serve,
   no remaining owned processes, and unchanged existing installation/data.

Core remains incomplete until the mandatory failures and cross-device gap are
closed. Signing, final identical signed-installer two-PC release acceptance,
Identity Production rollout and other release governance gates remain separate.
