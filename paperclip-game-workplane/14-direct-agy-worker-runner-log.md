# Direct Agy Worker Runner Log

Date: 2026-07-10

## Goal

Add a reusable way for Codex to act as CTO while delegating repetitive worker execution to local `agy.exe`, without waking Paperclip agents or draining Codex usage.

## Implemented

Added:

- `scripts/Invoke-AgyDirectTask.ps1`

The runner:

- Fetches a Paperclip issue as the Task Room context.
- Builds a scoped worker prompt.
- Runs `agy.exe --print` locally.
- Stores prompt/output artifacts under `.direct-agy-runs`.
- Posts the worker result back to the Paperclip issue through the UTF-8 comment helper.
- Optionally marks the issue `done`.
- Optionally proposes the close-summary `Memory Candidates:` section to the Memory Sidecar candidate inbox.

## Architecture Fit

- Paperclip remains the source of truth.
- Task Rooms remain Paperclip issues.
- The runner does not introduce a hidden central controller.
- It does not assign or wake Paperclip agents.
- It is a CTO-operated local worker adapter for saving Codex usage.
- Memory behavior remains candidate-only: Memory Sidecar can receive opt-in candidates, but approved `LEARNINGS.md` files are not mutated.

## Guardrails

- Use this runner for narrow, repetitive, or read-only worker tasks.
- Do not use it to bypass explicit user approval gates.
- Do not use it to mutate approved `LEARNINGS.md`.
- For real Paperclip agent behavior, still verify with assigned-agent smoke tests when Codex usage allows.

## Verified

- `CMP-15` verified that `agy.exe` output is posted as a comment, issue completion works, and no Paperclip live run is created because the issue is unassigned.
- `CMP-19` verified opt-in memory candidate proposal through the Memory Sidecar.

## Smoke Test Notes

- `CMP-14` verified the main runner path: direct `agy.exe` output was posted, the issue was marked `done`, and no live run was created.
- A formatting bug was found in the runner metadata header: Markdown-style backticks before PowerShell variables prevented interpolation of `Issue`, `Exit code`, and `Output artifact`.
- The runner header was corrected to plain interpolated text.
- `CMP-15` verified the corrected runner header:
  - `Issue: CMP-15`
  - `Exit code: 0`
  - `Output artifact: C:\Users\young\Documents\paperclip-game-workplane\.direct-agy-runs\CMP-15-20260710-000936.output.md`
- `CMP-15` was unassigned, marked `done`, and had `liveRunCount = 0`.

## Current Status

The direct local `agy.exe` worker runner is usable for narrow unassigned Task Rooms. It keeps Paperclip as the source of truth while avoiding Paperclip agent wakeups and Codex usage drain.

Use `-ProposeCandidates` only when the close summary contains memory candidates worth sending to the review inbox.
