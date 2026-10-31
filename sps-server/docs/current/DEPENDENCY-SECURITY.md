# SPS Dependency Security Gates

> This file is generated from [`release/security-audit-policy.json`](../../release/security-audit-policy.json). Do not edit it manually.

## Audit Scope

SPS runs two fail-closed dependency checks:

- `npm run audit:release` uses `npm audit --omit=dev` for Desktop and `pnpm audit --prod` for Core, auditing dependencies classified as production dependencies.
- `npm run audit:development` audits the complete Desktop and Core dependency graphs, including development and build tooling and the shipped Electron runtime.

Desktop declares Electron as a `devDependency` for packaging, so the production audit omits it and the full-graph audit covers it. Electron is shipped to users; findings in its runtime must not be dismissed solely because of its `devDependency` classification.

Both checks reject command failures, malformed audit output, every unapproved `critical` or `high` advisory, every unreviewed or expired `moderate` advisory, and every policy entry that no longer matches an active advisory. Low findings remain visible in the audit output but do not block the build.

Policy entries may be restricted to an audit scope. A `full`-only build-tool review never authorizes a finding in the `production` audit. Expired or stale entries in the selected scope fail the gate.

Any critical/high result is scoped to the named audit. A clean result for one scope must not be shortened to "no vulnerabilities found."

## Current Critical/High Exceptions

None.

## Current Moderate Reviews

- `core:minimatch` advisory `1244012` (moderate)
  - Reviewed: `2026-10-31`; expires: `2026-11-07`
  - Audit scopes: `production`, `full`
  - Reason: GHSA-g3hv-75wg-m249 path review: the remaining Core finding in both scopes is minimatch 3.1.5, only through optional sqlite3/node-gyp/glob7 and without the affected level-2 preprocessing implementation. The affected Storybook docgen/glob13/minimatch10 path was replaced by a consumer-scoped glob14.0.3/minimatch11.0.3 override, not a blanket legacy matcher override. Re-review the exact lockfile snapshot and consuming options before the one-week deadline; see docs/reviews/MINIMATCH-PATH-REVIEW-2026-10-31.md.
- `desktop:minimatch` advisory `1244012` (moderate)
  - Reviewed: `2026-10-31`; expires: `2026-11-07`
  - Audit scopes: `full`
  - Reason: GHSA-g3hv-75wg-m249 build-only path review: electron-builder 26.17.0/app-builder-lib uses minimatch 10.2.6 with fixed dot:true options (default optimization level1, not the affected level2); older 3/5 implementations lack that preprocessing, and the macOS9 consumer does not request level2. Patterns come from the trusted SPS build configuration, not remote or restored plugin requests. No affected dependency is declared fixed. A major11 override removes APIs required by existing builders. Re-review the exact lockfile and build options before the one-week deadline; see docs/reviews/MINIMATCH-PATH-REVIEW-2026-10-31.md.

## CI Contract

Verification, pilot, beta, and Stable workflows run both audit scopes and check this generated document; release workflows run these gates before packaging. A dependency update that changes the policy or active finding set must update the policy, regenerate this document, and pass both gates.

`SPS-Source` Actions need `SPS_SOURCE_READ_TOKEN` to check out the private `SPS-Core` submodule. Before a wider beta, use a fine-grained token limited to read-only Contents access for the required private repositories.
