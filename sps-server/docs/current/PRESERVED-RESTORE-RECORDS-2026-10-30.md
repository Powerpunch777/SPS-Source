# Preserved restore records

Desktop now records the account, operation UUID and time before creating a restore staging directory or copying backup data. The optional `ownerRestoreAttempts` slot uses the existing guarded Desktop state writer and keeps state version13 compatible. Invalid existing or proposed records are rejected without replacing saved settings. If recording fails, staging work does not start.

Failed or interrupted attempts retain their record and data. The signed-in account sees only its own operation IDs and dates in the setup window's preserved-data section. A narrow preload action selects the corresponding folder in Explorer. The renderer cannot supply a filesystem path. Main rechecks the account, connection generation, state, recorded ID and application paths around asynchronous resolution. A concurrent account change or same-account connection ABA denies the reveal. The normal restore gate prevents revealing through an active restore.

The path is derived from Desktop's own user-data directory and a validated UUID. Linked/replaced roots or staging directories are refused. If staging is absent after promotion, the live Vault can be revealed only when its existing Desktop restore receipt matches both operation and account. Successful activation removes this attempt's bookkeeping record through guarded state persistence; it does not delete or move data.

This adds a recovery inventory and folder-location action. It does not resume an uncertain helper, modify a database, promote staged files, delete data, infer termination from PID absence, or sweep directories by age. Reimport still uses the original transfer and the existing fresh-Host restrictions. Old staging created before these records existed is not assigned to the currently signed-in account. Local metadata remains under the Windows user and is not an OS sandbox against that same user's arbitrary file edits.

Up to128 outstanding records are accepted. Desktop preserves the existing list and refuses additional attempts rather than silently dropping a previous recovery reference. There is no automatic retirement of failed records in this change.

Selected verification:

```powershell
node --test test/native-restore-main-flow.test.mjs test/owner-restore-attempts.test.mjs test/owner-restore-attempts-renderer.test.mjs test/state.test.mjs test/preload-contract.test.mjs test/owner-vault-operation-gate.test.mjs test/owner-vault-restore-receipt.test.mjs
```

Result:99 tests,97 passed,0 failed,2 existing file-symlink cases skipped because creation was unavailable on the local Windows host. New directory-junction, hardlink, promoted-receipt, account-filter, malformed-state preservation and actual Main VM reveal tests executed successfully. State tests used real temporary files and reloads; renderer tests executed the actual function with an isolated DOM fixture. Syntax and diff checks passed. Full installed Desktop crash/restart and manual Explorer interaction remain separate qualification boundaries; no installed user profile or customer data was changed by these checks.
