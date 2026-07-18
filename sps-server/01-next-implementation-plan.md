# SPS Memory Work Plane Implementation Plan

## Local Findings

- `agy.exe` is installed at `C:\Users\young\AppData\Local\agy\bin\agy.exe`.
- `agy --version` returns `1.0.16`.
- The local SPS instance lives at `C:\Users\young\.sps\instances\default`.
- SPS uses embedded Postgres on port `54329`.
- SPS serves locally on `127.0.0.1:3100`.
- SPS is in `local_trusted` and `private` mode.
- An Antigravity adapter plugin is registered in `C:\Users\young\.sps\adapter-plugins.json`.
- `paperclipai` is not currently available on PATH, so plugin install commands from documentation cannot be assumed to work directly from this shell.

## AGY Worker Result

An `agy` read-only architecture worker was executed from this workspace. It confirmed the broad direction:

- SPS should remain the control plane.
- Agents should directly use tools rather than being controlled by a hidden central controller.
- Memory should be added as a curated long-term layer.
- The first safe milestone should avoid deep database/schema changes.

The worker mixed in some Agent Swarm POC files, so the final architecture document corrects the plan back to SPS primitives.

## Implementation Strategy

### Track A: Immediate SPS-Native Memory

This track gives useful memory behavior without waiting for a plugin or core fork.

Deliverables:

- company-level `LEARNINGS.md`
- project-level `LEARNINGS.md`
- agent-level `LEARNINGS.md`
- task close summary template
- AGENTS.md directive for reading and proposing learnings

Pros:

- works today
- easy to inspect and edit
- reversible
- aligns with SPS's managed instruction bundle model

Cons:

- weak retrieval
- no vector/semantic search
- risk of files becoming too large
- must be curated manually at first

### Track B: Memory Sidecar MVP

This track becomes the real long-term memory layer.

Deliverables:

- local memory service
- database tables for candidates, approved memories, links, and retrieval events
- import from issue comments/documents
- search API
- candidate approval workflow
- close-summary generator

Pros:

- structured memory
- provenance
- project/agent/task scoping
- later compatible with UI and retrieval briefs

Cons:

- requires service lifecycle management
- needs SPS integration points
- must avoid becoming a second source of truth

### Track C: SPS Plugin / Minimal Patch

This track connects memory to actual agent runs.

Deliverables:

- pre-run recall brief
- post-run extraction
- issue/project/agent Memory UI
- tool exposure to agents

Preferred order:

1. Try plugin route first.
2. If plugin route is blocked on Windows/local networking, use sidecar and minimal SPS patches.
3. Keep patches isolated and easy to rebase.

## First Implementation Milestone

Do Track A first, then inspect plugin feasibility while Track A is already improving the system.

Concrete steps:

1. Back up current agent instruction bundles.
2. Add `LEARNINGS.md` next to each important agent's `AGENTS.md`.
3. Add a shared company `LEARNINGS.md`.
4. Patch each important `AGENTS.md` with a short institutional memory contract.
5. Add a task close summary template in the workspace documentation.
6. Run one real SPS task and verify whether the CTO/Worker reads and writes the learning journal.

Important agents for first pass:

- Manager / CEO
- CTO
- Designer
- Code Worker
- Art Worker
- QA Worker

## Memory Contract For AGENTS.md

Suggested directive:

```markdown
## Institutional Memory

Before starting meaningful work, read the relevant `LEARNINGS.md` files available in your instruction bundle or project context.

Use memory conservatively:

- Treat learnings as guidance, not proof.
- Prefer recent task comments and source files when they conflict with older learnings.
- When you discover a durable fact, decision, repeated failure mode, project convention, or user preference, propose a dated learning entry in the task comments.
- Do not silently rewrite long-term memory unless the task explicitly asks for memory maintenance.

For task completion, include a close summary with:

- goal
- result
- changed files or artifacts
- verification performed
- durable lessons
- follow-up tasks
```

## Close Summary Template

```markdown
## Close Summary

Goal:

Result:

Artifacts:

Verification:

Durable Lessons:

Memory Candidates:

Follow-up Tasks:
```

## Stop Conditions

Do not continue into database or UI patching until:

- the learning journal flow is verified in one real task
- a canonical memory source is chosen
- plugin feasibility is confirmed
- backup/restore is tested
