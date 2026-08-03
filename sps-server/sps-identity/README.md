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

Run `npm run keygen` once on the protected deployment machine. The ignored
`.secrets/` directory contains the RSA private key and public JWK. Never commit
these files.

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
secret. Ciphertexts include their key version during the overlap.

## Staged deployment

Deploy staging first:

```powershell
./scripts/publish-identity.ps1 `
  -Environment Staging `
  -GoogleClientId <staging-web-client-id>
```

The command applies migrations to the staging D1, deploys the staging Worker,
verifies health/JWKS/source revision, and automatically exercises token,
token retry, refresh, refresh retry, reuse detection, family revocation, and
explicit revocation. It writes a token-free JSON evidence file under the
ignored `artifacts/` directory.

Production requires recent evidence from the exact Source revision:

```powershell
./scripts/publish-identity.ps1 `
  -Environment Production `
  -GoogleClientId <production-web-client-id> `
  -StagingEvidencePath <staging-evidence.json> `
  -ConfirmProduction
```

Migration `0003` keeps the old plaintext replay table for Worker rollback and
adds the encrypted v2 table. Migration `0004` assigns a unique safe family root
to every active legacy refresh token, so users are not logged out during the
rollout. As a second safety net, an unbackfilled active token receives a family
root during its first atomic rotation. An already-consumed token whose lineage
cannot be reconstructed is rejected without deleting its row.

After the previous Worker's replay TTL has elapsed, finalize with the same
staging evidence:

```powershell
./scripts/finalize-identity-v2.ps1 `
  -StagingEvidencePath <staging-evidence.json> `
  -ConfirmLegacyReplayWindowElapsed
```

Finalization removes only consumed legacy token rows and drained plaintext
replay rows. Active migrated sessions remain valid. Before finalization, list
deployments and use Wrangler rollback if production verification fails.

Desktop retries a lost or truncated response once with the same high-entropy
idempotency key. Identity returns structured refresh error codes so revoked,
reused, expired, and legacy sessions are cleared immediately without parsing
human-readable messages.

Never commit Google secrets, RSA private keys, replay keys, D1 contents,
staging evidence, or Desktop refresh tokens.
