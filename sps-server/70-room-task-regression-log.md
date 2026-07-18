# Room And Task Regression Log

## Scope

Validate the two workflow boundaries added after the Room-first operating
model:

1. Finite Task Rooms must protect against overlapping edits and wait for user
   review after a successful Worker result.
2. Long-lived Role Room compact must preserve a readable handoff before native
   Codex context compaction changes the active context window.

## Task Room Results

The `local.room-chat` Task Room tool test verifies that:

- `preview_task` finds an active Task that declares the same affected path.
- `create_task` refuses an overlapping Task without the conflicting Task ID as
  a SPS dependency.
- A sequenced Task is created as `todo`, receives `TASK_ROOM_STATE`, and has a
  visible Task protocol comment.
- CTO feedback is written to the finite Task comment timeline.
- Task owner feedback actions fail closed while the Codex Room runtime is
  disabled.

The named-pipe `agy` bridge test also verifies that a successful Worker result
now moves to `in_review`, not `done`. The user retains the final close
decision. A Worker failure remains `blocked` with its report.

## Compact Results

The Room compact test uses a mock Codex app-server and verifies this exact
write order:

1. Write the generated handoff to `ROOM_STATE` with `compactedAt: null`.
2. Append that same handoff to `ROOM_CHECKPOINTS`.
3. Start and complete native Codex compact.
4. Update `ROOM_STATE` with the native compact completion time.

The native compact event alone is never treated as the readable summary. The
stored handoff is the SPS-visible memory checkpoint.

## Current Runtime State

The checks run without an actual Codex turn, Worker assignment, or `agy` job.
The live Room runtime and role-created assigned Tasks remain disabled until
the operator deliberately enables them.

The pre-existing `local.memory-sidecar` plugin was disabled after this check.
Its old project-memory UI and direct `agy` bridge do not participate in the
new Room-first workflow. Re-enable it only for an explicit isolated `agy`
test, then disable it again after the Task has reached user review.
