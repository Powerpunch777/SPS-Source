# Core backup COPY restore fallback

## Confirmed failure

A disposable, migrated SPS database was backed up with the default `auto` engine, exported with Desktop's Owner Vault transfer helper, imported into a fresh Vault and restored by the real Desktop restore CLI under Windows Job ownership. Backup/export/import succeeded. Restore failed on `COPY "drizzle"."__drizzle_migrations" ... FROM stdin` with a syntax error near the first data value. The failed Vault and original transfer were preserved.

When external `pg_dump` is unavailable, the existing automatic backup writer can produce PostgreSQL COPY text blocks. If `psql` is also unavailable, the old JavaScript restore fallback submitted these blocks, including their data, as ordinary SQL. Earlier selected backup tests explicitly requested the `javascript` backup engine, which emits INSERT statements, so they did not exercise this default-engine boundary.

## Correction

Core's restore reader recognizes the COPY text blocks emitted by the existing SPS writer. It consumes rows until the explicit `\.` terminator, keeping SQL statement-breakpoint text inside COPY rows as data. It decodes PostgreSQL text escapes, distinguishes null from a literal `\N`, and restores through parameterized INSERT batches. The backup format, backup-engine selection, existing external-tool path and SDK contracts are unchanged.

Batches are bounded by the existing 100-row/1-MiB buffering limits and PostgreSQL's 65535 bind-parameter limit. Individual large rows still require their own row-sized memory. Values are bound as PostgreSQL UNKNOWNOID (705): the server determines the destination column type while the JavaScript client's inferred JSON, bytea, boolean and date serializers do not encode already-formatted COPY text a second time. Row values never become SQL text.

An unterminated COPY block or inconsistent field count is rejected. Invalid typed values are rejected by PostgreSQL. Transactional SPS archives retain rollback behavior when the restore connection closes after a failure; a failure does not authorize Vault promotion.

## Focused verification

From `external/sps-core`:

```powershell
pnpm exec vitest run packages/db/src/backup-copy-restore.test.ts packages/db/src/backup-lib.test.ts --testNamePattern 'COPY data|legacy public-only backups' --maxWorkers=1
pnpm --filter @paperclipai/db run build
```

The COPY regression forces both external tools to an absent path and uses real PostgreSQL. It compares 128 rows, binary data, JSON objects, arrays, booleans, precise numerics, date/time infinity, Unicode, escaped control characters, empty strings, nulls and migration history. A single-column row equal to the SQL delimiter must survive. Negative archives check truncation after a full batch, invalid integer input and inconsistent fields, including transactional rollback. Another archive checks octal/hex UTF-8 escapes.

The existing legacy test's full database fixture is prepared in a bounded 60-second `beforeEach`; its actual restore/assertion body retains the existing 20-second limit and all previous assertions. This separates fixture startup from the restoration check; it does not prove the previous combined fixture-plus-restore path finishes within 20 seconds. The prior local combined-deadline failure remains a failed observation.

These checks do not alone qualify authenticated export API behavior, Main's complete promotion/account flow, normal Host startup, previous-version application migration, production credentials or a newly installed final package. Current CI and separate Desktop runtime evidence are still required.

## Primary references

- [PostgreSQL COPY text format](https://www.postgresql.org/docs/current/sql-copy.html): field escaping, null handling, data terminator and encoding.
- [PostgreSQL parameter inference](https://github.com/postgres/postgres/blob/REL_18_STABLE/src/backend/parser/parse_param.c): UNKNOWNOID parameter coercion to the destination type.
- [Postgres.js COPY streams](https://github.com/porsager/postgres#copy-tofrom-as-streams): the distinction between COPY protocol streams and ordinary queries. No new dependency or upstream implementation was copied.
