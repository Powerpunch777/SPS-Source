# SPS Game Work Plane

## Current Source Of Truth

The current target architecture and implementation order are defined in
`75-optimal-work-environment-blueprint-ko.md`. Earlier numbered documents and
the baseline notes below are retained as implementation history. When they
conflict, document 75 wins.

The current P0 implementation and deployment record is
`76-room-workplane-p0-implementation-and-deployment-log-ko.md`.

SPS을 게임 개발용 AI 제작 파이프라인의 control plane으로 쓰기 위한 설계/구현 기록이다.

## Current Baseline

- SPS is the source of truth for company, project, Task Room issues, comments, documents, work products, and agent run state.
- Task Rooms are SPS issues.
- Agent Rooms are long-lived role desks, not separate runtimes.
- `agent_task_sessions` and heartbeat runs are internal execution records.
- CTO and Manager directly use SPS tools/API to create child Task Rooms and assign workers.
- Memory Sidecar and SPS Memory Plugin are recall/candidate support layers only.
- Memory must not create, assign, route, close tasks, or mutate approved `LEARNINGS.md`.

## Current Implementation Status

- File-based `LEARNINGS.md` journals: implemented.
- Memory Sidecar MVP: implemented and running on `127.0.0.1:3188`.
- Restart-safe local runtime: `scripts\Start-SPS.ps1` idempotently verifies or starts SPS, the Memory Sidecar, and the enabled Direct Task Pipe Broker.
- Project-scoped memory provisioning: `memory-sidecar\Provision-ProjectMemory.ps1` creates only a minimal managed project journal and requires an explicit `-Restart` before Sidecar reload.
- `강해린` has a separate SPS Project Hub, an empty approved-memory namespace, a bound Unreal workspace with an initial Git baseline, and an explicitly enabled no-secret Named Pipe Direct Task path.
- SPS Memory Plugin: installed as `local.memory-sidecar`.
- Exposed tools:
  - `local.memory-sidecar:memory-search`
  - `local.memory-sidecar:memory-propose`
- SPS Windows external adapter loader patch: implemented and verified.
- Windows-safe SPS API helpers: implemented under `scripts`.
- ASCII workspace alias: `C:\Users\young\Documents\sps-server`.
- UTF-8 helper live smoke test:
  - `CMP-12`: direct `agy.exe` test, Korean description/comment preserved, no assignee.
  - `CMP-13`: direct helper correction test, Korean title/description/comment preserved, no assignee, no issue live runs.
- Direct `agy.exe` worker runner:
  - `CMP-14`: runner posted output and marked issue done; header formatting bug found.
  - `CMP-15`: corrected header verified, marked done, no assignee, no live runs.
- Direct Agy Task Room workflow helper:
  - `scripts\Invoke-DirectAgyTaskRoom.ps1` creates an unassigned Task Room, runs direct `agy.exe`, posts the result, and checks live-runs.
  - `CMP-16`: end-to-end workflow verified, marked done, no assignee, no live runs.
- Direct Agy memory candidate flow:
  - `-ProposeCandidates` can move the close-summary `Memory Candidates:` section into the Memory Sidecar candidate inbox.
  - This remains candidate-only and does not mutate approved `LEARNINGS.md`.
  - `CMP-19`: end-to-end candidate proposal verified; candidate `cand_7d08a1fe1b9bf060` stored in the Sidecar inbox.
- Candidate inbox review:
  - `memory-sidecar\memory-candidates.ps1 -Limit 5` verified; candidates remain separate from approved journals.
- Explicit candidate review:
  - `memory-sidecar\memory-promote-candidate.ps1` previews by default and requires `-Apply` before appending to `LEARNINGS.md`.
  - `memory-sidecar\memory-record-candidate-review.ps1` records append-only review events.
  - `cand_7d08a1fe1b9bf060` is marked `reviewed`, not promoted.
  - `CMP-20`: SPS completion record created, marked done, no assignee, no live runs.
