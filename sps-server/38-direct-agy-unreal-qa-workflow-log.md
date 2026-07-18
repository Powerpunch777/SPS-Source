# Direct Agy Unreal QA Workflow Log (CMP-45)

## Objective
Implement a practical QA Worker path for the local Unreal game project using the direct local `agy.exe` runner. Keep the SPS Task Room as the system of record and never wake a SPS-managed agent. Implement workspace validation reuse and model prompt customization for the QA Worker role/boundary.

## Design & Implementation Decisions

1. **Shared Workspace Validator Helper**:
   - Created a shared validation script `scripts/Resolve-UnrealWorkspace.ps1` that contains the hardened Unreal workspace/project-file validation.
   - Refactored both `scripts/Invoke-DirectAgyUnrealTaskRoom.ps1` and `scripts/Invoke-AgyDirectTask.ps1` to call this shared validator, eliminating duplication and potential divergence in workspace verification.

2. **QA Worker Mode Prompt Customization**:
   - Added a `[switch]$QA` parameter to the direct task runner `scripts/Invoke-AgyDirectTask.ps1`.
   - When `$QA` is active, the runner modifies the generated model prompt:
     - Identifies the role as `QA Worker`.
     - Sets the context scope to `QA/Unreal`.
     - Appends the default QA operating boundary strictly stating that the agent must inspect and report by default, and must not edit gameplay code, Blueprints, assets, project settings, build, package, launch the editor, or run destructive commands unless explicitly authorized by the Task Room.
     - Adds clear instructions requesting an actionable QA result in the Close Summary under 'Result' (including test scope, reproducible steps/inspection basis, expected vs actual behavior, severity/risk, and recommended next action), without requiring any new game-project document by default.

3. **PowerShell QA Task Room Helper**:
   - Created `scripts/Invoke-DirectAgyUnrealQATaskRoom.ps1` which exposes the same parameters as the standard Unreal helper but invokes `Invoke-AgyDirectTask.ps1` with the `-QA` and `-Unreal` switches enabled.
   - It performs dynamic discovery/validation, creates an unassigned low-priority SPS issue only in live mode, supports `-DryRun`, and supports `-MarkDone` and `-ProposeCandidates`.

## Verification Performed

1. **Focused QA Workflow Tests**:
   - Created `scripts/Test-DirectAgyUnrealQAWorkflow.ps1` covering:
     - Rejecting invalid workspace path.
     - Rejecting missing or multiple `.uproject` files in the workspace.
     - Supporting valid explicit project file override.
     - Rejecting explicit project files outside the workspace or matching sibling directories sharing prefix.
     - Validating the end-to-end dry run on the real local Unreal workspace.
     - Asserting that the generated prompt correctly contains the `QA Worker` role, `QA/Unreal` scope, the default read-only operating boundary, and Close Summary result requirements.
   - All 7 test cases in the suite passed successfully.

2. **Regression & Recall Lifecycle Tests**:
   - Ran `scripts/Test-DirectAgyUnrealWorkflow.ps1` (all 7 tests passed).
   - Ran `scripts/Test-AgyRecallLifecycle.ps1` (all 6 tests passed).

## Durable Lessons
- Shared validation helpers should be extracted early to prevent validation rules (like containment checks and dynamic discovery) from diverging between the task runner layer and workflow wrapper layer.
- Restricting LLM agent actions (such as restricting write operations in a QA task) is best achieved through explicit, structured prompt constraints describing default operating boundaries and the expected output summary format.
