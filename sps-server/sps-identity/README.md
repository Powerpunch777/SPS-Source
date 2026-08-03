# SPS Identity

> 이 패키지는 외부 Host·원격 협업 모드에서 사용할 수 있는 identity runtime이다. 개인·소규모 팀 기본 제품 흐름의 역할·접근 정책은 Core가 아니라 활성화된 정책 플러그인이 정의한다.

This Cloudflare Worker is SPS's central identity plane. It deliberately stores
only identity, device, OAuth state, one-time code, and refresh-token records.
It is not a workspace, Room, Task, agent, attachment, or execution server.

## Local checks

```powershell
Set-Location sps-server/sps-identity
npm ci
npm test
```

## Provisioning

1. Create a Google OAuth **Web application** with this redirect URI:
   `https://auth.redongames.com/v1/oauth/google/callback`.
2. Run `npm run keygen` once on the deployment machine. It writes the RSA
   private key and public JWK under the ignored `.secrets/` folder. Set the
   public JWK as `SPS_IDENTITY_PUBLIC_JWK`, then put the private PEM in the
   Worker secret named `SPS_IDENTITY_PRIVATE_KEY_PEM`.
3. Run the deployment helper below. It creates the D1 database if needed,
   creates a separate versioned AES-GCM replay secret under the ignored
   `.secrets/` folder, applies additive D1 migrations, and attaches
   `auth.redongames.com` during the Worker deploy.

## Safe deployment helper

After Wrangler is authenticated, run
`./scripts/publish-identity.ps1 -GoogleClientId <web-client-id>`. The script
prompts for the Google web-client secret without writing it to a file, uploads
the RSA key and the independent `SPS_IDENTITY_REPLAY_KEY_V1` material, applies
all pending additive D1 migrations, deploys the Worker, and verifies health and
the signing key. Migration `0003` keeps the previous `response_json` replay
table intact and adds `identity_replay_results_v2`, so a failed deploy can be
rolled back without a schema outage.

After token, refresh, retry, reuse, and revoke staging smoke passes and the
previous Worker's replay TTL has elapsed, explicitly finalize the transition:

```powershell
./scripts/finalize-identity-v2.ps1 `
  -ConfirmStagingSmokePassed `
  -ConfirmLegacyReplayWindowElapsed
```

Finalization revokes refresh tokens that predate family lineage and removes
drained plaintext replay rows. The old table structure remains available for
an emergency Worker rollback, but users must sign in again after rollback.
Before finalization, use `npx wrangler deployments list` and
`npx wrangler rollback <previous-version-id> -y` if the new Worker fails.

Successful code and refresh exchanges retain an AES-GCM-encrypted response for
at most 60 seconds. Desktop retries a lost or truncated response once with the
same high-entropy idempotency key. Reuse with a different key revokes the
active refresh-token family and requires sign-in again. D1 stores
refresh-token hashes rather than plaintext refresh tokens.

To rotate replay encryption independently from the RSA signing key, create the
next ignored replay-key file, update `SPS_IDENTITY_REPLAY_KEY_VERSION`, publish,
wait longer than the 60-second replay TTL, and only then remove the old Worker
secret. Ciphertexts carry their key version so the overlap remains readable.

Never commit the Google secret, RSA private key, D1 database contents, or a
Desktop refresh token.