- Workplane readiness check:
  - `scripts\Test-SPSWorkplaneReadiness.ps1` checks SPS, Memory Sidecar, live runs, and required agent status before real agent smoke tests.
  - `memory-sidecar\Start-MemorySidecarBackground.ps1` starts the Sidecar through a direct Node process with no command interpreter.
- Readiness-gated SPS runtime smoke test:
  - `CMP-21`: CTO parent Task Room, created after readiness returned true.
  - `CMP-22`: CTO-created Code Worker child Task Room.
  - Both closed successfully; final readiness returned true and company live runs returned 0.
  - New hardening finding: unauthenticated local-board helper writes from inside an assigned worker runtime can re-wake the worker after completion.
  - Helper guard added: assigned issue comment/status writes now require `PAPERCLIP_API_KEY` or explicit `-AllowBoardWriteToAssignedIssue`.
  - Code Worker task-bridge key created and injected as `TASK_BRIDGE_API_KEY`.
  - `CMP-23`: task-bridge close path verified; close comment was agent-authored, issue marked done, final live runs returned to 0, no redundant automation wakeups.
  - `scripts\SPSApiUtf8.ps1` now adds `x-sps-run-id` automatically when `PAPERCLIP_RUN_ID` exists.
- Runtime smoke test:
  - Parent Task Room `CMP-8`.
  - CTO resumed after quota recovery.
  - CTO created Code Worker child Task Rooms `CMP-9` and `CMP-10`.
  - Code Worker completed both with close summaries.
  - `CMP-10` is the clean ASCII handoff run; `CMP-9` proved the path but had Korean encoding corruption.
- Standardized assigned worker close helper:
  - `scripts\Close-SPSTaskUtf8.ps1` posts close summary comments and marks the assigned issue `done` via the agent-authenticated task-bridge path.
  - Checks and enforces the presence of `TASK_BRIDGE_API_KEY` (or `PAPERCLIP_API_KEY`) and `PAPERCLIP_RUN_ID` before performing changes to ensure no unauthenticated local-board writes occur.
  - `CMP-24`: standardized close helper implemented and verified with a focused safety guard test suite (`scripts\Test-CloseSPSTaskHelper.ps1`).
- Bounded Direct Agy Recall Brief (CMP-33):
  - Injects a bounded, read-only Recall Brief from the Memory Sidecar into the `agy.exe` prompt before operating rules.
  - Derives recall query from issue title plus description (capped at 500 characters).
  - Retrieves only approved memory scope-by-scope in the order of company + project, then assigned agent (if assignee is present).
  - Handles sidecar offline/unavailable status as a non-blocking graceful fallback.
  - Propagates authoritative `companyId`, `projectId`, `agentId` (only when present), and `issueId` in candidate submission.
  - Verified via automated verification test suite (`scripts/Test-AgyRecallLifecycle.ps1`).
  - Note: This covers the direct local `agy.exe` path only; automatic injection for SPS-managed agents remains a separate future milestone.
- Correct Agent Room Bootstrap Tool (CMP-34, CMP-40 & CMP-42):
  - PowerShell utility `scripts\Bootstrap-AgentRoom.ps1` creates one named Agent Room per selected existing agent in SPS.
  - Fail-Closed Default: A default `-Apply` without `-StartImmediately` fails closed and creates nothing. This prevents accidental agent runs and usage limit exhaustion because the SPS heartbeat/recovery scheduler automatically transitions blocked assigned issues to `in_progress` (as disproved by CMP-39/CMP-41).
  - Runnable Creation Path: Preserved only when `-Apply -StartImmediately -AcknowledgePotentialAgentRun` are all supplied, making cost and run consequences unmistakable.
  - Read-Only Diagnostic Helper: `scripts\Activate-AgentRoom.ps1` has been converted into a read-only diagnostic utility. Any attempts to write or transition issue status via `-Apply` are blocked and fail closed.
  - Verified via test suite `scripts\Test-BootstrapAgentRoom.ps1` (asserts fail-closed defaults and safe idempotency check).
