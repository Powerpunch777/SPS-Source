# Authentication dependency security follow-up

Status: scoped security correction; engine cleanup remains unqualified. Baseline Source is
`cbcb86110e37d113e9ebff837d6eff3b4112a4ba`, Core
`2071d2f090c7740f4180a2612434185400ddfcf0`. This record does not clear release
security policy or authorize an installed application change.

Integrated Core commits: `4acb1c56` (auth dependency/Origin/CSRF correction) and
`2608fdfe0056dad40f667eacdfd9a950a2dda014` (bounded DB diagnostics). Desktop
remains0.4.137 development-candidate, SDK remains607b48a4edaed1db7132a01719431ffce5852964
(0.11.0, unreleased), Native default off and Tailscale supported. No release
qualification is inferred from the candidate pin.
Source candidate document generation/check and its four tests passed with this
Core pin; the Native smoke harness passed syntax and targeted whitespace checks.

## Authoritative failure

Source CI40612266790 compatibility job122566411174 failed the production
dependency gate. It reported 10 advisories and four critical/high findings:
Zod1243066, Better Auth1243435/1243466/1243467, plus an unreviewed moderate
qs1243452. Therefore the previous known Zod hold is not the only current gate
failure. The installed production versions were Better Auth1.6.22 and qs6.16.0.

A separate read of four open default-branch critical Dependabot alerts found
that this candidate already resolves their Storybook/DOMPurify/proxy-addr
packages to patched versions. Those alert records do not represent a complete
audit of the current candidate: the new production audit above is independent
and still fails.

## Intended correction and compatibility

- Upgrade direct Better Auth importers and matching release-family packages to
  1.7.7, within the existing major version. Upgrade qs override to 6.16.1.
- Preserve unrelated dependency overrides, the canonical lockfile, current
  cookie prefix/secure-cookie/origin contracts and Core auth schema.
- The current Core auth composition enables email/password and optional Google
  social sign-in. It does not enable device authorization, Magic Link or OAuth
  Proxy; their absence does not waive the vulnerable dependency policy.
- The official 1.7.7 advisory requires a coordinated upgrade for participants
  sharing verification storage and restarting pending OAuth/SAML/Magic Link
  flows. It states that the purpose-prefix fix needs no user/account or database
  schema migration. This source change performs no installed deployment or
  real-account action; existing-session compatibility still needs its own test.
- The user's Zod major-migration hold remains. No exception/review is added to
  security policy, and full security clearance is not claimed.

