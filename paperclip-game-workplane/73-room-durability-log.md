# Room Durability Log

## Crash Boundary

Role Room comments and state are written to Paperclip, not held only in the
plugin process. Version `0.1.5` adds an explicit pre-turn persistence boundary:

1. Save the user Room comment.
2. Open or resume the Codex thread.
3. Persist the Codex thread ID and `pendingTurn` in `ROOM_STATE`.
4. Run the Codex turn.
5. Save the assistant comment and clear `pendingTurn` only after a completed
   result is recorded.

The same pattern is used before compact handoff turns and explicit Task owner
feedback turns.

## Failure Behavior

If the computer or process stops after step 3, the next Room load has the
user's original comment, the durable Codex thread ID, and a visible pending
turn marker. The assistant response may be absent because it was not yet
written to Paperclip; this is shown as an incomplete turn that can be resumed
or reviewed, not as a successful answer.

## Verification

The durability test simulates a Codex process failure after thread creation.
It verifies that the user comment, thread ID, source comment ID, and pending
turn marker are all persisted before the failed turn returns.
