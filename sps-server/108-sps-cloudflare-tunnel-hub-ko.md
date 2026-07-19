# SPS Cloudflare Tunnel Hub Deployment

## Purpose

This is the recommended SPS public Hub path for a home computer. The Hub host
keeps its router closed: the `cloudflared` Docker container creates an outbound
connection to Cloudflare, and Cloudflare sends `app.redongames.com` traffic
through that tunnel to the private `sps-hub:3100` service.

`redongames.com` remains the public SPS product website. `app.redongames.com`
is the authenticated SPS Hub used by SPS Desktop and invited collaborators.

## Fixed security boundaries

- The tunnel token is stored only in the ignored Hub `.env` file. Never put it
  in an Agent instruction, task comment, repository, or Desktop invite.
- Docker publishes no inbound host port in Tunnel mode.
- PostgreSQL and `sps-hub` remain private Docker services. Cloudflare connects
  to `http://sps-hub:3100` only through the `cloudflared` container's shared
  Docker network.
- The Hub coordinates Rooms, Tasks, invites, and signed Node commands. Codex,
  Agy, local AI model files, provider logins, and project workspaces remain on
  each approved member's SPS Desktop Node.

## One-time Cloudflare configuration

1. In the Cloudflare account that owns `redongames.com`, open **Networking >
   Tunnels** and create a **Cloudflared**, remotely-managed tunnel named
   `sps-hub`.
2. Copy the connector token. Treat it as a deployment secret.
3. Add a **Published application** route:
   - Hostname: `app.redongames.com`
   - Service URL: `http://sps-hub:3100`
4. Cloudflare creates the proxied CNAME route to the tunnel. Do not create an
   A record for `app` and do not expose router ports 80 or 443.

Cloudflare hosts the remotely-managed route configuration. The SPS repository
only starts the connector with its token, so the same Hub can be managed from
the Cloudflare dashboard without committing a local tunnel YAML file.

## Google OAuth configuration

Create a Google OAuth Web client with exactly these values:

| Setting | Value |
| --- | --- |
| Authorized JavaScript origin | `https://app.redongames.com` |
| Authorized redirect URI | `https://app.redongames.com/api/auth/callback/google` |

Use the same hostname in SPS. OAuth is intentionally not configured against
the marketing website root or `localhost`.

## Local Hub configuration

On the Hub computer, initialize the ignored `.env` file:

```powershell
Set-Location ".\sps-server\deploy\hub"
.\Initialize-SPSHubDeployment.ps1 `
  -Domain "app.redongames.com" `
  -GoogleClientId "<Google OAuth client ID>" `
  -PromptForGoogleClientSecret `
  -PromptForCloudflareTunnelToken
```

Run the preflight. It checks for the required keys but never prints their
values:

```powershell
.\Test-SPSPublicHubDeployment.ps1 -Mode tunnel
```

## Start, test, and update

```powershell
# Start or rebuild the private Hub and outbound connector.
docker compose --env-file .env -f docker-compose.yml -f docker-compose.tunnel.yml up -d --build

# Check container health locally and the HTTPS Hub through Cloudflare.
docker compose --env-file .env -f docker-compose.yml -f docker-compose.tunnel.yml ps
.\Test-SPSPublicHubDeployment.ps1 -Mode tunnel -CheckPublicHealth

# Update the product source while retaining Docker volumes and .env.
git pull --ff-only
git submodule update --init --recursive
docker compose --env-file .env -f docker-compose.yml -f docker-compose.tunnel.yml up -d --build
```

Open `https://app.redongames.com`, sign in with Google, create an invite, and
have the teammate open it with SPS Desktop. The owner then approves the Node
and grants its specific Agents permission before it can execute work.

## Verification checklist

1. `https://app.redongames.com/api/health` returns `status: ok`.
2. The Hub browser sign-in redirects to and returns from Google successfully.
3. A second computer accepts an invite and shows a pending SPS Desktop Node.
4. The owner approves that Node and grants exactly one test Agent.
5. The test Agent runs a harmless CLI or local-AI task only on that approved
   Node. Revoking the grant prevents the next command.

This is the release-critical end-to-end test for SPS multi-computer operation.
