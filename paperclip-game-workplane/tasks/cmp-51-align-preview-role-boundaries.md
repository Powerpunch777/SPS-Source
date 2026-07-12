# CMP-51: Align Direct Task Preview role boundaries with real worker prompts

## Objective

Correct the non-executing Direct Task Preview text so it describes the **actual currently verified direct Agy worker boundaries** and does not promise a different permission model.

## Review finding

`direct-task-preview` currently returns role boundary text that says:

- Unreal QA Worker is restricted to “running test commands”; and
- Unreal Code Worker is restricted to code/config files with no direct network/host command access.

Those statements do not match the current runner prompts exactly:

- QA defaults to **inspect and report only**. It must not edit gameplay code, Blueprints, assets, settings, build, package, launch the editor, run destructive commands, or run a test command unless the Task Room explicitly authorizes that exact action.
- Code uses the validated Unreal workspace and defaults to read-only inspection; requested edits are governed by the explicit Task Room scope. The preview must not invent unverified network/host-command claims or an artificial code-only constraint.

## Work

1. Inspect `scripts/Invoke-AgyDirectTask.ps1` role prompt construction and `paperclip-memory-plugin/dist/worker.js` preview handler.
2. Update the worker preview role labels/boundaries and the UI result rendering if needed to accurately state the above behavior in concise user-facing language.
3. Update `scripts/verify-plugin.mjs` to assert the corrected text so it cannot regress.
4. Update the CMP-50 implementation log with an explicit pointer to the correction, preserving history, and create `43-direct-task-preview-role-boundary-correction-log.md`.
5. Run `npm run check`.

## Hard boundaries

- Keep the preview data handler read-only.
- Add no plugin capabilities, no routes, no Bridge code/configuration, no issue creation, and no runtime installation.
- Do not change `02-final-operating-model-ko.md`, actual Unreal runner behavior, Memory Sidecar, or game files.

## Completion format

Return `## Close Summary` with exact corrected behavior, changed files, and test results. `Memory Candidates:` must be empty.
