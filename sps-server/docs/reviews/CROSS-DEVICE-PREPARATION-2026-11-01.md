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

## Remaining Work

1. Diagnose and fix e35 installed historical-profile and legacy confirmation
   failures; run exact revised-HEAD Windows gates. Retain original bounds.
2. Exercise the test controller's actual candidate startup/sign-in/normal close
   locally before copying it to the notebook.
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
