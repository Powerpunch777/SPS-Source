# Portable Vault export sensitivity

Date: 2026-10-30. Code-only review; no real account, key, or user database was
opened. This record concerns a server-data transfer bundle, not a plugin
installation package.

## Finding

Desktop Main requests `/instance/database-backups`. The protected Core route
invokes its regular database backup service. That invocation does not supply
`excludeTables` or `nullifyColumns`. `exportSpsOwnerVaultTransfer` copies the
resulting SQL gzip bytes into the transfer bundle without redacting them.

The bundle excludes the separate Vault `secrets` path, local Desktop sign-in
storage, Memory sidecar token/configuration, logs, and live database files.
These filesystem exclusions do not remove values stored inside database rows.
Depending on actual data, the snapshot can contain credential or key columns,
including upstream connection records. Stored ciphertext, hashed values, and
plaintext are not interchangeable; this audit does not claim every record is
usable or unencrypted.

`owner-host-restore.mjs` runs `sanitizePostRestoreDatabase` after loading that
snapshot into the staged database. That sanitizer clears credentials and
execution authority for the restored Host. It does not rewrite the original
exported SQL file. Thus the former blanket claim that the bundle excludes
account credentials and encryption keys was too broad.

## Immediate Correction

The export completion message now distinguishes omitted local credential/key
folders from potentially sensitive database contents and included files. It
explicitly says SPS does not encrypt the transfer, to keep it private, and that
restore-time cleanup does not sanitize the exported file. This changes no backup bytes,
transfer format, restore sanitation, or permissions.

Four tests execute the actual extracted Main export function: success retains
the protected backup request and accurate warning, cancellation creates nothing,
non-owners are rejected before backup access, and backup failure cannot display
success or create a transfer. These plus transfer/Main restore checks passed
38/38. The directory-exclusion test name now states its actual filesystem scope
instead of implying that the database snapshot is secret-free.
The final full Desktop run after this correction passed: 1,540 total,
1,538 passed, 2 environment-dependent skips, 0 failed.

## User Decision

The user first asked whether this meant plugin files; the difference between a
plugin package and a server-data transfer was explained. The user then proposed
retaining sensitive contents and warning that they may be included. The current
snapshot contents are retained, with accurate sensitivity and non-encryption
warnings. Ordinary full backups are unchanged. This is not a request to add
previously excluded device private keys, local login stores, or other credential
folders; those exclusions remain in force. Post-restore authority and credential
cleanup also remains in force.

The transfer must not be advertised as safe for public upload or unprotected
sharing. A warning is not encryption or access control; official backup guidance
recommends encrypted backups as an additional protection ([CISA guidance](https://www.cisa.gov/sites/default/files/publications/CISA_MS-ISAC_Ransomware%20Guide_S508C.pdf)).
Export-time redaction or an encrypted backup format would be separate future
designs, not assumed requirements of this correction.