- SPS-Managed Agent Memory Lifecycle Hooks (CMP-35):
  - Proved pre-run prompt injection limitation: asynchronous void return event handlers (`agent.run.started`) serve as notifications only. Direct prompt mutation requires a SPS core fork or upstream SDK extension.
  - Implemented post-run guarded candidate extraction: listens to `agent.run.finished` and `issue.updated` (status `done`), reads issue comments/documents via SDK, extracts memory candidates using regex, and submits them to the loopback Memory Sidecar candidate queue.
  - Guarded boundary: candidate-only, metadata-preserving (tags, companyId, projectId, agentId, issueId, runId), non-blocking, and no task creation/routing modification.
  - Verified via Node.js test harness probe (`sps-memory/scripts/verify-lifecycle-probe.mjs`) integrated into `npm run check`.
- Hardened Managed Post-Run Memory Handoff (CMP-36):
  - Removed `issue.updated` listener to rely only on the official `agent.run.finished` callback.
  - Locked extraction behind opt-in config schema properties (`enableManagedCandidateExtraction` and `managedCandidateCompanyId`). Disabled by default.
  - Filtered comment inspection to match comments authored by the exact run (`createdByRunId === runId`) and scan only explicit `Memory Candidates:` sections (no document scanning).
  - Enforced a 4000-character candidate content limit and a maximum of 5 proposed candidates per run.
  - Added deterministic idempotency keys and durable sidecar deduplication.
  - Reduced capabilities in plugin manifest: removed `issue.documents.read`.
  - Verified via expanded automated test suites in both plugin (`verify-lifecycle-probe.mjs`) and sidecar (`verify-filters.mjs`).
  - Deployment status: Not installed/reinstalled in SPS; production behavior remains unchanged pending Codex review.
- Project Hub Memory Candidate Queue (CMP-37):
  - Implemented native `project-memory-candidates` detailTab slot for `project` entityType.
  - Implemented `ProjectMemoryCandidatesTabElement` custom Web Component mapped to same-origin Node-based worker data handler `/api/plugins/<pluginId>/data/project-memory-candidates-view`.
  - Enforced fail-closed behavior on missing `companyId`/`projectId`.
  - Added strict project isolation filtering to exclude legacy/mismatched candidates.
  - Verified via Node.js verification tests (cases 4, 5, 6) in the plugin harness.
  - Deployment status: Not installed/reinstalled in SPS; production behavior remains unchanged pending Codex review.
- Unreal Code Worker Direct Agy Workflow (CMP-43):
  - PowerShell utility `scripts\Invoke-DirectAgyUnrealTaskRoom.ps1` implements the first game-production adapter for the local Unreal workspace.
  - Creates an unassigned Task Room issue in SPS to prevent managed-agent wakeups, runs `agy.exe` with the Unreal project as its working directory, posts the close summary, and verifies that the live run count is zero.
  - Injects custom Unreal Code Worker role identification and project context into the direct agy prompt.
  - Supports a guarded dry-run mode (`-DryRun`) that bypasses issue creation and model execution while writing the prompt file artifact.
- Hardened Unreal Workspace Boundary (CMP-44):
  - Resolves path traversal risks by strictly enforcing that any explicit project file (.uproject) must reside within the resolved workspace directory.
  - Normalizes path separators and checks prefix containment with trailing separators to prevent sibling prefix-collision bypasses.
  - Verified via automated verification test suite (`scripts\Test-DirectAgyUnrealWorkflow.ps1`).
