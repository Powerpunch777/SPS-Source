# Final Model Fit Audit

Updated: 2026-07-14

## Source Of Truth

`02-final-operating-model-ko.md` remains the agreed operating model. This
audit records the current deployed interpretation; it does not replace the
model.

## Current Alignment

| Agreed behavior | Current implementation |
| --- | --- |
| A Project has one durable Room per hired Agent. | Each hired, non-built-in Agent receives one unassigned root Agent Room in every Project. SPS system Agents such as the paused Reflection Coach are excluded. The Room name follows the Agent name and its role instructions remain in the SPS-managed Agent `AGENTS.md`. |
| A Task is a finite goal-owned work room. | Manager, Designer, or any CTO uses the Room's explicit SPS tools to create a child Task. The plugin first parks it unassigned, writes `TASK_ROOM_STATE` and the visible protocol, and only then assigns it. A paused Worker receives one blocked Task, which is started in place after that Worker is resumed. |
| No hidden controller decides work. | There is no routing controller. Manager, Designer and CTO use tools directly after explicit natural-language delegation. Design approval is not a hard gate; exploration and prototype maturity preserve uncertainty. |
| User reviews completion or blockers. | One substantive Worker final/blocker report with its matching `in_review` or `blocked` state wakes only the Task-owning Agent Room. The Task Owner technically verifies evidence, marks qualifying work `done`, and reports to the user without claiming user approval. The user reviews at completion or when work is impossible and may reopen a Task. |
| Projects are isolated but shared knowledge can be reused intentionally. | Design and implementation truth remains in each Project's external repositories. SPS keeps Room/Task operational memory; only explicitly reusable approved knowledge enters the shared scope. |
| SPS remains updateable. | UI and company policy stay in plugins/Sidecar. Missing host contracts live on the small local `codex/workplane-core-contract` branch, based on the upstream repository. Updates are integrated by rebasing that branch and rerunning the contract suite; the installed registry package is not patched in place. |

## Runtime Status

- `local.room-chat` `0.3.19` is the primary Room and Task workplane and is deployed `ready`/`healthy`.
- `local.memory-sidecar` provides approved-memory recall and candidate storage.
- Agent Room provisioning excludes SPS built-in Agents by metadata, not
  by display name. Existing built-in Rooms are cancelled for history and are
  omitted from the Project Room list and Codex account selector.
- A Room uses a native SPS Agent Session carrying Project, Project
  Workspace, and Room Issue context. The host persists its latest run and
  terminal error, so the plugin can recover the same durable Room after a
  process or machine restart.
- Room turns, native compact, and Task-owner feedback start while a valid
  SPS action exists, then persist their result using SPS's public
  loopback API. This removes the expired-invocation execution path.
- A finished Room turn writes terminal state to `ROOM_STATE`. The auxiliary
  Room Job ledger is reconciled on the next Room read and during worker
  startup, so old `working` records do not block the Room.
- `ROOM_STATE` uses a versioned base64 UTF-8 JSON envelope. This prevents a
  Windows code-page conversion from silently corrupting Korean state while
  retaining backwards-compatible reads of older documents.
- Room file attachments are durable SPS attachments. Their local Codex
  staging cache has no file-count limit and expires after 30 days; the original
  SPS attachment is not deleted.
- Room dynamic tools now expose approved `memory_search` and candidate-only
  `memory_propose` to Codex Rooms, so a Room does not rely on a separate
  SPS managed-agent session to access memory.
- Opening a Project or Task Memory view idempotently creates the project
  learning journal and Sidecar namespace when necessary.
- Each Room resolves `CODEX_HOME` from its Agent connection first. Separate
  homes use independent Codex app-server processes, so different ChatGPT
  accounts can be assigned to different Agents without sharing local auth or
  session state.
- A Room changed to a different Codex home starts a new Codex session while
  retaining its SPS conversation, checkpoints, attachments, and memory.
- Codex native automatic compact events are persisted separately in
  `ROOM_NATIVE_COMPACTIONS`. They are observable in the Room Session panel and
  never trigger an additional forced compact or replace the durable checkpoint.
