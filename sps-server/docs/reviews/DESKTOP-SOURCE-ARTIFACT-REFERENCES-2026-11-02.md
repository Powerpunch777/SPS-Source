# Desktop Source Artifact References

2026-11-02 KST. Known-input observation increment, not cleanup readiness.

## Authoritative Boundary

Core's `sps_workspace_sources` deliberately stores opaque Source handles and
optional transport routes, not the Host's local folders. Do not change that
privacy/security contract to make artifact inspection easier. Desktop keeps
local mappings in the active profile, retained account connections and encrypted
Host Source/project share records. A selected Workspace alone is insufficient.

The new private in-memory reader captures default folders, every stored project
mapping and Workspace Source mapping across those profiles, plus Source paths
from every retained protected share record. It returns paths and opaque numeric
owner labels only: no account IDs, Source display names, credential objects,
ciphertext or passwords. Unchanged ciphertext is not repeatedly decrypted.
An empty transferred Source handle does not imply a replacement local folder.

The bounded reader rejects malformed, sparse, duplicate or accessor-based Source
records instead of normalizing/filtering them away. Missing root fields, async
readers, corrupt protected state, unsupported paths and excessive metadata deny
observation. It rechecks a hash of the projected Source metadata and ciphertext;
active, saved or shared-reference changes invalidate the result. No file is
read, written or deleted by this metadata projector. Existing Core's held parent
path observation separately validates filesystem identities.

Main supplies this reader to its existing private input composition. Its result
continues to say `desktop-known-inputs-and-owned-cores`, `cleanupReady:false`.
There is no new SDK, HTTP/renderer endpoint, DB schema, permission or cleanup UI.

## Mutation Admission

Host Source folder/grant/revoke/synchronization mutations now join the same
process-local Desktop artifact activity gate before entering the existing FIFO
queue. Both running and queued accepted work block maintenance; held maintenance
rejects new work before queueing/action. Existing prequeue/queued authority
checks, errors, serial order and close/drain behavior remain unchanged. The
default optional hook preserves other existing callers. No task is automatically
cancelled and no Windows share or credential was changed for this increment.

## Verification

Node24.22.1 focused selection passed84/84 without skips:

```powershell
node --test test/desktop-source-artifact-references.test.mjs test/desktop-artifact-context.test.mjs test/host-share-mutation.test.mjs test/desktop-artifact-inputs.test.mjs test/plugin-artifact-observation.test.mjs
```

The Source and admission tests are bounded synthetic state/promise tests; they
do not decrypt actual user credentials or create Windows shares. The updated
actual Windows two-owned-Core scope test passed1/1 (28.1s). It placed a project
sentinel in its own temporary folder, observed a saved Source path through the
real private Core parent scope, rejected Source mutation admission while held,
invalidated an out-of-band metadata change and preserved sentinel bytes. Both
owned Core Jobs closed naturally and exact temporary-data cleanup was required.
The final Node24.22.1 `npm run test:ci` exited0: serialized4/4; remaining2149/2152
with three unavailable Windows8.3-alias skips. Aggregate2156 total,2153 passed,
3 skipped,0 failed, including the updated real owned-Core Source scope test.
The generated ignored log is `desktop/dist/source-artifact-final-node24-20261102.log`.
No actual Source-management UI or new packaged/physical acceptance is claimed.

References consulted, not copied code:
- [Node path semantics](https://nodejs.org/api/path.html#pathrelativefrom-to)
- [Node child-process lifecycle](https://nodejs.org/api/child_process.html)
- Existing SPS Source schema, routing metadata, share-mutation coordinator and
  private artifact scope. No private source was copied into Builder.

## Runner Gap And Remaining Work

Read-only Runner inspection found no synchronous artifact reference observer.
The real launch uses resolved executable/args/cwd, optional npm shim/script and
Codex config paths plus temporary SMB mappings. Current active-command tracking
and durable claim journal/outbox do not enumerate all those paths; a claimed or
entered operation is not proof of process closure after restart. CLI tools may
read further files, so the known-input scope cannot certify safe unreferenced
artifacts while Runner use or closure is uncertain.

Runner admission/uncertainty must be connected before cleanup eligibility, with
no automatic stopping or invented empty reference list. Crosschecking incomplete
Core Source routes/shared-state reconciliation also remains necessary; this
increment does not infer local paths from UNC routes or unmapped handles.
Ownership/inventory recheck, fresh Host/account-bound selection confirmation,
actual selective removal and Settings tests remain incomplete. Original
Core/Builder, real AI, SQL-crash/abnormal-loss, installed/recovery, Linux and
two-PC qualification requirements are unchanged. User apps/profiles/Vaults,
external projects, original checkout and Production were preserved.
