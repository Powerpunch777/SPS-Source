# Final Model Fit Audit

## Source Of Truth

`02-final-operating-model-ko.md` supplies the original Paperclip Work Plane
direction. Later operator decisions supersede its old project-memory
assumptions. `67-room-first-operating-model.md` and
`69-task-room-collaboration-contract.md` are the current implementation
contracts.

## Matches

| Agreed behavior | Current implementation |
| --- | --- |
| One project contains long-lived role conversations. | Unassigned root `[Agent Room]` issues with Room Chat, state, checkpoints, and one persisted Codex thread ID per initialized Room. |
| Work is a finite Task Room under the role that created it. | Child Task issue, `TASK_ROOM_STATE`, Task protocol comment, and Task Room tab. |
| CTO/Designer decide and use tools; no hidden controller makes work decisions. | Direct role tools preview, create, inspect, and comment. User actions alone request an owner feedback turn. |
| CTO does not start implementation without design. | CTO implementation Task creation requires declared design references. |
| Avoid concurrent edits to the same paths. | Conflicting paths block Task creation until CTO/Designer sequences the Task with Paperclip dependencies. |
| Worker completion requires user review. | Successful direct `agy` test result moves to `in_review`; final `done` remains a user decision. |
| Room memory belongs in Paperclip; design and implementation artifacts belong in repositories. | `ROOM_STATE`, `ROOM_CHECKPOINTS`, and `TASK_ROOM_STATE` are Paperclip documents. Design and implementation `AGENTS.md` files point to their separate repositories. |
| Native Codex compact must retain a usable handoff. | Summary checkpoint is stored before native compact and displayed in Room Chat. |

## Intentionally Disabled

- `enableCodexRooms`: false. No live Codex thread, cost, or session is started.
- `enableTaskAssignment`: false. No Worker is assigned or woken by the Room
  plugin.
- `local.memory-sidecar`: disabled. It is a legacy `agy` test path, not the
  current project-memory system.

## Remaining Activation Work

The structure is implemented and regression-tested. The remaining work is
operational rather than architectural:

1. Explicitly configure and enable one Codex Role Room for an initial Designer
   conversation.
2. Configure the intended local Worker adapter, enable Task assignment, and
   run one scoped Task through `in_review`.
3. Add specialist Image and Voice adapters only when their API credentials and
   project asset workflow are ready.
