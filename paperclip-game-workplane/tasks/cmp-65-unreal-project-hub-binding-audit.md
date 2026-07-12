# CMP-65: Read-only Unreal Project Hub binding audit

## Context

A local Unreal project candidate has been discovered:

- Workspace root: `C:\Users\young\Documents\Unreal Projects\강해린`
- Project file: `C:\Users\young\Documents\Unreal Projects\강해린\강해린.uproject`
- Existing `.paperclip-unreal.json` parses as valid UTF-8 JSON and declares Unreal Engine 5.8 plus the same root and project file.

The currently active Paperclip Project is named `Onboarding` and has no `primaryWorkspace`, `localFolder`, repository URL, or workspace record. The discovered Unreal Git repository is on branch `main` but currently has no initial commit, remote, or tracked files.

## Objective

Perform a read-only architecture and safety audit that recommends the correct Paperclip Project Hub binding strategy for this Unreal project, aligned with `02-final-operating-model-ko.md` and the Paperclip-first model.

## Required Questions

1. Should the existing generic `Onboarding` Paperclip Project be reused, renamed, archived, or left as a setup project while a new game-specific `강해린` Project Hub is created? Give one clear recommendation and rationale.
2. What exact minimum metadata and workspace policy should exist before mapping the Direct Task Bridge to this Unreal root?
3. Identify any blocking repository/workspace facts, including Git state, possible untracked generated folders, project file validity, engine path availability, and safety constraints for Unreal binary assets.
4. Define a safe first activation sequence after the user approves the binding. It must keep `enableDirectTaskLaunch=false` until workspace mapping and secret reference are independently verified.
5. Identify the smallest harmless first smoke task that would prove the final Project Hub -> unassigned Task Room -> direct Agy -> finalizer flow without risky game-content changes.

## Boundaries

- Read-only only. Do not modify the Unreal workspace, its Git state, `.paperclip-unreal.json`, `AI_WORKFLOW.md`, Paperclip projects, plugin configuration, bridge configuration, secrets, or `LEARNINGS.md`.
- Do not create/assign/wake Paperclip agents or invoke Direct Task UI/bridge.
- Do not use a model runner inside Paperclip. You are the direct external `agy.exe` Worker.
- This audit may inspect filesystem metadata, Git status, JSON validity, and documented operating-model files.

## Output

Return a concise `## Close Summary` containing:

- a single binding recommendation;
- blockers versus non-blockers;
- exact next activation gates;
- a proposed harmless smoke-task title and expected evidence;
- no implementation changes.
