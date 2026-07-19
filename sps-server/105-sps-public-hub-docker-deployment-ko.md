# SPS Public Hub Docker Deployment

## Scope

This deployment runs the shared SPS Hub and PostgreSQL in Docker. It supports
two ingress choices: Caddy with directly exposed ports 80/443, or an outbound
Cloudflare Tunnel for a home computer without port forwarding.

Each collaborator still runs their own SPS Desktop Node and keeps Codex, Agy,
Ollama, LM Studio, and their credentials on their own computer. The Hub only
coordinates authenticated Rooms, Tasks, Node grants, and signed commands.

The Hub image also builds and installs the SPS Rooms plugin from this repository
before its normal plugin startup pass. This keeps the deployed product's
project Rooms, long-lived Agent conversations, and Task view aligned with the
local SPS workplane instead of deploying only the bare core.

## Before starting

1. Reserve a public hostname such as `app.example.com` for the Hub.
2. Choose one ingress path:
   - Direct: make ports 80 and 443 reachable from the internet. Caddy obtains
     and renews the HTTPS certificate.
   - Tunnel: create a remotely-managed Cloudflare Tunnel and published route;
     no inbound port or router forwarding is required.
3. In Google Cloud, create a Web OAuth client with this exact redirect URL:
   `https://app.example.com/api/auth/callback/google`.
4. Install Docker Engine and the Docker Compose plugin on the Hub computer.
5. Clone SPS with its pinned Core source. A normal clone must initialize the
   submodule before Docker builds the Hub image.

```powershell
git clone --recurse-submodules https://github.com/Powerpunch777/SPS.git
cd SPS

# Only needed when SPS was already cloned without --recurse-submodules.
git submodule update --init --recursive
```

## Create the local deployment secrets

Run this only on the Hub computer. It writes an ignored `.env` file with fresh
database and Better Auth secrets.

```powershell
Set-Location ".\sps-server\deploy\hub"
.\Initialize-SPSHubDeployment.ps1 `
  -Domain "app.example.com" `
  -GoogleClientId "<Google OAuth client ID>" `
  -PromptForGoogleClientSecret
```

Tunnel 모드에서는 같은 명령에 `-PromptForCloudflareTunnelToken`을 추가한다.
두 프롬프트 방식은 비밀값을 PowerShell 기록에 남기지 않는다.
Do not share or commit the created file. Rotating it with `-Force` invalidates
running authentication sessions and changes the database password.

## Start and verify

### Cloudflare Tunnel (recommended for a home Hub)

Configure the Cloudflare published hostname `app.example.com` to service
`http://sps-hub:3100`, then run:

```powershell
Set-Location ".\sps-server\deploy\hub"
docker compose -f docker-compose.yml -f docker-compose.tunnel.yml up --build -d
docker compose -f docker-compose.yml -f docker-compose.tunnel.yml ps
.\Test-SPSPublicHubDeployment.ps1 -Mode tunnel -CheckPublicHealth
```

This mode deliberately starts no Caddy container and publishes no host port.

### Direct Caddy exposure

```powershell
Set-Location ".\sps-server\deploy\hub"
docker compose --profile direct-exposure up --build -d
docker compose --profile direct-exposure ps
curl https://app.example.com/api/health
```

The health response must report `status: ok`. Then set
`https://app.example.com` as the Hub URL in SPS Desktop, sign in with Google,
create an invite, and use SPS Desktop on the second computer to accept it.

Before and after startup, use the read-only deployment preflight. It never
prints the secrets in `.env`.

```powershell
.\Test-SPSPublicHubDeployment.ps1 -Mode tunnel
.\Test-SPSPublicHubDeployment.ps1 -Mode tunnel -CheckPublicHealth
```

## Operations

```powershell
# Follow Hub logs without printing .env contents.
docker compose -f docker-compose.yml -f docker-compose.tunnel.yml logs -f sps-hub

# Apply a Hub code update after taking a database backup.
docker compose -f docker-compose.yml -f docker-compose.tunnel.yml up --build -d

# Stop without deleting persistent SPS data.
docker compose -f docker-compose.yml -f docker-compose.tunnel.yml down
```

Docker named volumes retain PostgreSQL and SPS files across container restarts.
Back up the `sps-postgres` volume before upgrading the Hub.

## Important boundary

In direct mode, only Caddy exposes ports 80/443. In Tunnel mode, no service
exposes a host port. PostgreSQL and the SPS service always remain on the
internal Docker network. Do not add host ports for either service just to make
debugging easier.
