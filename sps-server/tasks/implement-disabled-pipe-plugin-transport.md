# Objective

Implement the disabled-by-default Windows Named Pipe transport in the local
SPS memory plugin. Preserve SPS as the source of truth: a real
Direct Task must be a child SPS issue under a selected durable Agent Room.

# Scope

Edit only these files unless a directly required generated artifact demands it:

- `sps-memory/dist/manifest.js`
- `sps-memory/dist/worker.js`
- `sps-memory/scripts/verify-direct-tasks.mjs`

Do not edit `02-final-operating-model-ko.md`, SPS core, live plugin
configuration, the broker configuration, runtime state, or the Project UI in
this task.

# Required Behavior

1. Keep `enableDirectTaskLaunch` default false. No enabled production config
   may be created.
2. Add an explicit `directTaskTransport` string config. Its safe default is
   `windows-named-pipe`; preserve the old secret-backed route only as explicit
   `legacy-http-token`. Add `directPipeName` with default
   `SPSDirectTaskBroker`.
3. For `windows-named-pipe`, use `node:net` and raw UTF-8 one-line JSON. Do
   not send HTTP over the pipe. Match the broker protocol exactly:
   request `{ protocolVersion: 1, requestId: <uuid>, operation, payload? ,
   jobId? }`, response `{ protocolVersion, requestId, ok, statusCode, body }`.
   Validate pipe names with `^[A-Za-z0-9._-]{1,80}$`, use
   `\\\\.\\pipe\\<name>`, set a bounded timeout, reject oversized/malformed or
   request-id-mismatched responses, and never include a token.
4. Both submit and finalizer must use the selected transport. In named-pipe
   mode they must never call `ctx.secrets.resolve` or `fetch` for Direct Task
   transport. Legacy HTTP-token behavior stays explicit and functionally
   equivalent.
5. A submit must require `parentId`. Before creating a task, validate the
   parent with `ctx.issues.get`: same Company and Project Hub, root issue,
   open/non-terminal, unassigned, title beginning `[Agent Room] `. Require
   `[Agent Room] Code Worker` for `unreal-code` and `[Agent Room] QA Worker`
   for `unreal-qa`. Create the child Task Room with `parentId` and inherited
   `goalId` when present. Never assign or wake an agent.
6. Keep idempotency, cancellation-on-dispatch-failure, structured finalization,
   marker retry convergence, and candidate-only worker behavior. Do not store
   secrets in active job state, comments, returns, or logs.
7. Update/add hermetic tests. On Windows a temporary local `node:net` named
   pipe mock is acceptable. Cover submit, status/finalization, request wire
   format, parent child hierarchy, invalid pipe name, and zero secret
   resolution/fetch in named-pipe mode. Keep existing legacy tests valid by
   selecting `legacy-http-token` explicitly.

# Constraints

- The broker already performs its own parent, mapping, and goal validation;
  this plugin validation prevents orphan issue creation and preserves UI/action
  semantics.
- Do not use SPS managed agent execution. External `agy.exe` remains the
  Worker only behind the broker.
- Do not enable, install, reload, or start anything.
- Run `npm run check` in `sps-memory` before closing.
