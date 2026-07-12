# Ganghaerin Agent Room Bootstrap

## Status

Implemented and verified without starting a managed Paperclip agent or direct
worker process.

## Agent Desks

The `강해린` Project Hub now has these persistent unassigned desks:

- `CMP-71` Manager
- `CMP-72` CTO
- `CMP-73` Designer
- `CMP-74` Code Worker
- `CMP-75` Art Worker
- `CMP-76` Voice Worker
- `CMP-77` QA Worker

Every desk is a root Project Hub issue with `backlog` status, no assignee, and
`planning` work mode. The bootstrap helper is idempotent and refuses to reuse an
assigned desk or create an active desk.

## Boundary

An Agent Room is a durable responsibility desk, not a managed-agent session or a
general chat. It holds the role brief and role-specific context. A concrete goal
must be opened as a separate Task Room, receive a bounded worker execution, and
close with a summary.

The current direct external `agy.exe` runners remain the execution route. The
Project Hub Direct Task UI remains installed but disabled because upstream
company-scoped plugin secret support is not yet available.

## Verification

- All seven target issues were read back from Paperclip after creation.
- Every desk belongs to the `강해린` Project Hub and the game goal.
- Every desk is `backlog` and has `assigneeAgentId = null`.
- The raw Paperclip company live-runs endpoint returned an empty array after
  bootstrap.
- `scripts\Test-BootstrapProjectAgentDesks.ps1` verifies dry-run idempotency and
  the non-running boundary.
