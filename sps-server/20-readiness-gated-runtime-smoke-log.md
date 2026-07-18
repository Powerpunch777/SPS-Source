# Readiness-Gated Runtime Smoke Log

Date: 2026-07-10

## Goal

Run the next real SPS CTO -> Code Worker smoke test only after the readiness preflight passes.

## Preconditions

- `scripts\Test-SPSWorkplaneReadiness.ps1 -AsMarkdown` returned `Ready: True`.
- SPS API was healthy.
- Memory Sidecar was healthy with 33 approved memory items and 3 candidates.
- Company live runs were 0.
- CTO and Code Worker were both `idle`.

Before the preflight passed, Code Worker was stuck in `error` with `Antigravity exited with code 1`. This was cleared through SPS's official API:

- `POST /api/agents/bb309102-69c4-4566-9a4d-07e7882945d8/clear-error`

## Task Rooms

- Parent: `CMP-21` (`cfaecad1-9837-4066-96df-eb461e44864b`)
- Child: `CMP-22` (`cb356ecd-5e09-469b-8a65-ecc37017a46a`)

## Verified Flow

- `CMP-21` was created as the parent Task Room and assigned to CTO.
- CTO used the existing memory/readiness model and directly created exactly one child Task Room.
- `CMP-22` was created by CTO and assigned to Code Worker.
- Code Worker read the child Task Room scope, confirmed the parent/child handoff, posted a close summary, and marked the child done.
- CTO reviewed the child and closed the parent.
- Final readiness returned `Ready: True` and company live runs returned 0.

## Architecture Fit

- SPS issue remains the Task Room.
- `agent_task_sessions` / heartbeat runs stayed internal.
- CTO directly created the child Task Room; no hidden controller was introduced.
- Memory Sidecar stayed in recall/candidate mode.
- No approved `LEARNINGS.md` journal was auto-mutated.

## New Hardening Finding

The Code Worker instruction previously told the worker to use local PowerShell helper scripts for comments and status updates. In a real assigned SPS runtime, those helper writes can be recorded as `local-board` rather than as the active agent/run.

Observed effect:

- Code Worker completed `CMP-22`.
- A board-authored close comment and board-authored status update caused extra Code Worker automation wakeups after completion.
- Redundant runs were cancelled through the official heartbeat cancel API:
  - `4b48f99a-80bb-40be-9be8-21cb47e1d1bd`
  - `6f19300e-db4e-45f7-b2a9-70a342fa8903`

## Implemented Guard

Added a default safety guard to:

- `scripts\Add-SPSIssueCommentUtf8.ps1`
- `scripts\Update-SPSIssueUtf8.ps1`
- shared helper: `scripts\SPSApiUtf8.ps1`

If no `PAPERCLIP_API_KEY` is present and the target issue has an assignee, the helpers now refuse the write unless `-AllowBoardWriteToAssignedIssue` is passed for deliberate manual cleanup.

Updated Code Worker instructions to avoid unauthenticated local-board helper writes inside real assigned SPS runtimes.

## Task-Bridge Setup

Created a Code Worker task-bridge key:

- Key ID: `67822ce5-2049-4f5c-857e-043d6c4fe1eb`
- Scope: project `2e0a5142-c2d2-4f23-8079-a287e8c8e59f`
- Allowed assignee: Code Worker `bb309102-69c4-4566-9a4d-07e7882945d8`

Injected the token into Code Worker's adapter env as:

- `TASK_BRIDGE_API_KEY`

The helper scripts now accept `TASK_BRIDGE_API_KEY` as an API bearer token. `PAPERCLIP_*` env names are not suitable for adapter config because SPS strips those runtime keys before dispatch.

## Next Step

Completed in `CMP-23` and recorded in `21-task-bridge-close-smoke-log.md`: Code Worker closed through the task-bridge path, the close comment was agent-authored, the issue stayed done, and company live runs returned to 0 without redundant automation wakeups.
