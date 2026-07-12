# CMP-52: Implement a disabled-by-default Direct Task Bridge core

> [!IMPORTANT]
> **Hardenings and Corrections Notice**: The design decisions and details in this document have been updated and corrected to address security and contract findings in [45-direct-task-bridge-hardening-log.md](file:///C:/Users/young/Documents/AGENT%20%EA%B5%AC%EC%B6%95/paperclip-game-workplane/45-direct-task-bridge-hardening-log.md).

## Objective

Implement the standalone **Direct Task Bridge (DTB)** core described in the corrected authority design. It is a separate loopback service that can validate and, only when explicitly configured in a future phase, run a bounded local Agy job using the existing `Invoke-AgyDirectTask.ps1 -NoPost` path. It must have no Paperclip write credential and must not be integrated with the Project Hub UI yet.

## Authority contract

- Memory Sidecar stays memory-only. Do not modify it.
- DTB owns only local process/job execution state. It must not create/update Paperclip issues, post comments, close tasks, wake agents, or submit/promote memory candidates.
- Paperclip plugin will later own authenticated issue creation and finalization. It is out of scope now.
- `02-final-operating-model-ko.md` is locked.

## Required implementation

1. Create a separate `direct-task-bridge/` directory with:
   - `direct-task-bridge.mjs` Node loopback service;
   - `config.example.json` with no real secret and no hardcoded Korean/local project path;
   - an ignored `config.local.json` pattern if appropriate;
   - an append-only audit log path under the bridge directory;
   - focused Node verification tests runnable without Paperclip, Agy, or a real Unreal project.
2. Listen only on `127.0.0.1` by default. Reject requests if disabled, unauthorized, malformed, oversized, or outside the configured role/project allowlist.
3. Define endpoints exactly:
   - `POST /direct-task/preview`: validate a role (`unreal-code` or `unreal-qa`), company/project/issue IDs, bounded title/description, and project mapping. Return non-sensitive preview metadata only; never spawn a process.
   - `POST /direct-task/submit`: requires explicit `enabled: true` config plus secret token, accepts an idempotency key, enforces one active job, and uses a fixed argument array to launch PowerShell with `Invoke-AgyDirectTask.ps1 -NoPost`, `-Unreal`, optional `-QA`, and no `-ProposeCandidates`/`-MarkDone`.
   - `GET /direct-task/status/:jobId`: returns bounded non-sensitive job state/result metadata.
4. Mapping must be local config `projectId -> workspacePath` only. Never accept an arbitrary workspace path, executable name, arbitrary flags, raw command, or arbitrary script path from request data.
5. For optional project file, accept only a relative `.uproject` filename with no directory separator or `..`, then resolve/validate it inside the configured workspace. Reuse or invoke the existing hardened PowerShell workspace validator rather than duplicating path logic where practicable.
6. Spawn PowerShell by executable and argument array with `shell: false`; use a fixed script path resolved under the workplane root. Capture output, timeout after a bounded duration, write an audit event, and never expose absolute paths, raw prompt, token, or process environment in HTTP responses.
7. Persist enough local job/idempotency metadata safely to support status after restart if feasible; otherwise explicitly fail closed on restart and document it. No Paperclip write or candidate write is permitted in any path.
8. Start script may be added only if it defaults to disabled/validation behavior; do not start a live daemon in this task, create real secrets, or create `config.local.json` with an enabled execution configuration.
9. Add a next-numbered implementation log and update README/checklist only with accurate disabled-by-default status.

## Verification

- Tests must prove preview has no spawn, missing/invalid token fails, disabled submit fails, invalid role/path/workspace rejects, relative project-file validation rejects traversal, duplicate idempotency is stable, concurrency blocks, and mocked successful execution produces a stored completed job without Paperclip/memory writes.
- Run all DTB tests and existing `Test-AgyRecallLifecycle.ps1`.

## Hard boundaries

- Do not modify Paperclip plugin source/manifest, plugin installation, live Paperclip config, Memory Sidecar, or actual Unreal project.
- Do not start the daemon or run a real Agy job through it.
- No credentials/secrets in repository files or task comments.

## Completion format

Return `## Close Summary` with changed files, exact disabled state, API safety properties, tests, and residual gap: Project Hub remains Preview-only until a future authenticated plugin-finalizer integration. `Memory Candidates:` must be empty.
