# Structure Fit Checklist

Use this checklist before and after each implementation step.

## Core Model

- Paperclip remains the control plane for company, project, task rooms, comments, documents, work products, agent assignment, and run state.
- Task Rooms are Paperclip issues with one goal and a close condition.
- Agent Rooms are role desks, not replacement runtimes.
- `agent_task_sessions` are internal execution records, not user-facing chat rooms.
- The user can address Project Hub, Agent Rooms, or Task Rooms directly.

## Agent Authority

- CTO and Manager directly use tools to create child task rooms and assign workers.
- No hidden central controller decides routing or overrides agent agency.
- Workers stay inside assigned Task Room scope and explicit CTO/User direction.
- Large product direction, release decisions, monetization, major architecture changes, budget, permissions, and new worker roles escalate to the user.

## Memory Layer

- Memory is an assistive recall layer, not the source of truth for work.
- Paperclip comments, documents, work products, and issue status remain the source of truth.
- Memory entries must have scope: company, project, agent, task, artifact, or user.
- Agents propose memory candidates; they do not silently promote every observation.
- Durable memories are promoted only through explicit memory maintenance or user-approved update.
- Avoid split-brain memory. If multiple backends exist, one must be canonical and the others are evidence/imports.

## Sidecar Rules

- A Memory Sidecar may index, search, and propose memory.
- A Memory Sidecar must not create task rooms, assign workers, close tasks, or decide routing.
- A Memory Sidecar must expose provenance for every result.
- Sidecar writes should go to candidate storage first, not directly into approved learning journals.
- Sidecar config must keep Paperclip paths explicit and easy to inspect.

## UI Rules

- Start with simple Project/Agent/Task memory views and candidate review.
- Do not build a graph UI before retrieval quality is useful.
- Do not hide memory edits from the user.

## Current Milestone Status

### Milestone 1: File-Based Learning Journals

Status: implemented.

Fit result:

- Fits the Paperclip-first model.
- Does not add a central controller.
- Keeps generic placeholder agents untouched.
- Adds memory as guidance and candidate proposal, not automatic truth.

Open verification:

- Run a real CTO -> Worker Paperclip task and confirm agents actually read/use the journals.

### Milestone 2: Memory Sidecar MVP

Status: MVP skeleton implemented.

Required fit:

- Read/index learning journals.
- Search memory by query and scope.
- Store memory candidates separately from approved journals.
- Do not call Paperclip task APIs for routing or assignment.

Fit result:

- Fits the Paperclip-first model.
- Does not create, assign, close, or route Paperclip tasks.
- Reads approved memory from `LEARNINGS.md`.
- Stores candidates separately in local JSONL.
- Includes provenance path and line numbers in approved memory results.
- Restricts browser CORS origins to configured local UI origins.

Open verification:

- Connect this sidecar to a real Paperclip run through a plugin, adapter hook, or explicit agent tool.
- Run one real CTO -> Worker task and confirm recall/candidate behavior inside Paperclip.

### Milestone 3: Paperclip Memory Plugin Wrapper

Status: installed and runtime-verified at the Paperclip plugin tool API level.

Implemented:

- Local plugin source at `paperclip-game-workplane/paperclip-memory-plugin`.
- Agent tool wrapper for approved memory search.
- Agent tool wrapper for memory candidate proposal.
- Manifest validation script.
- Worker syntax check script.
- Installed Paperclip plugin `local.memory-sidecar`.
- Paperclip exposes `local.memory-sidecar:memory-search`.
- Paperclip exposes `local.memory-sidecar:memory-propose`.
- Active Manager, CTO, and Code Worker instructions prefer Paperclip plugin memory tools and keep helper scripts as fallback.
- Standard worker `fetch` is used because Paperclip's managed `ctx.http.fetch` blocks loopback/private addresses.
- Loopback-only sidecar URL validation remains the plugin safety boundary.

Fit result:

- Keeps Paperclip as the control plane.
- Exposes memory to real Paperclip agents instead of creating a separate chat/control system.
- Does not create, assign, route, wake, or close Paperclip tasks.
- Does not write to the Paperclip database.
- Does not mutate approved `LEARNINGS.md`.
- Uses the Memory Sidecar as a helper, not a source-of-truth replacement.

Open verification:

- Run one real CTO -> Worker Task Room and verify recall/candidate behavior from issue comments and close summaries.

Verified:

- `npm run check` passes inside the plugin folder.
- Paperclip starts cleanly on `127.0.0.1:3100`.
- Memory Sidecar is healthy on `127.0.0.1:3188`.
- Paperclip plugin health is `ready`.
- `memory-search` returned approved project memory for `Task Room` with `LEARNINGS.md` provenance.
- `memory-propose` created a candidate without mutating approved `LEARNINGS.md`.

### Milestone 4: Paperclip Runtime Smoke Test

Status: architecture flow verified; runtime hardening still required.

Fit result:

- Paperclip issue `CMP-8` was created as the parent Task Room.
- Assigning/resuming the issue triggered Paperclip's CTO execution path.
- Failed and successful attempts stayed as internal execution/run records, while the user-facing work surface remained issue/comment/child-issue state.
- After quota recovery, CTO confirmed the Task Room vs `agent_task_sessions` structure from memory recall.
- CTO directly created Code Worker child Task Rooms without a hidden central controller.
- Code Worker completed child Task Rooms with close summaries.
- Memory stayed in the recall/candidate role and did not mutate approved `LEARNINGS.md`.

Verified child flow:

- `CMP-9`: created by CTO and completed by Code Worker, but the Korean handoff text was corrupted by Windows/PowerShell encoding.
- `CMP-10`: created by CTO as an ASCII replacement handoff and completed by Code Worker. Treat this as the clean reference run.

