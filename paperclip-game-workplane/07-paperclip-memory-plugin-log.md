# Milestone 3 Paperclip Memory Plugin Log

## Goal

Expose the Memory Sidecar to real Paperclip agents as safe agent tools while keeping Paperclip as the control plane.

This milestone must preserve the agreed structure:

- Paperclip issue/comment/document/work-product state remains the source of truth.
- Task Rooms remain Paperclip issues with one goal.
- Agent Rooms remain role desks.
- CTO and Manager directly use tools; there is no hidden controller.
- Memory only recalls approved facts and proposes candidates.

## Implemented

Created a local plugin source package:

```text
paperclip-game-workplane/paperclip-memory-plugin
```

The plugin declares:

- `local.memory-sidecar:memory-search`
- `local.memory-sidecar:memory-propose`

The worker:

- calls the Memory Sidecar over standard worker `fetch`
- defaults to `http://127.0.0.1:3188`
- only accepts loopback sidecar URLs
- returns approved memory with provenance
- writes proposals only to the sidecar candidate inbox
- fails softly if the sidecar is unavailable

Reason:

- Paperclip's host-managed `ctx.http.fetch` blocks private/reserved IP ranges.
- The plugin therefore uses standard worker `fetch`, with loopback-only URL validation as the safety boundary.

## Guardrails

The plugin does not:

- create Paperclip issues
- assign agents
- route work
- close tasks
- wake issues
- mutate approved `LEARNINGS.md`
- write to the Paperclip database

## Validation

Run from the plugin folder:

```powershell
npm run check
```

Expected checks:

- `node --check ./dist/worker.js`
- `node ./scripts/validate-manifest.mjs`

## Runtime Verification

The plugin is installed into Paperclip as:

```text
local.memory-sidecar
```

Paperclip exposes:

- `local.memory-sidecar:memory-search`
- `local.memory-sidecar:memory-propose`

Agent instruction update:

- Active Manager instructions prefer `local.memory-sidecar:memory-search` and `local.memory-sidecar:memory-propose`.
- Active CTO instructions prefer `local.memory-sidecar:memory-search` and `local.memory-sidecar:memory-propose`.
- Active Code Worker instructions prefer `local.memory-sidecar:memory-search` and `local.memory-sidecar:memory-propose`.
- Sidecar PowerShell helpers remain fallback paths when direct Paperclip plugin tools are unavailable.

Verified runtime state:

- Paperclip server is listening on `127.0.0.1:3100`.
- Memory Sidecar is listening on `127.0.0.1:3188`.
- Paperclip reports the plugin as `ready`.
- `memory-search` returns approved project memory for `Task Room` with `LEARNINGS.md` provenance.
- `memory-propose` creates a candidate entry and does not mutate approved `LEARNINGS.md`.

The first `memory-search` execution exposed an important Paperclip runtime behavior:

- Paperclip's host-managed `ctx.http.fetch` blocks private/reserved IP ranges, including `127.0.0.1`.
- The worker was patched to use standard worker `fetch`.
- The sidecar URL is still restricted to loopback hosts only.
- After disabling and re-enabling the plugin, both tools executed successfully.

## Completed Blocker Fixes

- The Antigravity adapter external-loader Windows path import bug was patched through a re-applicable local script.
- A stale embedded Postgres lock was handled after confirming the runtime process state.
- Paperclip now starts cleanly and loads the Antigravity adapter.

## Next Step

Run one real CTO -> Worker Task Room and verify memory recall/proposal behavior in Paperclip issue comments and close summaries.
