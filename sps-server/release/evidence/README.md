# SPS Physical Release Evidence

Stable SPS Desktop releases require candidate-specific evidence from two real
Windows devices. Candidate and pilot builds remain available so this evidence
can be produced before publication.

Create `v<desktopVersion>.json` locally only after completing the required
scenarios:

- Host and Member invitation/join;
- an allowed Agent runtime executed from the Member Node;
- Member editing of the Host-owned Workspace Source;
- Tailscale/network interruption and recovery;
- Node and runtime permission revocation failing closed;
- export followed by restore into an empty Host.

Do not store names, emails, machine names, IP addresses, tokens, or project
contents. Store SHA-256 device fingerprints and compact, sanitized JSON or text
logs in the protected Secret. Each embedded log is Base64 encoded, and the
release gate recalculates its SHA-256 instead of trusting a declared digest.
The combined decoded logs must remain at or below 12 KiB so the Base64 JSON
fits safely inside both a GitHub Actions Secret and one Windows environment
variable used by the release runner.

Do not commit the candidate evidence file. Its `sourceRevision` names the
already-tested commit, so committing the evidence would create a different
revision. Store the compact JSON as the private GitHub Actions secret
`SPS_PHYSICAL_RELEASE_EVIDENCE_JSON`. The stable release workflow writes that
secret to a temporary runner file and validates it against the release tag's
exact commit. Local verification can pass the file with
`SPS_PHYSICAL_EVIDENCE_PATH`.

Use this shape:

```json
{
  "schemaVersion": 1,
  "candidate": {
    "desktopVersion": "0.4.112",
    "sourceRevision": "<40-character Git revision>",
    "coreRevision": "<40-character Git revision>",
    "pluginSdkRevision": "<40-character Git revision>"
  },
  "completedAt": "2026-08-02T00:00:00.000Z",
  "devices": {
    "hostFingerprint": "<SHA-256>",
    "memberFingerprint": "<different SHA-256>"
  },
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
    "emptyHostRestore": { "status": "pass", "artifactNames": ["two-device-session-log"] }
  }
}
```
