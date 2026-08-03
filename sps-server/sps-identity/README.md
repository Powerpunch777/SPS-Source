# SPS Identity

> 이 패키지는 외부 Host·원격 협업 모드에서 사용할 수 있는 identity runtime이다. 개인·소규모 팀 기본 제품 흐름의 역할·접근 정책은 Core가 아니라 활성화된 정책 플러그인이 정의한다.

This Cloudflare Worker is SPS's central identity plane. It deliberately stores
only identity, device, OAuth state, one-time code, and refresh-token records.
It is not a workspace, Room, Task, agent, attachment, or execution server.

## Local checks

```powershell
Set-Location sps-server/sps-identity
npm install
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
   applies all pending D1 migrations, stores the secrets, and attaches
   `auth.redongames.com` during the Worker deploy.

## Safe deployment helper

After Wrangler is authenticated, run
`./scripts/publish-identity.ps1 -GoogleClientId <web-client-id>`. The script
prompts for the Google web-client secret without writing it to a file, uploads
the RSA key material from the ignored `.secrets/` folder, applies all pending
D1 migrations, and deploys the Worker. Successful code and refresh exchanges
retain an AES-GCM-encrypted response for at most 60 seconds. Desktop retries a
lost response once with the same high-entropy idempotency key. Reuse with a
different key revokes the active refresh-token family and requires sign-in
again. D1 stores refresh-token hashes rather than plaintext refresh tokens.
Finish with `npm run verify:deployment`.

Never commit the Google secret, RSA private key, D1 database contents, or a
Desktop refresh token.
