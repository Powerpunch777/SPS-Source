# Implementation Log: Direct Task Bridge Core (CMP-52)

> [!IMPORTANT]
> **Hardenings and Corrections Notice**: The design decisions and details in this document have been updated and corrected to address security and contract findings in [45-direct-task-bridge-hardening-log.md](file:///C:/Users/young/Documents/AGENT%20%EA%B5%AC%EC%B6%95/sps-server/45-direct-task-bridge-hardening-log.md).
> Result handoff is further corrected by [46-direct-task-bridge-result-contract-log.md](46-direct-task-bridge-result-contract-log.md), which replaces stdout parsing with a validated structured result file.

## 1. Objective

Implement the standalone **Direct Task Bridge (DTB)** core loopback service as described in the corrected authority design under CMP-49. The bridge listens strictly on localhost (`127.0.0.1`), is disabled by default, and operates under a zero-trust execution model. It acts as a local process runner with no SPS credentials or write operations.

## 2. Design & Implementation Decisions

- **Disabled by Default**: Configured `"enabled": false` by default in both config templates and runtime initialization.
- **Port and Host Bounds**: Listens only on `127.0.0.1` (port `3105` by default) to restrict access to local clients only.
- **Header Authentication**: Enforces presence and validation of `x-bridge-token` or `Authorization: Bearer <token>` matching the configured `bridgeSecret`.
- **Input Content & Schema Bounds**:
  - Validates role to be exactly `unreal-code` or `unreal-qa`.
  - Rejects any requests mapping to a project ID not registered in `projectWorkspaceMappings`.
  - Captures body size limits up to 100KB to prevent memory exhaustion (oversized body returns `413 Payload Too Large`).
  - Limits title length to 256 characters and description to 4096 characters.
- **Relative Project File Containment**:
  - Enforces that `projectFile` (if provided) is a relative name ending with `.uproject` and containing no path separators (`/`, `\`) or traversal elements (`..`).
  - Resolves it to an absolute path within the configured workspace in Node, then passes the absolute path to `Invoke-AgyDirectTask.ps1`, reusing the hardened PowerShell path containment checker `Resolve-UnrealWorkspace.ps1`.
- **Concurrency & Stable Idempotency**:
  - Enforces a single active job limit globally. If a job is currently `"running"` or `"pending"`, any other execution requests are rejected with `409 Conflict`.
  - Provides stable idempotency: if a request is submitted with an `idempotencyKey` that matches an existing job (running or completed), the existing job ID and status are returned without launching a new process or triggering concurrency blocks.
- **Secure Process Spawning**:
  - Spawns PowerShell (`powershell.exe`) with `shell: false` using a fixed argument array.
  - Passes the `-NoPost` flag to `Invoke-AgyDirectTask.ps1` to prevent any SPS writes or agent wakenings, and omits candidate wakenings/posting flags.
  - Limits execution time using a configurable timeout (`jobTimeoutMs`, defaulting to 5 minutes). When timed out, the child process is terminated via `SIGKILL` and status is marked as failed.
- **Safe Persistence and Fail-Closed Restart**:
  - Persists job execution state and idempotency mapping to a local `jobs.json` file.
  - Fail-Closed: Upon restart/loading, the bridge scans the persisted state. Any jobs marked as `"running"` or `"pending"` are immediately transitioned to `"failed"` with the error `"Job aborted due to service restart"`, preventing stale locks or undefined runtime states.
- **Auditing**:
  - Appends JSON events to `audit.log` for core lifecycle operations (job startup, complete, error, timeout, etc.).
- **Sanitized Outputs**:
  - Never exposes absolute paths, raw prompts, tokens, or system environment variables in HTTP API responses. Any absolute paths matching configured workspaces or typical path regex are redacted to `<workspace>` or `<path>` in the status endpoint response.

## 3. Files Created

- [direct-task-bridge/direct-task-bridge.mjs](file:///C:/Users/young/Documents/AGENT%20%EA%B5%AC%EC%B6%95/sps-server/direct-task-bridge/direct-task-bridge.mjs): Core loopback service.
- [direct-task-bridge/config.example.json](file:///C:/Users/young/Documents/AGENT%20%EA%B5%AC%EC%B6%95/sps-server/direct-task-bridge/config.example.json): Configuration template containing zero secrets or hardcoded Korean/local project paths.
- [direct-task-bridge/.gitignore](file:///C:/Users/young/Documents/AGENT%20%EA%B5%AC%EC%B6%95/sps-server/direct-task-bridge/.gitignore): Ignores local configuration `config.local.json`, jobs database `jobs.json`, and audit log `audit.log`.
- [direct-task-bridge/test.mjs](file:///C:/Users/young/Documents/AGENT%20%EA%B5%AC%EC%B6%95/sps-server/direct-task-bridge/test.mjs): Standalone Node.js unit and integration test suite.

## 4. Verification Performed

1. **Direct Task Bridge Node Test Suite**:
   - Ran `node direct-task-bridge/test.mjs`.
   - Verified that:
     - Disabled requests fail closed (403).
     - Unauthorized requests fail (401).
     - Payload schema checks reject invalid roles, unmapped projects, or invalid project files (traversal/separators).
     - Mocked execution correctly runs in the background and completes successfully.
     - Status endpoint retrieves sanitized results and extracts Close Summary sections.
     - Concurrency limits correctly block concurrent execution.
     - Idempotency mapping correctly handles duplicate key returns.
     - Service restart transitions pending/running jobs to failed closed.
   - All tests passed cleanly.

2. **PowerShell Recall Regression Tests**:
   - Ran `powershell.exe -File scripts/Test-AgyRecallLifecycle.ps1`.
   - All 6 recall test cases passed successfully.
