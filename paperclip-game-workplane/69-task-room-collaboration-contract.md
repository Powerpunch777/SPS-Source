# Task Room Collaboration Contract

## Purpose

Define the finite Paperclip Task Room used after a role AI creates work for a
Worker. This contract extends the Room-first model; it does not replace the
long-lived Manager, CTO, Designer, or Worker role Rooms.

## Task Shape

Every created Task is:

- A child Paperclip issue under the originating Role Room.
- Assigned to the named organization Worker when that runtime is enabled.
- Backed by a `TASK_ROOM_STATE` Paperclip document.
- A visible comment timeline for Worker progress and CTO feedback.
- Finite: it ends in user review or a blocker report.

`TASK_ROOM_STATE` records the task ID, project ID, originating Room, owning
role, assigned Worker, declared affected paths, approved design references,
acceptance criteria, verification steps, and review state. It contains no raw
conversation transcript, credential, or repository-owned artifact.

## Collision Rule

CTO or Designer first calls `preview_task`. It returns active Tasks that touch
the same declared paths.

- No overlap: `create_task` may create the Task.
- Overlap: `create_task` refuses to create the Task until the caller passes all
  conflicting Task IDs as `blockedByIssueIds`.
- The caller therefore decides the sequence; the plugin only enforces that two
  conflicting Tasks do not begin in parallel by accident.

## Feedback And Review

The Task comment record has four intended message types:

1. Task protocol: written at creation with scope and review boundary.
2. Worker update: progress, evidence, or an explicit request for CTO feedback.
3. CTO feedback: direction or scope correction made in the Task itself.
4. Worker result: structured completion or blocker report.

A successful Worker result changes status to `in_review`. The user then
accepts it as `done`, asks for correction, or reopens it. A permanent blocker
changes status to `blocked` and must include the reason, attempted paths, and
the decision or permission needed from the user.

## Runtime Boundary

The existing named-pipe `agy` bridge remains a test runner. Its successful
result follows the same `in_review` boundary and is not treated as automatic
user approval. Future Paperclip-assigned local Workers and specialist API
Workers use this same Task Room contract.

## Implemented Guardrails

The `local.room-chat` plugin version `0.1.3` provides the following role tools
for Manager, CTO, and Designer Rooms:

- `preview_task`: reads active Task paths before work is created.
- `create_task`: rejects an overlapping Task until every conflict is supplied
  as a Paperclip dependency; writes `TASK_ROOM_STATE` and the Task protocol.
- `get_task_context`: reads the finite Task Room state and recent feedback.
- `post_task_feedback`: writes role feedback directly in the Task comment
  timeline without closing or approving the Task.

The implementation does not yet create automatic CTO turns from a Worker
comment. A Worker must explicitly request CTO feedback in the Task timeline,
and the CTO or user decides when to respond. This preserves the agreed
no-hidden-controller model.

The `Task Room` Issue detail tab shows the Task protocol, visible feedback,
and current review boundary. Its `Ask <owner role>` action is an explicit user
action: it resumes the owning Role Room's Codex thread, asks only for Task
guidance, and writes the reply back into the Task comment timeline. The action
is disabled until the local Codex Room runtime is deliberately enabled.
