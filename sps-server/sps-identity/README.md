# SPS Identity

SPS Identity is the central account plane for SPS Desktop. It stores only
identity, device, OAuth state, one-time code, and hashed refresh-token records.
It is not a Workspace, Room, Task, agent, attachment, or execution server.

## Local verification

```powershell
Set-Location sps-server/sps-identity
npm ci
npm test
```

## Environments

Production and staging are deliberately isolated:

| Environment | Worker | D1 | URL |
| --- | --- | --- | --- |
| Staging | `sps-identity-staging` | `sps-identity-staging` | `https://auth-staging.redongames.com` |
| Production | `sps-identity` | `sps-identity` | `https://auth.redongames.com` |

Google OAuth needs a Web application redirect URI for each environment.
Production uses `https://auth.redongames.com/v1/oauth/google/callback`; staging
uses `https://auth-staging.redongames.com/v1/oauth/google/callback`.

Generate one key pair per environment. The ignored files live under
`.secrets/staging/` and `.secrets/production/`; never reuse the staging key in
Production:

```powershell
$env:SPS_IDENTITY_ENVIRONMENT = "staging"; npm run keygen
$env:SPS_IDENTITY_ENVIRONMENT = "production"; npm run keygen
```

## Replay-key initialization and rotation

Normal deployment never generates or uploads an AES-GCM replay key. Initialize
each environment once with an explicit command:

```powershell
./scripts/initialize-replay-key.ps1 -Environment Staging -GenerateNewKey
./scripts/initialize-replay-key.ps1 -Environment Production -GenerateNewKey
```

The initializer refuses to overwrite a remote key with the same version. To
rotate, increase `SPS_IDENTITY_REPLAY_KEY_VERSION`, initialize that new version,
deploy, wait longer than the 60-second replay TTL, and only then remove the old
secret. Ciphertexts include their key version during the overlap. The
initializer combines an exclusive local file lock with a unique D1
initialization record, so a second computer cannot initialize the same version.
If upload fails after that record is created, recovery is intentionally manual:
inspect both Cloudflare Secrets and D1 before removing the incomplete record.

## Staged deployment

Deploy staging first with `-RolloutPhase Bridge`. This creates an immutable
Cloudflare version with a unique Wrangler tag, routes 100% traffic to that
version, records the Cloudflare deployment ID separately from the SPS release
ID, and writes evidence. Only after that bridge is the active rollback floor
may `-RolloutPhase Final` be used. Final verification rolls back only to the
declared bridge version if its verification fails; it never falls back to the
legacy Worker.

```powershell
./scripts/publish-identity.ps1 `
  -Environment Staging `
  -GoogleClientId <staging-web-client-id>
```

The command applies migrations to the staging D1, uploads a strict immutable
Worker version, verifies health/JWKS/source revision, and exercises the
direct-D1 token protocol plus OAuth endpoint configuration. It writes token-free
evidence containing the exact D1 identity, deployment/version IDs, replay-key
version, rollout phase, and Source revision. The staging hostname must resolve
before this command can run.

The 302 check is named `oauthConfigurationSmoke`; it is not full OAuth. A
human completes a real Google sign-in separately. Set the exact values printed
by the staging deployment, then run `npm run smoke:oauth`; the command opens the
browser, exchanges and revokes the resulting session, and writes token-free,
hashed-subject evidence. Stable attestation requires that full OAuth evidence
in addition to the direct-D1 protocol evidence.

Production requires recent evidence from the exact Source revision. First
deploy the compatibility Bridge and keep its three IDs. Then deploy Final while
declaring that exact Bridge as the only supported rollback target:

```powershell
./scripts/publish-identity.ps1 `
  -Environment Production `
  -GoogleClientId <production-web-client-id> `
  -StagingEvidencePath <staging-evidence.json> `
  -StagingDeploymentId <staging-worker-deployment-id> `
  -StagingVersionId <staging-worker-version-id> `
  -StagingReleaseId <staging-sps-release-id> `
  -RolloutPhase Bridge `
  -ConfirmProduction

./scripts/publish-identity.ps1 `
  -Environment Production `
  -GoogleClientId <production-web-client-id> `
  -StagingEvidencePath <staging-evidence.json> `
  -StagingDeploymentId <staging-worker-deployment-id> `
  -StagingVersionId <staging-worker-version-id> `
  -StagingReleaseId <staging-sps-release-id> `
  -RolloutPhase Final `
  -BridgeVersionId <production-bridge-version-id> `
  -BridgeCloudflareDeploymentId <production-bridge-deployment-id> `
  -BridgeReleaseId <production-bridge-release-id> `
  -ConfirmProduction
```

Migration `0003` keeps the old plaintext replay table for Worker rollback and
adds the encrypted v2 table. Migration `0004` assigns a unique safe family root
to every active legacy refresh token, so users are not logged out during the
rollout. As a second safety net, an unbackfilled active token receives a family
root during its first atomic rotation. An already-consumed token whose lineage
cannot be reconstructed is rejected without deleting its row.

Finalization reads the legacy replay table and refuses to run until its real
maximum expiry has elapsed. It does not accept a manual "TTL elapsed" checkbox:

```powershell
./scripts/finalize-identity-v2.ps1 `
  -StagingEvidencePath <staging-evidence.json> `
  -ProductionDeploymentId <production-worker-deployment-id> `
  -ProductionVersionId <production-worker-version-id> `
  -ProductionReleaseId <production-sps-release-id>
```

Finalization removes only consumed legacy token rows and drained plaintext
replay rows. Active migrated sessions remain valid. A supported rollback may
target only the recorded Bridge Worker; selecting the pre-Bridge Worker in the
Cloudflare dashboard would disable refresh-token family protection.

After finalization, combine the Production Final rollout, staging protocol
smoke, and staging full-OAuth evidence with `npm run attest:release -- <four
paths>`. The Stable publish workflow remotely rechecks both Workers, exact
Cloudflare version traffic, and the finalized Production D1 before publishing.

Desktop retries a lost or truncated response once with the same high-entropy
idempotency key. Identity returns structured refresh error codes so revoked,
reused, expired, and legacy sessions are cleared immediately without parsing
human-readable messages.

Never commit Google secrets, RSA private keys, replay keys, D1 contents,
staging evidence, or Desktop refresh tokens.