- Direct Agy Unreal QA Workflow & Baseline Run (CMP-45 & CMP-46):
  - PowerShell utility `scripts\Invoke-DirectAgyUnrealQATaskRoom.ps1` implements the QA Worker workflow, reusing the shared workspace validator (`scripts/Resolve-UnrealWorkspace.ps1`).
  - Restricts prompt with a strict default read-only boundary (inspect/report only) and requests structured findings in the Close Summary 'Result' section.
  - Baseline run (CMP-46) executed against the local Unreal workspace, creating an unassigned Task Room issue with zero live runs, generating a QA report and proposing candidate `cand_3ba965de01eed2cc`. The candidate is not approved memory, and no git commit was created or staged.
- Design safe Project Hub direct-request launcher (CMP-48 & CMP-49):
  - Produced an evidence-based implementation design for a user-facing launcher to start the Unreal Code/QA direct agy Task Room workflows.
  - Decision: Keep Memory Sidecar strictly memory-only. Introduce a separate local Direct Task Bridge loopback daemon to manage execution and process spawning.
  - Controls: Local loopback binding, explicit token authentication, registered project-to-workspace mapping, normalized path containment validation, argument-array process spawning, role-based allowlists, and audit logging.
  - Phased plan: Non-executing preview UI first, followed by explicit submit execution.
  - Authority Correction (CMP-49): Rejected active user's raw API key forwarding and sidecar-config storage. Defined a clean authority split where the board-authenticated plugin worker creates unassigned Task Rooms and handles final comments/updates, while the Direct Task Bridge receives only validated, non-credentialed payloads and executes local agy runs.
- Project Hub Direct Task Preview (CMP-50 & CMP-51):
  - Integrated preview-only UI in Project Hub for developers to inspect task parameters and role boundaries.
  - Updated role boundary strings to match direct worker prompts, avoiding unverified sandbox claims and enforcing strict defaults.
- Direct Task Bridge Core (CMP-52):
  - Standalone Node.js loopback service (`direct-task-bridge.mjs`) listening strictly on `127.0.0.1`.
  - Disabled by default (`enabled: false`). Enforces local token authentication, project mapping checks, and relative project file checks.
  - Enforces single active job concurrency and stable idempotency keys.
  - Spawns PowerShell with `shell: false` using a fixed argument array, timeouts after a bounded duration, writes events to `audit.log`, and redacts absolute paths from HTTP status responses.
  - Persists job execution state to `jobs.json` and fails closed on service restart.
  - Verified via standalone Node.js test suite (`direct-task-bridge/test.mjs`).
- Direct Task Plugin Integration (CMP-55 to CMP-58):
  - Local plugin worker integration that submits direct requests and polls for completion, keeping SPS as the source of truth.
  - Implements strict validation of the bridge URL (loopback http only), secure string-based secret resolution, token redaction across all outputs, company isolation verification, and namespaced active job state tracking.
  - Implements retry-safe finalization with outcome-encoded markers to allow zero-side-effect retry convergence, ensuring unassigned tasks are finalized safely to done or blocked without assigning or waking agents.
  - Verified via a mock-based test suite (`scripts/verify-direct-tasks.mjs`) integrated into `npm run check`.
- Project Hub Direct Task Action UI (CMP-59):
  - Extended the Project Hub > Direct Task Preview tab to display a "Launch Task Room" button inline after a valid preview, generating/reusing an idempotency key for that draft.
  - Form edits automatically invalidate and hide the launch controls, requiring a new preview.
  - Implemented the dynamic worker action handler (`direct-task-submit`) that enforces board-user context verification, forces companyId scope from the host context for anti-spoofing, and returns structured JSON responses only.
  - Extended the verification suite with 6 additional hermetic test cases proving action context refusal, disabled launch behavior, host company scope enforcement, duplicate submission caching, secret leak prevention, and static source/UI code constraints.
