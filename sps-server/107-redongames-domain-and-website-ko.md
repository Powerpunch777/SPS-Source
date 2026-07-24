# Redon Games Domain and Website Topology

## Decision

`redongames.com` is the public Redon Games and SPS product website. It is not
the SPS API origin and it must not be deployed from the private product source
repository.

| Address | Responsibility | Hosting |
| --- | --- | --- |
| `https://redongames.com` | Public product introduction, beta entry point and feedback contact | Public [`redon-games-website`](https://github.com/Powerpunch777/redon-games-website) repository on GitHub Pages |
| `https://app.redongames.com` | Authenticated SPS Hub, invitations, Rooms, Tasks, Nodes and Agent grants | SPS Hub deployment |

This prevents the static public website from sharing product source,
credentials, cookies, runtime data, PostgreSQL access, or Docker lifecycle
with the SPS Hub.

## Current State

On 2026-07-24 the public website was moved from `SPS/sps-server/website` to
`Powerpunch777/redon-games-website` before the product repositories are made
private. GitHub Pages now owns `redongames.com`, HTTPS is enforced, and the
GitHub Pages certificate is approved.

The website repository contains only static product content, the SPS logo,
site validation, and its Pages workflow. It contains no SPS Desktop, Core,
Hub, Node, private extension source, credential, invite, database, or project
data.

## Operating Rules

1. Change public copy and web design only in `redon-games-website`.
2. Keep the product and Core repositories private after the Desktop update
   bridge is verified.
3. The public website may link to `app.redongames.com`, but must never embed an
   invite code, OAuth secret, Hub administrator route, or local network URL.
4. The public website does not make a Node trustworthy. Google login, an SPS
   invite, Owner approval, and an Agent-Node grant remain separate controls.

## Verification

```powershell
Set-Location .\redon-games-website
node .\scripts\check-site.mjs
```

Verify the live site at `https://redongames.com` after deployment. The GitHub
Pages Custom domain must remain `redongames.com` and HTTPS enforcement must
remain enabled.
