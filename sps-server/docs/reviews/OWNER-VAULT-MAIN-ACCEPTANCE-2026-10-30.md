# Owner Vault Main transfer acceptance

Date: 2026-10-30. Scope: source Desktop on Windows, with isolated temporary
profiles and a loopback fixture Identity. This is not installed-byte, production
Google, physical Host/Member, or Stable release qualification.

## Baseline and changes

- Source parent: `d3777c155632f23349ac2243f3fc615cb8759643`.
- Core: `01fe9b16162fb8f6c0023e5efda30c1189094f10`.
- Public SDK: `61a929f6c783f78e5af603682de1543c7e24abc0`.
- Desktop: `0.4.137`, development candidate.
- This increment adds acceptance tooling, a shared fixture, tests, and this
  record. It does not change Main export/restore, Core, SDK, or installed data.
- The parent Source push run `41011334677` and PR run `41011340737` each passed
  18/18 jobs. Those results do not certify this later acceptance-tooling commit.

## Reproduction

From a checked-out Source with initialized submodules, install pinned SDK,
Desktop, and Core dependencies using their lockfiles. Build Core prerequisites
with `pnpm build` from `external/sps-core`. Then, from `sps-server/desktop`:

```powershell
npm run test:e2e:owner-vault-transfer
```

This source-only harness reuses Core's pinned `@playwright/test` Electron driver.
It starts the real Desktop entrypoint, uses the real preload/IPC handlers,
Core database backup and restore helper, promotion, activation, and restart.
Only native folder selection and informational dialogs are replaced in the
test process, following Playwright's documented Electron dialog-fixture API.
There is no additional test bridge in production code and no security
confirmation bypass.

Do not run dependency synchronization while this or another Desktop acceptance
is using the same checkout. Windows holds the running supervisor executable
open; `npm test`'s pretest synchronization can then fail partway with `EBUSY`.
Wait for Desktop cleanup before synchronizing. Independent read-only unit tests
can use `node --test` without that pretest hook.

## Observed successful run

The final command `node scripts/smoke-owner-vault-transfer-desktop.mjs` exited 0:

```text
[vault-transfer] source sign-in settled
[vault-transfer] Main export complete
[vault-transfer] fresh target sign-in settled
[vault-transfer] restored Host running; typed row and attachment preserved
[vault-transfer] restored Host restart complete
```

The source profile creates a project row using the authenticated Core API and
a fixture file within the included Vault storage directory. Main exports a
portable transfer. A separate fresh profile signs in, calls actual Main restore,
returns a running Owner Host with no retained attempt, and opens its Workspace.
The project ID/name and file bytes match. After normal Desktop quit and restart,
the same project's ID is still readable from the reopened Workspace.

All owned Main processes exited zero and both output streams reached EOF.
The harness also checked for remaining processes whose command lines contained
the fixture root before removing its identity-checked temporary directory.
This is not an independent whole-descendant Job attestation: descendants without
that command-line marker are not proven absent by the scan. The existing
Windows restore-runner tests separately exercise Job emptiness and cancellation.

Earlier harness attempts failed or needed intervention and are not counted as
passing runs: sign-in was observed before `pending` cleared, opening the
Workspace was omitted, dependency synchronization interfered with a restart,
and one restart tried to open the Workspace before Host readiness. The final
run waits for settled sign-in and running Host state without manual intervention.

## Related checks

- Core full `pnpm build`: exit 0; existing CSS/build warnings remain.
- Selected restore/receipt/attempt/activation tests: 67/67 passed after preparing
  and synchronizing the Windows supervisor.
- Shared Identity and Workspace harness checks: 6/6 passed.
- Full Desktop `node --test --test-reporter=dot test/*.test.mjs`: exit 0.
  The preceding full run caught a stale inline-fixture source assertion; it was
  updated to verify the imported fixture and its protocol contracts.
- `git diff --check`: passed.

## Still separate

- Abrupt crash during real Main promotion/activation and restart recovery.
- Previous Stable upgrade, real application-data migration, normal installed
  profile startup, OS updater/rollback, and final signed installer testing.
- Production Identity rollout and external account operation.
- Physical two-computer installation, Source/Runner operations, and revocation.
- Final required CI evidence for this new commit and independent review.

Builder remains a separate plugin design and delivery workflow. This acceptance
does not implement its roles, thread history, secret configuration, or ABI
mapping, and does not resume deferred Native development.
