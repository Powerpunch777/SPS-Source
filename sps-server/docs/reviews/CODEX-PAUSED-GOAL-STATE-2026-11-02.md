# Codex Paused Goal State Evidence

Date: 2026-11-02

Private Core revision: `defd883f08daea0e42171cc52a505459d0448d47`.
The release support matrix, submodule pins and installed app are not advanced.

This continues the existing native execution prerequisite, not the draft
specification Gate implementation. No new Builder policy, SDK surface, model
provider, account, installed release, or production engine is activated.

## Changes

Private Core adds an exact-thread, bounded provider goal-state parser and a
separate internal paused-state diagnostic over the existing JSONL transport.
The ordinary read-only client retains its old read allowlist. The state-probe
client rejects active/default goal writes, unknown fields, getters and serializer
overrides; a checked paused write is copied to fresh own data before encoding.
This client is only for a newly owned empty diagnostic profile, not ambient
account homes or plugin-facing authorization.

The no-model probe can now create an idle thread, store a paused goal, exit,
start a second process in the same isolated home, recover the identical goal,
resume the same paused thread, and clear the goal. It waits for both processes
to exit and removes only its verified owned temporary profile. It does not send
`turn/start`, enable native Workers, or publish identifiers/private diagnostics.

## Verification Scope

Core root, with Node 24.22.1:

```powershell
pnpm exec vitest run packages/adapters/codex-local/src --exclude '**/dist/**'
pnpm --filter @paperclipai/adapter-codex-local typecheck
node scripts/probe-codex-app-server-observer.mjs <absolute-native-codex-executable>
node scripts/probe-codex-app-server-observer.mjs <absolute-native-codex-executable> --paused-goal
```

- Adapter source regression: **204/204**; typecheck passed.
- Added goal parsing: **8** tests; paused goal-wire diagnostic: **14** tests.
- Actual CLI **0.144.1**: exact goal survived process restart, same paused thread
  resumed, clear/read-null succeeded, two normal process exits.
- Observed goal counters stayed zero; the client sent zero turn-start requests.
  No existing account credentials were supplied. This is not a billing audit.
- Prior read-only initialization/direct-child empty-list probe still passed.

## Remaining Work

Paused goal persistence does not prove active continuation, real native children,
Worker input/authority separation, cancellation, quota recovery or Builder
acceptance. Source review of the pinned Codex implementation shows setting an
active goal and resuming an active goal can initiate work. Production activation
must therefore be treated as execution admission, not a metadata read. Core's
Workspace/plugin stop state, exact session ownership, current permissions and
uncertain-run recovery must still apply. Goal clear is not proof that a process
or its child Workers terminated.

Builder owns the Workstream objective, decisions, work allocation and QA. No
custom domain scheduler is added to Core. The existing protected CLI still
disables native multi-agent execution. The new G1~G6 integration documents remain
unapproved design drafts, not a reason to start new policy implementation.
Marketplace, Preview, Native LAN, broad Core completion and Stable qualification
remain outside this increment.

References: [official goal API](https://learn.chatgpt.com/docs/app-server#manage-a-thread-goal),
[pinned Codex goal runtime](https://github.com/openai/codex/blob/rust-v0.144.1/codex-rs/ext/goal/src/runtime.rs).
