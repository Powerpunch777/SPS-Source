# SPS Game Production Work Plane

> ## Current Canonical Architecture
>
> This document retains the original work-plane analysis. The current SPS platform
> architecture is defined in [111-sps-owner-host-and-memory-platform-architecture-ko.md](111-sps-owner-host-and-memory-platform-architecture-ko.md).
> In particular, the earlier "plugin or sidecar first" memory decision is superseded:
> SPS Core owns the durable memory contract and lifecycle, while SPS Default Memory
> is a bundled first-party provider. Alternative providers remain replaceable.

## Decision

Use SPS as the base control plane.

SPS already has the right production shape for the target system:

- company/project boundaries
- agents with roles and reporting lines
- issue-based task rooms
- comments as room conversation
- documents and work products as durable artifacts
- child issues for delegated work
- agent task sessions for per-agent execution state
- heartbeat runs for controlled agent activity

The missing layer is long-term memory, not a new swarm runtime.

## Product Shape

The target is a two-person game development production tool where AI agents behave like a small studio team.

Core roles:

- Manager AI: backlog, status, schedule, routing, and human-facing summaries.
- Designer AI: game design docs, system docs, UX flows, economy/combat/narrative specs.
- CTO AI: implementation architecture, task decomposition, worker assignment, review.
- Code Worker AI: code changes, bug fixes, build support, repository maintenance.
- Art Worker AI: image, Blender, Unity/Unreal asset support.
- Voice Worker AI: voice generation, cleanup, naming, import preparation.
- QA Worker AI: test plans, bug reports, repro steps, release checks.

The work model is agent-led. The CTO or Manager uses tools directly to create child task rooms, assign workers, request confirmation, attach documents, and close completed work. There is no hidden central controller deciding the workflow.

## Room Model

### Project Hub Room

A project hub is the long-lived room for one game project.

It stores:

- high-level game direction
- milestones
- active risks
- current backlog
- project-wide decisions
- source repository/workspace links
- shared style and production rules

SPS mapping:

- `projects`
- `project_workspaces`
- one top-level issue used as the project hub
- project-level documents
- project-level memory namespace

### Agent Room

An agent room is a long-lived role room inside a project.

Examples:

- CTO room
- Designer room
- Code Worker room
- Art Worker room
- QA room

It stores:

- role-specific operating notes
- role-specific current context
- recurring questions and decisions
- handoff notes from other agents
- role-specific memory candidates

SPS mapping:

- top-level or project-child issue assigned to that agent
- `agent_task_sessions` for actual execution sessions
- agent instruction bundle
- agent-level memory namespace

### Task Room

A task room is a goal-bound work room. It opens for one concrete objective and closes when the objective is done, cancelled, or split.

Examples:

- "Implement player dash prototype"
- "Create combat feel test scene"
- "Investigate packaging failure"
- "Write QA checklist for vertical slice"

SPS mapping:

- `issues`
- `issue_comments`
- `issue_documents`
- `issue_work_products`
- `execution_workspaces`
- parent/child issue relationship
- assignee agent as the current owner

In this model, the task room is the visible collaboration unit. `agent_task_sessions` are not chat rooms; they are the per-agent execution records underneath a task room.

## Memory Architecture

The memory system should be a SPS plugin or sidecar first. Core SPS edits should be minimal so upstream updates remain easy.

### Memory Scopes

Memory must be scoped tightly enough to prevent cross-project contamination.

Required scopes:

- `company`: durable studio-wide preferences and operating rules.
- `project`: game-specific decisions, style, technical constraints, build rules.
- `agent`: role-specific learned behavior and recurring traps.
- `task`: important context for a specific task room.
- `artifact`: memory linked to files, docs, builds, assets, or bug reports.
- `user`: human preferences, approval style, recurring constraints.

Recommended namespace format:

```text
company:{companyId}
project:{projectId}
project:{projectId}:agent:{agentId}
project:{projectId}:issue:{issueId}
project:{projectId}:artifact:{artifactId}
user:{userId}
```

### Memory Objects

Use two layers: raw evidence and curated memory.

Evidence records:

- issue comments
- document revisions
- work products
- run summaries
- tool results
- changed file lists
- test/build outcomes

Curated memory records:

- decisions
- preferences
- constraints
- recurring bug fixes
- project conventions
- asset pipeline rules
- role procedures
- rejected approaches

Minimal schema:

```text
memory_items
- id
- company_id
- project_id
- namespace
- scope
- type
- title
- body
- status: candidate | approved | rejected | deprecated | superseded
- importance
- confidence
- source_type
- source_id
- source_url_or_path
- created_by_agent_id
- approved_by_user_id
- created_at
- updated_at
- expires_at

memory_links
- id
- from_memory_id
- to_memory_id
- relation: supports | contradicts | supersedes | related | caused_by

memory_retrieval_events
- id
- run_id
- issue_id
- agent_id
- query
- returned_memory_ids
- accepted_memory_ids
- created_at
```

### Agent Tools

Agents should call memory tools directly.

Required tools:

- `memory_search(query, scopes, limit)`: recall relevant project/agent/task memory.
- `memory_propose(content, type, source)`: propose a candidate memory.
- `memory_promote(candidateId)`: approve and promote, usually human/Manager/CTO guarded.
- `memory_update(memoryId, patch)`: revise stale memory.
- `memory_forget(memoryId, reason)`: deprecate or reject bad memory.
- `memory_link(memoryId, issueId|artifactId)`: attach memory to a task room or artifact.
- `memory_close_issue(issueId)`: summarize a closing task and generate candidates.

### Run Lifecycle

Before run:

1. Resolve company, project, issue, parent issue chain, assignee agent, and role.
2. Retrieve bounded memory from company/project/agent/task namespaces.
3. Build a short recall brief.
4. Inject the brief into the local adapter context.

