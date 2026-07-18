# Operating Model Fit Audit

## Authority

`02-final-operating-model-ko.md` is the operating-model contract for this workplane. This audit compares the current implementation to that contract and defines the permitted next steps.

## Confirmed Fit

| Contract in 02 | Current implementation | Result |
| --- | --- | --- |
| SPS is the AI game studio office and source of work truth. | Projects, issues, comments, agent assignment, documents, work products, and run state remain in SPS. The sidecar has no routing or issue-write authority. | Aligned |
| A Task Room is one goal and `agent_task_sessions` are internal execution records. | The verified CTO-to-Code-Worker flow uses SPS issues/comments as the visible room. Direct `agy.exe` work also receives and closes one unassigned issue at a time. | Aligned |
| CTO and Manager directly create and assign work. | A real CTO-created Code Worker child task and task-bridge close path have been verified. No central controller was added. | Aligned |
| Long-term memory is candidate first, then explicitly approved. | Sidecar candidates are stored separately. Promotion previews by default and writes approved journals only with explicit `-Apply`. | Aligned |
| Memory is recall support, not a replacement for SPS. | The plugin exposes only `memory-search` and `memory-propose`; native Project and Task Memory views are read-only. | Aligned |
| Workers use relevant memory before work. | `CMP-33` adds a bounded company/project/assigned-agent Recall Brief to the direct `agy.exe` worker prompt. A sidecar failure is non-blocking. | Partially aligned |
| Agent Room is a long-lived role desk. | The local Agent dashboard cannot mount plugin detail tabs. The supported mapping is an assigned, long-lived SPS issue whose Task Room Memory tab shows the assignee's role memory. | Structurally aligned |
| Direct Unreal workflows are available. | Direct Code (CMP-43) and QA (CMP-45) workflows discover the local Unreal project, validate boundaries, and run via direct `agy.exe` Task Rooms with zero SPS-managed runs. | Aligned |
| Direct Task Integration & UI (CMP-55 to CMP-59) | Board-authenticated submit route, finalizer job, outcome-encoded markers, strict validations/redactions, and the newly added `direct-task-submit` action registration/UI launch path enforced in source. | Aligned (Source-only) |
| Direct Task Identity & Links (CMP-60) | Enforced strict user identity verification, returned null taskHref, and dynamically built same-origin URL on the client using host companyPrefix and issue identifier. | Aligned (Source-only) |
| Direct Task Deployment Preflight (CMP-61/CMP-62) | Read-only preflight readiness checker script implemented and corrected to be strictly process-spawn free. Compares live plugin manifest, verifies absence of Bridge artifacts/process, and fails closed if live runs check is unavailable. Route regex validation tightened on client. | Aligned (Source-only) |

## Important Boundaries

- An Agent Room is not an `agent_task_session` and is not a replacement chat runtime. It is a long-lived, assigned SPS issue inside a project.
- The blocked Agent dashboard tab is not a reason to fork SPS. The assigned-issue mapping is closer to the model in `02` because direct requests, comments, documents, and memory are co-located in one visible room.
- Current `agent` journals are company-plus-agent role playbooks. They must not hold project-specific facts that could leak into another game. Project-specific role decisions stay in `project` memory until a future `project:{projectId}:agent:{agentId}` journal exists.
- The new Recall Brief covers direct local `agy.exe` tasks only. SPS-managed agents can call the plugin tools explicitly, but they do not yet receive lifecycle-level automatic injection.
- **Unreal Boundary Hardening (CMP-44)**: Strict workspace containment is enforced. Any explicit `.uproject` file must reside within the resolved workspace directory. Sibling prefix collisions are prevented by directory separator normalization.
- **CTO Quota Blocker**: The SPS-managed CTO is currently quota-blocked. Managed Agent Rooms are not ready or runnable without encountering this blocker, which remains unresolved. Do not imply managed runs are active.
- **Managed Candidate Extraction**: Automatic post-run extraction is disabled by default via config (`enableManagedCandidateExtraction = false`). It is not active in production.
- **Git Baseline Status**: Although the first QA baseline report (CMP-46) recommended establishing an initial Git baseline commit immediately, no commit has been created or staged.
- **Direct Task Integration (CMP-55 to CMP-60)**: Local plugin source code contains hardened submit route, retry-safe finalizer job definitions, strict job-id contract validation, user context identity checks (requiring user type, userId, and companyId), and same-origin task URL routing logic in the preview tab, but is **not installed or reinstalled, feature is disabled by default, and no secret, config, or bridge process exists in the live environment**. The runtime remains Preview-only and disabled.
- **Direct Task Preflight & Deployment Status (CMP-61/CMP-62)**: Preflight script runs safely without side effects and without spawning any sub-processes. It validates source readiness externally via the `-SourceValidationStatus` parameter, and fails closed with an unsafe status if live-runs checks are unavailable or shape is unrecognized. Activation remains blocked; no deployment occurred.