Open hardening:

- UTF-8-safe issue/comment helper scripts were added under `scripts`.
- Active CTO, Code Worker, and Manager instructions now point to the helper scripts through the ASCII alias `C:\Users\young\Documents\paperclip-game-workplane`.
- Direct helper smoke tests verified Korean title, description, comment, and literal backticks on unassigned issues `CMP-12` and `CMP-13`.
- `CMP-13` had no assignee and no issue live runs, so direct helper use does not wake agents by itself.
- Completed issues `CMP-8`, `CMP-9`, `CMP-10`, `CMP-12`, and `CMP-13` currently report no live runs.
- `scripts\Get-PaperclipLiveRunsUtf8.ps1` was added to avoid PowerShell null-count artifacts when checking live runs.
- `scripts\Invoke-AgyDirectTask.ps1` was added as a Codex-saving direct local worker runner.
- `CMP-15` verified the corrected direct runner path: result comment posted, issue marked `done`, no assignee, no live runs.
- `scripts\Invoke-DirectAgyTaskRoom.ps1` was added to create unassigned Task Rooms and run the direct local worker path as one workflow.
- `CMP-16` verified the workflow helper end-to-end: unassigned Task Room created, direct `agy.exe` run posted a result, issue marked `done`, no assignee, no live runs, no leftover `agy.exe` process.
- `CMP-17` delegated the memory-candidate extraction design review to direct `agy.exe`.
- `CMP-18` found and fixed a PowerShell `$Host` variable collision in the loopback URL guard.
- `CMP-19` verified opt-in `-ProposeCandidates`: the close-summary memory candidate was stored in the Memory Sidecar candidate inbox, issue marked `done`, no assignee, no live runs, no leftover `agy.exe` process.
- `memory-sidecar\memory-candidates.ps1` was added and verified as a read-only candidate inbox viewer; it does not approve, promote, reject, or mutate memory.
- `memory-sidecar\memory-record-candidate-review.ps1` and `memory-sidecar\memory-promote-candidate.ps1` were added for explicit candidate review.
- Promotion previews by default and writes to `LEARNINGS.md` only with `-Apply`.
- `cand_7d08a1fe1b9bf060` was marked `reviewed` through append-only event `event_6cc618ee70734413ad36bfe81d523f44`; it was not promoted to approved memory.
- `CMP-20` records the explicit review helper implementation in Paperclip; it is done, unassigned, and has `liveRunCount = 0`.
- `scripts\Test-PaperclipWorkplaneReadiness.ps1` was added as a read-only preflight before real Paperclip CTO -> Worker smoke tests.
- `CMP-21` verified the readiness-gated parent CTO Task Room.
- `CMP-22` verified a CTO-created Code Worker child Task Room.
- Final readiness after `CMP-21`/`CMP-22` returned true with company live-run count 0.
- New hardening finding: unauthenticated local-board helper writes from inside an assigned worker runtime can re-wake the worker after completion.
- `Add-PaperclipIssueCommentUtf8.ps1` and `Update-PaperclipIssueUtf8.ps1` now refuse board-auth writes to assigned issues unless `PAPERCLIP_API_KEY` exists or `-AllowBoardWriteToAssignedIssue` is passed.
- Code Worker now has a scoped task-bridge key injected as `TASK_BRIDGE_API_KEY` for the project.
- `CMP-23` verified the task-bridge close path: agent-authored close comment, issue done, final company live-run count 0, no redundant automation wakeups.
- `PaperclipApiUtf8.ps1` now forwards `PAPERCLIP_RUN_ID` as `x-paperclip-run-id` for assigned issue status updates.
- `CMP-24` standardized close helper `Close-PaperclipTaskUtf8.ps1` implemented and verified to enforce `TASK_BRIDGE_API_KEY` and `PAPERCLIP_RUN_ID` for clean agent-authenticated task-bridge writes.
- Prevent repeated Codex wakeups from draining usage; delegate repetitive worker tasks to `agy`.

Guardrail:

- Keep Codex in a lightweight CTO/review role.
- Use `agy` for most repetitive worker execution.
- Use the `Close-PaperclipTaskUtf8.ps1` helper path for assigned worker closure, and watch the next real worker task for repeated clean live-run cleanup.

### Milestone 5: Paperclip Memory UI Extension Feasibility

