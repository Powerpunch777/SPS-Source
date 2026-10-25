# SPS Release Baseline

Last reviewed: 2026-10-25

The current **source** candidate is `0.4.137` and remains `development-candidate`.
It is not a new installer or Stable release. The generated
[current candidate](CURRENT-CANDIDATE.md) and support matrix are authoritative
for its Core/SDK tuple; do not use a historical tuple from this document.

## Candidate tuple

- Desktop: unreleased source `0.4.137`
- Core and public SDK: exact revisions in [CURRENT-CANDIDATE.md](CURRENT-CANDIDATE.md)
- Platform: Windows 10/11 x64
- Remote transport: Tailscale `1.52.0` or later
- Identity protocol: v2 compatibility bridge
- Rollback floor: `bridge-v2`

The source adds optional AI/backend discovery, Native recovery and the mock-first
model broker. Exact commands, partial failures and tested Source/Core/SDK revisions
are recorded in [the multi-backend plan](MULTI-BACKEND-WORKSTATION-PLAN-ko.md)
and its dated acceptance records. Source tests do not qualify installed bytes.

### Historical 0.4.136 UI Checkpoint (2026-10-18)

That Core included the first light UI pass (bundled Korean/Latin font,
shared frame and plugin settings). Source Electron visual checks passed at three
viewport sizes; see `SPS-LIGHT-UI-PLAN-ko.md`. The prior installer and its four
packaged E2Es predate this UI commit and do not validate these new bytes. A new
installer has not been produced for the UI pass.
The Desktop source also applies the same font and light styling to sign-in,
Host creation/participation and setup forms. These source-level UI changes
require a fresh package before any installed-app or release claim.

## Identity rollout state

The external deployment state below is the last recorded state from August 2026,
not a new October rollout verification. This candidate changes dependencies,
verification tooling and UI. No Identity deployment, migration, Stable publication,
or signing operation was performed for this update. Treat each external condition
as unverified until fresh candidate-bound evidence is collected.

Production has not received a code or D1 migration rollout from this candidate. It does have a prior replay-secret change deployment, so the earlier phrase "Production Worker and DB were unchanged" is incomplete. The current production health endpoint still exposes only the legacy health contract and must not be treated as a `0.4.135` attestation.

The staging hostname currently does not resolve. Staging and Production migrations `0001` through `0006`, environment-specific RSA files, and the Bridge/Final/finalization rollout remain external setup work. Therefore no real staging OAuth or Worker deployment evidence exists yet. The code requires exact staging URL, D1 ID/name, newest Worker deployment ID, Cloudflare version metadata, replay-key version, Source SHA, protocol version, rollback floor, and a Worker-signed OAuth receipt before production verification can pass. Both staging and production health must report the exact Cloudflare `version_id`; runtime receipts and health fail closed without Cloudflare's version-metadata binding, and Final verification requires one exact Worker version to receive 100% of traffic.

The `sps-production` GitHub Environment now exists and restricts deployment to protected branches. The current private-repository plan does not support required Environment reviewers or `main` branch protection, and no production secrets have been populated. Stable publication remains blocked until the repository plan and reviewer configuration provide the approval boundary required by this document.

GitHub immutable releases are enabled for `Powerpunch777/SPS-Desktop-Releases` as of 2026-08-04. This setting is not retroactive: older public releases remain mutable metadata records, while every future Stable publish must become immutable and pass GitHub release and asset attestation verification.

The required Host lifecycle E2E uses a deterministic ACP fixture that connects to the injected Marketplace MCP stdio server, calls `search_marketplace_plugins`, and returns the tool result in the visible assistant transcript without depending on a paid model account. It also verifies that the read-only conversation did not change plugin lifecycle state. A separate manually dispatched, non-blocking live Codex ACP canary preserves real-provider diagnostics; it is observability evidence, not a Stable gate.

The packaged `0.4.135` Owner Host runtime retains the ACPX dependency-closure checks from `0.4.120`. Core catalog generation, installation, and installed-file audit share one canonical UTF-8/LF byte contract, so fresh LF clones and existing Windows CRLF checkouts produce the same manifest and update status. Private Tailscale requests no longer gain a hostname identity from `X-Forwarded-Host` or a direct `.ts.net` Host claim alone: tokenless loopback access requires the actual Tailscale Serve proxy shape, including a loopback socket peer, matching `.ts.net` `Host` and `X-Forwarded-Host`, HTTPS forwarding, one valid forwarded client IP, Serve user identity, and the official Serve header marker. SPS requires a stable Tailscale `1.52.0` or later release and checks the raw version before creating or repairing the Serve route; prerelease versions, malformed build metadata, and preprocessed support claims are rejected, and tagged devices are not accepted as human Member clients because Tailscale does not provide user identity headers for their traffic. Candidate transport evidence is generated by a tracked observation server and a strict schema verifier. Its one-time GET route and response challenge are derived from the release nonce; the real Member HTTP 200 and direct-spoof HTTP 403 may each be recorded only once. The evidence checks the runtime archive and loaded `request-hostname.js` hashes against the release manifest, removes account, machine, Tailnet, network, and local-path data, and is covered by Host and Member Ed25519 signatures over the complete evidence document rather than a selected field list. Every package pipeline treats the `sps-candidate-*` prefix case-insensitively, retains only the exact lowercase current-version public evidence filename, removes every other candidate artifact, and rejects candidate entries that are not regular files. The retained public evidence is limited to 8 KiB and must be canonical JSON encoded as strict UTF-8 with at most one UTF-8 BOM. UTF-16, malformed UTF-8, NUL, replacement characters, malformed JSON, duplicate object keys (including escaped forms), and non-canonical byte representations fail closed. Privacy scanning inspects both the decoded source text and every parsed JSON key and string value for email addresses, real Tailnet hostnames, non-loopback IPv4 or IPv6 addresses, and absolute Windows paths. A live HTTP 200 from an older installed server or an ad hoc source checkout is not candidate evidence. Electron E2E fails closed when its isolated user-data directory is missing, outside the operating-system temporary root, redirected through a link, or configured with a Host readiness timeout outside the bounded 30-second to 10-minute range. The Linux Core regression gate is split into bounded general and serialized shards, excludes generated `dist` test copies, and requires the serialized Core job in the legacy required check. A valid short-lived local Agent JWT may cross only the loopback `/api` transport gate; normal browser surfaces remain blocked and the request still passes the existing actor, run, company, and Marketplace session scope checks.

