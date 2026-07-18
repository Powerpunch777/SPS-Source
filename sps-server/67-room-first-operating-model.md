# Room-First Operating Model

## Purpose

This document supersedes the long-lived Agent Room assumptions in the earlier
operating-model drafts. It preserves SPS as the control plane without
claiming that SPS-managed agent runs are interactive chat rooms.

## Verified SPS Constraint

An issue assigned to a SPS-managed agent is eligible for scheduler
execution. It is therefore a Task, not a durable role chat. An unassigned
root issue can provide the visible Room container, comments, documents, and
Task hierarchy, but it does not by itself run a conversational model.

## Final Boundary

| Location | Owns |
| --- | --- |
| SPS Project | Project dashboard, active Tasks, status, assignments, and reviews. |
| SPS Agent Room issue | User-visible Agent conversation, Room documents, and child Tasks. |
| SPS `ROOM_STATE` document | Codex thread identifier, role configuration reference, current durable handoff, and checkpoint metadata. No secrets. |
| SPS `ROOM_CHECKPOINTS` document | Append-only compact and handoff history. No raw secret values. |
| SPS `TASK_ROOM_STATE` document | Finite Task participants, owning role, Worker assignment, declared paths, design references, and review boundary. No raw transcript or secrets. |
| SPS Agent Instructions | Each hired Agent's managed `AGENTS.md`, edited from that Agent's Instructions surface and used as the Agent Room instruction source. No secrets. |
| Design repository | `Project.md`, game designs, decisions, and references. |
| Implementation repository | Source, assets, tests, build artifacts, and project-specific workflow documents referenced by a Task. |
| Shared knowledge repository | Explicitly promoted reusable patterns and references only. |

SPS comments remain the complete visible conversation record. Repositories
never receive copied raw Room transcripts.

## Room Chat Extension

`paperclip-room-chat` is a local SPS plugin, not a SPS core fork.
It owns a `Room Chat` Issue detail tab and uses the supported plugin Worker API
to read SPS comments, issue documents, issues, assignments, and active
Task summaries. Durable Room document writes use SPS's documented local
REST document endpoint with optimistic `baseRevisionId` checks. This is needed
because the current Worker SDK omits `baseRevisionId` while forwarding document
updates, even though SPS itself requires it for an existing document.

The plugin Worker is a protocol bridge to one local Codex app-server process.
For every Room it either starts a Codex thread or resumes the `codexThreadId`
stored in that Room's `ROOM_STATE` document. The process may restart safely:
the Codex thread is persisted by Codex and its non-secret identifier is
persisted by SPS.

The bridge is not a manager or hidden controller. Designer and CTO make the
work decision through their role instructions and call explicit dynamic tools.
The bridge only validates and executes an allowed SPS operation.

Before a live Codex turn begins, the plugin records the user request and the
Codex thread ID in SPS. A sudden local shutdown can therefore lose an
unfinished assistant reply, but not the visible user request or the session
identifier needed to resume the Room. The Room UI marks this condition as a
pending turn rather than presenting a missing reply as completed work.

## Roles And Repositories

Each project begins with one unassigned durable Room for every hired Agent in
the company. A Room title is exactly the Agent name, while its immutable plugin
origin stores the Agent ID. This means two CTOs receive two distinct Rooms and
their different Instructions never collide.

The Room plugin subscribes to `project.created` and creates the missing Agent
Rooms. It also subscribes to `agent.created` so a newly hired Agent receives a
Room in existing Projects, and to `agent.updated` so a Room title follows a
renamed Agent. Provisioning is idempotent: an Agent ID can have only one Room
per Project.

Agent Rooms use status `todo`, not `backlog`. They remain unassigned, so
SPS does not schedule a managed Worker; `todo` only means the durable
conversation space is available. Earlier role-based Rooms are retained as
cancelled history after their replacement Agent Rooms are created.

The Room extension also provides a Project `Workplane` tab. It renders the
project's Agent Rooms and links to the project-specific Task Board. The Task
Board first requires the user to select a Project, then includes only that
Project's finite Tasks and never renders Agent Rooms. SPS's native
all-issue screen remains untouched for upstream compatibility.

- Designer works in the design repository and may create or change design
  artifacts and decisions.
- CTO reads approved design artifacts and active Tasks before splitting work.
- User explicitly requests implementation after reviewing a design. No
  automatic Designer-to-CTO implementation handoff exists.
- CTO may create an implementation Task and assign an organization Worker.
- Code and QA Workers eventually use local models. Until then, `agy` remains
  only a test runner, not the Room runtime.
- Image and Voice workers will use specialist API adapters when connected.

SPS owns each hired Agent's managed `AGENTS.md` through the Agent
Instructions surface. The Room plugin reads the linked Agent's current managed
file on every new or resumed Room thread and injects that content as the Codex
developer instruction. Connection credentials and adapter mechanics are never
placed in those documents.

Project-specific decisions are not global Agent rules. Design and implementation
repositories hold their own artifacts, and a role receives those constraints
only through an explicit design reference, Task contract, or user decision.
Raw Room transcripts are never copied to either repository.

## Tasks And Collision Control

A Task is a finite objective and a child issue of the originating Agent Room.
Its SPS comments are the visible Worker/CTO feedback record and its
`TASK_ROOM_STATE` document holds durable task metadata. A Task does not become
an unbounded second Agent Room.

Worker completion moves a Task to `in_review` with a structured completion
report. The user reviews it and closes it as `done`, requests a correction, or
reopens it. An unresolvable quota, permission, design, or external-tool
problem moves the Task to `blocked` with a structured blocker report for user
review.

Before creating an implementation Task, CTO's SPS tool previews active
Tasks for the project. Overlapping affected files or assets prevent creation
until CTO explicitly sequences the new Task behind the conflicting Task IDs.
The plugin never silently creates parallel edits or reorders the plan.

## Native Codex Compact

The Room extension uses the Codex app-server `thread/compact/start` method.
The native completion stream reports that compaction happened but does not
return the compacted summary text as a Room artifact.

For a manual `/compact`, the extension first asks the current role thread for a
concise handoff summary, writes that text to `ROOM_STATE`, appends checkpoint
metadata to `ROOM_CHECKPOINTS`, and only then starts native compaction. The
user-visible comments remain unchanged.

Automatic Room compaction is enabled only after a preflight checkpoint is
implemented and tested against token-usage events. Until then, a native
automatic compact can preserve the Codex session but cannot be advertised as a
fresh SPS checkpoint.

## Update Strategy

The extension uses SPS's public plugin SDK plus SPS's documented
local Issue Document REST API. It does not patch SPS core or the SDK.
Room document writes are restricted to a loopback SPS URL. SPS
upgrades therefore require the plugin compatibility test and one local Room
document update smoke test, not a merge of local core changes.

The older `local.memory-sidecar` plugin is not part of this operating model.
It remains installed only as a legacy `agy` test-runner path and is disabled by
default so project memory is not collected or presented through SPS.
