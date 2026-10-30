# Enforce declared local-folder access

The local-folder broker previously allowed `writeTextAtomic` and `deleteFile` on a healthy folder whose declaration was read-only. Inspection correctly returned `access: read` and `writable: false`, but the common write guard checked only configuration, readability and folder health. A real Workspace worker reproduced an unauthorized write to a disposable read-only marker file.

Core's common write guard now requires both `access: readWrite` and `writable: true` before a write or delete proceeds. Read-only access fails with HTTP 403 in the Host service and the existing normalized RPC error through the worker protocol. Reading a healthy read-only folder remains supported. The existing allowance to repair missing required paths in an otherwise writable folder remains intact.

The existing real-filesystem tests now check the denied write guard. The existing real PostgreSQL/Host-service fixture retains its undeclared-folder checks and additionally verifies declaration precedence over a caller's read-write request, successful reading, rejected writing and deletion, and unchanged file bytes. The writable bootstrap case remains selected. **Four focused cases passed; twenty other cases were excluded by name.** The new read-only guard case failed before the fix.

The Windows service fixture's previous 20-second setup hook expired before the database cases ran. Its Windows-only startup budget now matches the existing bounded 180-second company-service fixture budget; Linux retains its prior 20-second setup budget. The fixture retains and joins its exact startup promise even on timeout, closes its database client, then cleans up the owned instance. Test-body deadlines and assertions are unchanged. The timed-out run is not counted as a successful database test.

The Core pin, support matrix and generated current-candidate document advance together. These changes preserve the SDK API, Workspace scoping, internal Registry and approved-plugin execution contracts. They enforce Core-brokered file permissions; full hostile-code OS sandboxing remains outside this milestone. No user-selected folder data is automatically removed.
