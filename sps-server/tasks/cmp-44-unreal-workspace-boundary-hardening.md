# CMP-44: Harden the direct Unreal workspace boundary

## Objective

Correct the one review finding in the direct `agy.exe` Unreal Task Room workflow: an explicit `-ProjectFile` must belong to the resolved `-WorkspacePath`. A project file outside that workspace must fail closed.

## Contract to preserve

- SPS issue/comment remains the Task Room system of record.
- This is a direct local `agy.exe` worker path, so created issues must remain unassigned and must never create a SPS managed-agent run.
- `-DryRun` creates no SPS issue and invokes no model.
- The Unreal adapter must not build, package, launch, or alter Unreal assets by default.
- Retain the existing requirement: exactly one `.uproject` in the workspace, unless a valid explicit in-workspace `-ProjectFile` is supplied.
- Do not modify `02-final-operating-model-ko.md`.

## Work

1. Inspect `scripts/Invoke-DirectAgyUnrealTaskRoom.ps1` and the `-Unreal` validation in `scripts/Invoke-AgyDirectTask.ps1`.
2. Add robust path containment validation for explicit `-ProjectFile` in both layers. Use resolved paths, preserve PowerShell compatibility, and avoid substring-prefix mistakes such as `C:\\game` matching `C:\\game-old`.
3. Extend `scripts/Test-DirectAgyUnrealWorkflow.ps1` with a regression case proving that an explicit `.uproject` outside the workspace is rejected without issue creation or Agy invocation. Keep the existing valid explicit override test.
4. Run the focused Unreal workflow test and the direct recall lifecycle test.
5. Write a concise implementation/verification log as the next numbered log file. State the fail-closed boundary precisely.

## Completion format

Return a short `## Close Summary` with changed files, test commands/results, and residual limitations. Include `Memory Candidates:` only for durable lessons, then `Follow-up Tasks:`.
