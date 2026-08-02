# SPS Dependency Security Gate

The release gate runs production dependency audits for SPS Desktop and SPS Core.
Any new `critical` or `high` advisory fails verification.

Temporary exceptions live in
[`release/security-audit-policy.json`](../../release/security-audit-policy.json).
An exception must match the package manager source, advisory ID, module, and
severity, state why the affected path is not active in SPS, and include an
expiry date. An expired exception fails the gate.

## Current Exception

React Router advisory `1124282` affects React Server Components mode. SPS uses
React Router as a browser SPA and does not enable RSC. The exception expires on
2026-09-30 so the React Router 8 migration must be reassessed before then.

## CI Access

`SPS-Source` Actions need `SPS_SOURCE_READ_TOKEN` to check out the private
`SPS-Core` submodule. The current secret restores verification. Before a wider
beta, replace it with a fine-grained token limited to read-only Contents access
for the required private repositories.
