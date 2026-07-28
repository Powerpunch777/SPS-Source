# SPS Memory Sidecar MVP

This is a legacy local-first journal and candidate store. It can back a memory
provider but is not enabled for a new SPS Company by default.

It is intentionally not a controller.

It can:

- read configured `LEARNINGS.md` journals
- parse dated learning entries
- search approved memory items
- store memory candidates in local JSONL

It must not:

- create work items
- assign Agents
- close workflow items
- decide routing
- replace SPS as the system of record

## Start

```powershell
.\start-memory-sidecar.ps1
```

Default URL:

```text
http://127.0.0.1:3188
```

## Agent Helpers

Recall memory:

```powershell
.\memory-recall.ps1 -Query "Task Room" -Scope project -Limit 5
```

Propose a candidate:

```powershell
.\memory-propose.ps1 -Scope project -Type decision -Content "Task Rooms are SPS issues with one goal."
```

Review candidate inbox:

```powershell
.\memory-candidates.ps1 -Limit 20
```

Preview candidate promotion:

```powershell
.\memory-promote-candidate.ps1 -CandidateId cand_example -JournalId project-default
```

Apply candidate promotion:

```powershell
.\memory-promote-candidate.ps1 -CandidateId cand_example -JournalId project-default -Apply
```

Record review status without promotion:

```powershell
.\memory-record-candidate-review.ps1 -CandidateId cand_example -Action rejected -Note "Too narrow" -Apply
```

Helpers are non-blocking by design. If the sidecar is not running, they print a fallback message instead of failing the
agent task.

## Endpoints

```text
GET  /health
GET  /memory/items?scope=company,project,agent&includeWarnings=true
GET  /memory/search?q=task%20room&scope=project&limit=10
GET  /memory/candidates?limit=50&offset=0&projectId=...&taskId=...&roomId=...
POST /memory/candidates
```

Candidate example:

```json
{
  "scope": "project",
  "type": "decision",
  "content": "Task Rooms are SPS issues with one goal and a close condition.",
  "source": {
    "kind": "issue_comment",
    "id": "CMP-3"
  },
  "tags": ["task-room", "sps"]
}
```

`issueId` remains accepted for compatibility. New callers may use `taskId` and
`roomId`; the sidecar stores both task aliases so existing task-room views keep
working.

## Configuration

`config.local.json` is local-only and ignored by git.

Use `config.example.json` as the portable template.

`security.allowedOrigins` restricts browser CORS access to local SPS/Swarm UI origins. Local scripts without an
`Origin` header can still call the API.

Set `security.token` or the `MEMORY_SIDECAR_TOKEN` environment variable to require `X-Sidecar-Token` on requests.

## Structure Fit

- SPS remains the control plane.
- Memory search is assistive recall only.
- Candidate writes do not directly edit approved learning journals.
- Every search result includes provenance.
