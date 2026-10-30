# Pinned Historical Core Schema Upgrade And Backup Recovery

Date: 2026-10-30. Development fixture evidence, not installed-byte or Stable proof.

## Verified Input

The withdrawn Desktop 0.4.86 manifest names Core
`95665eb49996cd0e9c13e2da817326dfffe0f2a3`. That Git commit is available from
the private Core repository. Its PostgreSQL/Drizzle v7 journal contains 157
entries, ending at `0158_sps_plugin_artifacts` (indices are not contiguous).
Current pinned Core `01fe9b16162fb8f6c0023e5efda30c1189094f10` has 176
entries ending at `0177_sps_plugin_package_operations`.

The parent inspected the original Git objects: old SQL files are unchanged;
19 migration SQL files and journal entries were added. Reconstructing the
historical journal with the first 157 current entries reproduces the exact
original journal bytes and SHA-256:

`b4f499190694a372442c8ff3c86e78adabafa733e67b7799ebe0db8d9ad4ab0b`.

The ordered SQL input pin is:

`b89987692343bdea3ab476ea2298782836916b0675c33bf583270abd61f9838f`.

For each journal entry, the verifier decodes strict UTF-8, canonicalizes CRLF to
LF, hashes the SQL text and hashes `filename + NUL + text-sha256 + LF` in journal
order. It validates the complete prefix before exclusively creating its owned
staging directory. Files are limited to 2 MiB each and 16 MiB total; links and
changed input pins are rejected. Only SQL and the old journal are staged, not
the current schema or an executable old application.

This source input does not repair the withdrawn release's dirty provenance or
unsigned status. Its bundled SQL may have had packaging-time changes not present
in the named commit. The claim is explicitly about the pinned historical source
schema, not an arbitrary existing or actual withdrawn installation's database.

## Real Database Acceptance

`smoke-historical-core-migration.mjs` uses the existing owned embedded PostgreSQL
fixture and a new empty sibling database. The cluster's control database may be
current, but the historical test database starts empty and receives **only** the
157 pinned historical migrations through the installed Drizzle migrator. A
current table's absence and exact journal count are asserted before seeding.

The fixture seeds 12 rows: two Workspaces, two projects, two technical memberships,
one disabled inert plugin, two separately scoped plugin-state values, and inert
user/session/provider-account records. JSON, Unicode, timestamps and fake token
strings are included. No real credentials or plugin worker is used. The complete
set of each old table's columns for these rows is captured before upgrading;
new additive columns are not falsely compared to old nonexistent columns.

The test then:

1. Creates an actual JavaScript-engine pre-upgrade database backup.
2. Requires exactly 19 pending current migrations and applies the actual current
   migration service. It verifies current schema/history and every old-column
   value in all 12 rows.
3. Applies migrations again, requiring unchanged history and data.
4. Restores the pre-upgrade backup into another empty sibling database with the
   real JavaScript restore fallback. The historical journal, rows and absent
   current table must match before any new migration is applied.
5. Upgrades that restored historical database and verifies the same data and
   final migration history again.
6. Ends every DB client, invokes the existing owned-postmaster cleanup, and only
   then removes the identity-checked temporary SQL/backup directory.

The complete local command returned an independently observed exit 0:

```powershell
node scripts/smoke-historical-core-migration.mjs
```

The final output named the exact historical commit, journal/SQL hashes, 157 old
migrations, 19 added migrations, 12 verified records and all five completion
phases. A first attempt failed in fixture seeding: Drizzle modifies its client's
JSON serializers. The correction uses an independent raw Postgres.js client for
fixture rows; the migration and database code are unchanged. Another intermediate
run omitted the historical commit from output due a fixture-field mismatch; it
is not the final provenance record. The final rerun asserted and emitted that
field, checked the new table, and exited 0 after confirmed fixture cleanup.

## CI And Limitations

The Windows workflow now includes `historical-core-migration` through the same
hosted-only reduced-token launcher and owned OS Job as the other source tests.
The script accepts no external database/path arguments. Delegated mode requires
the hosted-Windows context and returns pending exit 76 only after its own DB and
temporary-file cleanup; CI success additionally requires externally observed
natural Job emptiness. No timeout/cleanup failure becomes a skipped pass.

The new final-HEAD CI step is pending. Local execution proves a pinned old-source
schema upgrade and recoverable pre-upgrade backup, not old installed Main launch,
an installer downgrade, in-place schema downgrade, automatic application rollback,
fresh-Host account re-enrollment, production Identity, signing or two computers.
The existing actual Main fresh-Host restore and v11 Desktop DPAPI acceptance are
separate evidence; no one check substitutes for all of them.

Existing Core migration/COPY-restore/post-restore-sanitizer tests were also rerun:
three files and 27 tests passed with real temporary PostgreSQL, no skips. Those
current-schema tests do not substitute for this pinned historical schema flow.

The input/flow/Windows-launcher checks passed 27/27, including changed-input,
CRLF, malformed UTF-8, oversized input, existing-stage preservation, unowned
delegation and external-DB argument rejection. The final Desktop suite passed
1600/1602 with two environment skips and zero failures. A preceding run caught
the database-only command's incorrect Electron-suite prefix; it now uses
`test:db:historical-core-migration`. The Electron dependency-sync contract is
unchanged. YAML parsing and `git diff --check` passed. None of these unit checks
substitutes for the new hosted database step's external Job confirmation.

References: [Drizzle migrations](https://orm.drizzle.team/docs/migrations),
[pinned historical journal](https://github.com/Powerpunch777/SPS-Core/blob/95665eb49996cd0e9c13e2da817326dfffe0f2a3/packages/db/src/migrations/meta/_journal.json).
