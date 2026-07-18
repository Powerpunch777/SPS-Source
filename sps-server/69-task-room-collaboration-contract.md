# Task Room Collaboration Contract

## Purpose

Define the finite SPS Task Room used after a role AI creates work for a
Worker. This contract extends the Room-first model; it does not replace the
long-lived Manager, CTO, Designer, or Worker role Rooms.

## Task Shape

Every created Task is:

- A child SPS issue under the originating Role Room.
- Assigned to the named organization Worker when that runtime is enabled.
- Backed by a `TASK_ROOM_STATE` SPS document.
- A visible comment timeline for Worker progress and owning Lead feedback.
- Finite: it ends with the owning Lead's technical verification, a correction
  cycle, or a blocker report.

`TASK_ROOM_STATE` records the task ID, project ID, originating Room, owning
role, assigned Worker, declared affected paths, approved design references,
acceptance criteria, verification steps, and review state. It contains no raw
conversation transcript, credential, or repository-owned artifact.

## Collision Rule

The owning Lead first calls `preview_task`. It returns active Tasks that touch
the same declared paths.

- No overlap: `create_task` may create the Task.
- Overlap: `create_task` refuses to create the Task until the caller passes all
  conflicting Task IDs as `blockedByIssueIds`.
- The caller therefore decides the sequence; the plugin only enforces that two
  conflicting Tasks do not begin in parallel by accident.

## Feedback, Report, And Technical Review

The Task comment record has four intended message types:

1. Task protocol: written at creation with scope and review boundary.
2. Worker update: progress and evidence while the assigned finite work is in
   progress.
3. Owning Lead feedback: direction or scope correction made in the Task
   itself.
4. Worker result: structured completion or blocker report.

A substantive Worker final report atomically changes the Task to `in_review`.
The Workplane then wakes the originating Lead Room and supplies the report,
Task state, acceptance criteria, and verification evidence. The owning Lead,
not the Worker and not the user, checks the technical acceptance criteria:

- Satisfied: the owning Lead calls `complete_task`, which marks the Task
  `done`, then reports the technical completion from its long-lived Room.
- Not satisfied: the owning Lead posts exact Task feedback. The same Task
  returns to the assigned Worker for a correction cycle.
- Blocked: the Task changes to `blocked`; the owning Lead reports the blocker,
  impact, and the smallest required user or environment action from its Room.

This technical check is never product, design, cost, release, publication, or
user approval. The user can inspect or reopen a completed Task later, but a
Task never creates an approval or question interaction for the user.

## Runtime Boundary

The existing named-pipe `agy` bridge remains a test runner. Its successful
result follows the same `in_review` boundary and is not treated as user
approval. Future SPS-assigned local Workers and specialist API Workers
use this same Task Room contract.

Automatic Lead wake is the default Workplane policy. A company may explicitly
choose the compatibility `manual` review policy for an Agent; that policy
leaves the same durable report in the owning Lead Room but does not start the
Lead turn until a user starts it. It never changes Task ownership or gives the
Worker completion authority.

## Implemented Guardrails

The current `local.room-chat` plugin provides the following tools to every
Agent Room configured as a Lead:

- `preview_task`: reads active Task paths before work is created.
- `create_task`: rejects an overlapping Task until every conflict is supplied
  as a SPS dependency; writes `TASK_ROOM_STATE` and the Task protocol.
- `get_task_context`: reads the finite Task Room state and recent feedback.
- `post_task_feedback`: writes role feedback directly in the Task comment
  timeline without closing or approving the Task.

The implementation detects exactly one substantive Worker final or blocker
report and normalizes the Task to `in_review` or `blocked`. Under the default
automatic policy it starts a durable `task_owner_report` job for the
originating Lead Room. It does not route by `reportsTo`, and it does not use a
central controller. If the Lead Room is busy, the durable job ledger retries
the owner notification after the Room is idle; provider quota failures remain
visible blockers and are never retried automatically.

The `Task Room` Issue detail tab shows the Task protocol, visible feedback,
and current review boundary. Owner feedback is internal Task work; the user
talks to the owning Lead in its long-lived Room for product decisions, major
scope changes, blockers, and the final technical report.
