# CMP-53: Harden Direct Task Bridge core review findings

## Objective

Correct the concrete security and contract gaps found in review of the disabled-by-default Direct Task Bridge core before any daemon start or Project Hub execution integration.

## Findings to fix

1. The service currently uses `config.server.host`, so a local config could bind it to `0.0.0.0` rather than strict `127.0.0.1`.
2. The example secret string can be treated as a valid credential if someone copies the example and sets `enabled: true`.
3. HTTP responses send `Access-Control-Allow-Origin: *` even though browser CORS is unnecessary; the future plugin worker calls the Bridge server-to-server.
4. Bridge title/description limits (256/4096) do not match the Project Hub Preview and direct task contract (200/4000).
5. Client-supplied `jobId` is unnecessary; idempotency key must be the only submission identity. Validate its type/length/format and generate job IDs server-side.
6. The status response and captured child output are unbounded. Bound retained HTTP-visible close summaries and capture output defensively, visibly marking truncation. Do not expose paths, prompts, tokens, or process environment.
7. Preview currently accepts any mapped string without checking that it is a usable workspace/project selection. Add non-spawning filesystem validation sufficient to fail closed for a missing/non-directory workspace, missing/ambiguous `.uproject`, and invalid optional relative `.uproject` selection. Preserve the actual PowerShell validator as execution defense in depth.
8. Ensure the configured audit log path is resolved only inside the bridge directory, or remove the unused config field. Do not allow arbitrary log paths from config.

## Required behavior

- Bridge must bind only to `127.0.0.1`; reject invalid host configs rather than falling back to another interface.
- It must refuse execution when disabled, when no secret is configured, or when the secret is an example/placeholder/too weak value. No real secret or enabled local config is created in this task.
- Remove broad CORS. At most use no CORS headers; the service is not browser-callable.
- Standardize on the design header name `x-direct-bridge-token` (or document and use a deliberate compatible alias only if necessary). No browser sees the secret.
- Maintain `-NoPost`, omit candidate/mark-done switches, and keep all Paperclip/memory writes absent.
- Do not start the daemon, modify plugin/sidecar/runtime config, or access the actual Unreal project except read-only test discovery if tests explicitly use a temporary workspace.

## Tests

Extend `direct-task-bridge/test.mjs` to cover every finding, including strict host rejection, placeholder/weak secret failure, no wildcard CORS, exact field limits, invalid idempotency/client jobId handling, output/status truncation, workspace validation without spawning, and no spawn on preview. Retain prior tests. Run DTB tests plus `Test-AgyRecallLifecycle.ps1`.

## Documentation

Create `45-direct-task-bridge-hardening-log.md` and update prior CMP-52 documentation only with an explicit correction pointer. Do not modify `02-final-operating-model-ko.md`.

## Completion format

Return `## Close Summary` with fixed findings, tests, and exact remaining state: Bridge source exists but no live Bridge config/process/UI submit path is enabled. `Memory Candidates:` must be empty.
