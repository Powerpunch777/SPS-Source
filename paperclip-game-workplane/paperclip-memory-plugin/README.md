# Paperclip Memory Sidecar Plugin

This is the Paperclip plugin wrapper for the game workplane Memory Sidecar.

It keeps Paperclip as the production control plane and exposes only two agent tools:

- `local.memory-sidecar:memory-search`
- `local.memory-sidecar:memory-propose`

## What It Does

- Searches approved memory served by `paperclip-game-workplane/memory-sidecar`.
- Proposes memory candidates to the sidecar inbox.
- Returns source paths and line numbers for approved memories.
- Fails softly when the sidecar is unavailable.
- Uses standard worker `fetch` for the loopback-only sidecar call because Paperclip's host-managed `ctx.http.fetch`
  blocks private/reserved IP ranges.

## What It Must Not Do

- Create, assign, route, wake, or close Paperclip issues.
- Write directly to the Paperclip database.
- Edit approved `LEARNINGS.md` files.
- Replace Paperclip comments, documents, work products, or issue status as the source of truth.

## Local Check

```powershell
npm run check
```

This validates the manifest against the local Paperclip schema and runs a Node syntax check on the worker.

## Sidecar Configuration

The plugin defaults to:

```text
http://127.0.0.1:3188
```

The Paperclip plugin instance config can override:

- `sidecarUrl`
- `sidecarToken`

The worker only accepts loopback sidecar URLs (`127.0.0.1`, `localhost`, or `::1`).

## Installation Status

Do not install this plugin into Paperclip until:

1. Paperclip starts cleanly.
2. The local Antigravity adapter Windows path bug is either fixed or intentionally ignored.
3. The Memory Sidecar is running and `/health` returns `ok: true`.
4. `npm run check` passes.
