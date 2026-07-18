# SPS Runtime Smoke Test Log

Date: 2026-07-09

## Goal

Verify the real SPS-first flow:

1. A SPS issue acts as a Task Room.
2. The assigned CTO agent is executed by SPS.
3. The CTO uses memory recall and creates a child Task Room for Code Worker.
4. Code Worker completes the child Task Room with a close summary.
5. SPS comments, issue status, and child issues remain the source of truth.

## Parent Task Room

- Identifier: `CMP-8`
- Issue ID: `b0f4c0f7-5f38-49ed-a97a-722650a62428`
- Title: `Smoke test: CTO memory handoff flow`
- Assignee: CTO `dfdde6a7-ae30-43f8-8b65-593c7eecf171`
- Project: `2e0a5142-c2d2-4f23-8079-a287e8c8e59f`
- Goal: `0cfb833b-3264-4209-b017-c4a6a3be06c1`

The issue instructed the CTO to recall Task Room memory, confirm the `Task Room` vs `agent_task_sessions` model, create a child Task Room for Code Worker, and keep the parent open until worker completion.

## First Attempt

Initial CTO execution was blocked by Codex adapter quota.

Verified during the blocked phase:

- SPS created `CMP-8` as an issue-backed Task Room.
- Assignment triggered SPS's issue execution path.
- Failed runs remained internal execution records.
- The user-facing work surface remained issue/comment state.
- Memory Sidecar and the SPS plugin API were already verified separately.

## Resumed Attempt

After quota recovered, `CMP-8` was resumed.

Observed:

- CTO used memory recall fallback and confirmed that Task Rooms are SPS issues.
- CTO confirmed `agent_task_sessions` / heartbeat runs are internal execution records, not user-facing chat rooms.
- CTO created `CMP-9` for Code Worker.
- `CMP-9` proved the CTO -> child Task Room -> Code Worker path, but the Korean handoff text was corrupted by Windows/PowerShell encoding.
- Code Worker still completed `CMP-9` and left a close summary.
- CTO created `CMP-10` with an ASCII handoff to avoid encoding corruption.
- Code Worker completed `CMP-10` and left a clean close summary.

## Result

Status: architecture flow verified, with runtime hardening required.

Verified:

- SPS issue-backed Task Rooms are the working user-facing control plane.
- CTO can create and assign child Task Rooms directly.
- Code Worker can complete child Task Rooms and report with close summaries.
- Memory Sidecar works as recall/candidate support.
- Memory did not mutate approved `LEARNINGS.md`.
- Memory did not create, assign, route, or close tasks.

Remaining runtime risks:

- Korean issue descriptions/comments can corrupt through Windows/PowerShell encoding if UTF-8-safe creation is not enforced.
- Backticks and escape sequences in PowerShell-generated comments can trigger database insertion problems if strings are not safely quoted.
- Some heartbeat/live run records can continue or re-wake after issue completion; cleanup and wake policy need follow-up verification.
- Codex usage can drain quickly if SPS wakes Codex agents repeatedly; repetitive worker tasks should be delegated to `agy`.

## Child Task Rooms

### CMP-9

- Purpose: first Code Worker child smoke test.
- Result: completed.
- Note: handoff text had Korean encoding corruption, so it is not the clean reference run.

### CMP-10

- Purpose: clean ASCII handoff replacement for `CMP-9`.
- Result: completed.
- Note: this is the reference run for the verified CTO -> Code Worker handoff.

## Guardrail

For the next implementation step:

- Use `agy` for repetitive worker execution.
- Keep Codex as lightweight CTO/reviewer.
- Before creating more SPS wakeups, fix or document the live-run cleanup behavior.
- Use UTF-8-safe writes for any Windows-generated SPS descriptions/comments.
