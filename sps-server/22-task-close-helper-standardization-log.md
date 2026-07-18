# Standardized Task-Bridge Close Helper Log

Date: 2026-07-10

## Goal

Standardize the assigned worker closure process by implementing a reusable helper script (`scripts\Close-SPSTaskUtf8.ps1`) that posts a close summary comment and marks the issue done via agent-authenticated task-bridge writes, ensuring safety guards against accidental local-board writes.

## Task Room

- Identifier: CMP-24
- Issue ID: 723220dc-de1e-48df-a07d-2b051e91422d
- Title: Standardize assigned worker task close helper

## Implementation

Implemented `scripts\Close-SPSTaskUtf8.ps1` with the following characteristics:
- **Mandatory parameters**: `-IssueId`, and either `-Body` or `-BodyPath`.
- **UTF-8 Support**: Reads `-BodyPath` files with `System.Text.UTF8Encoding` and sets console encoding using `Set-SPSUtf8`.
- **Validation Guards**:
  - Validates that the bearer token is present (via `TASK_BRIDGE_API_KEY` or `PAPERCLIP_API_KEY`) and fails clearly if absent.
  - Validates that `PAPERCLIP_RUN_ID` is present and fails clearly if absent.
  - Validates that the comment body is non-empty.
- **Task-Bridge Authentication**: Posts comment to `/api/issues/$IssueId/comments` and status updates to `/api/issues/$IssueId` with headers containing the authorization bearer token and `x-sps-run-id` matching the run ID.
- **Safety checks**: Uses `Assert-SPSBoardWriteAllowed` to ensure board-auth writes are rejected.

## Verification

Created a focused unit/integration test script `scripts\Test-CloseSPSTaskHelper.ps1` that checks:
1. **Token Absence Guard**: Throws an error when no API key is available.
2. **Run ID Absence Guard**: Throws an error when `PAPERCLIP_RUN_ID` is missing.
3. **Valid Environment (DryRun)**: Succeeds when both parameters are present, verifying parameters are properly passed to API functions.

All checks passed successfully.