## Remaining Gaps

1. **Runnable long-lived Agent Rooms while quota/scheduler behavior remains.** The SPS heartbeat/recovery scheduler still transitions blocked assigned issues to `in_progress`. Creating assigned Agent Rooms willy-nilly is blocked by the managed CTO quota block. Runnable Agent Room bootstrap requires explicit cost authorization (`-AcknowledgePotentialAgentRun`).
2. **Explicit candidate review actions in UI.** The Project Hub candidate queue is read-only. Promoting, rejecting, or reviewing candidates still requires running local CLI scripts (`memory-promote-candidate.ps1`, etc.).
3. **Other game-tool adapters.** The pipeline contains direct local Unreal Code (CMP-43) and QA (CMP-45/46) workflows. Adapters for Unity, Blender, GitHub, VSCode, and voice remain to be designed and implemented.
4. **User-facing direct-request surface.** Direct tasks must be triggered via PowerShell CLI wrappers (`Invoke-DirectAgyUnrealTaskRoom.ps1`, etc.). No user-facing UI interface exists to request direct runs from the web browser.

## Next Approved Sequence

1. Track or patch an upstream scheduler behavior that respects an assigned issue's initial `blocked` status; until then, create a runnable Agent Room only with explicit cost authorization and quota recovery.
2. Add a reviewed explicit promotion/rejection entry point to the Project Hub queue without bypassing the candidate-approval contract.
3. Add project-agent journals only when a project needs role-specific long-term facts that do not fit project memory.
4. Connect remaining game-production tools role by role (Unity, Blender, etc.) while building upon the verified Unreal direct workflows.

## Runtime Evidence & Correction (CMP-42)

Live evidence from SPS pilot runs (CMP-39 and CMP-41) demonstrated that assigning a SPS issue to an agent—even with `status: blocked`—triggers an execution run via the current SPS heartbeat/recovery scheduler path. 

Consequently:
- The structural mapping in `02-final-operating-model-ko.md` remains the authoritative contract, but the current SPS runtime does not yet support a cost-free/non-waking instantiation mechanism for assigned issues.
- `Bootstrap-AgentRoom.ps1` has been updated to fail closed by default. Invoking `-Apply` without `-StartImmediately` will fail closed to prevent accidental agent wakeups and credit exhaustion.
- `Activate-AgentRoom.ps1` has been reassessed and converted into a read-only diagnostic utility that refuses write activation (`-Apply`) completely.
- Runnable Agent Rooms can only be instantiated by explicitly supplying `-Apply -StartImmediately -AcknowledgePotentialAgentRun`.

## Decision

The current direction remains consistent with `02-final-operating-model-ko.md`. Continue from SPS, not Swarm; keep the memory sidecar as a scoped recall/candidate service; and implement Agent Rooms as long-lived assigned SPS issues rather than an unsupported Agent dashboard extension.
