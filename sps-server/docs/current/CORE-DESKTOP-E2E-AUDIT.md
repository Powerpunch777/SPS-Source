# SPS Core Desktop E2E Audit

> Historical evidence for Desktop 0.4.104. This report does not certify the
> current candidate listed in `CURRENT-CANDIDATE.md`.

Audit date: 2026-08-01
Desktop under test: SPS Desktop `0.4.104` on Windows
Status: packaged, installed, and physical two-computer Host Source E2E gates pass.

## Scope

This audit records evidence from the packaged Electron application and the two
installed computers. Automated tests protect contracts, but they do not replace
direct button, permission, credential, and recovery checks.

## Evidence baseline

| Evidence | Result |
| --- | --- |
| Desktop test suite | `261/261` pass, exit 0 |
| Public Plugin SDK suite | `146/146` pass |
| Desktop Node suite | `39/39` pass |
| Installer | SHA256 `B58E7EAE15884D4E9B052ED3A15A9B43B340CB83DCAE1EE0D1A71261C974C2C1`, size `255265752` |
| Host and Member app.asar | both SHA256 `2ECC983D650BBBB51798762A1A4AAFB6B8096AE5073C251CD33FB7C66E34EFEC` |
| Packaged bootstrap | pass |
| Packaged Workspace surfaces | pass |
| Packaged Plugin Preview and cleanup | pass |
| Packaged Host plugin lifecycle | pass |
| `0.4.104` Host/main installation | pass |
| `0.4.104` Member/laptop installation | pass |
| Host Source metadata/route/grant contracts | pass in automated coverage |
| Host Source -> laptop Agy CLI physical file edit | pass; run `e0286388-cf8d-4acb-9890-40d8fce1edab` |

## Release gates

| Gate | Current result |
| --- | --- |
| Sign-in, Host creation, Workspace restart | pass in packaged coverage |
| Member invite, join, Node approval | pass in packaged/installed coverage |
| Browser boundary | pass: direct browser Workspace/API access is denied |
| Plugin stage/enable/disable/re-enable/uninstall flow | pass in packaged Host lifecycle |
| Host Source selection and grant setup | pass in contracts and installed Host setup |
| Member CLI edits an actual Host Source | pass; `SPS_WORKSPACE_PATH=Z:\` and marker verified |
| Source revoke blocks a second run | pass; run `e5bec7a5-9324-4479-aea2-834d4dca5730` failed with no active transport route |
| Host and Member restart after Source run | pass; Node ID, version, plugin, and revoked Source state persisted |
| Every visible control, empty/loading/error state | automated and packaged regression baseline pass; product-level visual inventory remains a beta follow-up |

## Current finding

The physical gate passed. The laptop Node mounted Host Source
`53faf93c-7da0-44d9-9586-9435274eec24` as `Z:\`, used the trusted
`SPS_WORKSPACE_PATH=Z:\` contract, and wrote/read the exact marker in
`node-source-e2e.txt`. Source UI revoke removed the Windows share/account;
the second run was denied and the original file hash remained unchanged.

## Required next run

1. Keep the physical evidence attached to the beta release record.
2. Repeat the visual control inventory before public release, including empty,
   loading, error, cancellation, and update states.
3. Complete code-signing and publication checks if this candidate leaves controlled beta.

## Interpretation

`pass` means the named scope was directly exercised or covered by a matching
contract. Automated Core/SDK green results do not close the physical Source gate.
`open` is intentional and is not equivalent to failure.
