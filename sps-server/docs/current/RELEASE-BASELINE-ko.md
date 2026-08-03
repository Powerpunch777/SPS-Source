# SPS Release Baseline

Last reviewed: 2026-08-03

The current candidate is `0.4.116` and remains `development-candidate`. It is not a Stable release.

## Candidate tuple

- Desktop: `0.4.116`
- Core: `3fee634ee5bc57f8dd9ff2a7b511d91439b35b02`
- Plugin SDK: `4e23934dd0164132b9ba6d637d7687e97ad27f86` (`0.11.0`)
- Platform: Windows 10/11 x64
- Remote transport: Tailscale
- Identity protocol: v2 compatibility bridge
- Rollback floor: `bridge-v2`

## Identity rollout state

Production has not received a code or D1 migration rollout from this candidate. It does have a prior replay-secret change deployment, so the earlier phrase "Production Worker and DB were unchanged" is incomplete. The current production health endpoint still exposes only the legacy health contract and must not be treated as a `0.4.116` attestation.

The staging hostname currently does not resolve. Therefore no real staging OAuth or Worker deployment evidence exists yet. The code requires exact staging URL, D1 ID/name, Worker deployment ID, replay-key version, Source SHA, protocol version, and rollback floor before production verification can pass.

## Stable gates

Stable publication requires all of the following for the same Source commit:

1. Core, SDK, bundled extensions, Identity, Desktop, and Node checks pass.
2. Identity staging passes direct-D1 protocol smoke, OAuth configuration smoke, and a separate real Google sign-in/token/revoke smoke for the same deployment/version/release IDs.
3. Production health reports the exact Source SHA, SPS release ID, protocol, rollout phase, replay-key version, and bridge floor; Cloudflare and D1 APIs independently verify deployment/version traffic and the pinned database.
4. Identity Final is deployed only after a compatible Production Bridge, and failed Final verification can roll back only to that Bridge.
5. Identity finalization verifies a clean checkout, the actual legacy replay expiry, and zero family-less refresh or plaintext replay rows.
6. Windows Authenticode is `Valid`.
7. Host/Member physical evidence includes fresh install, previous-Stable upgrade, and the exact final installer version, byte size, SHA-256, and signature status.
8. The signed installer is uploaded once as a draft; the publish workflow downloads and verifies those same bytes and never rebuilds or replaces them.
9. The annotated release tag descends from `main`, is verified by GitHub, and the pinned Core and Plugin SDK revisions are reachable from their own `main` branches.
10. Publication uses the protected `sps-production` environment.

Evidence and installer bytes from `0.4.115` or earlier cannot be reused after the Source changes in `0.4.116`.
