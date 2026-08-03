# SPS Release Baseline

Last reviewed: 2026-08-04

The current candidate is `0.4.119` and remains `development-candidate`. It is not a Stable release.

## Candidate tuple

- Desktop: `0.4.119`
- Core: `f32b80c0cea82f1476050c2b1d9e90630da992d8`
- Plugin SDK: `4e23934dd0164132b9ba6d637d7687e97ad27f86` (`0.11.0`)
- Platform: Windows 10/11 x64
- Remote transport: Tailscale
- Identity protocol: v2 compatibility bridge
- Rollback floor: `bridge-v2`

## Identity rollout state

Production has not received a code or D1 migration rollout from this candidate. It does have a prior replay-secret change deployment, so the earlier phrase "Production Worker and DB were unchanged" is incomplete. The current production health endpoint still exposes only the legacy health contract and must not be treated as a `0.4.119` attestation.

The staging hostname currently does not resolve. Staging and Production migrations `0001` through `0006`, environment-specific RSA files, the protected `sps-production` GitHub Environment, and the Bridge/Final/finalization rollout remain external setup work. Therefore no real staging OAuth or Worker deployment evidence exists yet. The code requires exact staging URL, D1 ID/name, newest Worker deployment ID, Cloudflare version metadata, replay-key version, Source SHA, protocol version, rollback floor, and a Worker-signed OAuth receipt before production verification can pass. Runtime receipts and health fail closed without Cloudflare's version-metadata binding, and Final verification requires one exact Worker version to receive 100% of traffic.

GitHub immutable releases are enabled for `Powerpunch777/SPS-Desktop-Releases` as of 2026-08-04. This setting is not retroactive: older public releases remain mutable metadata records, while every future Stable publish must become immutable and pass GitHub release and asset attestation verification.

## Stable gates

Stable publication requires all of the following for the same Source commit:

1. Core, SDK, bundled extensions, Identity, Desktop, and Node checks pass.
2. Identity staging passes direct-D1 protocol smoke, OAuth configuration smoke, and a separate real Google sign-in/token/signature/revoke smoke for the same deployment/version/release IDs. Only after revoking that Google-verified session does the staging Worker atomically retain a replayable RSA receipt bound to the Source, newest deployment, Cloudflare version metadata, release ID, account hash, smoke nonce, and revoke idempotency key. Production Bridge and Final re-fetch both environments' health, deployments, and JWKS before accepting it, and reject a shared Production/Staging RSA key.
3. Production health reports the exact Source SHA, SPS release ID, protocol, rollout phase, replay-key version, and bridge floor; Cloudflare and D1 APIs independently verify that the exact deployment is the latest active deployment and uses the pinned database.
4. Identity Final is deployed only after a compatible Production Bridge, and failed Final verification can roll back only to that Bridge.
5. Identity finalization verifies a clean checkout, the actual legacy replay expiry, and zero family-less refresh or plaintext replay rows.
6. Windows Authenticode is `Valid`.
7. Host/Member physical evidence includes fresh install, previous-Stable upgrade, the exact final installer tuple, an immutable release challenge, and separate Ed25519 signatures from two device-local keys. The two key fingerprints must be enrolled in the protected Environment before the challenge nonce is generated.
8. The signed installer is uploaded once as a draft; the publish workflow first confirms immutable releases are enabled, downloads and verifies those same bytes, and rechecks the remote release ID plus every asset ID, size, digest, and update timestamp immediately before publication. After publication it requires `immutable:true`, runs GitHub release and asset attestation verification, and rechecks the exact snapshot. An immutable release cannot be returned to draft, so any mismatch fails publication without pretending rollback is possible.
9. The annotated release tag already belongs to `main`, is verified by GitHub, and the pinned Core and Plugin SDK revisions are reachable from their own `main` branches.
10. Publication uses the protected `sps-production` environment.

Evidence and installer bytes from `0.4.118` or earlier cannot be reused after the Source changes in `0.4.119`.