Status: completed. Feasibility documented in [23-paperclip-ui-feasibility-log.md](file:///C:/Users/young/Documents/AGENT%20%EA%B5%AC%EC%B6%95/paperclip-game-workplane/23-paperclip-ui-feasibility-log.md).

Fit result:
- Fits the Paperclip-first model. Adding Project, Agent, and Task Room Memory panels/tabs via the native plugin UI SDK (`detailTab` slot) does not require a core fork.
- Respects security boundaries: direct local loopback calls from the browser UI are blocked by CORS/security constraints, but routed cleanly through the Node.js Plugin Worker Bridge to call the loopback Memory Sidecar API.
- Recommends a standalone sidecar-only page as a viable temporary surface while the native slot components are bundled and loaded.

### Milestone 6: Hardened Memory Sidecar Namespace Filtering (CMP-26)

Status: implemented and verified.

Fit result:
- Fits the Paperclip-first model by ensuring strict optional namespace query filtering (`companyId`, `projectId`, `agentId`, and `issueId`) on approved memory items, search, and candidate lists.
- Preserves `companyId` and `projectId` metadata on approved items and proposed candidate records.
- Does not modify approved `LEARNINGS.md` journals without explicit user-approved maintenance.
- Retains backward compatibility for existing journals and candidate JSONL.
- Verified via `verify-filters.mjs` and `verify-filters.ps1` to prevent cross-scope memory leakage.

### Milestone 7: Build Task Room Memory Tab MVP (CMP-27)

Status: implemented and verified.

Fit result:
- Fits the Paperclip-first model by implementing a read-only Task Room Memory tab natively inside the Paperclip UI via the `detailTab` extension slot for the `issue` entity type.
- Avoids core modifications or direct loopback network requests from the browser (bypassing CORS limits) by using the Node-based Paperclip plugin worker bridge (`usePluginData` hook maps to registered worker data provider `memory-view`).
- Preserves security boundaries: is strictly read-only, has no actions that modify learning journals (`LEARNINGS.md`), close tasks, promote candidates, create tasks, or wake agents.
- Delivers rich UI indicating approved company memory, approved project memory, and memory candidates with clear scope, dates, provenance notes, and explicit empty/loading/error states.
- Checked using `npm run check` and builds the bundle into `dist/ui/index.js` via a reproducible esbuild build step.

### Milestone 8: Fix Task Room Memory Tab Mounting with Web Component (CMP-28)

Status: implemented and verified.

Fit result:
- Documented compatibility finding: The local Paperclip host does not inject the React plugin bridge global (`globalThis.__paperclipPluginBridge__`), causing React SDK hooks (`useHostContext`, `usePluginData`) to fail.
- Replaced the React-dependent bundle with a dependency-free custom web component (`MemoryTabElement`) defining a stable custom element `paperclip-memory-tab`.
- Exported `MemoryTab = "paperclip-memory-tab"` as the tag name string from the UI bundle entrypoint.
- Designed the web component to read `pluginSlot` and `pluginContext` properties directly when set by the host.
- Fetches worker data by making a `POST` request to the official same-origin Paperclip worker endpoint `/api/plugins/<pluginId>/data/memory-view` with `companyId` and `params` (containing `companyId`, `projectId`, and `issueId`) from the host context.
- Renders safe text-only cards for approved company memory, approved project memory, and task candidates (with loading, error, empty states, dates, scope/status, and source provenance) without any write actions.
- Avoids fetching the Memory Sidecar directly from browser code, satisfying CORS/local network access rules.
- Updated the build script in `package.json` to exclude external React/SDK dependencies, ensuring the static bundle contains zero imports or unresolved bare imports.
- Verified that `npm run check` compiles cleanly, the static bundle has no imports, and the manifest check passes.

### Milestone 9: Add Project Hub Memory Tab (CMP-29)

Status: implemented and verified.

Fit result:
- Fits the Paperclip-first model by extending the read-only Memory UI with a distinct Project Hub Memory tab for the `project` entity type, while preserving the existing Task Room Memory tab unchanged.
- Adds a distinct native `detailTab` slot configuration for entityType `project` in `manifest.js`.
- Implements a worker data handler `project-memory-view` that requires `companyId` and `projectId` (throwing an explicit error if missing to prevent unscoped results), returning only approved company memory filtered by company scope, approved project memory filtered by project scope/companyId/projectId, and candidates filtered by projectId.
- Implements `ProjectMemoryTabElement` as a dependency-free custom web component (`paperclip-project-memory-tab`) and exports `ProjectMemoryTab` from the UI bundle entrypoint.
- Renders loading/error/empty states, dates, scope/status, and source provenance path/line number with no write actions.
- Calls only the official same-origin Paperclip plugin data API (`/api/plugins/<pluginId>/data/project-memory-view`) from browser code.
- Verified that `npm run check` compiles successfully, the manifest validates against schema, and the bundle contains no React dependencies.

### Milestone 10: Agent Room Memory Tab (CMP-31)

Status: Blocked.

Fit result:
- Blocked by host UI limitations. The local host does not render plugin detail tabs on the Agent dashboard even though the SDK/manifest supports agent entity types.
- The `agent-memory` slot, `AgentMemoryTab` UI component, and `agent-memory-view` worker handler were removed to maintain a clean, deployable plugin codebase.

### Milestone 11: Task Room Assigned Agent Memory (CMP-32)

Status: Implemented and verified.

Fit result:
- Fits the Paperclip-first model. A long-lived Agent Room is an assigned Paperclip issue. Instead of exposing a separate agent-memory tab that the host cannot render, the Task Room Memory tab automatically retrieves and displays the current assignee agent's memory.
- Uses `ctx.issues.get` from the official SDK to identify the assignee and fetch their role memory (`/memory/items?scope=agent&companyId=<companyId>&agentId=<assigneeAgentId>`) when a task is assigned.
- Retains namespace safety: if a task is unassigned, it does not query agent memory or show an empty Assigned Agent Memory section.
- Does not query project memory from an unrelated project and does not perform any writes.
- Verified via an automated Node.js test environment using the official SDK test harness, testing both assigned (CMP-22) and unassigned (CMP-27) tasks.

### Milestone 12: Bounded Direct Agy Recall Brief (CMP-33)

Status: implemented and verified.

Fit result:
- Fits the Paperclip-first model. The direct local worker receives an approved-memory Recall Brief before it runs, while Paperclip remains the source of truth for the task and final report.
- Uses the authoritative issue `companyId`, `projectId`, and optional assignee ID; it never accepts invented namespaces from the worker prompt.
- Reads only approved company, project, and assigned-agent memory. It does not retrieve candidates, create issues, assign agents, or alter Paperclip run state.
- Bounds the query to 500 characters, returns at most three recalled items per scope, limits each rendered item to 500 characters, and limits the entire brief to 3,600 characters.
- Sidecar failure is non-blocking and explicitly visible in the prompt. Candidate submission remains opt-in and attaches authoritative company/project/agent/issue metadata.
- This milestone applies only to the direct `agy.exe` runner. Automatic lifecycle injection for Paperclip-managed agents remains open.

### Milestone 12: Bounded Direct Agy Recall Brief Lifecycle (CMP-33)

Status: Implemented and verified.

Fit result:
- Fits the Paperclip-first model. Only retrieves approved memory scope-by-scope (company + project, then assignee agent) using authoritative issue keys.
- Preserves safety boundaries: keeps sidecar requests localhost-only, does not call Paperclip write/route APIs from within agy, and utilizes non-blocking fallback if the memory sidecar is unavailable.
- Propagates authoritative metadata (`companyId`, `projectId`, `agentId`, `issueId`) in proposed memory candidates.
- Verified via a dedicated automated test suite (`scripts/Test-AgyRecallLifecycle.ps1`) covering recall success, recall unavailable, query capping/formatting, and candidate metadata composition.
- Note: This covers the direct local `agy.exe` path only; Paperclip-managed agent automatic memory injection is a separate milestone.

### Milestone 13: Safe Agent Room Bootstrap Tool (CMP-34)

Status: Implemented and verified.

Fit result:
- Fits the Paperclip-first model. Agent Rooms are represented as long-lived, project-scoped assigned Paperclip issues.
- Safety Boundary: Enforces explicit `-Apply` and `-AcknowledgePotentialAgentRun` switches to prevent accidental agent wakeups, since assigning an agent to an issue can trigger its execution.
- Idempotency & Safety Checks: Ensures the target agent exists and is in a ready/idle state. Inspects project issues to block duplicate creations of active rooms for the same agent.
- Role-Desk Protocol: Establishes a standard Markdown template describing the persistent, long-lived nature of the room, preflight memory checks, and child task room delegation.
- Verified via `scripts/Test-BootstrapAgentRoom.ps1` covering syntax verification, valid dry-run behavior, safety block tests, and validation rules.

### Milestone 14: Probe Paperclip-Managed Agent Memory Lifecycle Hooks (CMP-35)

Status: Implemented and verified.

Fit result:
- Fits the Paperclip-first model by investigating the local Paperclip runtime, plugin SDK type declarations, and shared type definitions without forking Paperclip or bypassing its control plane.
- Verified Pre-run Recall Brief Limitation: Proved that there is no supported API to hook into agent run start or modify prompts at the plugin layer. All event subscriptions (e.g. `agent.run.started`) are asynchronous and return `Promise<void>`, serving as notifications only. Documented this upstream SDK gap.
- Verified and Implemented Post-run Guarded Candidate Extraction: Implemented a safe, guarded event handler in the plugin worker subscribing to `agent.run.finished` and `issue.updated` (when status is `done`).
- Guarded extraction rules: Safely reads comments/documents of the finished issue via the Plugin SDK API, parses them for memory candidates, and submits proposals to the local Memory Sidecar candidate inbox.
- Preserves safety boundaries: It is candidate-only (does not mutate approved `LEARNINGS.md`), uses authoritative company/project/agent/issue identifiers, is non-blocking on sidecar failure, and does not close/route/assign tasks.
- Verified via an automated Node-based lifecycle probe script (`paperclip-memory-plugin/scripts/verify-lifecycle-probe.mjs`) which is integrated into the `npm run check` test suite.

### Milestone 15: Hardened Managed Post-Run Memory Handoff (CMP-36)

Status: Implemented and verified (non-deployed).

Fit result:
- Fits the Paperclip-first model by refining the post-run memory extraction to run securely and strictly opt-in.
- Hardening corrections:
  - Removed `issue.updated` event listener to retain only the official `agent.run.finished` listener.
  - Set extraction to be disabled by default. Configured config properties `enableManagedCandidateExtraction` (boolean) and `managedCandidateCompanyId` (string). Extraction runs only if the company matches and extraction is explicitly enabled.
  - Comments inspection filters only comments authored by the exact run (`createdByRunId === runId`), extracts only from `Memory Candidates:` section, and skips document scanning completely.
  - Enforces body size limit (4000 characters) and proposed count limit (max 5 candidates per run).
  - Implemented durable idempotency in the Memory Sidecar candidate endpoint (`idempotencyKey`), with a deterministic key calculated from plugin ID, run ID, and comment ID.
  - Reduced capabilities in plugin manifest: removed `issue.documents.read`.
- Verified via extended verification test suites in both plugin (`verify-lifecycle-probe.mjs`) and sidecar (`verify-filters.mjs`).
- Deployment Status: Source code hardened and verified locally. Not installed/reinstalled in production, awaiting Codex review.

### Milestone 16: Project Hub Memory Candidate Review Queue (CMP-37)

Status: Implemented and verified (non-deployed).

Fit result:
- Fits the Paperclip-first model by implementing a native read-only Project detail tab slot (`project-memory-candidates`) for viewing proposed candidates.
- Safety Boundary: The tab is strictly read-only, preventing any automatic promotion or modifications to approved journals (`LEARNINGS.md`), and has no buttons for approving/rejecting/modifying.
- Fail Closed: Worker data handler throws an error if `companyId` or `projectId` is missing.
- Project Isolation: The handler retrieves only candidates matching the exact `companyId` and `projectId`, applying a strict filter to keep legacy or mismatched candidates absent from the strict queue.
- Same-Origin: Requests are routed through the same-origin Node-based worker bridge, preserving CORS boundaries.
- Verified via automated verification check (`verify-plugin.mjs` case 4, 5, 6) in the plugin harness.
- Deployment Status: Source code implemented and verified locally. Not installed/reinstalled in production, awaiting Codex review.

### Milestone 17: Non-Waking Agent Room Bootstrap by Default (CMP-40)

Status: Superseded / Corrected (CMP-42).

Fit result:
- Initial design assumed that creating Agent Rooms in `blocked` status would prevent immediate agent runs. This assumption was later disproved by live evidence (CMP-39 and CMP-41), showing that the Paperclip heartbeat/recovery scheduler still transitions blocked assigned issues to `in_progress`.
- The implementation of `Bootstrap-AgentRoom.ps1` and `Activate-AgentRoom.ps1` has been corrected under CMP-42 to fail closed by default to prevent accidental runs.

#### Milestone 18: Correct Agent Room Bootstrap (CMP-42)

Status: Implemented and verified.

Fit result:
- Fits the Paperclip-first model. Acknowledges that the current Paperclip runtime does not support a cost-free, non-waking instantiation mechanism for assigned issues.
- Safety Boundary: A default `-Apply` without `-StartImmediately` fails closed and creates nothing, preventing accidental agent activation.
- Safe Diagnostic: Reassessed and converted `Activate-AgentRoom.ps1` into a read-only diagnostic utility, blocking all write transitions.
- Runnable Creation: Preserves a runnable creation path only when `-Apply -StartImmediately -AcknowledgePotentialAgentRun` are all supplied, making cost and resource consequences unmistakable.
- Verified via updated `scripts/Test-BootstrapAgentRoom.ps1` test suite (asserting fail-closed defaults and safe idempotency checks on existing rooms).

### Milestone 19: Direct Agy Unreal Code Worker Workflow (CMP-43)

Status: Implemented and verified.

Fit result:
- Fits the Paperclip-first model. Discovers and runs directly against the local Unreal workspace. Paperclip remains the source of truth for issues and comments.
- Safety Boundary: Performs path resolution and project validation to ensure it is a valid Unreal project (exactly one `.uproject` file or explicit matching project file) and fails closed on missing or ambiguous paths. Does not run an Unreal build by default.
- Unassigned Task Room: Creates an unassigned Task Room issue in Paperclip to prevent managed-agent wakeups, runs `agy.exe` with the Unreal project as its working directory, and posts the close summary.
- Zero Live Runs: Verifies that Paperclip live run counts are zero.
- Custom Prompt: Customizes the direct agy prompt to identify as `Unreal Code Worker` scope while retaining the recall brief, task boundaries, candidate-only behavior, and close-summary format.
- Dry-Run: Supports a dry-run mode that performs no issue creation, model invocation, or file writes outside normal local run artifacts (prompt files).
- Verified via automated verification test suite (`scripts/Test-DirectAgyUnrealWorkflow.ps1`) covering validation failure cases, explicit project override, and actual Unreal workspace path discovery and dry-run execution.
- Note: This is the first active Unreal Code Worker path; Unity, Blender, and voice adapters are later adapters.

### Milestone 20: Hardened Unreal Workspace Boundary (CMP-44)

Status: Implemented and verified.

Fit result:
- Fits the Paperclip-first model. Ensures direct workers cannot traverse paths or access files outside their resolved workspace.
- Safety Boundary: Enforces that any explicit project file (.uproject) must reside strictly within the resolved workspace directory. Normalizes path separators and checks prefix containment with trailing separators to prevent sibling prefix bypasses (e.g. `game` vs `game-old`).
- Immediate Fail-Closed: Validation is performed immediately, throwing an exception and blocking issue creation or model execution if containment is violated.
- Verified via automated verification test suite (`scripts/Test-DirectAgyUnrealWorkflow.ps1`) including external `.uproject` path rejection and sibling common prefix bypass prevention.

### Milestone 21: Direct Agy Unreal QA Workflow & Baseline Run (CMP-45 & CMP-46)

Status: Implemented and verified.

Fit result:
- Fits the Paperclip-first model. The QA Worker workflow runs directly on the local Unreal workspace with Paperclip as the control plane.
- Shared Validator: Refactored workspace validation into a shared script (`scripts/Resolve-UnrealWorkspace.ps1`) to avoid duplication and rule drift between Code and QA workflows.
- Custom Prompt & Boundary: Customizes the prompt for `QA Worker` role with a strict default read-only operating boundary (inspect/report only; no edits to code, assets, or settings; no builds or packaging unless explicitly requested).
- Actionable QA Result: Prompts the model for structured feedback under Close Summary 'Result' (including scope, reproducible steps, expected/actual behavior, severity, and recommendations) without forcing new document writes.
- Baseline Run (CMP-46): Completed a read-only QA run against the local Unreal workspace. Created an unassigned Task Room issue with zero live runs, producing a QA report and proposing a memory candidate (`cand_3ba965de01eed2cc`) in the sidecar. The candidate remains unapproved, and no initial git commit has been staged or created.

### Milestone 22: Design safe Project Hub direct-request launcher (CMP-48)

Status: Design/Feasibility Completed.

Fit result:
- Fits the Paperclip-first model. Direct-request launcher initiates an unassigned Task Room in Paperclip; the local direct runner executes the Task Room workflow, and Paperclip remains the source of truth for comments, reports, and status.
- Preserves safety boundaries: Keeps Memory Sidecar strictly memory-only. Implements a separate local Direct Task Bridge loopback daemon to handle command execution, process spawning, and PowerShell script runs.
- Enforces non-negotiable security controls: Local loopback binding, explicit token validation, registered project-to-workspace mapping, normalized path validation, argument-array process spawning, role-based allowlists (`unreal-code` and `unreal-qa`), and strict audit logging.
- Proposes a phased implementation: Non-executing preview UI first, followed by explicit submit execution.
- No automatic memory candidate promotion: memory candidates proposed by workers are submitted strictly to the Memory Sidecar candidate queue.

### Milestone 23: Direct Task Bridge Authority Correction (CMP-49)

Status: Implemented and verified.

Fit result:
- Rejects active user's raw API key forwarding and sidecar-config storage.
- Establishes a clean authority split where the board-authenticated plugin worker creates unassigned Task Rooms and handles final comments/updates, while the Direct Task Bridge receives only validated, non-credentialed payloads and executes local agy runs.

### Milestone 24: Project Hub Direct Task Preview (CMP-50)

Status: Implemented and verified.

Fit result:
- Integrates a preview-only UI element in the Project Hub to let developers preview the direct task parameters and safety boundaries without running processes.

### Milestone 25: Direct Task Preview Role Boundary Correction (CMP-51)

Status: Implemented and verified.

Fit result:
- Updates the preview boundaries for `unreal-code` and `unreal-qa` roles to match the actual direct worker prompts, avoiding unverified sandbox claims and enforcing strict defaults.

### Milestone 26: Implement disabled-by-default Direct Task Bridge core (CMP-52)

Status: Implemented and verified (Disabled by Default).

Fit result:
- Standalone Node.js loopback service listening strictly on `127.0.0.1`.
- Enabled configuration defaults to `false`. Requires token authorization, project workspace allowlist, and relative project file checks.
- Enforces single active job concurrency and stable idempotency keys.
- Executes PowerShell by argument array with `shell: false`, captures stdout/stderr, timeouts after a bounded duration, writes events to an append-only `audit.log`, and redacts absolute paths from HTTP responses.
- Persists job execution state to `jobs.json` and fails closed on service restart.

### Milestone 27: Implement source-only authenticated Direct Task plugin integration (CMP-55, CMP-56 & CMP-57)

Status: Implemented in source (Not installed/reinstalled; disabled by default).

Fit result:
- Fits the Paperclip-first model. The board-authenticated plugin worker submits requests and coordinates finalization, while Paperclip remains the source of truth for issues, comments, and status.
- Safety Boundary: The feature is disabled by default in plugin configuration. When disabled, API route calls return a clear disabled response before any issue creation, secret resolution, bridge call, state write, or worker wakeup.
- Bridge URL validation is performed before any writes and must strictly accept only `http://127.0.0.1:<port>`. Hostname aliases, IPv6, credentials, query/hash, non-HTTP, and non-root paths are rejected.
- String Secret Ref: Corrected the manifest config type of `directBridgeSecretRef` to string and validated it before calling `ctx.secrets.resolve`.
- Token Secrecy: A resolved token is strictly redacted (replaced with `[REDACTED]`) from API responses, comments, state, and logger messages/stack traces using a `redactToken` helper.
- Company Isolation: API submits reject company ID mismatches with the host-resolved `input.companyId`.
- Active Job Record: Namespaced all states with `"direct-task-bridge"` to prevent collisions and ensure clean concurrency tracking.
- Unassigned Task: Creates an unassigned Paperclip issue and submits a normalized bounded payload to Direct Task Bridge over loopback fetch using the resolved bridge secret.
- Retry-Safe Finalizer (CMP-57 Hardened): Polls DTB status, checks existing comments using a deterministic outcome-encoded marker `<!-- direct-task-bridge-marker: <jobId> - <outcome> -->` to avoid duplicate comments, and successfully converges to `done` or `blocked`. Comment marker check is performed prior to any URL validation or secret resolution to allow zero-side-effect retry convergence even if the bridge is offline or the configuration is invalid. Finalization never assigns or wakes any agent and is idempotent across retries.
- Verified via mock-based hermetic Node.js test suite (`scripts/verify-direct-tasks.mjs`) verifying disabled handling, validation, token secrecy, idempotency, finalization, simulated real database update failure (by throwing on the first `issues.update` call), and generic outer error secrecy.
- State: **Source implemented but not installed/reinstalled, feature disabled, no secret/config/bridge process exists.**

### Milestone 28: Source-Only Project Hub Direct Task Action UI (CMP-59)

Status: Implemented in source (Not installed/reinstalled; disabled by default).

Fit result:
- Fits the Paperclip-first model by extending the **Project Hub > Direct Task Preview** tab to allow authenticated board users to request a Direct Task Room through a plugin action bridge, keeping the live runtime Preview-only and disabled.
- Safety Boundary: Enforces board-user context verification (`actor.type === "user"` with a non-empty authorized company ID). Other/missing actor contexts return a structured, generic refusal with zero writes, secret resolution, network calls, state changes, or wakes.
- Action Bridge Contract: Registers the dynamic `ctx.actions.register("direct-task-submit", handler)` action in the worker, receiving bounded parameters, forcing the host context `companyId` for anti-spoofing, and returning a strict structured JSON response (success: `{ ok: true, issueId, identifier, jobId, status, taskHref }`, failure: `{ ok: false, code, message }`).
- Direct Task UI Enhancement: Displays the "Launch Task Room" button inline only after a valid preview, generating/reusing an idempotency key for that draft. Form changes automatically invalidate and hide the launch controls, requiring a new preview (which creates a new draft/key).
- Containment Compliance: Never references a loopback bridge URL or secret field in the UI. Keeps Launch unavailable before valid preview, prevents automatic/keyboard launch and polling loops.
- Extended Verification: Extended `scripts/verify-direct-tasks.mjs` with 6 additional hermetic test cases proving action context refusal, disabled launch behavior, host company scope enforcement, duplicate submission idempotency/caching, secret leak prevention, and static source/UI code constraints.

### Milestone 29: Direct Task Action Identity and Task-Link Correction (CMP-60)

Status: Implemented in source (Not installed/reinstalled; disabled by default).

Fit result:
- Enforces strict user identity validation in the `direct-task-submit` action context, requiring an authenticated `actor.type === "user"`, a non-empty `actor.userId`, and a non-empty `actionCtx.companyId`. Missing or empty user/company contexts return the generic structured refusal immediately with zero calls to secret resolver, issue/state APIs, bridge fetch, or wake APIs.
- Omit the UUID-based `taskHref` route (`/issues/<uuid>`) from the worker action return value. The worker action now returns `taskHref: null` to prevent manufacturing routes from untrusted client text.
- UI same-origin route construction: Updated `ProjectDirectTaskPreviewTabElement` in `src/ui/MemoryTab.jsx` to dynamically construct the same-origin task route `/${encodeURIComponent(companyPrefix)}/issues/${encodeURIComponent(identifier)}` using the host's immutable `pluginContext.companyPrefix` and the action response `identifier`, only when both are present and valid. If the companyPrefix is missing or invalid, it displays the issue identifier but no link.
- Extended Verification: Updated the hermetic Node.js test suite `verify-direct-tasks.mjs` to add missing-user-id action refusal cases, assert taskHref is null in successful actions, add a source/UI contract test verifying correct route construction and absence of `/issues/${body.issueId}`/hardcoded `CMP` route patterns, and updated all successful action test cases to include a mock authenticated `userId` on the actor.

### Milestone 30: Read-Only Direct Task Deployment Preflight (CMP-61)

Status: Implemented and verified (Strictly Read-Only).

Fit result:
- Implemented a read-only preflight readiness checker script `scripts\Test-DirectTaskPluginDeploymentReadiness.ps1` that runs without side effects: no HTTP POST/PATCH/PUT/DELETE, no plugin installation/reinstallation/reloading, no configuration writes, no process spawning, no secrets reading/resolution, and no bridge invocation.
- Compares the local source manifest (`dist/manifest.js`) capabilities and routes against the live plugin manifest via a GET request, reporting any capability escalations and missing route/job/action support.
- Runs source validation via `npm run check` and checks for active Paperclip runs and active bridge processes.
- Verifies that no deployment activation artifacts (`config.local.json`, `jobs.json`, `audit.log`, or `job-results` files) exist.
- Returns a structured output including `sourceReady`, `livePreviewOnly`, `capabilityEscalationRequired`, `bridgeUnconfigured`, `activationBlocked`, and `requiresExplicitDeploymentAuthorization`.
- Added a hermetic test mode (`-TestMode`) that stubs all file, process, and API operations, and runs self-assertions verifying that no mutating verbs are used, no configuration files are written, and no processes are spawned.
- UI route validation is tightened: `ProjectDirectTaskPreviewTabElement` in `src/ui/MemoryTab.jsx` only builds the task link when `companyPrefix` matches `^[A-Za-z0-9_-]{1,80}$` and the issue identifier matches `^[A-Za-z0-9_-]{1,120}$`.

### Milestone 31: Deployment Preflight Strict Read-Only Correction (CMP-62)

Status: Implemented and verified (Strictly Read-Only).

Fit result:
- Separated source validation from the read-only preflight process. Removed all process-spawning mechanisms (e.g. `Start-Process`, `cmd.exe`, `npm`, `npx`) from `scripts\Test-DirectTaskPluginDeploymentReadiness.ps1`.
- Added an explicit `-SourceValidationStatus` parameter taking `passed`, `failed`, or `not_run`. The preflight reports `sourceReady=true` only for `passed`; `failed` results in an unsafe/nonzero status; `not_run` blocks activation without pretending source validation passed.
- Made live runtime check fail-closed: if GET `/api/companies/{companyId}/live-runs` fails or returns an unrecognized shape, it records `liveRunsCheck=unavailable`, blocks activation, and treats the state as unsafe/nonzero unless in explicit hermetic `TestMode`.
- Added structured output fields: `missingSourceCapabilities`, `sourceDirectTaskApiRoutes`, `sourceDirectTaskJobs`, `sourceActionRegistered`, `liveDirectTaskApiRoutePresent`, `liveDirectTaskJobPresent`, `liveDirectTaskActionPresent`, and `liveRunsCheck`.
- Strengthened the `-TestMode` self-check to run hermetic test cases asserting source validation states (`passed`, `failed`, `not_run`) and `live-runs` unavailability, and verified that no mutating verbs, file writes, or process-spawn mechanisms exist in the script.

### Milestone 32: Disabled Direct Task Plugin Deployment

Status: Deployed and verified (Execution remains disabled).

Fit result:
- The existing local plugin package was reloaded by restarting only the verified Paperclip server. No Paperclip core fork or database replacement was used.
- The live manifest now exposes the authenticated Direct Task action, API route, scheduled finalizer, and Project Hub launch UI required by the Paperclip-first model.
- The persisted plugin configuration remains empty, so `enableDirectTaskLaunch` uses its default `false`. No issue creation, secret resolution, bridge process, Agy launch, agent wakeup, or durable-memory promotion can result from this deployment alone.
- The next gate is deliberately operational rather than code-related: bind the bridge to a real game workspace, configure a secret reference, then explicitly enable and smoke-test one direct task.
- See `53-disabled-direct-task-plugin-deployment-log.md` for the exact runtime verification and activation boundary.

### Milestone 33: Deployment Preflight Live Declaration Correction (CMP-63)

Status: Implemented and verified (Read-only).

Fit result:
- Corrected a post-deployment false negative caused by a mismatch between the preflight's expected declaration fields and the current Paperclip manifest's `apiRoutes.routeKey` and `jobs.jobKey` fields.
- The preflight now recognizes modern structured declarations and the compatible legacy forms, while its hermetic tests prove both matching and malformed cases.
- A live read-only run now reports the deployed route, scheduled finalizer, and action capability as present; the bridge remains unconfigured and activation remains blocked.
- See `54-deployment-preflight-live-declaration-correction-log.md` for verification details.

### Milestone 34: Game Project Hub and Hardened Memory Namespace (CMP-67, CMP-68)

Status: Implemented and verified (Execution remains disabled).

Fit result:
- Created a separate `강해린` Project Hub rather than reusing the generic Onboarding Project Hub. This keeps Task Rooms and project-scoped recall isolated by product.
- Provisioned exactly one empty approved-memory journal under the fixed Paperclip managed-project root. The helper accepts only company/project IDs, derives the target path itself, and never promotes a candidate or writes a substantive decision.
- Hardened provisioning before production use: live config is parsed before journal creation, config updates use same-directory atomic replacement, and tests run only in a disposable workplane-local root rather than backing up/restoring live memory data.
- Hardened Sidecar persistence: the background launcher now invokes `node.exe` directly with `--config` through a detached CIM process, with no shell command construction or broad Node termination.
- The Unreal workspace was subsequently bound to the `강해린` Project Hub after a clean initial Git baseline was created. The legacy secret-reference activation path remains blocked by the current Paperclip core gate; the active Named Pipe transport in Milestone 39 avoids that path without a core overlay.
- See `57-project-memory-provisioning-hardening-log.md`, `58-ganghaerin-project-workspace-binding-log.md`, and `59-plugin-secret-resolution-blocker-log.md` for the exact state and remaining gate.

### Milestone 35: Ganghaerin Project Workspace Binding (CMP-69)

Status: Implemented and verified (Execution remains disabled).

Fit result:
- Created the clean initial Unreal Git baseline `ede53ba` on `main` before binding the project workspace.
- Bound `C:/Users/young/Documents/Unreal Projects/강해린` as the primary local workspace for the `강해린` Project Hub, with `main` as both repository and default reference.
- The binding is metadata for Project Hub context only. It does not start Unreal, grant shell access, create a task, wake an agent, or enable the Direct Task Bridge.

### Milestone 36: Plugin Secret-Resolution Compatibility Gate (CMP-70)

Status: Verified core gate; no unsafe activation performed.

Fit result:
- The installed Paperclip runtime explicitly refuses plugin secret-reference resolution until company-scoped plugin configuration lands.
- Keeping the bridge disabled preserves the operating model: no raw bridge secret in plugin configuration, no browser-to-bridge bypass, and no cross-project secret ambiguity.
- The direct external `agy.exe` task-room runners remain the working execution path while this Paperclip capability is unavailable.

### Milestone 37: Ganghaerin Non-Running Agent Rooms (CMP-71 to CMP-77)

Status: Implemented and verified.

Fit result:
- Created Manager, CTO, Designer, Code Worker, Art Worker, Voice Worker, and QA Worker desks inside the `강해린` Project Hub.
- Each desk is an unassigned `backlog` issue with `planning` work mode. No desk is a managed-agent session, no desk has an assignee, and no live run was created.
- The role briefs preserve responsibility boundaries while real work remains goal-scoped in separate Task Rooms with close summaries and candidate-only memory handoff.

### Milestone 38: Direct Task Room Agent-Desk Parenting

Status: Implemented and verified.

Fit result:
- Direct external Code and QA Task Room runners now validate an optional parent as an open, unassigned root Agent Room in the same Company and Project Hub.
- A Task Room inherits the parent desk Goal when the caller does not supply one, preserving the Project Hub -> Agent Room -> Task Room hierarchy.
- The bounded parent role brief is injected into the external worker prompt as operating context while the child Task Room remains the authoritative goal.
- Cross-project, assigned, closed, nested, or non-Agent-Room parents fail before any task creation or external worker execution.

### Milestone 39: Windows Named Pipe Direct Task Broker

Status: Implemented, plugin-wired, deployed, activated, and verified.

Fit result:
- Preserves the locked Paperclip-first model: Paperclip remains the Project Hub, Agent Room, Task Room, comment, and memory authority while an external local broker performs only bounded execution transport.
- Avoids the blocked global plugin-secret path without a core fork. The Pipe Broker keeps its random Bridge token only in the broker and child Bridge process environments; no Paperclip/plugin/broker configuration contains that token.
- The current-user ACL protected Windows Named Pipe plus first-instance creation prevents cross-user access and pipe-name pre-creation. The same-user local trust boundary is documented explicitly rather than overstated.
- The existing tested loopback Direct Task Bridge remains the job/result-contract implementation. It strips broker runtime environment variables before launching external `agy.exe` and requests candidate-only memory handoff.
- The plugin now uses raw newline-delimited `node:net` requests in named-pipe mode, validates its response envelope, and never resolves a plugin secret or calls Direct Task HTTP fetch in that mode.
- Project Hub Direct Task Preview now selects a role-matched eligible Agent Room and passes its ID to both preview and authenticated launch action. The worker creates a child Task Room with the inherited Goal only after validating the parent.
- The source was rebuilt and Paperclip restarted. The live plugin stores only enabled state, pipe transport, and pipe name; one explicit no-secret local broker mapping is active for the bound Unreal workspace.
- Broker health, child Bridge readiness, Paperclip, and Memory Sidecar all verify healthy with zero Paperclip live runs. The first end-to-end Task Room remains an explicit user-requested goal rather than an automatic smoke run.

### Milestone 40: Reboot-Safe Local Runtime Recovery

Status: Implemented and verified.

Fit result:
- `scripts\Start-PaperclipWorkplane.ps1` now verifies or restores the enabled Named Pipe Broker after Paperclip and the Memory Sidecar are healthy.
- The recovery helper uses the same local `config.local.json`, current-user pipe health check, and secured broker startup path. It does not create tasks, submit jobs, or start `agy.exe`.
- A healthy Broker is reused rather than duplicated. An absent or disabled local configuration is treated as an intentionally inactive component, so portable checkouts do not acquire execution capability by accident.
- Regression tests cover live idempotency, disabled/missing configuration behavior, hardened Paperclip launch arguments, and the broker startup contract.
