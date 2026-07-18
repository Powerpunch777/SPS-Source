# Implementation Log: Direct Task Bridge Hardening (CMP-53)

> Result handoff correction: [46-direct-task-bridge-result-contract-log.md](46-direct-task-bridge-result-contract-log.md) adds validated structured runner-result handling on top of this hardening work.

## 1. Objective

Address concrete security vulnerabilities and contract alignment issues identified during code review of the Direct Task Bridge (DTB) core service before process daemon startup or integration with Project Hub.

## 2. Hardening and Corrections Implemented

1. **Strict Host Bounding**
   - Configured host is strictly validated during `loadConfig()`. Any host value other than `127.0.0.1` (such as `0.0.0.0` or localhost aliases) throws an error and rejects startup.

2. **Secret Strength Validation**
   - Added validation logic to verify `bridgeSecret` strength. It must be at least 32 characters in length and must not contain insecure placeholder substrings (like `change-this`, `example`, `placeholder`, `secret`, `password`).
   - The service will refuse to run or handle requests if disabled or if configured with a weak/placeholder secret.

3. **CORS Removal**
   - Broad browser CORS headers (`Access-Control-Allow-Origin: *`, etc.) have been completely removed since the service is called server-to-server and is not callable by a web browser.

4. **Standardized Header**
   - The primary design header for authorization is standardized to `x-direct-bridge-token`. The previous header `x-bridge-token` is retained strictly as a compatible alias.

5. **Field Limit Synchronization**
   - Synchronized payload limits with the direct task contract: title length is capped at `200` characters (previously `256`), and description is capped at `4000` characters (previously `4096`).

6. **Idempotency Key Validation & Server-side Job ID Generation**
   - Any client-provided `jobId` in payload submissions is now completely ignored and generated server-side using secure random bytes (`job-<32 hex characters>`).
   - The client-provided `idempotencyKey` is validated to be a string of length `8` to `128` containing only alphanumeric, dashes, and underscores (`/^[a-zA-Z0-9_-]+$/`).

7. **Output Truncation & Information Redaction**
   - Process output (`stdout`/`stderr`) is capped defensively to a maximum buffer of 100KB to prevent memory exhaustion, with clear indicators appended upon truncation.
   - Close summaries returned in status responses are capped at 8000 characters and visibly marked on truncation.
   - Enhanced `sanitizePaths` to replace:
     - Configured workspace paths.
     - General Windows-style and Unix-style absolute paths.
     - Terminal prompts (e.g. `PS >`, `>`).
     - Configuration secrets.
     - Host environment variable values and environment variable dumps.

8. **Non-spawning Filesystem Validation**
   - Added synchronous/asynchronous filesystem checks to `/direct-task/preview` and `/direct-task/submit` payloads:
     - Rejects missing workspaces or workspaces that are not directories.
     - Rejects workspaces with zero `.uproject` files (missing `.uproject`).
     - Rejects workspaces with multiple `.uproject` files when no explicit `projectFile` is selected (ambiguous `.uproject`).
     - Rejects optional `projectFile` parameters containing path traversals, path separators, or pointing to nonexistent/non-uproject files.

9. **Audit Log Containment**
   - Removed the unused `auditLogPath` setting from `config.example.json` and default code properties, ensuring the audit log is strictly and exclusively written to `audit.log` resolved inside the bridge directory.

## 3. Files Created & Modified

- **Modified**:
  - [direct-task-bridge/direct-task-bridge.mjs](file:///C:/Users/young/Documents/AGENT%20%EA%B5%AC%EC%B6%95/sps-server/direct-task-bridge/direct-task-bridge.mjs): Hardened core implementation.
  - [direct-task-bridge/test.mjs](file:///C:/Users/young/Documents/AGENT%20%EA%B5%AC%EC%B6%95/sps-server/direct-task-bridge/test.mjs): Unit & integration tests extended to verify all 8 review findings.
  - [direct-task-bridge/config.example.json](file:///C:/Users/young/Documents/AGENT%20%EA%B5%AC%EC%B6%95/sps-server/direct-task-bridge/config.example.json): Removed `auditLogPath` and updated example token placeholder.
  - [tasks/cmp-52-direct-task-bridge-core.md](file:///C:/Users/young/Documents/AGENT%20%EA%B5%AC%EC%B6%95/sps-server/tasks/cmp-52-direct-task-bridge-core.md): Added correction pointer.
  - [44-direct-task-bridge-core-log.md](file:///C:/Users/young/Documents/AGENT%20%EA%B5%AC%EC%B6%95/sps-server/44-direct-task-bridge-core-log.md): Added correction pointer.

- **Created**:
  - [45-direct-task-bridge-hardening-log.md](file:///C:/Users/young/Documents/AGENT%20%EA%B5%AC%EC%B6%95/sps-server/45-direct-task-bridge-hardening-log.md): This hardening implementation log.

## 4. Verification Performed

1. **Direct Task Bridge Node Test Suite**:
   - Ran `node direct-task-bridge/test.mjs`.
   - Verified strict host rejection, placeholder/weak secret rejection, CORS header absence, field limits validation, invalid idempotency/client-supplied jobId rejection, status and close summary truncation with sanitization, non-spawning workspace validation, and preview validation with no spawned jobs.
   - All tests passed cleanly:
     ```
     === Starting Direct Task Bridge Node Tests ===
     Test server running on port 50785
     Running Host Rejection Test...
     Running Secret Strength Validation Test...
     Running No Wildcard CORS Test...
     Running Exact Field Limits Test...
     Running Idempotency / Client jobId Handling Test...
     Running Output / Status Truncation & Sanitization Test...
     Running Workspace Validation without Spawning Test...
     Running No Spawn on Preview Test...
     Running Prior Retained Tests...
     === All Direct Task Bridge tests passed successfully! ===
     ```

2. **PowerShell Recall Lifecycle Tests**:
   - Ran `powershell.exe -File scripts/Test-AgyRecallLifecycle.ps1`.
   - All 6 recall lifecycle cases passed successfully:
     ```
     === Testing Invoke-AgyDirectTask.ps1 Recall and Candidate Lifecycle ===
     Running Test Case 1: Recall Success (Full Scope)...
     Test Case 1 Passed!
     Running Test Case 2: Recall Unavailable...
     Test Case 2 Passed!
     ...
     === All Invoke-AgyDirectTask.ps1 Recall & Candidate checks passed successfully! ===
     ```
