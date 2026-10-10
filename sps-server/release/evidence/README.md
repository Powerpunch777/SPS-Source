# SPS Physical Release Evidence

Stable SPS Desktop releases require evidence from two real Windows devices for
the exact signed installer. Before creating a release tag, initialize one key
on each supervised test device and store their two printed fingerprints in the
protected `sps-production` Environment secret
`SPS_PHYSICAL_RELEASE_DEVICE_KEYS_JSON`:

```json
{"host":"<64 hex characters>","member":"<64 hex characters>"}
```

The Prepare workflow refuses to build without that enrollment and publishes a
draft-only `sps-release-challenge.json` containing a random 256-bit nonce bound
to the Desktop version, Source revision, installer SHA-256, and both enrolled
device fingerprints.

Complete every scenario before signing the evidence:

- Host and Member invitation/join;
- an allowed Agent runtime executed from the Member Node;
- Member editing of the Host-owned Workspace Source;
- Tailscale/network interruption and recovery;
- Node and runtime permission revocation failing closed;
- export followed by restore into an empty Host;
- a clean installation of the candidate;
- an upgrade from the previous Stable release.

Do not store names, emails, machine names, IP addresses, Tailnet hostnames,
local absolute paths, tokens, or project contents. Embed only compact sanitized
JSON or text logs. Each log is Base64 encoded and hashed; all decoded logs
together must remain at or below 12 KiB.

The evidence schema is `3`. Copy the challenge nonce into `releaseNonce`, add
the exact candidate and installer tuple, logs, and scenario references, then
sign the same file on both devices. Each device owns a local Ed25519 key that is
never included in the evidence:

Before the two device signatures, create the required sanitized Tailscale Serve
artifact from a private capture. The private capture contains the actual HTTP
status and Base64 response bodies and must never be committed or uploaded. The
tracked observation server hashes the exact loaded transport module. The private
capture also records the packaged runtime archive hash. The generator requires
both observed hashes to match the release manifest, then retains only status
codes, response hashes, transport decisions, version numbers, the release
tuple, and those Owner Host runtime/module hashes:

```powershell
Set-Location sps-server/desktop
npm run release:observe-serve -- private-observation-config.json
npm run release:create-serve-evidence -- private-serve-capture.json tailscale-serve-evidence.json
npm run release:verify-serve-evidence -- tailscale-serve-evidence.json dist/sps-release-manifest.json dist/sps-release-challenge.json
```

`private-observation-config.json` contains local paths and is never published:

```json
{
  "modulePath": "<materialized request-hostname.js>",
  "expectedModuleSha256": "<manifest module SHA-256>",
  "runtimeArchivePath": "<packaged Owner Host runtime archive>",
  "expectedRuntimeArchiveSha256": "<manifest archive SHA-256>",
  "releaseNonce": "<release challenge nonce>",
  "port": 31311,
  "servePath": "/__sps-release-<first 32 hex characters of the nonce challenge>",
  "captureOutputPath": "<private capture output>",
  "hostTailscaleVersionPath": "<Host tailscale version --json output>",
  "memberTailscaleVersionPath": "<Member tailscale version --json output>"
}
```

The private capture has this exact schema and remains local to the supervised
test session:

```json
{
  "schemaVersion": 1,
  "releaseNonce": "<nonce from sps-release-challenge.json>",
  "completedAt": "<ISO-8601 timestamp>",
  "servePath": "/__sps-release-<first 32 hex characters of the nonce challenge>",
  "backendPort": 31311,
  "hostTailscaleVersion": { "short": "<stable version>" },
  "memberTailscaleVersion": { "short": "<stable version>" },
  "runtimeArchiveSha256": "<packaged runtime archive SHA-256>",
  "requestHostnameModuleSha256": "<loaded module SHA-256>",
  "memberResponse": { "httpStatus": 200, "responseBodyBase64": "<actual response>" },
  "directSpoofResponse": { "httpStatus": 403, "responseBodyBase64": "<actual response>" }
}
```

The observation route is derived from `SHA-256("sps-tailscale-serve:" +
releaseNonce)`. It accepts only `GET` and records the real Serve request and the
direct-spoof request once each. Both response bodies contain that derived
challenge, so copying a response or adding a nonce to a later JSON file does not
create valid evidence.

