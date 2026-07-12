# Objective

Audit the local Paperclip memory plugin source for the minimal disabled-by-
default change needed to submit Direct Task requests through the new local
Windows Named Pipe broker instead of resolving a Paperclip plugin secret.

# Read First

- `02-final-operating-model-ko.md` is locked. Do not edit it.
- `63-windows-named-pipe-broker-log.md` describes the new broker boundary.
- `paperclip-memory-plugin/dist/worker.js`
- `paperclip-memory-plugin/src/ui/MemoryTab.jsx`
- `paperclip-memory-plugin/dist/manifest.js`
- `scripts/verify-direct-tasks.mjs`

# Deliverable

Post a concise close summary containing:

1. Exact source files/functions that must change for a disabled Windows Named
   Pipe transport while preserving the existing HTTP-token transport as a
   disabled legacy path.
2. The request/response contract between the plugin and the broker, including
   selected Agent Room parent validation and job status finalization.
3. Existing tests that need changed fixtures or new hermetic coverage.
4. Any conflict with the locked operating model or Paperclip updateability.

# Constraints

- Read-only audit. Do not edit source, configuration, database, plugin state,
  or the locked operating-model document.
- Do not start Paperclip, the broker, Unreal, or Blender.
- Do not create a broker `config.local.json`.
- Do not resolve or store secrets.
- Treat Agent Rooms as unassigned durable role desks. A real Task Room is a
  child issue under a selected Agent Room and is closed when its objective ends.
- Paperclip must remain the source of truth. The broker may only transport
  bounded execution requests.
