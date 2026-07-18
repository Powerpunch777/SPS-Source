# Correction Log: Direct Task Preview Role Boundary (CMP-51)

## 1. Objective
Correct the non-executing Direct Task Preview boundary text to accurately describe the actual currently verified direct agy worker runner prompts instead of promising a different permission model. This document supersedes the relevant parts of [42-project-hub-direct-task-preview-log.md](file:///C:/Users/young/Documents/AGENT%20%EA%B5%AC%EC%B6%95/sps-server/42-project-hub-direct-task-preview-log.md).

## 2. Corrected Role Boundaries
The role preview data handler (`direct-task-preview`) has been updated to return safety boundaries that match the actual `Invoke-AgyDirectTask.ps1` runner prompts:

- **Unreal Code Worker (`unreal-code`)**:
  - *Previous*: `"Restricted to reading and writing code, header, and configuration files within the Unreal project workspace, with no direct network access or host command execution."`
  - *Corrected*: `"Uses the validated Unreal workspace and defaults to read-only inspection; requested edits are governed by the explicit Task Room scope."`
  - *Rationale*: Avoids inventing unverified network/host-command claims or an artificial code-only constraint, reflecting that the worker uses the validated Unreal workspace and defaults to read-only inspection with edits governed by the Task Room scope.

- **Unreal QA Worker (`unreal-qa`)**:
  - *Previous*: `"Restricted to running test commands, analyzing test output, and reporting test failures, without write access to source code files."`
  - *Corrected*: `"Defaults to inspect and report only. It must not edit gameplay code, Blueprints, assets, settings, build, package, launch the editor, run destructive commands, or run a test command unless the Task Room explicitly authorizes that exact action."`
  - *Rationale*: Aligns the preview boundary with the actual QA prompt, which defaults to inspect and report only and forbids editing code, blueprints, assets, settings, packaging, or running tests/destructive commands unless explicitly authorized by the Task Room.

## 3. Changed Files
- **`sps-memory/dist/worker.js`**: Updated the returned `roleBoundary` text for `unreal-code` and `unreal-qa` in the `handleDirectTaskPreview` handler.
- **`sps-memory/scripts/verify-plugin.mjs`**: Updated assertions to match the new role boundary strings.
- **`42-project-hub-direct-task-preview-log.md`**: Added a pointer to this correction log under a new section.

## 4. Verification Performed
- **Automated Tests**: Ran `npm run check` within the `sps-memory` directory, which successfully executed `verify-plugin.mjs` with the updated assertions. All verification checks passed cleanly.
