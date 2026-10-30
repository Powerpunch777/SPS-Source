# Restored Host account recovery

The restored database and files were previously renamed into the live Vault before Desktop saved its Owner account. A process interruption in that interval left restored data without the Desktop account binding needed to resume it safely. Startup did not recover that binding from the promoted Vault.

After the database helper has successfully restored, sanitized and confirmed termination, Desktop writes `sps-desktop-restore.json` into staging. This version-1 local record contains only the restoring account subject, random operation UUID and creation timestamp. It is create-only, flushed before promotion, and moves with the data directory. The existing fresh-Vault, account continuity, Native-credential and shutdown checks still precede promotion.

Before startup or explicit Host activation, Desktop reads this record and saves a missing Owner binding through the existing guarded state writer. Concurrent starts join the same recovery save; they cannot launch the Host using a binding whose save is pending or failed. A failed save restores the previous in-memory binding and leaves the on-disk record intact for retry. A conflicting existing Owner is not overwritten. A different signed-in account cannot activate the restored Host. Existing account routing is preserved until explicit activation.

The reader bounds record size and rejects malformed records, linked directory chains and non-regular or hardlinked metadata. The transfer allowlist excludes this local record: exporting a restored Host does not transfer its Desktop ownership authority to another computer or restoring account.

This is trusted Desktop-local metadata, like local connection settings. It is not a signature, protection against the same Windows user's arbitrary filesystem edits, a transferable credential, or an OS sandbox. Hosts without a record retain their existing behavior; ownership is not guessed for older unmarked orphan Vaults.

Selected verification from Desktop:

```powershell
node --test test/native-restore-main-flow.test.mjs test/owner-vault-restore-receipt.test.mjs test/owner-vault-transfer.test.mjs test/owner-vault-operation-gate.test.mjs test/owner-host-activation-contract.test.mjs test/core-settings-main-contract.test.mjs test/preload-contract.test.mjs
```

This selection passed 77/77 with no skips. It includes actual filesystem receipt write/read/rename and transfer exclusion, plus VM execution of the actual Main restore/startup flow for interrupted promotion, different-account denial, original-account retry, conflicting settings, concurrent save failure and rollback. It does not establish a full installed-app crash/restart E2E. Earlier real database/helper termination evidence remains separate.

Pre-promotion failed staging still requires an account-scoped inventory and recovery workflow. This change does not automatically resume, delete, sweep or repurpose failed staging, infer termination from PID absence, or change plugin/SDK/Workspace contracts.