During run:

1. Agent can explicitly call `memory_search`.
2. Agent can propose or retain important findings.
3. Agent can create child issues and assign workers using SPS tools.

After run:

1. Extract candidate memories from comments, documents, tool outputs, and work products.
2. Store candidates, not automatic truths.
3. Record retrieval and extraction metadata against the run.

On task close:

1. Generate close summary.
2. Record final outcome.
3. Link changed files/assets/docs.
4. Store verification state.
5. Propose durable memories.
6. Mark unresolved follow-up work.

## UI Surfaces

Start with small UI additions:

- Project Memory tab
- Agent Memory tab
- Task Room Memory panel
- Candidate queue
- Source/provenance viewer
- Recall preview for the next run

Do not start with a graph UI. Graphs can come later after the memory quality is proven.

## Plugin / Sidecar Strategy

Keep SPS update-friendly:

1. Prefer a SPS plugin if current local SPS supports the needed event hooks and UI extension points.
2. Use a sidecar service when the plugin API cannot reach a needed local resource.
3. Keep SPS core patches minimal and isolated.
4. Never replace SPS's issue/comment/document/work-product model.
5. Keep a separate migration path for memory storage.

The sidecar owns memory storage and retrieval. SPS remains the system of record for work.

## Existing Solutions To Borrow From

### Honcho for SPS

Honcho's SPS integration is the closest structural match. It keeps SPS as the system of record and maps SPS company to workspace, issue to session, and humans/agents to peers. It also syncs issue comments and document revisions, exposes an issue-level Memory tab, and gives agents retrieval/peer-chat tools.

Useful ideas:

- SPS remains the work system of record.
- Issue equals memory session.
- Agents and humans are first-class actors.
- Memory sync starts from comments and documents.
- Manual prompt preview is safer than aggressive automatic injection.

Reference: https://github.com/plastic-labs/paperclip-honcho

### Hindsight for SPS

Hindsight's SPS integration is useful for lifecycle design. It recalls memory before a run, retains issue comments, exposes explicit recall/retain tools, and supports Codex through the SPS event system.

Useful ideas:

- `agent.run.started` recall
- `issue.comment.created` retain
- explicit `recall` and `retain` tools
- bank granularity by company and agent
- self-host option for local testing

Reference: https://hindsight.vectorize.io/sdks/integrations/paperclip

### SPS Upstream Issues

SPS upstream already identifies this problem:

- #460 proposes an agent memory store with `agent_memories`, CRUD API, prompt injection, and Memory tab.
- #764 proposes cross-agent namespace memory.
- #854 covers adapter integration for pre-run briefs and post-run extraction.
- #855 covers operator UI for namespaces and secrets.
- #3326 describes a file-based `LEARNINGS.md` workaround that production users can use before a full database memory system ships.

References:

- https://github.com/paperclipai/paperclip/issues/460
- https://github.com/paperclipai/paperclip/issues/764
- https://github.com/paperclipai/paperclip/issues/854
- https://github.com/paperclipai/paperclip/issues/855
- https://github.com/paperclipai/paperclip/issues/3326

## Recommended Build Path

### Milestone 0: Confirm Plugin Feasibility

Goal: determine whether the local SPS instance can install or load plugins on Windows.

Checks:

- plugin install path
- plugin settings UI
- event hooks available locally
- whether Hindsight or Honcho can be installed directly
- whether localhost sidecar calls work from plugin code

Outcome:

- choose plugin-first or sidecar-first implementation.

### Milestone 1: File-Based Learning Journal

Goal: immediate memory improvement with minimal risk.

Implement:

- company `LEARNINGS.md`
- project `LEARNINGS.md`
- agent `LEARNINGS.md`
- task close summary template
- AGENTS.md directive: read relevant learnings before work and propose new learnings after meaningful work.

This is not the final memory system, but it gives useful behavior quickly and aligns with SPS issue #3326.

### Milestone 2: Memory Sidecar MVP

Goal: structured memory without deep SPS fork.

Implement:

- local sidecar service
- SQLite or Postgres memory tables
- import/sync from issue comments and document revisions
- `memory_search`
- `memory_propose`
- `memory_close_issue`
- basic candidate approval CLI or small web UI

### Milestone 3: SPS Integration

Goal: make memory available inside real agent runs.

Implement:

- pre-run recall brief
- post-run candidate extraction
- issue Memory panel or plugin tab
- source links back to issue comments/docs/work products

### Milestone 4: Game Tool Integration

Goal: connect production tools.

Add role-specific workers:

- GitHub issue/PR sync
- Unity/Unreal build commands
- Blender asset scripts
- image generation/import pipeline
- voice generation/import pipeline
- QA test report templates

Memory should remember tool-specific rules and failures, not replace the tools.

## First Task For Implementation

Build the Milestone 0/1 bridge:

1. Inspect local SPS plugin support and current managed instruction bundles.
2. Add a non-invasive learning journal structure to the existing agent instruction folders.
3. Add or update AGENTS.md directives so agents read project/company/agent learnings before work.
4. Create a task close summary template.
5. Do not modify SPS database schema yet.

This path is reversible and upstream-safe.

## Non-Goals

- Do not rebuild SPS on Agent Swarm.
- Do not make a central controller that overrides CTO/Manager agency.
- Do not auto-promote every comment into memory.
- Do not build a memory graph UI before retrieval quality is proven.
- Do not mix Codex native memory, file journals, Honcho, Hindsight, and custom sidecar as equal sources of truth.

## Key Risk

The biggest risk is split-brain memory: the same fact stored differently in SPS comments, agent files, Codex memory, Honcho/Hindsight, and a custom sidecar. The product must name one canonical memory layer and treat every other source as import/evidence.
