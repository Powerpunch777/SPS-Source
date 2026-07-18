# SPS Google Login Setup

## Purpose

SPS Desktop, the authenticated Hub browser, and invitation acceptance use the
same Google account. Google identifies the person; it does not grant company
access by itself. Company membership is granted only by an SPS invitation and
the Hub permission model.

This setup is required before inviting someone from another computer. A local
server can remain in `local_trusted` mode while the owner prepares the public
Hub, but the friend-facing Hub must use the exact HTTPS URL below.

## 1. Fix the Hub URL first

For Redon Games, the public product site and the authenticated Hub have
different origins:

| Purpose | URL |
| --- | --- |
| Public SPS product website | `https://redongames.com` |
| Google-authenticated SPS Hub | `https://app.redongames.com` |

Google OAuth must use only the Hub origin. The exact callback URL is:

```text
https://app.redongames.com/api/auth/callback/google
```

The scheme, hostname, port, and path must match exactly in SPS and Google Cloud
Console. Do not register the marketing website, a LAN IP, or `localhost` for
the public Hub client.

## 2. Create the Google OAuth client

1. Open Google Cloud Console and create or select a project.
2. Configure the OAuth consent screen. Add invited people as test users while
   the app is in testing.
3. Create an OAuth Client ID for a **Web application**.
4. Add `https://app.redongames.com` as an authorized JavaScript origin.
5. Add `https://app.redongames.com/api/auth/callback/google` as the authorized
   redirect URI.
6. Copy the Client ID and Client Secret. The secret is shown only once; keep it
   outside the SPS repository and Room messages.

For a one-computer local test, Google permits a localhost redirect such as
`http://localhost:3100/api/auth/callback/google`. That local URL is not
suitable for a friend connecting from another computer.

## 3. Configure the Hub computer

Do not distribute OAuth, database, or Cloudflare secrets among Windows user
environment variables. Create the ignored deployment `.env` file on the Hub
computer instead:

```powershell
Set-Location ".\sps-server\deploy\hub"
.\Initialize-SPSHubDeployment.ps1 `
  -Domain "app.redongames.com" `
  -GoogleClientId "<Google OAuth client ID>" `
  -GoogleClientSecret "<Google OAuth client secret>" `
  -CloudflareTunnelToken "<Cloudflare Tunnel connector token>"
```

The initializer generates the database password and Better Auth secret, sets
Google-only login, and fixes the public URL to `https://app.redongames.com`.
The `.env` file is Git-ignored and must not be put in screenshots, AGENTS.md,
or an invitation. Then verify it without printing any secret:

```powershell
.\Test-SPSPublicHubDeployment.ps1 -Mode tunnel
```

For a direct Caddy/VPS deployment, omit `-CloudflareTunnelToken` and follow
the direct mode in `deploy\hub\README.md`. The public Hub Docker compose file
always keeps PostgreSQL and the Hub application on its private network.

## 4. User and Desktop flow

1. Owner creates an SPS invitation from the authenticated Hub.
2. The invited person opens the code or `sps://join` link in SPS Desktop.
3. SPS Desktop opens the invitation in the default browser.
4. The person chooses **Continue with Google** and accepts the invitation.
5. Back in SPS Desktop, they choose **Continue with Google** again to approve
   the device connection.
6. SPS Desktop stores the Board API token using Windows secure storage, loads
   only the companies available to that Google account, and registers the PC's
   public key.
7. An Owner approves the pending Node and grants only the allowed Agents to
   that Node.

CLI credentials and local-model files never leave the invited computer. SPS
stores only its Hub token and locally generated Node keypair in Windows secure
storage.

## 5. Validation checklist

- Google browser callback returns to the SPS Hub instead of showing
  `redirect_uri_mismatch`.
- An invited Google account cannot see a company before accepting its
  invitation.
- SPS Desktop lists only the companies available to that account after device
  approval.
- A Node stays `pending` until an SPS Owner approves it.
- A Node cannot execute an Agent until an Owner grants that Node-Agent pair.
- Revoking that Agent grant or disconnecting the Node prevents the next queued
  command without exposing CLI credentials to the Hub.

## References

- Better Auth Google provider: https://better-auth.com/docs/authentication/google
- Google OAuth web-server redirect rules: https://developers.google.com/identity/protocols/oauth2/web-server
