# Room Workplane Runtime Hardening

Updated: 2026-07-14

## What Changed

### Reliable Room execution

Room messages, Compact, and Task-owner feedback now share one lifecycle:

1. SPS action validates the user, Room, Workspace, and current state.
2. The action persists the user request and starts a native Agent Session run
   with Project, Workspace, and Room context.
3. The run completes outside the short SPS RPC window while the host
   persists its last run and terminal state.
4. The completion writes the assistant result, Room state, checkpoint, or Task
   feedback through the durable host/plugin contract.

This prevents the old `missing, expired, or unknown invocation scope` failure
that occurred when background work tried to reuse an expired plugin context.
The Room Job ledger is reconciled from durable Room state, so a completed or
failed turn cannot leave the Room permanently blocked as `working`.

### File attachments

- Any number of files can be attached to one Room message.
- Attachments are stored by SPS, not copied into the design or
  implementation repository.
- Images are supplied to Codex as image input. Other files are staged as local
  files with an explicit safe-inspection instruction.
- The temporary local staging cache is retained for 30 days and then cleaned
  on later attachment use. This is a cache policy, not a user file-count cap.

### Long-term memory

- Approved memory lives in scoped `LEARNINGS.md` journals:
  company, project, and role/agent.
- Candidate memory is separate and never becomes approved merely because an
  agent mentioned it.
- Each project receives an idempotent project journal and Sidecar entry the
  first time its Project or Task Memory view is opened.
- Room dynamic tools can search approved memory before planning and can propose
  a candidate after a decision. They cannot silently modify approved journals.
- The Sidecar accepts only loopback requests and requires its local token.
  Until SPS supports company-scoped plugin secrets, the Room and Memory
  plugins read that token from the local Sidecar companion configuration; an
  explicit `MEMORY_SIDECAR_TOKEN` environment value takes precedence.

### Codex account isolation

- A Room resolves its Codex home from its Agent's
  `adapterConfig.env.CODEX_HOME` first, then the optional Room plugin default,
  and finally the inherited system default.
- Different Codex homes receive independent local Codex processes. This keeps
  authentication, local sessions, and account usage separate per Agent. The
  selector and startup configuration are part of the local core contract, not
  a mutation of the installed registry cache.
- When an Agent changes Codex homes, its next Room message opens a new Codex
  session. SPS comments, checkpoints, attachments, and memory journals
  remain intact, so the long-lived Room itself is not reset.
- ChatGPT/Codex does not expose a dependable local remaining-usage meter to
  this runtime. `codex login status` confirms authentication only; the Room
  records provider limits from an actual turn and clears the active failure
  state when a new turn begins.
- When Codex performs its own automatic context compaction, the Room records
  the event separately in `ROOM_NATIVE_COMPACTIONS`. It does not force a
  second compaction or overwrite the SPS checkpoint and conversation.

### Agy Worker Rooms

- An Agent configured with SPS's `antigravity_local` adapter now runs its
  own Room messages through local `agy --print` execution. The Agent's model,
  working directory, sandbox setting, and plain environment values are reused.
- Agy Room turns rebuild context from the durable SPS checkpoint, recent
  Room comments, staged file paths, and the Agent's managed `AGENTS.md`.
  They therefore survive a terminal close or machine restart without relying
  on an ephemeral CLI conversation ID.
- Planning Agents that must call SPS Task tools remain on the Codex
  app-server runtime. Agy Worker Rooms can discuss work and report results,
  but do not yet receive SPS dynamic Task-creation tools.
- Agy's interactive subscription login is stored in the current user's native
  OS keyring. It is shared by local agy Workers; this runtime does not claim
  unsupported per-Agent OAuth account isolation for Agy.
- Local Workers use event-driven execution: their scheduled heartbeat is off,
  assignment wake-up is on, and each Worker is limited to one concurrent run.
  A CTO assignment wakes that Worker without paying for periodic polling.
- Live verification on 2026-07-13 completed a minimal `gemini-3.1-pro-high`
  agy turn successfully. This validates the installed CLI and current local
  credential can execute the same model configuration used by Code Worker.

## Operating Flow

1. Create a Project and bind design and implementation Workspaces.
2. Start in the Designer Room and create or update the design repository.
3. When implementation is explicitly authorized, ask CTO in its Room.
4. CTO searches approved memory, checks existing Tasks, then creates one
   finite child Task with affected paths, acceptance criteria, verification,
   and a Worker assignment.
5. The Worker reports through the Task Room. CTO can provide Task feedback
   without turning the long-lived Room into a Task.
6. The user reviews `in_review` or `blocked`, promotes durable lessons when
   appropriate, and closes the Task.

## Compatibility Boundary

SPS Core is modified only where the plugin API could not safely provide
the required host guarantees: contextual recoverable Agent Sessions, atomic
Worker terminal reports, execution ownership guards, Windows ACP/UTF-8
compatibility, and Codex startup model/account configuration. Room UI, company
policy, provisioning, memory policy, and owner-wake orchestration remain in
plugins and Sidecar services.

The local core tracks upstream on `codex/workplane-core-contract`. After each
SPS update, integrate upstream into that branch and run the core contract
tests, plugin checks, startup tests, and one Room/Task smoke test before using
the updated build for production work.
