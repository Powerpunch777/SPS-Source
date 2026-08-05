# SPS Dependency Security Gate

The release gate runs production dependency audits for SPS Desktop and SPS Core.
Any new `critical` or `high` advisory fails verification. Every `moderate`
advisory also needs an exact, non-expired path review; an unreviewed or expired
moderate finding fails the same gate.

The current result is **policy gate passed**, not "no vulnerabilities found."
It includes one reviewed High exception and three reviewed Moderate findings,
all expiring on 2026-09-30.

Temporary exceptions live in
[`release/security-audit-policy.json`](../../release/security-audit-policy.json).
An exception must match the package manager source, advisory ID, module, and
severity, state why the affected path is not active in SPS, and include an
expiry date. An expired exception fails the gate.

Moderate path reviews use the same exact source, advisory, module, severity,
reason, and expiry contract. They do not waive a blocking severity and must be
removed when the advisory disappears.

## Current Exception

React Router advisory `1124282` affects React Server Components mode. SPS uses
React Router as a browser SPA and does not enable RSC. The exception expires on
2026-09-30 so the React Router 8 migration must be reassessed before then.

## Current Moderate Reviews

- `esbuild` `1102341` is an old transitive build-tool path; SPS does not expose
  its development server.
- `@anthropic-ai/sdk` `1119428` concerns the SDK filesystem Memory Tool, which
  SPS does not configure. Claude remains behind ACP and SPS Source grants.
- `@hono/node-server` `1124006` is transitive through the MCP SDK. SPS MCP
  servers use stdio and the connector is an HTTP client; SPS does not invoke
  Hono static-file serving on Windows.

All three reviews expire on 2026-09-30 and require dependency-path
reverification before renewal.

## CI Access

`SPS-Source` Actions need `SPS_SOURCE_READ_TOKEN` to check out the private
`SPS-Core` submodule. The current secret restores verification. Before a wider
beta, replace it with a fine-grained token limited to read-only Contents access
for the required private repositories.
