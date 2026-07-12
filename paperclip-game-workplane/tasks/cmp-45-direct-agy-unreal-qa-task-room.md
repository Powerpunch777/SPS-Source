# CMP-45: Add a direct Agy Unreal QA Task Room workflow

## Objective

Implement the first practical QA Worker path for the local Unreal game project. It must use direct local `agy.exe`, keep the Paperclip Task Room as the system of record, and never wake a Paperclip-managed agent.

## Operating-model contract

- A QA request is an unassigned Paperclip Task Room issue with one concrete objective; the direct worker posts its close summary and the Task Room can be marked done.
- `agent_task_sessions` and Paperclip managed-agent runs are not used by this workflow.
- It must use the bounded read-only Recall Brief and candidate-only memory proposal already present in `Invoke-AgyDirectTask.ps1`.
- User can later invoke this helper directly with a concrete QA goal against the selected local Unreal project.
- Do not modify `02-final-operating-model-ko.md`.

## Required implementation

1. Reuse the hardened Unreal workspace/project-file validation. Do not create a second divergent validator if a shared minimal helper or existing invocation is sufficient.
2. Add a clear QA role mode to the direct runner so the prompt identifies a `QA Worker`, uses `QA/Unreal` scope, and states its default operating boundary:
   - inspect and report by default;
   - do not edit gameplay code, Blueprints, assets, project settings, build, package, launch the editor, or run destructive commands unless the Task Room explicitly authorizes that exact action.
3. Create a PowerShell Task Room helper with a name that makes its direct/local Unreal QA purpose clear. It should:
   - dynamically discover or accept an Unreal workspace;
   - require exactly one in-workspace `.uproject` or an explicit valid in-workspace override;
   - create an unassigned low-priority Paperclip issue only in live mode;
   - invoke `agy.exe` in the validated Unreal workspace;
   - support `-DryRun`, which creates no Paperclip issue, calls no model, and reports zero live runs;
   - optionally mark done and propose candidate memory using the established switches.
4. Ensure the prompt requests an actionable QA result in the Task Room close summary: test scope, reproducible steps or inspection basis, expected versus actual behavior, severity/risk, and recommended next action. Do not require a new game-project document by default; the Task Room comment and run artifact are enough.
5. Add focused tests that cover invalid workspace, missing/multiple `.uproject`, valid explicit in-workspace override, outside-workspace rejection, and end-to-end dry run on the real local Unreal workspace. Assert the QA role/scope/default read-only boundary in the generated prompt.
6. Run the QA-focused test and existing Unreal/recall tests. Add the next numbered implementation log.

## Non-goals

- Do not create or assign any Paperclip Agent Room.
- Do not enable managed post-run candidate extraction.
- Do not implement Unity, Blender, voice, GitHub, or VSCode adapters in this task.
- Do not modify the actual Unreal game code/assets while implementing this workflow.

## Completion format

Return `## Close Summary` with changed files, test commands/results, safety properties, and residual limitations. Include `Memory Candidates:` only for durable lessons and then `Follow-up Tasks:`.
