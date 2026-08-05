# SPS Release Baseline

Last reviewed: 2026-08-05

The current candidate is `0.4.128` and remains `development-candidate`. It is not a Stable release.

## Candidate tuple

- Desktop: `0.4.128`
- Core: `f05ff0b0d73c2063fd27fae91f9d348a1014fc23`
- Plugin SDK: `4e23934dd0164132b9ba6d637d7687e97ad27f86` (`0.11.0`)
- Platform: Windows 10/11 x64
- Remote transport: Tailscale
- Identity protocol: v2 compatibility bridge
- Rollback floor: `bridge-v2`

## Identity rollout state

Production has not received a code or D1 migration rollout from this candidate. It does have a prior replay-secret change deployment, so the earlier phrase "Production Worker and DB were unchanged" is incomplete. The current production health endpoint still exposes only the legacy health contract and must not be treated as a `0.4.128` attestation.

The staging hostname currently does not resolve. Staging and Production migrations `0001` through `0006`, environment-specific RSA files, and the Bridge/Final/finalization rollout remain external setup work. Therefore no real staging OAuth or Worker deployment evidence exists yet. The code requires exact staging URL, D1 ID/name, newest Worker deployment ID, Cloudflare version metadata, replay-key version, Source SHA, protocol version, rollback floor, and a Worker-signed OAuth receipt before production verification can pass. Both staging and production health must report the exact Cloudflare `version_id`; runtime receipts and health fail closed without Cloudflare's version-metadata binding, and Final verification requires one exact Worker version to receive 100% of traffic.

The `sps-production` GitHub Environment now exists and restricts deployment to protected branches. The current private-repository plan does not support required Environment reviewers or `main` branch protection, and no production secrets have been populated. Stable publication remains blocked until the repository plan and reviewer configuration provide the approval boundary required by this document.

GitHub immutable releases are enabled for `Powerpunch777/SPS-Desktop-Releases` as of 2026-08-04. This setting is not retroactive: older public releases remain mutable metadata records, while every future Stable publish must become immutable and pass GitHub release and asset attestation verification.

The required Host lifecycle E2E uses a deterministic ACP fixture that connects to the injected Marketplace MCP stdio server, calls `search_marketplace_plugins`, and returns the tool result in the visible assistant transcript without depending on a paid model account. It also verifies that the read-only conversation did not change plugin lifecycle state. A separate manually dispatched, non-blocking live Codex ACP canary preserves real-provider diagnostics; it is observability evidence, not a Stable gate.

The packaged `0.4.128` Owner Host runtime retains the ACPX dependency-closure checks from `0.4.120`. Core catalog generation, installation, and installed-file audit share one canonical UTF-8/LF byte contract, so fresh LF clones and existing Windows CRLF checkouts produce the same manifest and update status. Private Tailscale requests no longer gain a hostname identity from `X-Forwarded-Host` or a direct `.ts.net` Host claim alone: tokenless loopback access requires the actual Tailscale Serve proxy shape, including a loopback socket peer, matching `.ts.net` `Host` and `X-Forwarded-Host`, HTTPS forwarding, one valid forwarded client IP, Serve user identity, and the official Serve header marker. This contract was exercised from the online Windows Member laptop through the live `main-computer.tail1725c2.ts.net` Serve endpoint; the temporary smoke route was removed afterward and the existing `127.0.0.1:31310` root proxy was restored. Electron E2E fails closed when its isolated user-data directory is missing, outside the operating-system temporary root, or redirected through a link. The Linux Core regression gate is split into bounded general and serialized shards, excludes generated `dist` test copies, and requires the serialized Core job in the legacy required check. A valid short-lived local Agent JWT may cross only the loopback `/api` transport gate; normal browser surfaces remain blocked and the request still passes the existing actor, run, company, and Marketplace session scope checks.

The transport statement above is intentionally precise: a direct `.ts.net`
`Host` header on a loopback connection is not Serve provenance. Only the
structured Serve identity and connection context can authorize tokenless
loopback access. Same-user native local processes remain inside the trusted
local threat boundary; removing that assumption would require OS or
cryptographic process attestation.

## Current Stable blockers

The following are explicit release blockers, not completed code-test claims:

- Staging DNS and the real staging Worker deployment are not complete.
- D1 migrations `0001` through `0006` are not complete in staging and
  production.
- Environment-specific RSA keys and a real Google OAuth sign-in/token/
  signature/revoke receipt are not complete.
- Production Bridge -> Final -> finalization has not been completed and
  attested.
- GitHub Environment secrets, a required non-author reviewer, and protected
  `main` are not all available. Private repositories require GitHub Pro,
  Team, or Enterprise for the relevant branch-protection controls; billing
  recovery alone does not create them.
- The exact candidate HEAD has not completed all nine Linux Core regression
  shards. Targeted Windows/Core checks and typecheck/build results do not
  substitute for the full Linux shard evidence.
- Core `f05ff0b0d73c2063fd27fae91f9d348a1014fc23` is still on Draft PR #26
  and is not reachable from the Core `main` branch.

Until these conditions have fresh evidence for the same candidate tuple,
`0.4.128` remains a development candidate and must not be described as
Stable.

## Stable gates

Stable publication requires all of the following for the same Source commit:

1. Core, SDK, bundled extensions, Identity, Desktop, and Node checks pass.
2. Identity staging passes direct-D1 protocol smoke, OAuth configuration smoke, and a separate real Google sign-in/token/signature/revoke smoke for the same deployment/version/release IDs. Only after revoking that Google-verified session does the staging Worker atomically retain a replayable RSA receipt bound to the Source, newest deployment, Cloudflare version metadata, release ID, account hash, smoke nonce, and revoke idempotency key. Production Bridge and Final re-fetch both environments' health, deployments, and JWKS before accepting it, and reject a shared Production/Staging RSA key.
3. Production health reports the exact Source SHA, Cloudflare Worker version ID, SPS release ID, protocol, rollout phase, replay-key version, and bridge floor; Cloudflare and D1 APIs independently verify that the exact deployment is the latest active deployment, routes 100% to that version, and uses the pinned database.
4. Identity Final is deployed only after a compatible Production Bridge, and failed Final verification can roll back only to that Bridge.
5. Identity finalization verifies a clean checkout, the actual legacy replay expiry, and zero family-less refresh or plaintext replay rows.
6. Windows Authenticode is `Valid`.
7. Host/Member physical evidence includes fresh install, previous-Stable upgrade, the exact final installer tuple, an immutable release challenge, and separate Ed25519 signatures from two device-local keys. The two key fingerprints must be enrolled in the protected Environment before the challenge nonce is generated.
8. The signed installer is uploaded once as a draft; one repository-wide publication queue confirms immutable releases are enabled both at startup and immediately before publication, downloads and verifies those same bytes, and rechecks the remote release ID plus every asset ID, size, digest, and update timestamp. After publication it requires `immutable:true`, runs GitHub release and asset attestation verification, rechecks the exact snapshot, and confirms `/releases/latest` points to that exact immutable tag. If attestation verification is interrupted after immutable publication, the same workflow resumes against the already-published immutable bytes without republishing. A mutable publication is quarantined before Stable verification when GitHub still permits it.
9. The annotated release tag already belongs to `main`, is verified by GitHub, and the pinned Core and Plugin SDK revisions are reachable from their own `main` branches.
10. Publication uses an `sps-production` Environment with protected `main`, a required non-author reviewer, and protected release, Identity, Cloudflare, and physical-device evidence secrets.

Evidence and installer bytes from `0.4.127` or earlier cannot be reused because `0.4.128` restores the real Tailscale Serve request contract and pins it to a new Core revision.