The Serve evidence schema rejects unknown fields, so public evidence cannot
carry an email, machine name, IP address, Tailnet hostname, or absolute path.
It requires the actual `200` Member response and `403` direct-spoof response,
their body hashes, the Owner Host archive hash, and the loaded
`request-hostname.js` hash. `NotSigned` installers produce only
`development-smoke` evidence; Stable physical evidence requires `stable` Serve
evidence from an Authenticode `Valid` installer.
The standalone `release:verify-serve-evidence` command verifies only schema,
hash, and candidate binding. It never proves Stable completion by itself.
Stable verification happens only when the Serve artifact is inside the physical
evidence envelope signed by both enrolled device keys.

```powershell
# Run once on each supervised test device, before preparing the release.
Set-Location sps-server/desktop
npm run release:init-device-key

# Host signs the unsigned evidence into a new file.
npm run release:sign-device-evidence -- unsigned.json host-signed.json host

# Transfer host-signed.json to the Member device. Member creates the final file.
npm run release:sign-device-evidence -- host-signed.json final-evidence.json member
```

The signatures cover the complete evidence document except the device
attestations themselves, including the release nonce, candidate and installer
tuples, completion timestamp, full embedded artifact bytes, and every scenario
result. Unknown fields and non-portable artifact names are rejected. This binds
the sanitized `tailscale-serve-evidence.json` proof to the same release nonce.
The
Stable gate rejects altered results, a challenge from unenrolled keys, invalid
signatures, or two signatures from the same device key. Successful publication
changes the release from draft to public, so the same candidate challenge
cannot be published again; failed pre-publication attempts may safely retry the
same candidate evidence. This is protected-enrollment application identity,
not TPM hardware attestation.

Use this unsigned starting shape:

```json
{
  "schemaVersion": 3,
  "releaseNonce": "<nonce from sps-release-challenge.json>",
  "candidate": {
    "desktopVersion": "<current Desktop version>",
    "sourceRevision": "<40-character Source revision>",
    "coreRevision": "<40-character Core revision>",
    "pluginSdkRevision": "<40-character Plugin SDK revision>"
  },
  "completedAt": "<ISO-8601 timestamp>",
  "installer": {
    "version": "<current Desktop version>",
    "sizeBytes": 123,
    "sha256": "<installer SHA-256>",
    "signatureStatus": "Valid"
  },
  "devices": {},
  "artifacts": [
    {
      "name": "two-device-session-log",
      "mediaType": "application/json",
      "contentBase64": "<Base64-encoded sanitized log>",
      "sha256": "<SHA-256 of decoded content>"
    },
    {
      "name": "tailscale-serve-evidence.json",
      "mediaType": "application/json",
      "contentBase64": "<Base64-encoded sanitized Serve evidence>",
      "sha256": "<SHA-256 of decoded Serve evidence>"
    }
  ],
  "scenarios": {
    "hostMemberJoin": { "status": "pass", "artifactNames": ["two-device-session-log", "tailscale-serve-evidence.json"] },
    "remoteAgentRuntime": { "status": "pass", "artifactNames": ["two-device-session-log"] },
    "hostSourceEdit": { "status": "pass", "artifactNames": ["two-device-session-log"] },
    "networkRecovery": { "status": "pass", "artifactNames": ["two-device-session-log"] },
    "nodeAndRuntimeRevocation": { "status": "pass", "artifactNames": ["two-device-session-log"] },
    "emptyHostRestore": { "status": "pass", "artifactNames": ["two-device-session-log"] },
    "freshInstall": { "status": "pass", "artifactNames": ["two-device-session-log"] },
    "previousStableUpgrade": { "status": "pass", "artifactNames": ["two-device-session-log"] }
  }
}
```

Do not commit the final evidence. Store its compact JSON in the protected
`SPS_PHYSICAL_RELEASE_EVIDENCE_JSON` GitHub Actions secret. The Publish workflow
rechecks both signatures against the exact downloaded challenge and installer.

Every Windows package pipeline removes all earlier public evidence plus every private Serve capture and
then runs the release-evidence privacy gate before and after packaging. The
gate allows only the current candidate's public evidence JSON and rejects raw
logs, temporary scripts, email addresses, real Tailnet hostnames, non-loopback
IP addresses, and absolute Windows paths.
