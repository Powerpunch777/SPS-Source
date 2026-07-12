# Direct Agy Unreal Code Worker Workflow Log (CMP-43)

## Objective
Implement a safe **Unreal Code Worker direct-agy Task Room workflow** as the first active game-production tool adapter. This enables executing tasks in the local Unreal project using `agy.exe` while keeping Paperclip issues and comments as the source of truth, bypassing the Codex external usage quota block.

## Design & Implementation Decisions

1. **Unreal Project Discoverability & Layout Verification**:
   - Inspects the local Unreal project directory safely by resolving the path.
   - Requires exactly one `.uproject` file in the workspace directory or an explicit override path via `-ProjectFile`.
   - Fails closed on missing or ambiguous paths to prevent running inside incorrect directories.
   - Does not trigger or run an Unreal build by default.

2. **Customized Agy Prompt for Unreal Scope**:
   - Extended the direct worker runner (`scripts/Invoke-AgyDirectTask.ps1`) to support a `-Unreal` switch.
   - When `-Unreal` is specified, the runner updates the worker role from "Worker" to "Unreal Code Worker" in the prompt.
   - Injects Unreal-specific project context (e.g. project name and scope) into the prompt.
   - Retains the exact same memory recall brief (bounded recall logic), task boundaries, candidate-only behavior, and close-summary format.

3. **PowerShell Workflow Helper (`scripts/Invoke-DirectAgyUnrealTaskRoom.ps1`)**:
   - Creates an **unassigned** Task Room issue in Paperclip to prevent managed-agent wakeups.
   - Resolves paths safely and validates the Unreal project structure.
   - Invokes `Invoke-AgyDirectTask.ps1` with `-Unreal`, executing `agy.exe` inside the Unreal workspace.
   - Checks and verifies that the live runs of the newly created issue are zero.
   - Returns a structured result reporting all details (output path, candidate postings, exit codes, and run status).

4. **Guarded Dry-Run & Non-Waking Verification**:
   - Supports `-DryRun` which performs no issue creation, model invocation, or file writes outside normal local run artifacts.
   - Generates a `$MockIssue` object during dry run to bypass Paperclip GET requests while allowing full prompt generation.
   - Writes the prompt file to `.direct-agy-runs` inside the Unreal project directory to permit inspectability.
   - Dynamic path discovery is implemented in tests to locate the actual local Unreal Projects workspace without hardcoding Korean characters (which prevents encoding corruption from breaking PowerShell's string literal quotes).

5. **Exclusion of Other Adapters**:
   - Marked Unity, Blender, and voice adapters as future roadmap extensions. This is the first and only active Unreal Code Worker workflow.

## Verification Performed

1. **Recall & Candidate Lifecycle Tests**:
   - Executed existing tests (`scripts/Test-AgyRecallLifecycle.ps1`) to ensure backwards compatibility. All 6 test cases passed successfully.

2. **Unreal Workflow Tests (`scripts/Test-DirectAgyUnrealWorkflow.ps1`)**:
   - **Test 1**: Verify fail-closed behavior on non-existent workspace path (PASS).
   - **Test 2**: Verify fail-closed behavior on directory missing a `.uproject` file (PASS).
   - **Test 3**: Verify fail-closed behavior on directory containing multiple `.uproject` files (PASS).
   - **Test 4**: Verify explicit override path using `-ProjectFile` in a multi-uproject directory (PASS).
   - **Test 5**: End-to-end dry-run verification against the actual Unreal project (`C:\Users\young\Documents\Unreal Projects\강해린`). Verified that:
     - The prompt file artifact is written successfully to `.direct-agy-runs`.
     - The prompt content identifies the worker as `Unreal Code Worker` and includes the project details.
     - Mode is returned as `dry-run` and live runs count is 0.
     - No issues were created in Paperclip, and no AI model was invoked.

## Durable Lessons
- Hardcoding Korean character strings (like "강해린") in PowerShell script files can lead to encoding corruption during file writing (e.g. converting them to ANSI sequences that swallow the closing quote of a string literal, resulting in syntax errors). It is much safer to dynamically discover path structures or pass them dynamically rather than hardcoding non-ASCII paths in code assets.
