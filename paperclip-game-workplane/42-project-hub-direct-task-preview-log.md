# Implementation Log: Project Hub Direct Task Preview (CMP-50)

## 1. Objective
Implement Phase 1 of the corrected direct-request launcher design: a **Project Hub UI tab that validates and previews** a future direct Task Room request for the two verified roles, without creating issues, running Agy, configuring a bridge, or adding write authority.

## 2. Fixed Safety Boundary & No-Execution Proof
This phase is strictly preview and validation only. It enforces a strict "read-only" boundary:
- **No Side Effects**: It creates no Paperclip issue/comment/status update, wakes no managed agent, executes no process, calls no Direct Task Bridge, and writes no memory.
- **Manifest Restrictions**: No write or launch capabilities were added to the plugin manifest. Specifically, capabilities like `issues.create`, `issues.update`, `issue.comments.create`, `api.routes.register`, `jobs.schedule`, `plugin.state.*`, `secrets.read-ref`, or `local.folders` remain omitted from the manifest.
- **Handler Security**: The browser sends only a same-origin request to the read-only `direct-task-preview` data handler registered via `ctx.data.register`.
- **Sandbox Validation**: The handler executes purely within the worker sandbox, validating input lengths and restricting target roles to the allowlist (`unreal-code` and `unreal-qa`), returning only metadata and safety boundaries with no workspace paths, command arrays, bridge secrets, or process details.

## 3. UI Design & Features
1. **Detail Tab Slots**: A new project detail tab named **Direct Task Preview** (`ProjectDirectTaskPreviewTab`) was registered in the plugin manifest and implemented in the UI bundle.
2. **Interactive Form**:
   - **Role Selector**: Restricted to `unreal-code` (Unreal Code Worker) and `unreal-qa` (Unreal QA Worker).
   - **Title Field**: Required text input, validated to be max 200 characters.
   - **Description Field**: Required textarea input, validated to be max 4,000 characters.
   - **Preview Button**: Standard action button that dispatches validation requests to the plugin's data handler.
3. **Execution Status**: An explicit, non-interactive warning banner is rendered at the top of the form, clearly stating:
   > **Phase 1 Preview Only**
   > Local execution is not configured in this phase. Creating issues, running agy, and configuring bridges are disabled.
4. **Adaptive States**: Form handles loading (submitting), success (structured preview results), invalid inputs (field-level client and server validation errors), and error states without layout overlaps across desktop and mobile screen widths.

## 4. Verification Performed
- **Automated Tests**: Added verification cases to `scripts/verify-plugin.mjs` verifying:
  - Valid `unreal-code` requests (valid flag, role label, role boundary).
  - Valid `unreal-qa` requests (valid flag, role label, role boundary).
  - Invalid role requests (fail-closed check against the allowlist).
  - Input bounds enforcement (title length > 200 and description length > 4000).
  - Missing company/project context parameters.
- **Build Distributable**: Compiled the static UI bundle cleanly via `npm run build` using the project's esbuild configurations.
- **Comprehensive Verification Checks**: Ran `npm run check` which executed:
  1. Zod manifest schema validation.
  2. Plugin data handler unit tests.
  3. Managed agent lifecycle probe tests.
  4. esbuild compilation.
  All checks passed successfully.

## 5. Residual Gap
- **Bridge Unimplemented**: The `Direct Task Bridge` daemon, the actual execution bridge, and task-dispatch workflows remain completely unimplemented in this phase.
- **No Real Action**: Clicking preview or submitting forms has no effect on Paperclip states or local processes.

## 6. Role Boundary Correction (CMP-51)
> [!NOTE]
> The worker role boundaries in the preview output were updated to match the actual currently verified direct Agy worker runner prompts. See [43-direct-task-preview-role-boundary-correction-log.md](file:///C:/Users/young/Documents/AGENT%20%EA%B5%AC%EC%B6%95/paperclip-game-workplane/43-direct-task-preview-role-boundary-correction-log.md) for details.
