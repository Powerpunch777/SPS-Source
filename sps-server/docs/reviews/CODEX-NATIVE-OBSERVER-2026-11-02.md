# Codex Native Worker Observation Prerequisite

Date: 2026-11-02

Private Core implementation revision: `307ff463dc67cf1d9f500fde6035f8245ee47bfe`.
The Desktop release support matrix and installed application are not advanced.

The user clarified the Builder target: after a Lead assigns a specification,
the project CTO must create and coordinate independent native Workers, inspect
results, and continue toward the stored objective without repeated user prompts.
This increment is a prerequisite, not that completed autonomous loop.

## Changed

Private Core adds a read-only app-server JSONL client, strict bounded direct-child
metadata observation, and an isolated no-model probe. It does not activate a new
adapter, enable native tools, change SDK exports, modify Builder workflow,
update the installed app, or replace DEV dependencies.

The client denies server tool/approval/auth requests. Child metadata must have
the exact requested parent; duplicate IDs/cursors, malformed or oversized
responses, invalid UTF-8 and timeouts fail closed. Tenant authorization and
actual parent/child tool boundaries are not implemented by this read helper.

## Evidence

With Node 24.22.1, from the private Core checkout:

```powershell
pnpm exec vitest run packages/adapters/codex-local/src --exclude '**/dist/**'
pnpm --filter @paperclipai/adapter-codex-local typecheck
node scripts/probe-codex-app-server-observer.mjs <absolute-native-codex-executable>
```

- Adapter source regression: **182/182**; new transport/metadata tests: **42**.
- Adapter typecheck: passed.
- Actual isolated **Codex CLI 0.144.1** process: initialize passed, direct-child
  filtering accepted, zero children, **zero model turns**, normal exit zero.
- The probe's first exec-style config flag failed at CLI parsing; it was removed
  for app-server, which uses a newly created empty home and workspace instead.
- A broader first test command also included generated tests; four failures
  represented two duplicated Windows fixture assumptions. Path checks now use
  platform paths, and real-process termination checks accept Windows reporting
  while still proving PID disappearance. Final source checks passed.

No actual native Worker was created, no real CTO goal was resumed, and no app
or physical-device pass is claimed. Builder's previous 449 checks and source-app
evidence remain earlier evidence, not tests rerun or superseded here.

## Next Critical Path

The installed CLI schema already includes native thread goals. Test their
persistence/continuation before inventing another scheduler. Then qualify real
native child identities, narrow dynamic tool authority, explicit Task Packet
input without automatic parent-private-memory sharing, stop/cancel/restart and
Worker/QA result handling. Only then connect the autonomous Builder workflow.
The current planning path still disables native multi-agent tools.

Core's Workspace worker lane does not currently offer generic run-event
subscriptions or direct scheduled `runJob` dispatch. Existing session receipt,
`getRun`, state CAS and native app-server lifecycle should be reused where
possible; do not assume a missing callback is already a durable continuation.

Marketplace, Preview, new Native LAN work, broad Core completion and Stable
release qualification are not added to Builder's prerequisite scope.

References: [official app-server](https://learn.chatgpt.com/docs/app-server),
[official subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents).
