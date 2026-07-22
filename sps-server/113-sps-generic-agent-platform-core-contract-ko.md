# SPS Generic Agent Platform Core Contract

Updated: 2026-07-22

> **문서 상태: Core compatibility contract**
> 이 문서는 범용 Core가 보장하는 중립 용어와 경계를 정의한다. SPS 제품 범위와 Extension Profile은 `114-sps-product-and-plugin-platform-contract-ko.md`, 표준화와 저작 도구의 구현 순서는 `115-sps-plugin-kit-and-bundled-teams-implementation-plan-ko.md`가 우선한다.

## Decision

SPS Core does not prescribe a company hierarchy, a project hierarchy, a task
screen, or a specific agent organization. It provides a small neutral contract
that every extension can share:

```text
Organization + permissions
Agent registry
Thread
Run
Store
Backend
Artifact and event log
Extension API
```

`Project`, `Issue`, `Room`, `Lead`, `Worker`, `Discord channel`, and
`OpenHands conversation` are not mandatory Core concepts. They are a
workplane's interpretation of these primitives.

## Core Terms

| Core term | Responsibility | Current SPS compatibility source |
| --- | --- | --- |
| Organization | Ownership, members, permissions, audit boundary | Company |
| Work Item | A unit of work with lifecycle and artifacts | Issue / Task |
| Thread | Durable conversation context for an agent or group | Agent task session plus Room history |
| Run | One bounded execution attempt with logs and result | Heartbeat run |
| Store | Durable provider with scope, health, and evidence rules | Plugin state, Default Memory, artifact storage |
| Backend | Where a run is executed | Agent adapter, SPS Node, sandbox, remote service |
| Extension | A separately versioned product behavior | Workplane, memory provider, backend provider, UI surface |

The first Core implementation is deliberately a **compatibility layer**. It
does not migrate or delete existing records. Existing `Issue`,
`agent_task_sessions`, and `heartbeat_runs` remain authoritative while the
new contract provides one stable vocabulary for new extensions.

SPS Extension Profile은 이 중립 용어를 현재 Core plugin SDK의 manifest,
capability, worker, UI slot, job API에 연결하는 제품 수준의 호환 표준이다.
Profile은 두 번째 runtime이나 두 번째 Core 객체 모델을 만들지 않는다.

## Invariants

1. Every Thread, Run, Store query, and Artifact reference has an Organization
   scope. Optional project, work item, agent, thread, and artifact IDs are
   normalized to `null` rather than omitted.
2. A Run is an execution record, not the conversation itself. A Thread can
   have many Runs and can outlive a failed or compacted CLI session.
3. A Store is replaceable. The Core owns scope validation, authorization,
   lifecycle events, and audit; the provider owns summary, retrieval, vector,
   Obsidian, or other memory strategies.
4. A Backend only receives an explicit, scoped execution request. It never
   receives a user's complete vault, unrelated agent credentials, or another
   computer's private CLI session.
5. A Workplane may define its own labels and flow, but must map its user-facing
   objects back to the Core terms above.

## Extension Profiles

### SPS Workplane

```text
Project -> long-lived Agent Room (Thread)
Lead Room -> creates Worker Work Item
Worker Work Item -> bounded Worker Thread + Runs
final/blocker report -> originating Lead Thread
```

The current `local.room-chat` plugin remains supported. It becomes the first
official `workplane` profile rather than a behavior embedded in Core.

### OpenHands-style profile

```text
Conversation -> Thread
Agent execution -> Run
local/Docker/remote agent server -> Backend
workspace/files -> Artifact Store
```

### EJClaw-style profile

```text
Discord channel -> Thread
Owner / Reviewer / Arbiter passes -> related Runs
SQLite worktree artifacts -> Artifact Store
```

## Migration Plan

### Phase A: contract and compatibility (this change)

- Add the versioned `Agent Platform Contract` to SPS Core shared and Plugin SDK
  packages.
- Preserve existing data and APIs.
- Give plugin authors a generic, versioned vocabulary before adding new
  behaviors.

### Phase B: Core service facade (in progress)

- Add `platform.threads`, `platform.stores`, and `platform.backends` to the
  Plugin SDK. `platform.threads.send()` returns the initial neutral Run record.
- Adapt them to existing session, heartbeat, state, and agent adapter services.
- Add `thread` as a first-class Core state scope without a database migration;
  the existing `plugin_state.scope_kind` column is text and remains compatible.
- Add a read facade for persisted Run state and an SPS Node backend health
  facade after the next Core service audit.
- Keep old SDK calls working for installed plugins.

### Phase C: Store provider lifecycle

- Keep the existing Core memory-provider declaration, readiness listing, scope,
  and lifecycle contract as the Store Provider base.
- Expose it through the neutral `store_provider` extension identity and expand
  the Core facade with health, checkpoint, compact-result capture, export, and
  import operations.
- Package SPS Default Memory as the first bundled provider.
- Keep Git, Obsidian, vector, and minimal-memory implementations optional
  providers.

### Phase D: Workplane profiles

- Declare SPS Rooms as the official `sps-lead-worker` workplane profile.
- Add profile templates for individual development, small teams, OpenHands-like
  execution, and third-party workflows without changing the Core schema.

### Phase E: native neutral records

- Introduce dedicated neutral Thread and Store registry tables only after the
  facade has been proven against real SPS Rooms and an external profile.
- Migrate incrementally with reversible imports; never delete legacy records
  during migration.

## Acceptance Checks

- Existing SPS projects, Rooms, Tasks, and run history continue to work.
- A new workplane can use the generic vocabulary without depending on
  `Designer`, `CTO`, `Lead`, `Worker`, or a game-specific repository layout.
- A memory provider failure never prevents a Thread or Run from being recorded.
- A backend or Node failure produces a durable Run result that the active
  workplane can interpret.
- The SDK rejects incompatible major contract versions before an extension is
  enabled.