Primary references:
[Better Auth critical advisory](https://github.com/better-auth/better-auth/security/advisories/GHSA-965c-763c-88jm),
[OAuth Proxy advisory](https://github.com/better-auth/better-auth/security/advisories/GHSA-r4xp-prcw-77qf),
[device authorization advisory](https://github.com/better-auth/better-auth/security/advisories/GHSA-q84f-53jg-9ppm),
[1.7.7 release](https://github.com/better-auth/better-auth/releases/tag/v1.7.7),
[qs advisory](https://github.com/advisories/GHSA-6pq8-jhm2-2vcw).

## Focused verification boundary

The scripts-disabled scoped install passed (session9811 exit0), and frozen
lockfile-only verification passed (session4962 exit0). Only the intended auth/qs
dependency graph changed; the existing tsx4.22.4 peer was preserved where valid.
Server typecheck82361 and DB typecheck92799 exited0. Their pnpm exec wrappers
also automatically materialized dependencies and ran the existing dev-SDK link
postinstall, with several CLI-bin ENOENT warnings. Subsequent focused tests use
the installed Node entrypoint directly to avoid that implicit installation.

Production security audit92335 exited1: three findings remain, only one
critical/high. Better Auth and qs findings are absent; Zod1243066 remains the
unwaived high blocker, with low @tootallnate/once1119438 and KaTeX1241206 reported.
Policy was not changed. Log: `sps-production-auth-security-audit-2026-10-28.log`
in the task's outer work directory. This is an improvement, not a green gate.

Initial focused run80688 exited1: 25 cases passed, one Google-config dynamic-import
case exceeded its5s budget, and both new engine cases were skipped because their
beforeAll20s and afterAll40s hooks timed out. This is not engine compatibility
proof or confirmed fixture cleanup. The new fixture now uses the existing
companies-service Windows180s/non-Windows45s startup pattern, joins its exact
startup promise, ends the DB client and invokes owned cleanup in finally. No
product deadline or assertion changed.

Run68430 exited1: Google config2/2 and the HTTPS Express engine case passed,
while the direct engine case failed its untrusted-origin expectation (200 instead
of403); that run's fixture cleanup completed. Better Auth sets `skipOriginCheck`
true under its test environment unless explicitly configured. Core now explicitly
sets `disableOriginCheck:false` and `disableCSRFCheck:false`: production defaults
are preserved, and test-environment detection cannot bypass Core's trust boundary.
Cookie-options expectations were updated accordingly.

Final run19375 exited1 with17/17 assertions passed (both actual-engine cases and
15 cookie cases), but afterAll failed its existing pg_ctl20s shutdown bound. The
child was not confirmed closed and the fixture was preserved. This proves the
listed assertions, not a passing engine suite or cleanup. Final server
typecheck3407 exited0 after the explicit check settings. No whole local suite,
real account, Electron acceptance or installed upgrade is implied.

Static cached-source comparison of1.6.22 and1.7.7 found identical basic DB schema,
password helper, token generation and session-cookie signing operations. This
supports compatibility but does not replace a runtime session test. OAuth state
identifier prefixes differ as described above.

The failed first setup retained `sps-better-auth-engine-AeeV8d`; the final shutdown
failure retained `sps-better-auth-engine-q3iX8J`. Subsequent read-only inventory
found their recorded processes absent, but original directory identities were
only in the terminated test workers' memory. Neither directory was adopted for
cleanup. Later absence is not evidence of timely graceful shutdown. The helper
already verifies owned pid-file identity and paired pg_ctl selection; static
review found no additional auth DB pool or alternate binary to explain delay.
Only fixed server shutdown phase markers will be retained for a future failure;
the existing stop mode/deadlines and failure preservation remain unchanged.

## Windows Native database observation

The same Source CI's Desktop job122566411539 reached the required SDK gate and
reported `embedded Postgres postgres_start failed (process_exited_before_ready)`.
Initialization completed; the owned server child closed before vendor readiness.
SDK/Electron work was not reached. The vendor drops the child terminal reason.
The diagnostic refinement retains only a bounded exit code or generic
signal marker from that exact child before cleanup; documented Windows loader
statuses may map to `binary_unavailable`. No raw process object, stderr, path,
credential, unknown signal string, retry, skip or timeout expansion is allowed.
The underlying startup cause remains unproven. Fixed shutdown-phase diagnostics
also observe the existing server log callback without exposing its bounded
private tail. The new diagnostics do not establish successful shutdown or relax
the existing deadline. Initial fixture-free checks passed27, then28 after phase
coverage. Final focused28/28 also includes the regression that an ordinary
checkpoint completion before shutdown cannot advance the shutdown phase. DB
typecheck initially found a nullable getter closure; passing the captured
optional getter fixes that without weakening types. Final DB typecheck47768
exited0 with no diagnostics. No actual PG repeat was added after the diagnostic
refinement; the observed startup and shutdown causes remain unresolved.

## Later exact-head CI observation

Sourceb8d197ffa1cafdef76babf4260de670bd79e1b99 with Core9e0516a1 was
observed in both automatic CI runs: push40626693162 and PR40626697872,
both completed failure. Windows jobs122613194383 and122613212155 failed
the Native public SDK step at `postgres_start`,
`process_exited_before_ready`, `child_exit=1`, before SDK/Electron assertions.
The sanitized logs contain no concrete PostgreSQL cause. The installed
embedded-postgres18.1.0-beta.16 forwards stderr chunks to onLog, then rejects
start without an error value on child close; its close listener is attached
synchronously. No missed-close race, DLL, port or permission cause was proven.
Compatibility also remains blocked by the existing unwaived Zod High.

No manual CI rerun or actual local PostgreSQL retry was started for this
observation. A separate Host API invalid-invocation correction passed52
fixture-free SDK cases and the SDK package typecheck; it does not resolve this
database startup failure or establish per-Workspace process isolation.

## Bounded SQLSTATE observation for a future startup failure

The test fixture now supplies `-c log_error_verbosity=verbose` through the
installed package's existing `postgresFlags` option. PostgreSQL18 documents that
[verbose errors include SQLSTATE](https://www.postgresql.org/docs/18/runtime-config-logging.html#GUC-LOG-ERROR-VERBOSITY).
This changes test fixtures only, not installed Host database configuration.

The observer inspects at most a16384-character chunk suffix, carries at most512
characters across chunks and retains only one of19 fixed startup-related
[PostgreSQL18 error codes](https://www.postgresql.org/docs/18/errcodes-appendix.html)
after a FATAL/PANIC header. It resets immediately before postgres_start. A failed
start snapshots its code before cleanup; successful probes, other stages and
unknown/malformed codes expose none. The shared failure formatter preserves the
existing stage/category, bounded child_exit and child_signaled markers and generic
fallback; the Native support assertion now consumes that formatter. No raw
message, path, credential or arbitrary five-character value is emitted.

The existing actual-fixture error templates gain only an optional allowlisted
SQLSTATE suffix. Probe cleanup aggregate errors still use their legacy safe
reason, so a probe whose cleanup also fails can omit the code. A pre-Postgres
loader exit, unknown code or oversized/truncated header can also stay generic.
An observed code is diagnostic evidence, not proof of the full startup cause.

The final fixture-free cleanup/diagnostic file passed31/31 and DB package
typecheck exited0. Parser/formatter cases cover split chunks, bounds, malformed
and unknown codes, stale metadata on success, other stages and fixed-output
privacy. Native smoke syntax passed. There was no actual PostgreSQL retry,
deadline increase, stop-mode change, failure skip, manual CI rerun or adoption of
retained fixtures. The previously observed Windows failure remains unresolved
until the new diagnostics are exercised by the actual failing environment.
