# Approved plugin upgrade recovery — 2026-10-29

Status: implementation verified by selected lifecycle/database tests, server
types and compatibility boundary checks. Candidate Core is
`2f467b0a6455cf0feab4786c3c46e4d1bd410dd8`; its Source gitlink, support matrix
and generated candidate document are aligned. New candidate CI is pending. This is not Core completion
or a qualification of an installed Desktop build.

## Resulting behavior

Core stores old and candidate package snapshots before tearing down the old
runtime on the approved-upgrade path. Ordered durable phases identify pointer
replacement and activation entry. A safe rollback decision is persisted before
restoring old metadata; lost completion responses quarantine the current runtime
instead of triggering another rollback. Existing process-close, Workspace and
permission fences remain mandatory.

Startup rereads each intent inside its mutation fence. It can restore the old
metadata when safe; normal startup subsequently validates/loads that package.
An entered activation with possible database changes instead preserves the
candidate in error for a fresh authorized Host review. Recovery never downgrades
an uncertain schema, replays recorded approval or restores a whole Host backup
automatically. Changed identity or unconfirmed cleanup retains intent/artifacts.

The journal uses the existing0177 table and remains Host-private. Its temporary
operation context expires for late asynchronous continuations. Workspace workers
check admission independently, including cached workers. No SDK contract, Native,
public Marketplace, Builder implementation or OS isolation is added.

## Actual evidence

- Upgrade recovery14, existing upgrade safety17 and cleanup3:34/34 passed.
- Real PostgreSQL13 and existing removal recovery11:24/24 passed, without skips,
  including reconnect durability, phase/context rules and owned fixture cleanup.
- Workspace worker21/21 passed.
- Final server typecheck and SPS compatibility boundary check passed.
- The initial concurrent PostgreSQL run timed out during90second setup; all13
  bodies were skipped. The serialized rerun passed with unchanged setup,
  assertion and30second cleanup limits. The failed run is not counted as a pass.
- Previous Source4b84e5a/Core d9ac43c9 push CI40846641804 passed18/18. That is
  baseline evidence and predates this increment; new candidate CI is required.

## Required remaining work

Installation-stage recovery, the capability-approval-pending upgrade branch,
artifact retirement, runtime-cache interruption recovery and current packaged
Desktop/installer data preservation still require separate work and evidence.
Old runtime archives do not qualify the current code. Physical Host/Member/Runner
validation remains a release requirement, even while one-computer work proceeds.

Stop before any new solution-plugin or Plugin Builder development.
