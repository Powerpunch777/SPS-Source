# Workspace Plugin process integration — 2026-10-28

This increment introduces an opt-in Workspace-owned process lane and its Host
configuration UI. It advances the earlier worker-authority review; it does not
qualify SPS Core, Native LAN or Desktop for release. Core commit
`80f936c8a0fe99356037ae1c4e9a37e27d8afe7e` and SDK commit
`61a929f6c783f78e5af603682de1543c7e24abc0` were pushed to their existing draft
branches. The tuple is recorded in the generated `CURRENT-CANDIDATE.md`.

## Product behavior

An installed Plugin can declare `entrypoints.workspaceWorker` and an inline
`workspaceConfigSchema`. Core retains its legacy Host worker and global settings,
while the new entrypoint uses separate `(Workspace, Plugin)` processes and JSON
configuration. Missing configuration starts at `{}`, never a copy of Host config.
Invalid, unavailable or incompatible Workspace workers fail closed instead of
falling back to the shared Host worker.

Native and local Desktop UI data/actions use the same owned pool. Host settings
read/save/reset compare explicit configuration revisions. A conflict or uncertain
restart requires an explicit reload; the UI does not silently replay a save or
user action. A late save response from a previous Workspace cannot overwrite the
current Workspace draft, including an A → B → A selection change.

Core binds calls to current Plugin policy and Workspace execution epochs. Stop A
joins A's owned process/startup without stopping B or the legacy Host. Unconfirmed
close retains ownership and Host services and blocks replacement. The existing
pending Plugin count includes owned local workers and startup work. Cleanup can
be retried after an unconfirmed stop while admission remains closed.

New additive migration0173 stores runtime configs by Workspace and Plugin,
rotates config/policy revisions on changes, and preserves the old global rows.
Restore rotates config revisions. Config audit records omit values. Saved JSON
is not a credential store; secret-reference schemas and raw secret access remain
unavailable. An ordinary broker connection UUID is not a permission grant.

The subset of neutral SDK Host APIs retains capability and tenant checks.
Lifecycle publications reach the Core event bus through a publishing-only view;
disposal cannot clear Host or B's subscriptions. The lane does not expose generic
SQL/HTTP/raw secrets, event subscriptions, global jobs/tools or Host lifecycle
registration. It is a process/Host API ownership boundary under the same OS user,
not Windows filesystem, Vault or network isolation.

## Focused evidence

- Shared package output rebuilt successfully using the installed compiler.
- Four selected Core files passed40 tests: shared manifest validation, config
  service/routes, and actual Node subprocess lifecycle acceptance.
- The subprocess case used the actual manager and factory with mocked durable
  registry/config/policy records. It proved distinct Host/A/B PIDs and config,
  wrong-Workspace denial, stop-A/B-survives, fresh A after resume, stale config
  invalidation preserving the new worker, and joined process close before owned
  fixture removal. It was not an actual PostgreSQL policy/migration test.
- Public SDK manifest tests passed9/9. Shared/Core and public SDK reject unsafe
  Workspace entrypoints, secret-reference and async config schemas; legacy
  entrypoint validation remains unchanged.
- Lifecycle event delivery tests passed2/2, including shared observer delivery,
  preserved subscriptions after disposal, and foreign-provenance/unavailable-bus
  rejection. The first root test command selected a nonexistent project name and
  collected no tests; the corrected server-directory command passed.
- DB package incremental TypeScript check exited0.
  Snapshot comparison confirmed164 existing tables unchanged and exactly one
  added table (165 total); this does not validate live SQL trigger execution.
- Entity/Host adapter tests passed8/8 across two files after the tenant-query
  compatibility follow-up. They check actual generated SQL predicates and adapter
  delegation, not a live PostgreSQL database. Scoped entity lists bind company
  and logical scope; legacy Host queries retain their previous behavior. Targeted
  Inbox publication requires active membership in the owning Workspace.
- Server-only incremental TypeScript session44780 exited0 with no diagnostics.
  This precedes final local-route wiring and compatibility import cleanup, so a
  final check of those edits remains separate.
- Local UI routing/config and factory tests passed90/90 across four files. After
  adding revoked-membership Inbox coverage, that route file separately passed3/3.
  The route calls use injected callers; the earlier actual subprocess case proves
  manager/factory process separation. Neither substitutes for the actual DB smoke.
- UI focused tests passed7/7; final cache-backed UI TypeScript session62434
  exited0 with no diagnostics. Two earlier checker attempts were interrupted
  without completion and are not passes. Windows runner tests passed17/17.
- Integrated server TypeScript session88996 exited2: a restored Host-guard import
  had been read before its fix, the new route fixture had an invalid nullable
  actor field, and private entity query types lacked their scope selectors. The
  fixture/type declarations were repaired without widening public SDK contracts;
  final cached server check83366 exited0 with no diagnostics (cache updated
  14:43:21). No runtime/product behavior was weakened to satisfy the compiler.
- The compatibility boundary check still fails on four direct legacy imports in
  existing model UI/API and Workspace-execution routes. `git show HEAD` confirmed
  all four predate this increment. New scoped worker/config/UI imports use the
  explicit compatibility facades. This is not a passing full boundary gate.

Public SDK manifest/docs commit61a929f6c783f78e5af603682de1543c7e24abc0 was pushed
to the existing draft SDK PR6. The package remains unreleased0.11.0; the commit
does not publish npm bytes or qualify a new installed Desktop tuple.

The earlier manager focused failures and fixes remain in local checkpoint logs.
Do not add their failed totals to later passes or describe this as a green whole
suite. No new actual PostgreSQL, Electron, physical multi-PC, installed Desktop or
full local suite was run for these results.

## Windows CI context

On parent Source4c3b334/Core6c8a5a, automatic push40629890627 and
PR40629899126 failed; Windows job122623568605 stopped during Native SDK database
startup before SDK/Electron assertions. No allowlisted SQLSTATE was found. The
installed embedded-postgres package already converts buffered logs to strings,
so a Buffer callback mismatch was ruled out.

The Native SDK step previously ran outside the restricted Windows runner used
by neighboring Native stages. It now uses a dedicated `native-plugin-sdk` runner
mode with the same owned job, restricted token, fixed script/arguments, process
empty confirmation and existing failure semantics.17 fixture-free runner cases
passed, including helper compilation. This aligns the execution context; it does
not prove an administrative token caused the old startup failure or that the
new actual Windows smoke passes. No manual CI rerun was requested.

## Remaining qualification

Migration0172/0173 behavior and full product composition still require actual DB
and exact-tuple Windows CI evidence. Physical Host/Member/Node LAN, credential
renewal and recovery, protected process/CLI isolation, real optional AI backends,
signed install/update/data-preserving rollback/restore and production Identity
remain open. Existing Zod High is unwaived; its major migration remains on user
hold. Existing UI token debt is unchanged. Native stays opt-in; Tailscale remains
supported. Marketplace policy and Plugin Builder restructuring remain excluded.

See Core's `doc/SPS-WORKSPACE-PLUGIN-WORKERS.md` for the implemented ownership,
compatibility and additive-table rollback contract. No merge, release, npm
publication, installed-app, firewall, OS trust or customer-data change is implied.
