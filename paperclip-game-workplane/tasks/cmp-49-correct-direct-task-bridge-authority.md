# CMP-49: Correct the Direct Task Bridge authority design

## Objective

Revise the Project Hub direct-request launcher feasibility design using the actual installed Paperclip plugin SDK capability model. Correct the two unsafe/unproven assumptions in CMP-48 before any launcher UI or execution bridge implementation begins.

## Confirmed evidence

- The installed plugin SDK exposes capabilities for `issues.create`, `issues.update`, `issue.comments.create`, `plugin.state.read`, `plugin.state.write`, `jobs.schedule`, `api.routes.register`, and `secrets.read-ref`.
- The current memory plugin has only read/event/http/UI capabilities and only `ctx.data.register` handlers.
- The current plugin manifest has no direct-task execution capability, no API routes, and no secret-reference capability.
- Memory Sidecar is intentionally memory-only.

## Corrections required

1. Reject the claim that the plugin should forward the active user's raw `PAPERCLIP_API_KEY` to the Direct Task Bridge. Do not assume the browser/plugin can or should access it.
2. Reject storing Direct Task Bridge secret/config/workspace mapping in `memory-sidecar/config.local.json`. The Bridge must have a separately owned config path and secret.
3. Define an authority split that needs no raw Paperclip credential in the Bridge:
   - A board-authenticated Paperclip plugin action/route validates user input, creates the **unassigned** Task Room with plugin `issues.create`, and owns final comment/status writes using plugin capabilities.
   - The Direct Task Bridge receives only a validated, bounded, role-allowlisted job payload and runs local `agy.exe` via argument arrays in a mapped workspace.
   - The Bridge returns/stores the close-summary output and job status; it does not write Paperclip issues or approved memory.
   - A plugin scheduled/polled finalizer retrieves completed job output and uses `issue.comments.create` plus `issues.update` to close the Task Room. State/idempotency are held in plugin-owned state.
4. Account for the fact that the direct runner's Recall Brief must remain bounded and Paperclip task context remains source-of-truth. Define which minimal normalized fields the plugin passes to the Bridge and how the Bridge must not trust arbitrary project paths/commands.

## Work

1. Inspect the local SDK README/types for issue create/comment/update, API routes with board auth, jobs scheduling, plugin state, and secret reference APIs.
2. Create `41-direct-task-bridge-authority-correction-log.md` that supersedes the affected parts of the CMP-48 design. Include a corrected sequence diagram, capability delta, separate config ownership, exact job-state/finalization flow, idempotency points, and residual limitations.
3. Update `40-project-hub-direct-request-launcher-log.md` only with an explicit pointer to the correction; do not silently rewrite history.
4. Update `29-operating-model-fit-audit.md` only if needed to prevent the obsolete API-key forwarding / sidecar-config design from appearing as the approved path.
5. Do not modify runtime code, manifests, service configs, plugin installation, Paperclip server state, or the Unreal project.

## Completion format

Return `## Close Summary` with evidence, corrected authority split, changed documents, and the safe next implementation phase: non-executing Project Hub preview UI. `Memory Candidates:` should be empty.
