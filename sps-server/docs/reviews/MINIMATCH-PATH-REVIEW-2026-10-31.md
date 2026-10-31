# Minimatch Preprocessing Path Review

Reviewed 2026-10-31; expires 2026-11-07. This is a temporary reviewed Moderate
finding, not a dependency patch, proof of zero risk or Stable qualification.

Exact Source04f1cda CI41151544581/job124388976612 failed its production audit
for newly visible npm advisory1244012. The earlier local two-Low production /
three-Low full-graph results are historical observations, not the current audit
set. The gate correctly rejected an unreviewed Moderate finding.

The [upstream advisory](https://github.com/isaacs/minimatch/security/advisories/GHSA-g3hv-75wg-m249)
describes amplification in level-2 first/second-phase preprocessing. Its fixed
release is11.0.1. The [11.x changelog](https://raw.githubusercontent.com/isaacs/minimatch/v11.0.3/changelog.md)
also removes makeRe/matchOne and changes Minimatch.set entries from RegExp to
Matcher objects. A blanket major-version override is not a compatible patch.

## Core Paths

- Production has3.1.5 only, through optional drizzle-orm/sqlite3/node-gyp/
  glob7/cacache/rimraf. Its implementation splits brace-expanded patterns and
  maps parse directly; it has no optimizationLevel, firstPhasePreProcess or
  secondPhasePreProcess methods. The registry range '<11.0.1' is broader than
  this specific implementation's trigger. SPS's database is PostgreSQL; no
  SQLite execution success or removal of that optional graph is claimed.
- The former full graph also had10.2.5 through @storybook/react-vite10.6.2 /
  @joshwooding/vite-plugin-react-docgen-typescript0.7.0 / glob13.0.6.
  glob13 explicitly requests optimizationLevel2, so **that code is affected**.
  The consuming docgen plugin passes trusted build include/exclude settings
  (default '**/*.tsx' / '**/*.stories.tsx') to globSync. SPS's Storybook config
  contains fixed checked-in stories and no request-to-pattern bridge. This is
  build-time exposure, not an assertion that minimatch10 is safe in general.
- That build path is now upgraded with a consumer-scoped override:
  `@joshwooding/vite-plugin-react-docgen-typescript>glob: 14.0.3`, resolving
  minimatch11.0.3. This also fixes the newly reported glob cancellation finding
  [GHSA-3g3m-2fjr-6pw4](https://github.com/isaacs/node-glob/security/advisories/GHSA-3g3m-2fjr-6pw4).
  It does not override glob7 or other legacy consumers. Docgen uses the public
  `globSync` API, not the internal matcher methods changed by glob14. Its ordinary
  include/exclude patterns and actual Storybook build require compatibility
  verification; successful dependency resolution alone is not that evidence.

## Desktop Paths

- electron-builder26.17.0/app-builder-lib compiles its configured file patterns
  using minimatch10.2.6 with the fixed options `{ dot: true }`; the implementation
  defaults to optimizationLevel1. The reviewed path does not enter the affected
  level2 preprocessing. Configured source patterns are trusted repository build
  settings, not strings supplied by SPS Registry packages or remote users.
- @electron/asar/glob7/dir-compare use3.1.5, filelist uses5.1.9; neither has this
  level2 implementation. @electron/universal uses9.0.9 with no level2 option in
  the inspected call sites, and is a macOS packaging consumer (Windows-first
  SPS). This does not exempt shipped Electron runtime findings generally.

## Bounds And Follow-Up

The policy adds no Critical/High exception. Desktop review is full-graph-only;
Core includes both scopes solely for the remaining legacy3 finding.
Both expire after one week, rather than accepting a long-lived waiver. General
expired/stale/scope checks remain unchanged. A repository test pins the reviewed
lockfile content hashes (LF-normalized), so dependency graph changes require a
new review rather than inheriting this evidence silently.

Re-evaluate upstream compatible backports or consuming-builder updates before
expiry. Do not globally upgrade3/5/9/10 to11: callable exports, RegExp sets and
makeRe consumers would change. Never compile an exponential attack payload in
the main app as a diagnostic. This review uses source inspection and ordinary
bounded patterns only, not a successful exploit or a patched-vulnerability claim.

## Verification

- Frozen Core install with pinned pnpm11.9.0 passed. Unrelated refreshed package
  deprecation metadata was excluded from the lockfile change.
- `node --test scripts/storybook-glob-compat.test.mjs`:2/2. It resolves the
  actual Storybook/docgen dependency, asserts glob14.0.3/minimatch11.0.3 and
  exercises ordinary nested TSX inclusion/stories exclusion in an owned fixture.
- `pnpm typecheck` and `pnpm build`: all30 workspaces passed locally.
- `pnpm build-storybook`: passed, with existing directive/sourcemap, generated
  CSS, missing static-font and chunk-size warnings. This is build compatibility,
  not visual or font-delivery qualification of the preview.
- Live production policy gate:3 findings,2Low and the reviewed Core Moderate.
  Full graph gate:5 findings,3Low and the reviewed Core/Desktop Moderates.
  Both have zero Critical/High and zero Critical/High exceptions. The complete
  graph includes Electron. The full gate was repeated using pnpm11.9.0.
- Policy/document/build-prerequisite focused selection:22/22. Full local
  Desktop:1680 total,1678 passed,two unavailable-8.3-alias skips,zero failures,
  `node --test --test-reporter=tap test/*.test.mjs`, exit0. Hosted final-HEAD
  Linux/Windows and actual installed-byte qualification remain required.
