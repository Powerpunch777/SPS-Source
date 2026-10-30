# Workspace Plugin CI follow-up — 2026-10-28

Parent tuple: Source `aed1cf457268200cf5f2cd3c082ecde9c348e147`, Core
`80f936c8a0fe99356037ae1c4e9a37e27d8afe7e`, SDK
`61a929f6c783f78e5af603682de1543c7e24abc0` (unreleased0.11.0).
Automatic push40639854350 and PR40639861049 both completed failure.
No manual rerun or whole local suite was used for this follow-up.

Follow-up Core commit: `7c8b87ab7bb6ed744b16b8f6dd6611949084aeae`.
The SDK pin is unchanged. This tuple's automatic checks are separate from the
parent-head results below; no new-head CI pass is claimed.

## Verified parent-head CI

The PR's full Core Linux typecheck/build job122655240881 passed. Server shards
1/3,2/3,3/3, serialized shards1/4,2/4,3/4, Workspaces B, Room workplane,
bundled plugins, Plugin Kit/Registry and Identity contracts on Node22/24/26
also passed. These do not erase the following failures:

- Workspaces A: push122655217200 and PR122655241036 failed ten existing
  `PluginSettings.test.tsx` cases. New UI read `entrypoints.workspaceWorker`
  directly although older metadata fixtures omit `entrypoints`. The failing PR
  shard reported342 passing files and one failing file (2729 passed/10 failed).
  Both UI checks now use optional chaining, retaining the previous behavior when
  the optional declaration is absent. The existing page and new component tests
  then passed17/17 across two files.
- Serialized4/4: push122655217266 and PR122655241114 failed the exact mounted-route
  inventory check because the new Workspace config route was unregistered. The
  other six cases in that file passed. The route inventory and OpenAPI operations
  now describe GET/PUT/DELETE, Host authority, revision concurrency, empty default,
  validation, and uncertain post-commit restart. Responses explicitly use
  `Cache-Control: no-store`, including errors. Config-route and OpenAPI tests
  passed12/12 across two files. The guard/coverage assertions were not removed.
- Compatibility: push122655217102 and PR122655240990 failed production audit
  with three advisories, one High: Zod1243066, no approved exception. The other
  two were low `@tootallnate/once`1119438 and KaTeX1241206. No new audit, policy
  exception or Zod major migration was attempted. The user's migration hold
  remains; the High continues to block release.

Four pre-existing direct compatibility imports in model UI/API and Workspace
execution routes now use the existing compatibility facades with exact matching
exports. The compatibility boundary checker passes. This does not resolve the
security gate that precedes it in CI.

## Windows evidence and ownership follow-up

Push Windows job122655217166 failed prepared Native Host source E2E at broad
`host_start`. Its final summary confirmed all three Main children exited
orderly, all six output streams ended, and final Main reported graceful exit0
without forced stop. The source acceptance now records four fixed sub-stages
for the existing click, Workspace target, empty UI and Agent check boundaries.
It retains all assertions/timeouts and emits no raw failure messages.

PR Windows job122655241224 passed earlier stages but failed the Native public
SDK smoke's temporary database support probe before SDK/Electron assertions.
The restricted-token report confirmed administrator disabled, reduced privileges
and same-user token. The failure changed to `postgres_start(other)` plus a
separate PID-file ownership mismatch during cleanup; the owned job was empty
naturally. This does not prove the previous token mismatch was the only cause.

The helper previously compared the PID-file directory lexically against the
canonical fixture directory. It now resolves an absolute recorded path and
requires that it identify the original canonical directory; Windows short/long
aliases can match, while foreign or unresolvable directories cannot. Existing
fixture device/inode/birth identity checks remain. Initial PID capture additionally
requires the actual spawned child PID; cleanup still requires the originally
captured PID/start time and exact port. No old fixture is adopted, and an invalid
PID record cannot authorize `pg_ctl` or recursive removal.

PID validation failures now use fixed allowlisted codes, exposed through the
safe support formatter even when cleanup also fails. This gives the next actual
run a concrete failure field without leaking directory names or raw database
logs. Alias mismatch is a plausible cause, not a proven explanation of the old
job's sanitized `other` result. Focused helper tests passed34/34 and DB package
incremental typecheck exited0; actual Windows success remains unproven.

## Migration coverage and release limits

An actual-PostgreSQL integration case was added to the existing Native runtime
test fixture for0173 config foreign/composite keys, revision rotation and ABA,
Workspace authority isolation, deletion, cascades and catalog rotation on
truncate. A written test is not proof of trigger execution; its actual run and
cleanup result must be recorded separately.

The coordinator requested that0173 case, but a delegated command mistakenly ran
`sps-native-enrollments-schema.test.ts` first. That run78556 exited1: seven tests
discovered, two static cases passed, five DB cases skipped because its30-second
setup hook timed out. Its Node process later exited naturally; no live PostgreSQL
or pg_ctl was observed, but cleanup was not proven and both fixture directories
were preserved. No second local PG run was launched. The0173 test remains unrun.
The enrollment fixture teardown was reviewed to retain/join its startup promise
before closing the client and database; this source correction is not runtime
cleanup evidence and does not increase the startup deadline.

Final server incremental TypeScript check54595 exited0 with no diagnostics.
The API check, UI check and helper checks are focused selections, not a full
regression pass. Neither the parent green full Linux build nor these local
checks qualify the new head's Windows/DB behavior.

No deadlines, failure gates, publication rules, Marketplace policy or Plugin
Builder architecture were relaxed. Native remains opt-in, Tailscale supported,
Desktop0.4.137 a development candidate. Physical LAN/recovery, protected OS
isolation, real optional provider execution, signed installed updates and exact
candidate deployment validation remain required. No release completion claim.
