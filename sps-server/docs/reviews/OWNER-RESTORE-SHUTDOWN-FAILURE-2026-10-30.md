# Restore failure must retain data and report shutdown errors

The Owner Host restore CLI previously swallowed `instance.stop()` rejection.
A restore whose database shutdown failed therefore exited0. If both restoration
and shutdown failed, only the restoration error survived. The Main failure path
also recursively removed its staging tree, which could still belong to an
unconfirmed database process.

The CLI now returns success only after the restore/sanitization sequence and
the database stop operation succeed. A single restore error remains visible;
simultaneous restore and stop errors are retained in an AggregateError. Stop
errors alone are failures. Main preserves staged data on failure, retains the
original reason/cause and never promotes the failed restore. Existing account
continuity, fresh-vault and post-promotion preservation checks remain unchanged.

An actual CLI probe with inert database/Postgres modules reproduced exit0 on a
rejected stop. The new CLI fault tests initially failed exactly the stop-error
and dual-failure cases after correcting the test's own event-log escaping.
After the fix, all four subprocess cases and six Main-flow cases passed10/10
without skips. These CLI tests execute the actual helper but inject inert
database modules; Main-flow tests use the existing VM fixture. They are not a
real database export/restore end-to-end or physical process-tree qualification.

The restore subprocess is still started through its existing Main launcher.
Exact owned-tree supervision, recovery of a Desktop lost during restore, and
graceful stop failure/retry with real PostgreSQL remain separate incomplete
work. Preserving staging does not claim those guarantees. Retained staging
requires explicit recovery ownership; no age-based removal sweep is added.

This corrects a Core/Desktop recovery defect. It adds no Native, Marketplace,
Builder or solution-plugin feature, changes no data format and lowers no
existing security, account or release requirement.
