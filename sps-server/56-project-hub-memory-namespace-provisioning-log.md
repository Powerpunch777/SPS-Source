# CMP-67: Provision explicit Project Hub memory namespace Implementation Log

Date: 2026-07-10

## Goal

Implement a reusable, explicit, safe way to initialize a SPS Project's approved-memory journal and register it in the local Memory Sidecar configuration. Then provision the target Project Hub using that tool.

## Implemented

Created:

- [Provision-ProjectMemory.ps1](file:///C:/Users/young/Documents/AGENT%20%EA%B5%AC%EC%B6%95/sps-server/memory-sidecar/Provision-ProjectMemory.ps1): Safe, idempotent helper script to initialize project journals and update configuration.
- [Test-ProvisionProjectMemory.ps1](file:///C:/Users/young/Documents/AGENT%20%EA%B5%AC%EC%B6%95/sps-server/memory-sidecar/Test-ProvisionProjectMemory.ps1): Focused test suite validating inputs, containment, dry-run behavior, and idempotency.

Updated:

- [Start-MemorySidecarBackground.ps1](file:///C:/Users/young/Documents/AGENT%20%EA%B5%AC%EC%B6%95/sps-server/memory-sidecar/Start-MemorySidecarBackground.ps1): Hardened background execution by leveraging WMI (`Invoke-CimMethod`) to start the Node.js server outside the runner's parent Job Object. This ensures the Memory Sidecar persists correctly after the spawning script finishes.
- [config.local.json](file:///C:/Users/young/Documents/AGENT%20%EA%B5%AC%EC%B6%95/sps-server/memory-sidecar/config.local.json): Registered the target Project Hub memory namespace `project-1a3fe2e8`.

## Verification Performed

1. **Automated Unit Tests**:
   - Ran `powershell.exe -File .\Test-ProvisionProjectMemory.ps1`.
   - Verified that UUID format checks reject malformed inputs (e.g. invalid UUIDs or traversal paths).
   - Verified path containment restricts all journal file creation strictly within `C:\Users\young\.sps\instances\default\projects\`.
   - Verified dry-run mode prevents any live file writes or configuration updates.
   - Verified live provisioning correctly creates the journal file with a non-substantive header and registers it in `config.local.json`.
   - Verified idempotency prevents duplicate entry creation on subsequent runs.
   - All tests passed successfully.

2. **Target Project Hub Provisioning**:
   - Ran the helper script with target parameters:
     - `CompanyId`: `181e1bf7-3390-4b8d-8507-b736a03e444b`
     - `ProjectId`: `1a3fe2e8-f7a2-4fe6-9df7-eab58914b999`
     - `-Restart` switch to safely restart the sidecar service.
   - Confirmed the journal file [LEARNINGS.md](file:///C:/Users/young/.sps/instances/default/projects/181e1bf7-3390-4b8d-8507-b736a03e444b/1a3fe2e8-f7a2-4fe6-9df7-eab58914b999/_default/LEARNINGS.md) was created with the correct header.
   - Confirmed the project entry was successfully added to `config.local.json` without modifying any other entries or settings.

3. **Sidecar Integration & Scoped Recall**:
   - Verified that the restarted Memory Sidecar is running and healthy on loopback-only port 3188.
   - Verified that scoped recall for the target Project ID `1a3fe2e8-f7a2-4fe6-9df7-eab58914b999` successfully reaches the new journal namespace and separates project memories securely (verified by adding a temporary test entry, searching for it via `memory-recall.ps1`, confirming the search returns 1 result for the target project and 0 results for other project scopes, and restoring it to the clean empty state).