- Direct Task Identity and Task-Link Correction (CMP-60):
  - Tightened action validation inside `direct-task-submit` action registration (`dist/worker.js`) to strictly require action context `actor.type === "user"`, a non-empty `actor.userId`, and a non-empty `actionCtx.companyId`.
  - Returned `taskHref: null` (omitting the manufactured UUID-based route) from worker action return value.
  - Updated `ProjectDirectTaskPreviewTabElement` in `src/ui/MemoryTab.jsx` to construct same-origin route using the host's immutable `pluginContext.companyPrefix` and the action response `identifier` only when present and valid.
  - Added test cases asserting context refusal on missing/invalid user-id, verifying `taskHref: null` on successful actions, and checking MemoryTab.jsx contract rules.





## Native Memory UI

- Task Room Memory and Project Hub Memory tabs are mounted through the local plugin worker bridge; they remain read-only and never promote or edit memory.
- Task Room Memory reads the current issue through the official `issues.read` SDK capability. An assigned task shows only that assignee's role memory; an unassigned task omits the section.
- `CMP-31`: Agent dashboard tab experiment is blocked because the local SPS Agent dashboard does not render plugin detail tabs. No SPS core fork was made.
- `CMP-32`: assigned-agent memory in Task Rooms is implemented and browser-verified on assigned `CMP-22` and unassigned `CMP-27`.
- Current SPS capability-escalation upgrade path is incomplete. For a reviewed new capability, soft-uninstall and reinstall from the ASCII workspace alias preserves the plugin ID/config while explicitly installing the new manifest.

## Verified Flow

The core architecture is now verified:

1. SPS issue is the Task Room.
2. CTO agent can recall memory and comment on the room model.
3. CTO can directly create a child Task Room for Code Worker.
4. Code Worker can complete the child Task Room with a close summary.
5. Memory stays as recall/candidate support and does not control routing or mutate approved journals.

## Remaining Runtime Risks

- Windows/PowerShell UTF-8 helper scripts are implemented and live-smoke-tested with unassigned issues.
- Assigned worker close writes now have a task-bridge key path verified by `CMP-23`; repeat it on the next real worker implementation task before treating it as fully standard.
- The first Named Pipe Direct Task is deliberately waiting for an explicit user goal. Do not create a synthetic task merely to test the live path.
- The local broker is recovered by `Start-SPS.ps1` when its enabled local configuration exists. OS-login auto-start is intentionally not installed; run the bootstrap command after a reboot.

## Key Docs

