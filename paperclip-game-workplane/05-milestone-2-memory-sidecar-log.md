# Milestone 2 Memory Sidecar Log

Date: 2026-07-09

## Goal

Create a lightweight Memory Sidecar MVP that supports the agreed Paperclip-first game-production structure.

The sidecar is an assistive recall service only. It must not act as a controller.

## Implemented

Created:

- `paperclip-game-workplane/memory-sidecar/memory-sidecar.mjs`
- `paperclip-game-workplane/memory-sidecar/start-memory-sidecar.ps1`
- `paperclip-game-workplane/memory-sidecar/memory-recall.ps1`
- `paperclip-game-workplane/memory-sidecar/memory-propose.ps1`
- `paperclip-game-workplane/memory-sidecar/config.example.json`
- `paperclip-game-workplane/memory-sidecar/config.local.json`
- `paperclip-game-workplane/memory-sidecar/README.md`

Updated:

- `.gitignore`
- `paperclip-game-workplane/04-structure-fit-checklist.md`

## Endpoints

```text
GET  /health
GET  /memory/items?scope=company,project,agent&includeWarnings=true
GET  /memory/search?q=Task%20Room&scope=project&limit=3
GET  /memory/candidates?limit=50&offset=0
POST /memory/candidates
```

## Agent Helpers

```powershell
.\memory-recall.ps1 -Query "Task Room" -Scope project -Limit 5
.\memory-propose.ps1 -Scope project -Type decision -Content "Task Rooms are Paperclip issues with one goal."
```

The active Manager, CTO, and Code Worker instructions now mention these helpers as optional. If the sidecar is not
running, agents must continue from learning journals, task comments, documents, work products, and source files.

## Behavior

The sidecar:

- reads configured company/project/agent `LEARNINGS.md` journals
- parses dated bullets in the form `- YYYY-MM-DD: text`
- returns approved memory with scope, role, section, tags, source path, and line numbers
- searches memory with simple lexical scoring
- stores memory candidates in local JSONL
- supports simple pagination for candidates
- uses a sequential write queue for candidate appends
- restricts browser CORS access to configured local origins
- optionally supports `X-Sidecar-Token` via config or `MEMORY_SIDECAR_TOKEN`

## Structure Fit

This sidecar does not:

- create Paperclip issues
- assign workers
- close tasks
- decide routing
- modify approved learning journals
- replace Paperclip as the system of record

It fits the agreed model because it is only a searchable memory drawer and candidate inbox.

## Smoke Test

Smoke test results:

```json
{
  "HealthOk": true,
  "ApprovedMemoryCount": 33,
  "CandidateCount": 0,
  "WarningCount": 0,
  "CompanyProjectItems": 22,
  "SearchItems": 3,
  "FirstSearchText": "Task Rooms are goal-bound Paperclip issues. They close when the objective is completed, cancelled, or split into follow-up work.",
  "CandidateTotal": 0
}
```

Helper test:

```json
{
  "RecallFirstLines": "# Memory Recall\n\nQuery: Task Room\nScope: project\nResults: 2\n\n## 1. Room Model\n",
  "ProposeFirstLines": "# Memory Candidate Proposed\n\n- Candidate ID: cand_a4c1201a3d7a0569\n- Scope: project\n- Type: implementation\n- Created At: 2026-07-09T13:50:12.958Z\n\nMemory Sidecar MVP indexes approved LEARNINGS.md journals and keeps proposed memories in a separate candidate inbox.",
  "CandidateCount": 1
}
```

CORS check:

```json
{
  "BlockedOriginStatus": 403,
  "AllowedOriginStatus": 200,
  "AllowedOriginHeader": "http://127.0.0.1:3100"
}
```

## Worker Review

An `agy` Worker reviewed the implementation.

Findings addressed:

- CORS no longer uses wildcard browser access.
- Approved memory item IDs no longer depend on line number.
- Candidate append queue recovers after write failures.
- Candidate listing supports `limit` and `offset`.

## Follow-Up Status

The sidecar has now been integrated into Paperclip through the local `local.memory-sidecar` plugin.

Completed after this milestone:

1. Added agent helper scripts for manual recall/proposal.
2. Added AGENTS.md instructions telling CTO/Worker how to call memory while keeping it optional.
3. Implemented and installed the Paperclip Memory Plugin wrapper.
4. Verified Paperclip plugin tool execution for recall and candidate proposal.
5. Implemented strict namespace filtering on approved memory search, items, and candidate endpoints for companyId, projectId, agentId, and issueId (CMP-26).
6. Preserved companyId and projectId journal metadata on approved items and proposed candidate records.
7. Explicitly identified the current company and project journals in config files.
8. Created verify-filters.mjs and verify-filters.ps1 to prove scope safety.

Remaining:

- Run one Paperclip CTO -> Code Worker task and verify memory recall/candidate flow in real issue comments and close summaries.