## Dependency verification (rechecked 2026-10-18)

Both production and full-graph dependency policy gates pass with zero Critical
or High advisories. This is not a claim of zero vulnerabilities. Production has
two Low advisories (`@tootallnate/once` in sqlite3/node-gyp install tooling and
`katex` through Mermaid). The full graph additionally has one reviewed Moderate
advisory, `sprintf-js` `1241202`, through electron-builder's download/proxy logger.
It has no upstream patch; the inspected logger uses constant format strings and
structured context. Its full-graph-only review expires on 2026-11-09 and cannot
authorize a production finding. No High exceptions remain.

Electron 43.7.7 is included in the full-graph audit despite being declared as a
devDependency. Patched Core paths include proxy-addr, MCP SDK, js-yaml, nanoid,
Hono, esbuild, multer, sharp, URI/address parsers, caching, and build tooling.
The expired esbuild/Hono reviews were removed after their paths were patched.
The generated [dependency policy document](DEPENDENCY-SECURITY.md) and four CI
workflows now enforce both scopes and documentation consistency. Stale or expired
policy entries fail closed. These are time-stamped audit results, not permanent
claims about future registry advisories.

## Local validation

- Desktop: 369/369 tests; Desktop Node: 39/39 tests.
- Core transport/catalog/auth configuration: 41/41; asset upload: 8/8.
- MCP server source tests: 22/22; MCP connector: 8/8.
- Core shard/workflow contracts: 8/8; portable asset copier: 2/2;
  all-workspace typecheck/build passed on the patched dependency graph.
- UI entry budget and compatibility namespace checks passed.
- The asset fixture now loads its route graph in bounded setup before request
  assertions, avoiding cold-import timeouts and work leaking into the next test.
- Windows temporary-path assertions compare canonical real paths, including
  runner 8.3 aliases. Runtime pack ZIP hashes use a disposed .NET SHA-256 stream
  and are checked against the exact archive bytes in a Windows subprocess test.
- Core PR CI validates the committed lockfile instead of prohibiting changes,
  regenerating an unreviewed graph, or replacing it with a CI artifact.
- Release package/bootstrap contracts pass 22/22. The unpublished MCP connector
  remains buildable and usable locally but is not enrolled for automatic npm publication.
- Catalog packaging now always builds before checking the npm artifact and
  rejects a non-pnpm `npm_execpath`; both packaging regressions pass locally.
- Desktop CI packaging explicitly installs bundled plugin dependencies from
  their lockfiles before building; a workflow ordering test protects all five lanes.
- Initial retries and generated-dist MCP test discovery were not counted as
  successful source validation; only the corrected explicit commands above count.

Final installer hash, Source revision, packaging/Electron E2E outputs, and CI
execution state are recorded in Source PR #14 and Core PR #26 after packaging.
The release manifest is authoritative for artifact provenance. Source run
`38061015442` completed all nine Linux shards at Source `bdfeb45b`, Core
`fdb8812e4`; its Windows packaging job failed because plugin build dependencies
were not installed. Core's Node 24 job also exposed the corrected npm/pnpm test
runner bug. These earlier results do not imply exact-current-HEAD success or
physical two-device verification. Follow the final PR evidence for fresh runs.

Core run `39095628464` passed all nine shards and browser E2E at `313dadae9`.
The subsequent Source run exposed a clipboard-test scheduling race, now fixed
with React `act`, and Windows short-path handling in Room Changes/attachments.
Git supplies the workspace prefix; attachment writes use the validated canonical
directory. Regression tests cover path aliases without weakening link rejection.
These changes require fresh final-tuple CI and package evidence.

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
- The pinned Core is still on Draft PR #26, not independently approved/merged
  into Core `main`; verify exact reachability for the tuple before release.
- The production dependency gate currently rejects Zod 3 High advisory 1243066.
  Its major migration remains on hold; there is no approved exception.
- No signed `0.4.137` installer or identical-byte two-PC evidence has been created.

Until these conditions have fresh evidence for the same candidate tuple,
`0.4.137` remains a source development candidate and must not be described as
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

Evidence and installer bytes from an earlier candidate cannot be reused for
`0.4.137`: its Core/SDK and Desktop source have changed. Rebuild and
retest from the exact Source revision. Code signing will change the installer
hash again, requiring new manifest, challenge, Serve and physical evidence.
