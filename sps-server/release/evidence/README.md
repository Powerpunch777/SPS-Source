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

Do not store names, emails, machine names, IP addresses, tokens, or project
contents. Embed only compact sanitized JSON or text logs. Each log is Base64
encoded and hashed; all decoded logs together must remain at or below 12 KiB.

The evidence schema is `2`. Copy the challenge nonce into `releaseNonce`, add
the exact candidate and installer tuple, logs, and scenario references, then
sign the same file on both devices. Each device owns a local Ed25519 key that is
never included in the evidence:

```powershell
# Run once on each supervised test device, before preparing the release.
Set-Location sps-server/desktop
npm run release:init-device-key

# Host signs the unsigned evidence into a new file.
npm run release:sign-device-evidence -- unsigned.json host-signed.json host

# Transfer host-signed.json to the Member device. Member creates the final file.
npm run release:sign-device-evidence -- host-signed.json final-evidence.json member
```

The signatures cover the release nonce, candidate tuple, installer tuple,
completion timestamp, every artifact digest, and every scenario result. The
Stable gate rejects altered results, a challenge from unenrolled keys, invalid
signatures, or two signatures from the same device key. Successful publication
changes the release from draft to public, so the same candidate challenge
cannot be published again; failed pre-publication attempts may safely retry the
same candidate evidence. This is protected-enrollment application identity,
not TPM hardware attestation.

Use this unsigned starting shape:

```json
{
  "schemaVersion": 2,
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
    }
  ],
  "scenarios": {
    "hostMemberJoin": { "status": "pass", "artifactNames": ["two-device-session-log"] },
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
