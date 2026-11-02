# Historical Core Backup Through Actual Main Restore

Date: 2026-10-30. Source-level fresh-Host compatibility, not installed update proof.

## Scope

The separate historical database scenario proves pinned SQL upgrade and backup
recovery. The original Main transfer scenario exports a current database and
restores it into a fresh Host. Neither alone proves current Desktop Main can
restore an old-schema backup, sanitize it, activate/migrate the Host and reopen
its data. This acceptance connects those production paths without executing the
withdrawn old app or touching an installed user profile.

## Fixture And Real App Flow

The bounded helper accepts an existing identity-checked temporary fixture and
an export destination strictly inside it. It creates an empty sibling database
in the existing owned embedded PostgreSQL fixture, applies only the verified
157-migration historical prefix and asserts a later table is absent. The input
Core commit is `95665eb49996cd0e9c13e2da817326dfffe0f2a3`; canonical journal
and ordered SQL hashes are the same as the separately qualified historical
schema fixture.

It seeds two Workspaces, two projects with Unicode description/environment
values and historical timestamps, plus technical operator membership for the
existing mock Identity subject in both Workspaces. There are no Agents, real
credentials, external runtimes or executing plugins. The actual JavaScript
backup service writes inside a fixture Vault; the unchanged production exporter
copies it and an inert storage attachment into its normal transfer format.
All SQL clients and the owned PostgreSQL cluster close before returning the
bundle. No backup bytes are rewritten or fake migration history inserted.

Current isolated Electron then signs in through the existing RSA/state/PKCE
fixture, verifies it has no Host connection, and invokes real
`window.spsDesktop.restoreOwnerServer()` with the existing native-folder dialog
fixture. The normal Main/restore-child/sanitizer/Host-activation path performs
the restore. Current Workspace APIs must return both historical projects and
the exact Unicode description; the restored storage file must match its bytes.

A read-only assertion first checks the target fixture identity/config, connects
only to its configured loopback database, and requires PostgreSQL's actual
`data_directory` to resolve to that target Vault. It then requires all 176
current migration entries and the new package-operations table. Main is stopped
normally and reopened with the same profile/account. Both project rows, the
attachment, and the complete current migration history must remain unchanged.

## Evidence

The parent independently observed ordinary caller exit 0:

```powershell
node scripts/smoke-owner-vault-transfer-desktop.mjs --historical-core-backup
```

The final JSON includes the exact historical Core/journal/SQL pins, 157 old
migrations, 176 current migrations, actual Main restore/activation, both
Workspace project checks, file preservation and restart. Normal Main exit,
output EOF, fixture-process absence and identity-checked temporary cleanup were
required. An earlier run passed the same UI/data flow before the additional
read-only current-history assertion; it is not substituted for the final run.

The hosted Windows workflow requires a separate
`owner-vault-historical-core` step through the existing reduced-token native
launcher and owned Job. It retains the hosted-only preconditions, 20-minute
step/18-minute child bounds and pending exit 76 that only the external owner can
accept after natural Job emptiness. The Main harness now flushes its evidence
before explicit pending exit, because this mode imports the same embedded
PostgreSQL vendor hook that otherwise overrides `process.exitCode`.

The initial helper-specific check exercised real PostgreSQL and export
byte-parity in about 16 seconds. That expensive check is not in the broad
Desktop unit glob: the integrated Main scenario provides the real-DB evidence,
while ordinary helper tests reject external paths and assert the fixed flow.
The final full Desktop run after the read-only history assertion passed
1,623/1,625, two environment skips, zero failures. Final committed-HEAD hosted
integration evidence remains separately required.

## Explicit Limits

This is a backup generated from the exact pinned old source schema using the
current backup engine, not proven bytes from an arbitrary old installed app or
its database. It is a **fresh-Host restore**, not an in-place update/default
profile migration, SQL downgrade or automatic application rollback. The old
release had dirty/unsigned provenance and is not promoted to a trusted Stable
predecessor. Production Identity, final signed installer byte parity and two
physical computers remain separate release gates.
