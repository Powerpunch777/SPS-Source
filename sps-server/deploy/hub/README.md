# SPS Public Hub Deployment

This folder deploys the shared SPS Hub for a small team. The Hub stores company
data, invite records, Rooms, Tasks, and signed Node command records. Each
member computer runs its own SPS Desktop Node and keeps its CLI logins, local
model runtime, and workspace files on that computer.

Choose exactly one ingress mode:

- **Cloudflare Tunnel mode** is recommended for a home computer or private
  network. `cloudflared` connects out to Cloudflare, so the Hub host does not
  open or forward inbound ports.
- **Direct exposure mode** runs Caddy on host ports 80/443. Use it for a VPS
  or a network where those ports deliberately point to the Hub computer.

## Before you start

Prepare the following before deployment:

1. A Windows or Linux Hub host with Docker Engine and Docker Compose.
2. A public Hub hostname such as `app.example.com`.
3. A Google OAuth Web application. Add these exact values in Google Cloud:
   - Authorized JavaScript origin: `https://app.example.com`
   - Authorized redirect URI: `https://app.example.com/api/auth/callback/google`
4. A clone of the SPS repository with its pinned Core source:

```powershell
git clone --recurse-submodules https://github.com/Powerpunch777/SPS.git
Set-Location SPS
```

If the repository was already cloned, fetch the pinned Core source with:

```powershell
git submodule update --init --recursive
```

## Create the private configuration

Run the initializer from this directory. It creates an ignored `.env` file
with generated database and authentication secrets. Never commit or share this
file. The prompt switches are the recommended route because neither secret is
placed in shell history.

```powershell
.\Initialize-SPSHubDeployment.ps1 `
  -Domain app.example.com `
  -GoogleClientId "your-google-client-id" `
  -PromptForGoogleClientSecret
```

For Cloudflare Tunnel mode, create a **remotely-managed** tunnel in the
Cloudflare dashboard and include its connector token while creating `.env`:

```powershell
.\Initialize-SPSHubDeployment.ps1 `
  -Domain app.example.com `
  -GoogleClientId "your-google-client-id" `
  -PromptForGoogleClientSecret `
  -PromptForCloudflareTunnelToken
```

The original `-GoogleClientSecret` and `-CloudflareTunnelToken` parameters are
still available for unattended CI or a dedicated secret manager. Do not use
them in an interactive shared shell.

The preflight verifies the Core source, private configuration, Docker Engine,
and Compose contract without printing secret values. With `-CheckPublicHealth`,
it also verifies that the public Hub can start Google OAuth without exposing
the authorization URL or credentials:

```powershell
# Cloudflare Tunnel mode
.\Test-SPSPublicHubDeployment.ps1 -Mode tunnel

# Direct exposure mode
.\Test-SPSPublicHubDeployment.ps1
```

## Start and verify the Hub

### Cloudflare Tunnel mode

In Cloudflare, create a published application route for `app.example.com` and
point its service URL to `http://sps-hub:3100`. Cloudflare creates the proxied
DNS route to the tunnel. The connector shares a private Docker network with
`sps-hub`, so that service name is intentionally not public.

```powershell
docker compose --env-file .env -f docker-compose.yml -f docker-compose.tunnel.yml up -d --build
docker compose --env-file .env -f docker-compose.yml -f docker-compose.tunnel.yml ps
.\Test-SPSPublicHubDeployment.ps1 -Mode tunnel -CheckPublicHealth
```

Do not enable `direct-exposure` in this mode. Caddy does not start and no
Docker service publishes a host port.

### Direct exposure mode

Point the hostname A/AAAA record to the Docker host and make ports 80 and 443
reachable before starting. Caddy obtains and renews the HTTPS certificate.

```powershell
docker compose --env-file .env -f docker-compose.yml --profile direct-exposure up -d --build
docker compose --env-file .env -f docker-compose.yml --profile direct-exposure ps
.\Test-SPSPublicHubDeployment.ps1 -CheckPublicHealth
```

Open `https://app.example.com` and sign in with Google. The first approved user
creates or joins the SPS company. A local server at `127.0.0.1:3100` is not a
public Hub and cannot be used by a friend outside that computer.

## Invite a teammate and connect a computer

1. An owner creates an invite code in SPS and sends it to the teammate.
2. The teammate installs SPS Desktop, opens the invite, and signs in with their
   own Google account.
3. In SPS Desktop, the teammate chooses the public Hub URL and company, then
   connects the Desktop Node. SPS Desktop accepts `https://` for a remote Hub;
   plain HTTP is reserved for `localhost` development only.
4. In SPS, an owner approves that Node, grants individual Agents access to it,
   and optionally selects it as an Agent's primary Node.
5. The Node owner maps each SPS project to the local project folder in SPS
   Desktop. Project-bound commands refuse to run until that mapping exists.

Before step 4, SPS Desktop sends only signed heartbeats. It does not poll or
execute Agent commands until the Hub returns the Node as `active`.

A computer owner can choose **Disconnect this computer** in SPS Desktop at any
time. That immediately revokes that Node, clears its Agent grants and primary
bindings, cancels queued or active commands, and discards its local Node
identity. Connecting it again creates a new pending Node that an owner must
approve.

The Hub only sends signed command requests to an approved Node. Provider
credentials, local CLI sessions, and local AI model files never leave the
member computer. Removing an Agent grant or Node approval cancels queued and
active commands for that pairing. The Hub workspace opens in a separate
sandboxed Desktop window and does not receive the privileged local Node setup
bridge.

The public Hub image deliberately does not install provider CLIs such as Codex,
Claude Code, Gemini, or OpenCode. A public Hub coordinates work and stores team
state; an approved SPS Desktop Node is the only place where a member's local
CLI or local AI runtime may execute a command.

Public Hub deployments set `SPS_REQUIRE_NODE_EXECUTION=true`. A local CLI or
local AI Agent without an approved primary Node fails clearly instead of falling
back to the Hub. HTTP/API Agents are unaffected, so a team can still use
centrally configured specialist APIs where its policy allows them.

## Update, backup, and incident response

Use the same Compose file selection that started the Hub when rebuilding or
stopping it. For Tunnel mode:

```powershell
git pull --ff-only
git submodule update --init --recursive
docker compose --env-file .env -f docker-compose.yml -f docker-compose.tunnel.yml up -d --build
docker compose --env-file .env -f docker-compose.yml -f docker-compose.tunnel.yml stop
```

For direct mode, replace the two `-f` values with
`-f docker-compose.yml --profile direct-exposure`.

The named Docker volumes `sps-postgres` and `sps-hub-data` contain production
data. Back them up before host migration or destructive Docker maintenance.
Keep `.env` in a separate encrypted backup because it contains the secrets
needed to read existing data and preserve Google sign-in sessions. Do not run
`docker compose down --volumes` unless intentionally deleting all SPS Hub data.

To immediately stop execution on one computer, revoke its Node approval or
remove the specific Agent grant from SPS. A computer owner can also disconnect
their own Node from SPS Desktop.
