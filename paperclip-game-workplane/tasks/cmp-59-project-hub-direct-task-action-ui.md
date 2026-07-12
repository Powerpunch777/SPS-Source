# CMP-59: Source-Only Project Hub Direct Task Action UI

## Objective

Complete the next user-facing step of the Paperclip workplane without changing the live runtime: extend the existing **Project Hub > Direct Task Preview** tab so an authenticated board user can explicitly request a Direct Task Room through a plugin action after a valid preview.

This is source-only. The installed plugin must stay Preview-only, no direct bridge config/secret/process exists, and `enableDirectTaskLaunch` remains disabled by default. The UI code may include the action path, but it must be safe when disabled and no source must be installed or reloaded.

## Required Architecture

Use the official Paperclip plugin action bridge, not a browser call to the Direct Task Bridge and not a custom central controller:

- Register `ctx.actions.register("direct-task-submit", handler)` in the worker.
- The UI action endpoint is `POST /api/plugins/{pluginId}/actions/direct-task-submit` with body `{ companyId, params }`.
- The worker must use the immutable `PluginPerformActionContext.companyId` / actor context as authority. Never trust a client-provided company id.
- Require a board-user action context (`actor.type === "user"` with a non-empty authorized company id). Other/missing actor contexts return a structured, generic refusal with zero writes, secret resolution, network calls, state changes, or wakes.
- Reuse the hardened `handleDirectTaskSubmit` path. Do not duplicate bridge, secret, issue, or finalizer logic.

## Worker Action Contract

1. Receive only bounded `projectId`, allowed role (`unreal-code` or `unreal-qa`), title, description, optional safe `.uproject` filename, and idempotency key from UI params.
2. Force `companyId` from the host action context when invoking the existing hardened submit logic.
3. Return structured JSON only:
   - success: `{ ok: true, issueId, identifier, jobId, status, taskHref }`
   - failure: `{ ok: false, code, message }`
4. Do not return bridge URLs, secret references/values, workspace paths, raw exception/upstream response text, or command details.
5. A disabled feature returns the existing `direct_task_launch_disabled` outcome before any side effect. No action may assign or wake an agent.

## Project Hub UI

Modify the existing `ProjectDirectTaskPreviewTab` custom element in `src/ui/MemoryTab.jsx` only; preserve its Preview functionality.

1. Keep the current Preview step. Only show **Launch Task Room** after a valid preview for the exact stored draft.
2. Launch calls the official action endpoint with the board session, current Project Hub company/project context, and a generated/reused idempotency key for that draft. Do not expose or request bridge secrets.
3. Handle states: launch-in-progress, success (show issue identifier and a Paperclip Task Room link), disabled/refused/validation error, and bridge failure. Error rendering must be escaped and bounded. A failed retry for the same draft must reuse its idempotency key; a new preview creates a new draft/key.
4. No automatic launch after preview, no keyboard shortcut launch, no polling loop, and no direct browser call to `127.0.0.1`.
5. Keep the UI compact and safe for the existing Project detail tab layout. The installed preview-only bundle must remain untouched because no reinstall is allowed.

## Tests

Extend hermetic tests so they prove:

- action context refusal for non-user/missing-company contexts has zero side effects;
- disabled valid board action produces the disabled code with zero secret resolution/issue writes;
- valid board action uses host company scope even if params attempt a different company, calls the existing path, creates exactly one unassigned issue, and returns only the safe structured fields;
- duplicate action submission with the same idempotency key returns the same task/job and does not re-dispatch;
- action failures do not leak a known secret or raw bridge error;
- a source/UI validation check confirms the tab calls the plugin action endpoint, keeps Launch unavailable before valid preview, uses/reuses an idempotency key, and never references a loopback bridge URL or secret field.

Run `npm run check`.

## Boundaries

- Do not install/reinstall/reload the Paperclip plugin or alter live plugin config/manifest.
- Do not create bridge configuration, secret, jobs/audit artifacts, or start a bridge daemon.
- Do not invoke a real bridge or agy run from plugin/UI code.
- Do not modify `02-final-operating-model-ko.md`.
- Do not enable managed candidate extraction or promote memory.
- Do not assign/wake Paperclip agents.

## Documentation

Add a new numbered log after `48-...` and update README / fit checklist / operating-model audit. It must say this is a source-only UI action path; the live runtime is still Preview-only and disabled.

## Completion Report

List changed files, exact test result, and confirm the live runtime boundary. Include `## Close Summary`.