- An `antigravity_local` Worker Room runs local agy print-mode turns with a
  reconstructed durable SPS context. This lets Code, QA, Art, Voice, and
  document Workers converse without consuming the Codex Room runtime.
- CLI Workers use SPS assignment wake-up with scheduled heartbeats off
  and up to three non-conflicting concurrent runs per Worker. Task assignment
  wakes only the assigned Worker and avoids background usage while the company
  is idle.
- Every `antigravity_local` assignment prompt reads the managed Agent
  `AGENTS.md` first and receives `paperclipTaskMarkdown`, wake reason, recent
  Task comments, and the selected Workspace directly. The template is kept in
  `config/agy-agent-prompt-template.txt` and is re-synced by the Workplane
  bootstrap without modifying the external adapter package.
- Managed Instructions are generated from one common company contract, a
  `task-owner` or `worker` profile, and one professional role template. Runtime
  authorization reads the managed role marker, so a broad SPS role such
  as `designer` cannot grant Image Worker Task-owner tools.
- A Worker transition to `in_review` or `blocked` schedules an automatic Room
  Job only after the Task contains a substantive, Worker-authored boundary
  report. The report must identify outputs or blockers, evidence, risk, and
  the next reviewer; title-only and byte-identical duplicate reports do not
  wake the owner. The owner resumes the existing long-lived Room session,
  reviews the evidence, and writes the user-facing report in that Room.
- Worker terminal submission is a host transaction tied to the assigned Agent
  and active run. It writes exactly one report and the matching Task state
  together, making concurrent retries idempotent for every Worker role.
- ACP thought/progress summaries remain available to the activity UI, while
  only the output stream becomes the final assistant Room comment.
- A minimal live `agy` call with the Code Worker model configuration
  (`gemini-3.1-pro-high`) succeeded on 2026-07-13. The runtime is therefore
  connected; no claim is made about a real-time remaining provider quota.
- Image Worker has a provider-selectable external Asset Tool: `pixel_lab` is
  for 2D pixel PNG output and `meshy` is reserved for explicit 3D output.
  Generated results and requests are persisted in the selected Project
  Workspace; provider tokens are absent until the user adds them to the Agent
  connection environment.

## Explicit Boundaries

- Design and implementation artifacts stay in the project's external Git and
  Obsidian repositories. They remain the canonical project knowledge. Room
  state, checkpoints, comments, attachments, and operational learning journals
  stay under the local Workplane data area and may reference those artifacts.
- Memory candidates are not approved memory. A user or authorized CTO review
  must promote a candidate into a `LEARNINGS.md` journal.
- The optional Unreal-only direct `agy` adapter remains a disabled compatibility
  route for an existing explicitly configured installation. It is no longer
  exposed as a Project tab: the generic UI has one production path, Agent Room
  -> Lead-created Task -> assigned Worker -> owning Lead Room report.

## Remaining Operational Limits

- The running server is the expected local core. The Windows
  `SPSLocalServer` scheduled task now points directly at the hidden local
  launcher; the next reboot is the remaining observational startup smoke test.

- A provider usage limit, permission denial, missing workspace, or unavailable
  external tool leaves the user message and Room state saved, but it cannot be
  retried automatically without renewed provider capacity or access.
- Provider capacity is determined only by an actual request. The local runtime
  cannot display a reliable real-time remaining-usage value; authentication
  status and provider availability are separate states.
- The Compact button creates a SPS checkpoint and invokes native Codex
  compact where available. Agy has no equivalent native session compact, so
  its button creates only the durable SPS checkpoint. Provider-native
  Codex auto-compacts are recorded as events, not reconstructed summaries.
- Worker adapters still need to be connected per Agent through SPS
  Agent settings. The current architecture deliberately separates that
  connection from the role's `AGENTS.md` instructions.
- PixelLab and Meshy tokens have intentionally not been added. The Asset Tool
  is verified with mocked provider calls and is ready to activate after the
  user creates the desired provider account and adds its Agent environment key.
- Agy OAuth authentication is currently a current-user OS-keyring credential,
  not a documented profile-per-Agent setting. Use a single selected Agy account
  for local Worker execution, or provide an approved API credential through
  the Agent environment when that operating model is required.
