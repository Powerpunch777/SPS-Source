# SPS Google Login Setup

## Purpose

SPS Desktop, the Hub browser, and invitation acceptance use the same Google account. Google identifies the person; it does not grant company access by itself. Company membership is still granted only by an SPS invitation and the Hub permission model.

This setup is required before inviting someone on another computer. The current local-only server can remain in `local_trusted` mode while the owner prepares these settings.

## 1. Prepare a Hub URL

Google OAuth needs one stable Hub URL. For a shared Hub, use HTTPS and a hostname that every invited computer can reach. Do not use a LAN IP address as the OAuth redirect target.

Example Hub URL:

```text
https://sps.example.com
```

The exact Google redirect URI is:

```text
https://sps.example.com/api/auth/callback/google
```

The scheme, hostname, port, and path must match exactly in SPS and Google Cloud Console.

## 2. Create the Google OAuth client

1. Open Google Cloud Console and create or select a project.
2. Configure the OAuth consent screen. Add invited people as test users while the app is in testing.
3. Create an OAuth Client ID for a **Web application**.
4. Add the exact redirect URI from the previous section.
5. Copy the Client ID and Client Secret. The secret is shown only once; store it outside the SPS repository.

For a one-computer local test, Google permits a localhost redirect, for example `http://localhost:3100/api/auth/callback/google`. That local URL is not suitable for a friend connecting from another computer.

## 3. Configure the Hub machine

Set these machine-level environment variables on the computer that runs the SPS Hub. Keep the secret out of Git, screenshots, Room messages, and AGENTS.md.

```powershell
[Environment]::SetEnvironmentVariable("SPS_GOOGLE_CLIENT_ID", "your-client-id", "User")
[Environment]::SetEnvironmentVariable("SPS_GOOGLE_CLIENT_SECRET", "your-client-secret", "User")
[Environment]::SetEnvironmentVariable("SPS_AUTH_SECRET", "replace-with-a-long-random-secret", "User")
[Environment]::SetEnvironmentVariable("SPS_AUTH_GOOGLE_ONLY", "true", "User")
[Environment]::SetEnvironmentVariable("SPS_DEPLOYMENT_MODE", "authenticated", "User")
[Environment]::SetEnvironmentVariable("SPS_DEPLOYMENT_EXPOSURE", "private", "User")
[Environment]::SetEnvironmentVariable("SPS_AUTH_BASE_URL_MODE", "explicit", "User")
[Environment]::SetEnvironmentVariable("SPS_AUTH_PUBLIC_BASE_URL", "https://sps.example.com", "User")
[Environment]::SetEnvironmentVariable("SPS_ALLOWED_HOSTNAMES", "sps.example.com", "User")
```

Open a new PowerShell window after setting user environment variables, then restart SPS from that new window. `SPS_AUTH_GOOGLE_ONLY=true` intentionally prevents the Hub from starting when the Google Client ID or Client Secret is absent.

## 4. User and Desktop flow

1. Owner creates an SPS invitation.
2. The invited person opens the code or `sps://join` link in SPS Desktop.
3. SPS Desktop opens the invitation in the default browser.
4. The person chooses **Continue with Google** and accepts the invitation.
5. Back in SPS Desktop, they choose **Continue with Google** again to approve the device connection.
6. SPS Desktop stores the Board API token using Windows secure storage, loads the companies available to that Google account, and registers the PC's public key.
7. An owner approves the pending Node and grants only the allowed Agents to that Node.

CLI credentials and local-model files never leave the invited computer. SPS only stores its Hub token and a locally generated Node keypair in Windows secure storage.

## 5. Validation checklist

- Google browser callback returns to the SPS Hub instead of showing `redirect_uri_mismatch`.
- An invited Google account cannot see a company before accepting its invitation.
- SPS Desktop lists only the companies available to that account after device approval.
- A Node stays `pending` until an SPS owner approves it.
- A Node cannot execute an Agent until an owner grants that Node-Agent pair.

## References

- Better Auth Google provider: https://better-auth.com/docs/authentication/google
- Google OAuth web-server redirect rules: https://developers.google.com/identity/protocols/oauth2/web-server
