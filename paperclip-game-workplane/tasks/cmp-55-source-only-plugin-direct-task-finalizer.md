# CMP-55: Implement source-only authenticated Direct Task plugin integration

## Objective

Implement the next launcher phase in the local plugin source only: a board-authenticated submit route plus a scheduled finalizer that can later coordinate the hardened Direct Task Bridge. Keep the live Paperclip plugin installed in its current **Preview-only** manifest/configuration; do not enable or install this source change yet.

## Current verified components

- Project Hub Preview tab validates `unreal-code` and `unreal-qa` requests only.
- `direct-task-bridge/` is loopback-only, disabled by default, token-gated, workspace-mapped, and owns no Paperclip write credentials.
- `Invoke-AgyDirectTask.ps1 -NoPost -ResultPath` writes a validated structured result contract.
- Existing plugin SDK supports `onApiRequest`, board-auth manifest routes, `ctx.issues.create/update/createComment`, `ctx.state`, `ctx.jobs.register`, and `ctx.secrets.resolve` when corresponding capabilities are declared.

## Source-only authority model

1. Paperclip plugin owns all issue/comment/status writes.
2. DTB receives only validated input, runs local Agy, and exposes local job status. It has no Paperclip credential.
3. Memory Sidecar remains memory-only; no candidate is automatically proposed/promoted through this path.
4. The feature is disabled by default in plugin configuration. When disabled, API route calls must return a clear disabled response **before any issue creation, secret resolution, bridge call, state write, or worker wakeup**.

## Required source implementation

1. In `paperclip-memory-plugin/dist/manifest.js`, add only the future runtime declarations needed for the source feature:
   - API route `POST /direct-tasks/submit`, `auth: "board"`, company resolved from required body `companyId`;
   - a scheduled `direct-task-finalizer` job (one-minute cadence);
   - config fields: `enableDirectTaskLaunch` default false, `directBridgeUrl`, and `directBridgeSecretRef` (a reference only, never a literal secret);
   - capabilities: `issues.create`, `issues.update`, `issue.comments.create`, `plugin.state.read`, `plugin.state.write`, `jobs.schedule`, `api.routes.register`, `secrets.read-ref`, and `projects.read` in addition to current required capabilities.
2. In worker source, implement only `onApiRequest` handling for that route:
   - validate company/project IDs, allowlisted role, title <= 200, description <= 4000, relative optional `.uproject` filename, and a strict idempotency key;
   - validate the project belongs to the route company using the SDK;
   - validate configured bridge URL is strict loopback HTTP(S);
   - resolve the bridge token only through `ctx.secrets.resolve(directBridgeSecretRef)` and never log/store/return it;
   - create an **unassigned** Paperclip issue with plugin origin/idempotency metadata only after enabled/config validation passes;
   - submit only the normalized bounded payload to DTB via server-side fetch;
   - store exactly one active DTB job record in plugin instance state. Preserve idempotency and do not create duplicate issue/job pairs;
   - on dispatch failure, leave a clear plugin-authored comment and mark the unassigned issue cancelled, then clear only the relevant state.
3. Register `direct-task-finalizer` through `ctx.jobs.register`:
   - reads the single active job record from plugin state;
   - polls DTB status server-to-server;
   - only when the structured result is `completed` with exit code 0 and a Close Summary, creates one plugin-authored comment and marks the unassigned issue done;
   - for failure, writes one bounded error/summary comment, marks the unassigned issue blocked, and preserves no active job lock;
   - finalization must be idempotent across scheduled retries and never assign/wake an agent.
4. Build/update the existing static UI only if required for source consistency. Do not expose an enabled launch button in the live Preview tab.
5. Add focused hermetic tests with mocked plugin context and mocked DTB responses proving:
   - disabled config has zero side effects;
   - invalid input/config/URL is rejected before writes;
   - valid source-only submit produces one unassigned issue and one normalized bridge payload;
   - duplicate idempotency does not duplicate work;
   - completed and failed finalizer paths are idempotent, do not wake/assign agents, and keep memory untouched;
   - secret text is absent from logs/response/state.
6. Add a next-numbered implementation log, and update audit/checklist/readme accurately to state **source implemented but not installed/reinstalled, feature disabled, no secret/config/bridge process exists**.

## Non-negotiable constraints

- Do not install/reinstall the plugin, alter live plugin manifest/config, configure Paperclip secrets, create a `direct-task-bridge/config.local.json`, start DTB, call a real bridge endpoint, or run Agy through DTB.
- Do not modify `02-final-operating-model-ko.md`, Memory Sidecar, or actual Unreal project files.
- Do not write approved memory or enable managed candidate extraction.

## Completion format

Return `## Close Summary` with exact source changes, test results, proof that runtime remains Preview-only, and residual deployment requirements. `Memory Candidates:` must be empty.
