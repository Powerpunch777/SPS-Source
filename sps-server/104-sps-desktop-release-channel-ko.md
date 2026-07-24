# SPS Desktop Release Channels

## Current policy

SPS Desktop currently ships through an **unsigned Beta** channel. This allows
the product to be tested before SonParkServer has a registered business and a
public Windows code-signing identity.

The app checks for updates after startup and every six hours. A Beta update is
never downloaded or installed silently: the user must choose **Download**, and
then choose **Restart and install** after the download finishes. No version is
mandatory while the release is unsigned, so an offline Owner Host can continue
working.

Windows may display an unknown-publisher warning for the first installer and
for Beta updates. Beta releases are for trusted testers, not general public
distribution.

## Beta channel

- Tag format: `desktop-beta-v<package version>`
- Workflow: `.github/workflows/sps-desktop-beta-release.yml`
- Build command: `npm run release:beta:win`
- Release type: GitHub prerelease
- Artifact channel: `Powerpunch777/SPS-Desktop-Releases`
- Transitional mirror: `Powerpunch777/SPS` while it remains public for older
  Desktop installations

The Beta workflow intentionally does not read Windows signing secrets and does
not enable `forceCodeSigning`. It still runs the complete Desktop test suite
before publishing the NSIS installer, block map, and update manifest.

### Required GitHub secret

Create one fine-grained GitHub token with **Contents: Read and write** access
to both `Powerpunch777/SPS-Desktop-Releases` and `Powerpunch777/SPS`, then save
it in the `SPS` repository as:

```text
SPS_DESKTOP_RELEASES_TOKEN
```

The workflow refuses to publish without this token. Never put the token in a
source file, local configuration tracked by Git, or a release note.

## Signed production channel

The signed channel remains prepared but inactive until SPS has a public code
signing identity.

- Tag format: `desktop-v<package version>`
- Workflow: `.github/workflows/sps-desktop-release.yml`
- Build command: `npm run release:win`
- Requires `SPS_WINDOWS_CSC_LINK` and `SPS_WINDOWS_CSC_KEY_PASSWORD`
- Requires `forceCodeSigning=true`

After a trusted signing service is configured, SPS can promote the same release
process to a signed stable channel. Only then should the product enable
mandatory minimum-version updates for security or data-format fixes.

## Publishing a Beta

1. Update `sps-server/desktop/package.json` to the intended version.
2. Run the Desktop test suite.
3. Push the matching tag, for example `desktop-beta-v0.4.19`.
4. Confirm the GitHub Actions Beta workflow publishes all three artifacts from
   the same build:
   - `SPS Desktop Setup <version>.exe`
   - `SPS Desktop Setup <version>.exe.blockmap`
   - `latest.yml`
5. Install the first Beta manually on each tester computer. Later versions are
   discovered by the in-app updater and require user confirmation.

`latest.yml` contains the update artifact hash produced by electron-builder.
Do not edit it by hand or upload an installer separately as an update.

## Development build note

SPS Desktop development now materializes its Owner Host runtime into the local
user-data directory instead of running the build source in place. This keeps a
running memory sidecar from locking `.owner-host-runtime` while the next
Desktop package is being prepared. Restart an already-running older Desktop
development process once after upgrading to this behavior. For a release
verification that must run beside an older Desktop process, prepare a private
staging runtime with `SPS_DESKTOP_RUNTIME_OUTPUT` and pass that folder to the
runtime smoke test.