- `00-final-architecture.md`: full architecture.
- `01-next-implementation-plan.md`: implementation plan.
- `02-final-operating-model-ko.md`: Korean operating model.
- `04-structure-fit-checklist.md`: fit checklist and milestone status.
- `07-sps-memory-log.md`: plugin implementation/verification log.
- `09-sps-runtime-smoke-test-log.md`: initial SPS runtime smoke test result.
- `10-sps-smoke-test-completion-log.md`: milestone 4 smoke test completion log.
- `11-sps-utf8-api-helper-log.md`: UTF-8-safe SPS API helper implementation log.
- `12-sps-utf8-helper-smoke-test-log.md`: direct helper smoke test result.
- `13-sps-live-run-cleanup-check-log.md`: completed-issue live-run cleanup check.
- `14-direct-agy-worker-runner-log.md`: direct local `agy.exe` worker runner.
- `15-direct-agy-task-room-workflow-log.md`: unassigned Task Room + direct `agy.exe` workflow helper.
- `16-direct-agy-memory-candidate-flow-log.md`: opt-in candidate proposal from direct worker close summaries.
- `17-memory-candidate-review-helper-log.md`: read-only Memory Sidecar candidate inbox helper.
- `18-memory-candidate-explicit-review-log.md`: explicit preview/apply candidate review and promotion helpers.
- `19-sps-workplane-readiness-log.md`: read-only preflight before real SPS agent smoke tests.
- `20-readiness-gated-runtime-smoke-log.md`: readiness-gated CTO -> Code Worker smoke test and helper guard result.
- `21-task-bridge-close-smoke-log.md`: task-bridge authenticated Code Worker close path smoke test.
- `22-task-close-helper-standardization-log.md`: standardized task-bridge close helper implementation and verification log.
- `23-sps-ui-feasibility-log.md`: native Memory UI extension feasibility.
- `24-sps-ui-memory-tab-mvp-log.md`: original Task Room Memory tab MVP.
- `25-sps-ui-project-memory-tab-log.md`: Project Hub Memory tab.
- `26-sps-ui-agent-memory-tab-log.md`: blocked Agent dashboard tab exploration.
- `27-task-room-assigned-agent-memory-log.md`: assigned-agent memory replacement design and validation.
- `28-bounded-direct-agy-recall-brief-log.md`: Bounded Direct Agy Recall Brief Lifecycle implementation and testing log.
- `30-safe-agent-room-bootstrap-log.md`: safe Agent Room bootstrap planning tool implementation log.
- `31-managed-agent-lifecycle-probe-log.md`: managed agent memory lifecycle hooks investigation, limitation proof, and post-run candidate extraction log.
- `32-hardened-memory-candidate-handoff-log.md`: hardened managed post-run memory candidate handoff implementation, configuration, and verification log.
- `33-project-hub-memory-candidate-queue-log.md`: project hub memory candidate review queue implementation and verification log.
- `34-non-waking-agent-room-bootstrap-log.md`: non-waking Agent Room bootstrap default and activation helper log.
- `35-correct-agent-room-bootstrap-log.md`: correct Agent Room bootstrap log documenting the CMP-42 scheduler findings and correction.
- `36-direct-agy-unreal-workflow-log.md`: direct agy Unreal Code Worker workflow helper log.
- `37-hardened-unreal-workspace-boundary-log.md`: hardened Unreal workspace boundary log.
- `38-direct-agy-unreal-qa-workflow-log.md`: direct agy Unreal QA workflow log.
- `39-operating-model-audit-refresh-log.md`: operating model audit refresh log.
- `40-project-hub-direct-request-launcher-log.md`: design and feasibility log for safe Project Hub direct-request launcher.
- `41-direct-task-bridge-authority-correction-log.md`: design correction log documenting the corrected authority split for Direct Task Bridge under CMP-49.
- `42-project-hub-direct-task-preview-log.md`: design and feasibility log for Direct Task Preview.
- `43-direct-task-preview-role-boundary-correction-log.md`: role boundary correction log for Direct Task Preview under CMP-51.
- `44-direct-task-bridge-core-log.md`: Direct Task Bridge core daemon implementation log under CMP-52.
- `45-direct-task-bridge-hardening-log.md`: Direct Task Bridge hardening corrections under CMP-53.
- `46-direct-task-bridge-result-contract-log.md`: structured runner-result contract required before any Bridge-to-SPS finalization.
- `47-direct-task-plugin-integration-log.md`: board-authenticated submit route and scheduled finalizer integration log under CMP-55.
- `48-direct-task-plugin-hardening-log.md`: direct task plugin hardening corrections and retry-safety validation log under CMP-56.
- `49-project-hub-direct-task-action-ui-log.md`: Project Hub Direct Task Action UI under CMP-59.
- `50-direct-task-identity-and-link-correction-log.md`: identity tightening and link correction under CMP-60.
- `51-direct-task-plugin-deployment-preflight-log.md`: read-only deployment readiness preflight check log under CMP-61.
- `52-deployment-preflight-strict-read-only-correction-log.md`: deployment preflight strict read-only correction under CMP-62.
- `53-disabled-direct-task-plugin-deployment-log.md`: deployment check and disabled state logging under CMP-63.
- `54-deployment-preflight-live-declaration-correction-log.md`: deployment preflight live declaration correction under CMP-63.
- `55-sps-workplane-runtime-bootstrap-log.md`: idempotent local bootstrap/readiness helper implementation log under CMP-64.
- `56-project-hub-memory-namespace-provisioning-log.md`: project memory namespace provisioning helper and verification log under CMP-67.
- `57-project-memory-provisioning-hardening-log.md`: hermetic provisioning tests, atomic config handling, and shell-free Sidecar launch correction under CMP-68.
- `58-ganghaerin-project-workspace-binding-log.md`: initial Unreal Git baseline and `강해린` Project Hub workspace binding under CMP-69.
- `59-plugin-secret-resolution-blocker-log.md`: SPS core secret-resolution gate identified under CMP-70; the legacy secret-reference path remains unavailable while the active Named Pipe path avoids it.
- `60-sps-secret-ref-upstream-status.md`: verified upstream PAP-2394 status, no-overlay decision, and update-monitoring procedure.
- `61-ganghaerin-agent-room-bootstrap-log.md`: non-running Manager, CTO, Designer, Code, Art, Voice, and QA role desks for the game Project Hub.
- `62-direct-task-agent-room-parenting-log.md`: same-project Agent Room parent validation and goal inheritance for direct Task Room runners.
- `63-windows-named-pipe-broker-log.md`: disabled Windows Named Pipe execution transport with an in-memory child Bridge token and no SPS core overlay.
- `64-disabled-named-pipe-plugin-ui-log.md`: deployed disabled pipe client and Project Hub role-matched Agent Room selector.
- `65-named-pipe-direct-task-activation-log.md`: active no-secret broker mapping and zero-run readiness verification.
- `66-direct-task-broker-recovery-log.md`: reboot-safe Direct Task Pipe Broker recovery and regression checks.

