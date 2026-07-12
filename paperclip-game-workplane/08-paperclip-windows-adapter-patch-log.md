# Paperclip Windows Adapter Loader Patch Log

## Goal

Make the local Paperclip external adapter loader work on Windows without forking Paperclip.

The Antigravity adapter is installed, but Paperclip logs showed:

```text
Only URLs with a scheme in: file, data, and node are supported by the default ESM loader.
On Windows, absolute paths must be valid file:// URLs. Received protocol 'c:'
```

## Cause

The server adapter plugin loader imported a raw Windows absolute path:

```js
await import(modulePath)
```

Node ESM dynamic import requires Windows absolute file paths to be converted to file URLs.

## Patch Strategy

Use a re-applicable local script instead of a deep fork:

```text
paperclip-game-workplane/scripts/patch-paperclip-adapter-loader.ps1
```

The script changes:

- `await import(modulePath)`
- reload-time `file://${modulePath}`

to:

- `pathToFileURL(modulePath).href`

## Guardrails

- The script only patches inside the expected local Paperclip npx cache root.
- It creates a `.codex-backup` file before the first write.
- It is safe to rerun.
- It does not modify Paperclip data, database schema, issues, agents, tasks, or memory.

## Runtime Checks

Completed:

1. Applied the patch script.
2. Confirmed the loader imports `pathToFileURL`.
3. Moved the stale Postgres lock only after confirming no matching process was alive.
4. Started Paperclip.
5. Confirmed the Antigravity adapter loads.
6. Confirmed the server listens on `127.0.0.1:3100`.

Remaining:

- Keep the patch script as a local re-apply step when the Paperclip npx cache is refreshed or reinstalled.
