# CMP-70: Audit Paperclip plugin secret-resolution compatibility path

## Context

The `강해린` Project Hub now has a baseline Git commit and a bound primary local Unreal workspace. Direct Task execution remains disabled.

CTO inspection found a hard runtime constraint in the installed Paperclip server (`2026.707.0`):

`@paperclipai/server/dist/services/plugin-secrets-handler.js` documents `ctx.secrets.resolve(secretRef)`, validates UUID secret references, then unconditionally throws:

`Plugin secret references are disabled until company-scoped plugin config lands`

The deployed `local.memory-sidecar` plugin correctly uses only a secret UUID reference (`directBridgeSecretRef`) and calls `ctx.secrets.resolve()` only after `enableDirectTaskLaunch` is true. Therefore a secure Direct Task Bridge cannot be activated in the current runtime even if a local encrypted secret and loopback bridge config exist.

## Objective

Perform a read-only technical decision audit for resolving this limitation while preserving Paperclip upstream update compatibility and the agreed authority/security boundaries.

## Non-Negotiable Boundaries

- Do not modify Paperclip core, plugin source, bridge source/config, secret records, plugin config, Unreal workspace, Git state, memory journals, or `02-final-operating-model-ko.md`.
- Do not put bridge secrets in plugin config as plaintext.
- Do not remove bridge token authentication, weaken loopback restrictions, or add direct browser-to-bridge execution.
- Do not enable Direct Task launch, start the bridge, create/assign/wake managed agents, or invoke a real worker task.
- Read-only investigation/report only.

## Required Analysis

1. Trace the installed runtime's plugin secret flow and explain precisely why the current plugin cannot use a Paperclip secret UUID.
2. Identify the smallest upstream-compatible Paperclip core capability/contract change required to permit a plugin worker to resolve a company-scoped secret reference safely. Include required company context propagation, authorization/capability checks, audit boundaries, and config schema annotations.
3. Compare three paths:
   - contribute/upstream the capability and wait for a released Paperclip version;
   - maintain a minimal local patch or overlay that can be reapplied after Paperclip updates;
   - defer Project Hub launch and use the already-safe direct `agy.exe` Task Room runner until upstream support exists.
4. Give one recommendation for this 2-person game development setup, prioritizing security, Paperclip update continuity, and the final operating model.
5. Define explicit activation prerequisites after the selected path is implemented: secret UUID, disabled plugin config, loopback bridge workspace allowlist, authorization test, no-write smoke task, and explicit enable step.

## Output

Return a concise `## Close Summary` with a single recommendation, risks, the proposed minimal interface shape, and activation gates. No files or runtime state may change.
