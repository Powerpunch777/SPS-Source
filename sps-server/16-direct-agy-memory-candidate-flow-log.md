# Direct Agy Memory Candidate Flow Log

Date: 2026-07-10

## Goal

Move direct `agy.exe` close-summary memory candidates into the Memory Sidecar candidate inbox without changing the agreed control model.

## Implemented

Added opt-in candidate proposal support to:

- `scripts/Invoke-AgyDirectTask.ps1`
- `scripts/Invoke-DirectAgyTaskRoom.ps1`

New runner options:

- `-ProposeCandidates`
- `-MemorySidecarUrl`
- `-MemoryCandidateScope`
- `-MemoryCandidateType`

## Architecture Fit

- SPS remains the source of truth for Task Rooms, comments, status, documents, and work products.
- Direct `agy.exe` remains a local Worker execution path, not a SPS agent wake.
- Memory Sidecar receives candidates only.
- Approved `LEARNINGS.md` files are not mutated.
- Candidate proposal is opt-in, so routine worker runs do not silently fill memory.
- Sidecar failure is non-blocking; task execution and reporting still complete.

## Guardrails

- Only loopback Memory Sidecar URLs are accepted.
- The runner posts to `/memory/candidates`, not approved memory.
- The runner ignores empty placeholder candidate sections such as `None` or `N/A`.
- Candidate source metadata includes the SPS issue id, identifier, and direct worker output path.

## Verification

Parser and dry-run checks passed.

`CMP-18` found one implementation bug:

- PowerShell treats `$Host` as a read-only built-in variable, so a local `$host` variable in loopback URL validation failed.
- The variable was renamed to `$urlHost`.

`CMP-19` verified the end-to-end candidate flow:

- Task Room was created as an unassigned SPS issue.
- Direct `agy.exe` worker ran locally.
- Result comment was posted to the Task Room.
- Issue was marked `done`.
- `assigneeAgentId = null`.
- `liveRunCount = 0` for the issue and company.
- Memory Sidecar candidate count increased from 2 to 3.
- Candidate ID: `cand_7d08a1fe1b9bf060`.
- No leftover `agy.exe` process remained.

Output artifact:

- `C:\Users\young\Documents\sps-server\.direct-agy-runs\CMP-19-20260710-002238.output.md`

## Current Status

The direct `agy.exe` workflow can now optionally preserve close-summary memory candidates as reviewable Sidecar candidates while keeping SPS as the work source of truth.
