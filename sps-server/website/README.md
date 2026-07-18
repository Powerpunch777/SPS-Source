# Redon Games Website

This directory is the static product site for `https://redongames.com`.
It introduces SPS, while the authenticated multi-user workspace is hosted
separately at `https://app.redongames.com`.

## Local check

```powershell
node .\scripts\check-site.mjs
```

The site has no build step. For a local preview:

```powershell
node .\scripts\preview-site.mjs
```

Open `http://127.0.0.1:4173`, then request `/_shutdown` to stop the preview.

## GitHub Pages delivery and Cloudflare DNS

`redongames.com` uses Cloudflare DNS, while this directory is delivered by the
repository's GitHub Pages workflow. This keeps the public static site separate
from the SPS Hub container without requiring Cloudflare-to-GitHub repository
authorization.

1. The `Publish SPS website preview` GitHub Actions workflow deploys
   `sps-server/website` on every website change in the default branch.
2. GitHub Pages has `redongames.com` configured as its custom domain before
   any DNS record is added.
3. In Cloudflare DNS, create four DNS-only apex `A` records for `@`:
   `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, and
   `185.199.111.153`.
4. Wait for GitHub Pages to issue the HTTPS certificate, then enable HTTPS in
   the GitHub Pages settings. DNS and certificate verification can take time.
5. Add `www` as a DNS-only `CNAME` directly to
   `Powerpunch777.github.io` when the alternate hostname is needed. Do not
   point `www` at the apex domain.

The temporary GitHub Pages preview address is:

```text
https://powerpunch777.github.io/SPS/
```

GitHub Pages does not apply Cloudflare's `_headers` convention. That file and
`wrangler.toml` are retained only for a future Cloudflare Pages migration; they
are not part of the current production path.

## SPS Hub domain

Do not point the apex domain at the Hub. The Hub needs its own hostname:

```text
Website: https://redongames.com
Hub:     https://app.redongames.com
OAuth:   https://app.redongames.com/api/auth/callback/google
```

After a Hub computer or VPS has a stable public IP, add an `A` record for
`app` to that IP. Keep it DNS-only during the first Caddy certificate issuance.
Then prepare the ignored Hub environment file without placing secrets in Git:

```powershell
Set-Location .\sps-server\deploy\hub
.\Initialize-SPSHubDeployment.ps1 `
  -Domain app.redongames.com `
  -GoogleClientId "..." `
  -GoogleClientSecret "..."
docker compose up -d --build
.\Test-SPSPublicHubDeployment.ps1 -CheckPublicHealth
```

The Google OAuth web client must use exactly this redirect URI:

```text
https://app.redongames.com/api/auth/callback/google
```

Only after the Hub passes its preflight should an owner create a real invite and
connect a second physical SPS Desktop Node.
