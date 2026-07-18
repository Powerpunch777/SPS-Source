# SPS Public Hub Docker Deployment

## Scope

This deployment runs the shared SPS Hub, PostgreSQL, and Caddy in Docker. It
is the common base for a small VPS or a home computer with a public DNS name
and ports 80/443 forwarded to that computer.

Each collaborator still runs their own SPS Desktop Node and keeps Codex, Agy,
Ollama, LM Studio, and their credentials on their own computer. The Hub only
coordinates authenticated Rooms, Tasks, Node grants, and signed commands.

The Hub image also builds and installs the SPS Rooms plugin from this repository
before its normal plugin startup pass. This keeps the deployed product's
project Rooms, long-lived Agent conversations, and Task view aligned with the
local SPS workplane instead of deploying only the bare core.

## Before starting

1. Point a public hostname such as `hub.example.com` to the computer or VPS.
2. Make ports 80 and 443 reachable from the internet. Caddy uses them to obtain
   and renew the HTTPS certificate.
3. In Google Cloud, create a Web OAuth client with this exact redirect URL:
   `https://hub.example.com/api/auth/callback/google`.
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
  -Domain "hub.example.com" `
  -GoogleClientId "<Google OAuth client ID>" `
  -GoogleClientSecret "<Google OAuth client secret>"
```

Do not share or commit the created `.env` file. Rotating it with `-Force`
invalidates running authentication sessions and changes the database password.
The initializer accepts normal Google OAuth IDs and secrets only; it rejects
whitespace, quotes, and Compose control characters rather than writing an
ambiguous environment file.

## Start and verify

```powershell
Set-Location ".\sps-server\deploy\hub"
docker compose up --build -d
docker compose ps
curl https://hub.example.com/api/health
```

The health response must report `status: ok`. Then set `https://hub.example.com`
as the Hub URL in SPS Desktop, sign in with Google, create an invite, and use
SPS Desktop on the second computer to accept it.

Before and after startup, use the read-only deployment preflight. It never
prints the secrets in `.env`.

```powershell
.\Test-SPSPublicHubDeployment.ps1
.\Test-SPSPublicHubDeployment.ps1 -CheckPublicHealth
```

## Operations

```powershell
# Follow Hub logs without printing .env contents
docker compose logs -f sps-hub

# Apply a Hub code update after taking a database backup
docker compose up --build -d

# Stop without deleting persistent SPS data
docker compose down
```

Docker named volumes retain PostgreSQL, SPS files, and Caddy certificates across
container restarts. Back up the `sps-postgres` volume before upgrading the Hub.

## Important boundary

This Compose profile intentionally exposes only Caddy on ports 80/443. PostgreSQL
and the SPS service remain on the internal Docker network. Do not add host ports
for either service just to make debugging easier.