## Next Step

CTO/Manager can now:

1. Use direct `agy.exe` workflow for narrow repetitive unassigned Task Rooms.
2. Use `scripts\Invoke-DirectAgyUnrealTaskRoom.ps1` for unassigned Unreal Code Worker tasks, executing directly inside the local Unreal project directory.
3. Use `scripts\Invoke-DirectAgyUnrealQATaskRoom.ps1` for unassigned Unreal QA Worker tasks, executing directly inside the local Unreal project directory.
4. Use `-ProposeCandidates` only when the close summary contains memory candidates worth reviewing.
5. Review candidates with `memory-sidecar\memory-candidates.ps1`.
6. Promote candidates only after explicit user/CTO approval with `memory-sidecar\memory-promote-candidate.ps1 -Apply`.
7. Run `scripts\Test-SPSWorkplaneReadiness.ps1 -AsMarkdown`.
8. Run `scripts\Test-DirectTaskPluginDeploymentReadiness.ps1 -AsMarkdown` to verify deployment readiness and capability escalations.
9. Use the standardized close helper `scripts\Close-SPSTaskUtf8.ps1` for assigned worker closure, and watch the next real worker task for repeated clean live-run cleanup.
10. Run `scripts\Start-SPS.ps1` to idempotently bootstrap or verify SPS, the Memory Sidecar, and the enabled Direct Task Pipe Broker after a reboot or connection loss.
11. After every SPS update, run `scripts\Test-SPSPluginSecretRefCapability.ps1 -AsMarkdown`. A changed result requires CTO review and never enables Direct Task automatically.
12. Use the `강해린` Agent Rooms as durable role desks. Open actual goal-scoped Task Rooms separately; do not assign managed agents to the desks merely to make them reply.
13. For direct Code or QA work, pass the relevant Agent Room as `-ParentId`. The runner now rejects cross-project, assigned, closed, or non-Agent-Room parents before creating a Task Room.
14. Direct Task is ready through the local named-pipe broker. In Project Hub > Direct Task Preview, choose the worker role, matching Agent Room, title, and objective; a Task Room is created only when you explicitly launch it.

**Operational Gate**: Direct Task is active only through the local Named Pipe Broker. The SPS plugin configuration contains no bridge URL, token, or secret. Use Project Hub > Direct Task Preview only for an explicit user goal, select the role-matched Agent Room, then launch one child Task Room. The older secret-reference path remains unavailable and is not used.
