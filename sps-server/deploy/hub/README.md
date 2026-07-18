# SPS Public Hub Deployment

This folder deploys a public SPS Hub for a small team. The Hub stores SPS
company data, invite records, and task history. Each member computer runs its
own SPS Desktop Node, which keeps its own CLI login, local model runtime, and
workspace files on that computer.

## Before you start

Prepare the following before deployment:

1. A Windows or Linux host with Docker Engine and Docker Compose.
2. A public DNS hostname such as `hub.example.com`. Its A/AAAA record must
   point to the Docker host before Caddy can issue its HTTPS certificate.
3. A Google OAuth Web application. Add the following values in Google Cloud:
   - Authorized JavaScript origin: `https://hub.example.com`
   - Authorized redirect URI: `https://hub.example.com/api/auth/callback/google`
4. A clone of the SPS repository with the SPS Core submodule:

```powershell
git clone --recurse-submodules https://github.com/Powerpunch777/SPS.git
Set-Location SPS
```

If the repository was already cloned, fetch the pinned Core source with:

```powershell
git submodule update --init --recursive
```

## Create the private configuration

Run the initialization script from this directory. It creates a private
`.env` file with generated database and authentication secrets. The file is
ignored by Git and must never be committed.

```powershell
.\Initialize-SPSHubDeployment.ps1 `
  -Domain hub.example.com `
  -GoogleClientId "your-google-client-id" `
  -GoogleClientSecret "your-google-client-secret"
```

Run the preflight before starting containers:

```powershell
.\Test-SPSPublicHubDeployment.ps1
```

The preflight verifies the Core submodule, the private configuration, Docker
Engine, and Docker Compose without printing any secret value.

## Start and verify the Hub

From this directory, build and start the public Hub:

```powershell
docker compose --env-file .env -f docker-compose.yml up -d --build
docker compose --env-file .env -f docker-compose.yml ps
.\Test-SPSPublicHubDeployment.ps1 -CheckPublicHealth
```

Open `https://hub.example.com` and sign in with Google. The first approved
user creates or joins the SPS company. A local server at `127.0.0.1:3100` is
not a public Hub and cannot be used by a friend outside that computer.

## Invite a teammate and connect a computer

1. An owner creates an invite code in SPS and sends it to the teammate.
2. The teammate installs SPS Desktop, opens the invite, and signs in with
   their own Google account.
3. In SPS Desktop, the teammate chooses the public Hub URL and company, then
   connects the Desktop Node. SPS Desktop accepts `https://` for a remote Hub;
   plain HTTP is reserved for `localhost` development only.
4. In SPS, an owner approves that Node, grants individual Agents access to it,
   and optionally selects it as an Agent's primary Node.
5. The Node owner maps each SPS project to the local project folder in SPS
   Desktop. Project-bound commands refuse to run until that mapping exists.

Before step 4, SPS Desktop sends only signed heartbeats. It does not poll or
execute Agent commands until the Hub returns the Node as `active`.

The Hub only sends signed command requests to an approved Node. Provider
credentials, local CLI sessions, and local AI model files never leave the
member computer. Removing an Agent grant or Node approval cancels queued and
active commands for that pairing. The Hub workspace opens in a separate
sandboxed Desktop window and does not receive the privileged local Node setup
bridge.

The public Hub image deliberately does not install provider CLIs such as
Codex, Claude Code, Gemini, or OpenCode. A public Hub coordinates work and
stores team state; an approved SPS Desktop Node is the only place where a
member's local CLI or local AI runtime may execute a command.

## Update and backup

Pull the SPS repository and its pinned Core revision, then rebuild:

```powershell
git pull --ff-only
git submodule update --init --recursive
docker compose --env-file .env -f docker-compose.yml up -d --build
```

The named Docker volumes `sps-postgres` and `sps-hub-data` contain production
data. Back them up before host migration or destructive Docker maintenance.
Keep `.env` in a separate encrypted backup because it contains the secrets
needed to read the existing data and preserve Google sign-in sessions.

## Incident response

To immediately stop execution on one computer, revoke its Node approval or
remove the specific Agent grant from SPS. To stop all Hub services while
retaining volumes:

```powershell
docker compose --env-file .env -f docker-compose.yml stop
```

Do not run `docker compose down --volumes` unless intentionally deleting all
SPS Hub data.
