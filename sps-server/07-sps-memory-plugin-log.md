# Milestone 3 SPS Memory Plugin Log

## Goal

Expose the Memory Sidecar to real SPS agents as safe agent tools while keeping SPS as the control plane.

This milestone must preserve the agreed structure:

- SPS issue/comment/document/work-product state remains the source of truth.
- Task Rooms remain SPS issues with one goal.
- Agent Rooms remain role desks.
- CTO and Manager directly use tools; there is no hidden controller.
- Memory only recalls approved facts and proposes candidates.

## Implemented

Created a local plugin source package:

```text
sps-server/sps-memory
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

- SPS's host-managed `ctx.http.fetch` blocks private/reserved IP ranges.
- The plugin therefore uses standard worker `fetch`, with loopback-only URL validation as the safety boundary.

## Guardrails

The plugin does not:

- create SPS issues
- assign agents
- route work
- close tasks
- wake issues
- mutate approved `LEARNINGS.md`
- write to the SPS database

## Validation

Run from the plugin folder:

```powershell
npm run check
```

Expected checks:

- `node --check ./dist/worker.js`
- `node ./scripts/validate-manifest.mjs`

## Runtime Verification

The plugin is installed into SPS as:

```text
local.memory-sidecar
```

SPS exposes:

- `local.memory-sidecar:memory-search`
- `local.memory-sidecar:memory-propose`

Agent instruction update:

- Active Manager instructions prefer `local.memory-sidecar:memory-search` and `local.memory-sidecar:memory-propose`.
- Active CTO instructions prefer `local.memory-sidecar:memory-search` and `local.memory-sidecar:memory-propose`.
- Active Code Worker instructions prefer `local.memory-sidecar:memory-search` and `local.memory-sidecar:memory-propose`.
- Sidecar PowerShell helpers remain fallback paths when direct SPS plugin tools are unavailable.

Verified runtime state:

- SPS server is listening on `127.0.0.1:3100`.
- Memory Sidecar is listening on `127.0.0.1:3188`.
- SPS reports the plugin as `ready`.
- `memory-search` returns approved project memory for `Task Room` with `LEARNINGS.md` provenance.
- `memory-propose` creates a candidate entry and does not mutate approved `LEARNINGS.md`.

The first `memory-search` execution exposed an important SPS runtime behavior:

- SPS's host-managed `ctx.http.fetch` blocks private/reserved IP ranges, including `127.0.0.1`.
- The worker was patched to use standard worker `fetch`.
- The sidecar URL is still restricted to loopback hosts only.
- After disabling and re-enabling the plugin, both tools executed successfully.

## Completed Blocker Fixes

- The Antigravity adapter external-loader Windows path import bug was patched through a re-applicable local script.
- A stale embedded Postgres lock was handled after confirming the runtime process state.
- SPS now starts cleanly and loads the Antigravity adapter.

## Next Step

Run one real CTO -> Worker Task Room and verify memory recall/proposal behavior in SPS issue comments and close summaries.
