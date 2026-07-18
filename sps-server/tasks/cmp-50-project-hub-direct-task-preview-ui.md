# CMP-50: Implement a non-executing Project Hub Direct Task Preview tab

## Objective

Implement Phase 1 of the corrected direct-request launcher design: a **Project Hub UI tab that validates and previews** a future direct Task Room request for the two verified roles, without creating issues, running Agy, configuring a bridge, or adding write authority.

## Fixed safety boundary

- This is preview only. It must create **no** SPS issue/comment/status update, wake no managed agent, execute no process, call no Direct Task Bridge, and write no memory.
- Do not add `issues.create`, `issues.update`, `issue.comments.create`, `api.routes.register`, `jobs.schedule`, `plugin.state.*`, `secrets.read-ref`, `local.folders`, or any other write/launch capability to the plugin manifest.
- Do not modify `02-final-operating-model-ko.md`, Memory Sidecar, live plugin configuration, or the Unreal project.
- Existing Memory tabs and tools must remain unchanged.

## Required UI behavior

1. Add a Project detail tab named **Direct Task Preview** to the existing local memory plugin.
2. Render a compact, usable form in the existing UI style:
   - role selector restricted to `unreal-code` (Unreal Code Worker) and `unreal-qa` (Unreal QA Worker);
   - title field, required, max 200 characters;
   - description field, required, max 4,000 characters;
   - a `Preview` command button;
   - an explicit non-interactive execution status stating that local execution is not configured in this phase.
3. The browser sends only a same-origin request to a **read-only `ctx.data.register` handler**. The handler validates the role/input bounds and returns a structured preview:
   - valid/invalid result and specific errors;
   - selected role label and default role boundary;
   - SPS result statement: an unassigned Task Room would be created in Phase 2;
   - no local workspace path, command array, bridge secret, or process detail.
4. Use the host entity context for company/project IDs as existing Project Memory components do. Do not trust a claimed role outside the allowlist.
5. Add/loading/error/empty/form validation states that do not overlap at desktop or mobile widths.
6. Add focused plugin verification cases for the data handler and static UI bundle; run the existing plugin checks.
7. Create the next numbered implementation log. It must clearly state that this installed UI cannot execute anything.

## Build and verification

- Build the plugin distributable as required by its existing package scripts.
- Run `npm run check` within `sps-memory`.
- Do **not** install/reinstall the plugin or change runtime config in this task. Codex CTO will review then perform the read-only UI smoke separately.

## Completion format

Return `## Close Summary` with changed files, precise no-execution proof, test results, and residual gap (separate Direct Task Bridge remains unimplemented/unconfigured). `Memory Candidates:` should be empty.
