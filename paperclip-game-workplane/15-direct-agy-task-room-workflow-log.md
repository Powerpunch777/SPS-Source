# Direct Agy Task Room Workflow Log

Date: 2026-07-10

## Goal

Create a reusable local workflow for narrow repetitive tasks:

1. Create an unassigned Paperclip Task Room.
2. Run local `agy.exe` directly as a worker.
3. Post the result back to the Task Room.
4. Optionally mark the Task Room done.
5. Verify no Paperclip live run was created.

## Implemented

Added:

- `scripts/Invoke-DirectAgyTaskRoom.ps1`

The script composes existing helpers:

- `New-PaperclipIssueUtf8.ps1`
- `Invoke-AgyDirectTask.ps1`
- `Get-PaperclipLiveRunsUtf8.ps1`

## Architecture Fit

- Paperclip remains the source of truth.
- The created Task Room is still a Paperclip issue.
- No Paperclip agent is assigned by this workflow.
- No hidden central controller is introduced.
- Codex remains the CTO/reviewer.
- `agy.exe` is used as a direct local worker to conserve Codex usage.
- Memory behavior is unchanged.

## Guardrails

- The workflow refuses assigned issues.
- It creates low-priority standard issues.
- Use it for narrow, repetitive, or read-only worker tasks.
- Do not use it for work that requires a real Paperclip agent wake, user approval, or memory promotion.

## Verified

`CMP-16` verified the end-to-end workflow:

- `scripts/Invoke-DirectAgyTaskRoom.ps1` created an unassigned Task Room.
- `agy.exe` ran directly from the local workspace.
- The result comment was posted through the UTF-8 comment helper.
- The issue was marked `done`.
- `assigneeAgentId = null`.
- `liveRunCount = 0` for the issue and company.
- No leftover `agy.exe` process remained after completion.

Output artifact:

- `C:\Users\young\Documents\paperclip-game-workplane\.direct-agy-runs\CMP-16-20260710-001518.output.md`

## Follow-Up

- Keep using this workflow for narrow, repetitive worker tasks.
- Tighten worker prompts when concise output matters.
- Do not use this as a replacement for real assigned Paperclip agent smoke tests.
