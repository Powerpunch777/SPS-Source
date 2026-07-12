# Paperclip Runtime Analysis

Date: 2026-07-09

## Purpose

Keep the implementation aligned with the agreed Paperclip-first architecture while analyzing the real local Paperclip runtime.

## Current Runtime State

Paperclip instance:

- Instance path: `C:\Users\young\.paperclip\instances\default`
- Server config: `127.0.0.1:3100`
- Embedded Postgres port: `54329`
- Deployment mode: `local_trusted`
- Exposure: `private`
- Storage: local disk

Current observation:

- Paperclip server is not currently listening on `3100`.
- The scheduled task `PaperclipLocalServer` exists and is `Ready`.
- Last scheduled task result: `3221225786`, which indicates the prior process did not exit cleanly.
- Logs show Paperclip did start successfully at `15:34:54` and served the UI/API.
- Logs later show database connection errors against `127.0.0.1:54329`, after which the server was no longer reachable.

## Important Paperclip Finding: Plugin System Exists

The local Paperclip server includes a real plugin system:

- `services/plugin-loader.js`
- `services/plugin-worker-manager.js`
- `services/plugin-tool-dispatcher.js`
- `services/plugin-tool-registry.js`
- `routes/plugins.js`

Relevant behavior:

- Plugins have manifests validated by `pluginManifestV1Schema`.
- Plugins may declare `tools`.
- The host registers tools through `plugin-tool-dispatcher`.
- Tool names are namespaced as `<pluginId>:<toolName>`.
- Plugin workers run out-of-process over stdio JSON-RPC.

This fits the target structure well:

- A Paperclip memory plugin can expose `memory-search` and `memory-propose` to agents.
- The plugin should call the Memory Sidecar, not replace Paperclip.
- The plugin must not create issues, assign workers, close tasks, or route work.

## Important Paperclip Finding: Antigravity Adapter Startup Bug On Windows

The Antigravity adapter package is installed:

- `C:\Users\young\.paperclip\adapter-plugins\node_modules\@weslleycapelari\adapter-antigravity-local`

The store is registered:

- `C:\Users\young\.paperclip\adapter-plugins.json`

Paperclip log shows startup load failure:

```text
Failed to dynamically load external adapter; skipping
Only URLs with a scheme in: file, data, and node are supported by the default ESM loader.
On Windows, absolute paths must be valid file:// URLs. Received protocol 'c:'
```

The cause is visible in:

```text
C:\Users\young\AppData\Local\npm-cache\_npx\43414d9b790239bb\node_modules\@paperclipai\server\dist\adapters\plugin-loader.js
```

Startup load uses:

```js
const mod = await import(modulePath);
```

But reload uses:

```js
const fileUrl = `file://${modulePath}`;
const mod = await import(cacheBustUrl);
```

On Windows, startup load should use `pathToFileURL(modulePath).href`, like the core plugin loader already does for manifests.

## Direction Check

This does not change the core architecture decision.

Correct direction:

1. Keep Paperclip as the control plane.
2. Keep Memory Sidecar as a recall/candidate service.
3. Add a Paperclip plugin wrapper for agent tools.
4. Treat the Antigravity adapter issue as a Windows compatibility patch, not as a reason to abandon Paperclip.

Avoid:

- Deep Paperclip fork.
- Moving control to Swarm.
- Making the Memory Sidecar create or route Paperclip tasks.

## Next Safe Step

Build a local Paperclip memory plugin skeleton in the workspace.

It should:

- declare tools only
- call `http://127.0.0.1:3188`
- expose `memory-search`
- expose `memory-propose`
- not include UI yet
- not write to Paperclip DB directly
- not mutate approved `LEARNINGS.md`

Do not install it into Paperclip until:

- Paperclip server starts cleanly
- plugin manifest validates
- sidecar is running
- Antigravity adapter Windows issue is either fixed or explicitly deferred

## Follow-Up: Local Patch Script

The Windows adapter loader issue should be handled through a re-applicable patch script:

```text
paperclip-game-workplane/scripts/patch-paperclip-adapter-loader.ps1
```

This keeps the fix visible and repeatable after Paperclip updates, instead of turning the local npm cache into an undocumented fork.
