# SPS Desktop Release Channel

## Purpose

SPS Desktop updates come from the public `Powerpunch777/SPS` GitHub Releases
channel. The Desktop app checks this channel after installation starts and then
every six hours. It does not download or install an update without a person
pressing the relevant button in SPS Desktop.

The updater uses `electron-updater` with the normal Windows signature
verification path. SPS never replaces that verification with a custom
always-allow hook.

## What is published

Only a signed NSIS release may be published to the channel. A valid release
contains all of the following from the same build:

- `SPS Desktop Setup <version>.exe`
- `SPS Desktop Setup <version>.exe.blockmap`
- `latest.yml`

`latest.yml` contains the artifact hash used by the updater. Do not upload a
standalone installer or edit `latest.yml` by hand.

## GitHub Actions release gate

The workflow is `.github/workflows/sps-desktop-release.yml`.

1. Set repository secrets `SPS_WINDOWS_CSC_LINK` and
   `SPS_WINDOWS_CSC_KEY_PASSWORD` from the Windows code-signing certificate.
   The certificate subject must be the actual SPS publisher identity that will
   sign every future release.
2. Update `sps-server/desktop/package.json` to the release version.
3. Run the Desktop tests locally.
4. Push a tag exactly matching `desktop-v<package version>`, for example
   `desktop-v0.1.1`.
5. GitHub Actions verifies the tag and signing secrets, builds the Windows NSIS
   installer with `forceCodeSigning=true`, and publishes the release files.

The workflow fails before publishing if either signing secret is absent. This
is intentional: test installers must not become an update source for friends.

## Local release checks

The production command is:

```powershell
Set-Location "C:\Users\young\Documents\AGENT 구축\sps-server\desktop"
$env:GH_TOKEN = "<GitHub token with release permission>"
$env:WIN_CSC_LINK = "<base64 PFX or supported certificate location>"
$env:WIN_CSC_KEY_PASSWORD = "<certificate password>"
npm run release:win
```

Use GitHub Actions for ordinary releases so the certificate stays in repository
secrets rather than on a collaborator's computer. Never commit a certificate,
its password, `GH_TOKEN`, or Google OAuth credentials.

## Current state

The local `0.1.0` installer remains an unsigned test build. It can be used for
local setup and Node testing, but it must not be published as an SPS Desktop
update. The release pipeline becomes usable after a valid Windows signing
certificate is configured.
