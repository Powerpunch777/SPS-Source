# Hardened Unreal Workspace Boundary Log (CMP-44)

## Objective
Correct the review finding in the direct `agy.exe` Unreal Task Room workflow by enforcing that an explicit `-ProjectFile` (.uproject) must belong to the resolved `-WorkspacePath`. Any project file outside the resolved workspace directory must fail closed immediately to prevent path traversal or out-of-bounds operations.

## Design & Implementation Decisions

1. **Robust Path Containment Check**:
   - Implemented a canonical path containment check in both validation layers: the workflow adapter `scripts/Invoke-DirectAgyUnrealTaskRoom.ps1` and the direct task runner `scripts/Invoke-AgyDirectTask.ps1`.
   - Before performing the check, both `-WorkspacePath` and `-ProjectFile` are resolved to absolute canonical paths via `Resolve-Path` (which handles symbolic links, relative paths, and normalizes path separators).
   - Separators are normalized to the standard path separator (backslashes for Windows) and a trailing directory separator is appended to the workspace path.
   - We perform a case-insensitive string containment prefix check using `StartsWith` with `OrdinalIgnoreCase` to ensure the project file lies strictly within the workspace directory.
   - This avoids substring-prefix errors (e.g. `C:\game` matching `C:\game-old\game.uproject`).

2. **Immediate Fail-Closed**:
   - If containment check fails, the script throws an error immediately before any SPS issue is created, any mock is initialized, or `agy.exe` is invoked, securing the boundary.

## Verification Performed

1. **Unreal Workflow Validation & Regression Tests**:
   - Executed `scripts/Test-DirectAgyUnrealWorkflow.ps1` which includes the new test cases:
     - **Test Case 6**: Verifies that an explicit `.uproject` file located outside the workspace (e.g., in a parent or sibling directory) is rejected immediately with a path containment error message and throws an exception.
     - **Test Case 7**: Verifies that sibling directories sharing a common prefix (e.g., `$tempTestDir\game` vs `$tempTestDir\game-old`) are not falsely matched by prefix substring checks, preventing substring-prefix bypasses.
   - All 7 test cases passed successfully.

2. **Recall Lifecycle & Compatibility Tests**:
   - Executed `scripts/Test-AgyRecallLifecycle.ps1` to verify that there are no regressions to the core direct task execution, recall mechanism, or candidate lifecycle.
   - All 6 recall test cases passed successfully.

## Durable Lessons
- Direct substring prefix matching on directory paths is prone to false positives when directories share name prefixes (e.g., `/app` vs `/app-config`). Always normalize directory paths by appending the platform-specific directory separator character before doing containment checks.
