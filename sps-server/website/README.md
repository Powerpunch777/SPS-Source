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

## Cloudflare Pages deployment

`redongames.com` already uses Cloudflare DNS. Publish this directory with
Cloudflare Pages rather than mixing public marketing files with the SPS Hub
container.

1. In Cloudflare, open **Workers & Pages** and create a **Pages** project from
   `Powerpunch777/SPS`.
2. Set the production branch to `main` after this branch is merged.
3. Set the root directory to `sps-server/website`, leave the build command
   empty, and use `.` as the build output directory.
4. Add `redongames.com` as the custom domain. Cloudflare configures the apex
   record through its own DNS zone.
5. Add `www.redongames.com` as a redirect to `https://redongames.com` in
   Cloudflare Redirect Rules.

The same output can be deployed with Wrangler after a Cloudflare Pages project
exists and a `CLOUDFLARE_API_TOKEN` is available outside this repository:

```powershell
Set-Location .\sps-server\website
npx --yes wrangler@4 pages deploy . --project-name redon-games --branch main
```

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
