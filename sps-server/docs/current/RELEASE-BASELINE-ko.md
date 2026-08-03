# SPS Release Baseline

Last reviewed: 2026-08-04

The current candidate is `0.4.117` and remains `development-candidate`. It is not a Stable release.

## Candidate tuple

- Desktop: `0.4.117`
- Core: `3fee634ee5bc57f8dd9ff2a7b511d91439b35b02`
- Plugin SDK: `4e23934dd0164132b9ba6d637d7687e97ad27f86` (`0.11.0`)
- Platform: Windows 10/11 x64
- Remote transport: Tailscale
- Identity protocol: v2 compatibility bridge
- Rollback floor: `bridge-v2`

## Identity rollout state

Production has not received a code or D1 migration rollout from this candidate. It does have a prior replay-secret change deployment, so the earlier phrase "Production Worker and DB were unchanged" is incomplete. The current production health endpoint still exposes only the legacy health contract and must not be treated as a `0.4.117` attestation.

The staging hostname currently does not resolve. Therefore no real staging OAuth or Worker deployment evidence exists yet. The code requires exact staging URL, D1 ID/name, Worker deployment ID, replay-key version, Source SHA, protocol version, and rollback floor before production verification can pass.

## Stable gates

Stable publication requires all of the following for the same Source commit:

1. Core, SDK, bundled extensions, Identity, Desktop, and Node checks pass.
2. Identity staging passes direct-D1 protocol smoke, OAuth configuration smoke, and a separate real Google sign-in/token/signature/revoke smoke for the same deployment/version/release IDs. Production Bridge and Final both require those proofs before changing Production.
3. Production health reports the exact Source SHA, SPS release ID, protocol, rollout phase, replay-key version, and bridge floor; Cloudflare and D1 APIs independently verify that the exact deployment is the latest active deployment and uses the pinned database.
4. Identity Final is deployed only after a compatible Production Bridge, and failed Final verification can roll back only to that Bridge.
5. Identity finalization verifies a clean checkout, the actual legacy replay expiry, and zero family-less refresh or plaintext replay rows.
6. Windows Authenticode is `Valid`.
7. Host/Member physical evidence includes fresh install, previous-Stable upgrade, the exact final installer tuple, an immutable release challenge, and separate Ed25519 signatures from two device-local keys.
8. The signed installer is uploaded once as a draft; the publish workflow downloads and verifies those same bytes, then rechecks the remote release ID plus every asset ID, size, digest, and update timestamp immediately before publication.
9. The annotated release tag already belongs to `main`, is verified by GitHub, and the pinned Core and Plugin SDK revisions are reachable from their own `main` branches.
10. Publication uses the protected `sps-production` environment.

Evidence and installer bytes from `0.4.116` or earlier cannot be reused after the Source changes in `0.4.117`.
