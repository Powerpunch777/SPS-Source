# SPS Core Completion Audit

> Historical evidence for the Desktop 0.4.104 candidate snapshot. The physical
> results below apply only to that snapshot and do not certify the current
> candidate listed in `CURRENT-CANDIDATE.md`.

Status for this historical snapshot: Core contract, packaging, installed Desktop
regression, and physical two-computer beta gates passed; public release gates
remain separate.
Audit date: 2026-08-01

## Historical candidate snapshot

- SPS Desktop `0.4.104`
- SPS Core `8339edd1ee6cb479a757c303039e123b5e0680cf`
- Plugin SDK `@sonparkserver/plugin-sdk` `0.11.0`, revision
  `f24d9b236a8bdaee9441f37694b7e4298aa7e6c2`
- Plugin API `1`, Extension Profile `2.0` (Profile `1.0` compatibility retained)
- Windows 10/11 x64, Tailscale transport

## Requirement matrix

| Requirement | Result | Evidence and limit |
| --- | --- | --- |
| Core is workflow-neutral | Pass | Room, Task, role hierarchy, approval and memory policy are not required by the Core baseline. |
| Safe generic technical primitives | Pass | Profile 2.0 exposes scoped Source/Runtime/Run/Artifact/secret handles; no raw Host path or provider credential is exposed. |
| Host/Member/Node/Runtime/Source boundary | Pass | Host-only technical APIs, encrypted Node grants, and physical Source routing are covered. |
| Plugin lifecycle safety | Pass | Staging, compatibility, review, enable/disable/re-enable/uninstall and rollback coverage passed in packaged Host lifecycle. |
| Neutral first Workspace | Pass | Packaged Workspace does not auto-create legacy workflow objects; Marketplace/Discovery behavior is search/recommendation, not automatic installation. |
| Desktop-first boundary | Pass | Unheadered browser access is denied; Electron Desktop bridge access works. |
| Two-computer Source execution | Pass for this snapshot | Run `e0286388-cf8d-4acb-9890-40d8fce1edab` edited and read the Host marker through laptop Agy CLI. |
| Physical E2E cleanup | Pass for this snapshot | The temporary plugin, Source handle, Local Registry source, share account, and test files were removed after restart evidence was captured. |

## Executed evidence for the historical snapshot

| Area | Result |
| --- | --- |
| SPS Desktop | `261/261` pass, exit 0 |
| SPS Desktop Node | `39/39` pass |
| Public Plugin SDK | `146/146` pass |
| Installer | SHA256 `B58E7EAE15884D4E9B052ED3A15A9B43B340CB83DCAE1EE0D1A71261C974C2C1`, size `255265752` |
| Host and Member app.asar | both SHA256 `2ECC983D650BBBB51798762A1A4AAFB6B8096AE5073C251CD33FB7C66E34EFEC` |
| Packaged bootstrap | pass |
| Packaged Workspace surfaces | pass |
| Packaged Plugin Preview and cleanup | pass |
| Packaged Host plugin lifecycle | pass |
| Desktop `0.4.104` Host/main installation | pass |
| Desktop `0.4.104` Member/laptop installation | pass |
| Source metadata/route/grant contract | pass in automated coverage |
| Physical Host Source -> laptop Agy CLI edit | pass; `SPS_WORKSPACE_PATH=Z:\` |

## What was complete in this snapshot

The historical evidence supports the claim that SPS Core could package and run a
workflow-neutral Desktop, keep plugin lifecycle changes behind the Host boundary,
provide scoped Source/Runtime/Run contracts, and run the packaged baseline on both
the Host and Member installations. Plugin Preview is isolated and its cleanup was
verified.

## What is not complete

The following are deliberately still release gates:

1. Final direct visual control inventory, especially empty/loading/error and
   cancellation states, as a beta usability follow-up.
2. Public release signing and publication checks, if this candidate is promoted
   beyond controlled beta.

## Completion rule

For this historical snapshot, the physical Source run, revoke denial, and restart recovery are recorded in
[`CORE-DESKTOP-E2E-AUDIT.md`](CORE-DESKTOP-E2E-AUDIT.md). The remaining items are
beta usability and public-release gates for that snapshot, not missing Core/Source
execution behavior. No physical two-computer evidence for the current candidate is
claimed by this report.
