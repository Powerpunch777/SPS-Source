# Redon Games Domain and Website Topology

## Decision

`redongames.com` is the public Redon Games and SPS product site. It is not the
SPS API origin. The authenticated collaboration service is isolated at
`app.redongames.com`.

| Address | Responsibility | Hosting |
| --- | --- | --- |
| `https://redongames.com` | Public SPS product site, documentation entry point, GitHub and Desktop release links | GitHub Pages with Cloudflare DNS |
| `https://www.redongames.com` | Optional alternate hostname; not configured yet | Future DNS-only CNAME to `Powerpunch777.github.io` |
| `https://app.redongames.com` | Google-authenticated SPS Hub, invitations, Rooms, Tasks, Nodes and Agent grants | Docker Hub host with Caddy |

This prevents the static public site from sharing cookies, runtime data,
PostgreSQL access, or Docker lifecycle with the collaboration Hub.

## Current domain state

On 2026-07-19, `redongames.com` was configured as the GitHub Pages custom
domain before DNS changes. Cloudflare now publishes the four official GitHub
Pages apex A records as DNS-only records. HTTPS remains pending until GitHub
finishes certificate issuance.

## Website implementation

The static website lives in `sps-server/website`.

- It uses the approved SPS bitmap logo from the Desktop product assets.
- GitHub Pages publishes the current default branch to the temporary address
  `https://powerpunch777.github.io/SPS/` and the configured production domain
  `https://redongames.com`.
- Cloudflare provides DNS only. The static `_headers` file is retained for a
  future Cloudflare Pages migration and is not currently served by GitHub Pages.
- It describes the actual SPS Room, Task, Node and permission flow rather than
  pretending that a public Hub is already open.
- It links to the intended Hub address without embedding credentials, invite
  codes, or any internal server endpoint.
- `_headers` supplies static-host security headers and the site contains no
  external analytics or third-party script dependency.

Run its source check before publishing:

```powershell
node .\sps-server\website\scripts\check-site.mjs
```

## Publication order

1. Add `redongames.com` to GitHub Pages before changing DNS.
2. Create the four DNS-only GitHub Pages apex A records in Cloudflare and wait
   for GitHub HTTPS issuance. Add a direct `www` CNAME to
   `Powerpunch777.github.io` only when the alternate hostname is needed.
3. Choose a continuously available Hub computer or VPS. A friend-facing Hub
   cannot depend on a laptop that is usually asleep.
4. Add the `app` DNS record to the Hub's public IP and initially leave it
   DNS-only so Caddy can obtain its HTTPS certificate.
5. Create the Google OAuth web client using only
   `https://app.redongames.com/api/auth/callback/google` as its redirect URI.
6. Create the ignored Hub `.env` with
   `Initialize-SPSHubDeployment.ps1 -Domain app.redongames.com`, deploy Docker,
   and pass the public health preflight.
7. Run the real two-computer invitation, Node approval, Agent grant, and
   harmless command execution test.

## Boundaries that must remain true

- The public website must never expose the Hub administration interface.
- The Hub must never store a connected computer's CLI credential or local model
  files.
- Google login identifies a person. An SPS invite and company role still decide
  whether that person can enter a company.
- A new Node remains pending until an Owner approves it, and it cannot execute
  an Agent without an explicit Node-Agent grant.
