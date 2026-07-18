# Implementation Log: Task Room Assigned Agent Memory

- **Task Room Identifier**: `CMP-32`
- **Issue ID**: `7f0704b6-5f48-4b56-a34a-2e4f40a02b6f`
- **Title**: Show assigned agent memory in Task Rooms
- **Status**: Completed

---

## 1. Replacement Design (Instead of Blocked CMP-31)

CMP-31 was blocked because the local SPS host dashboard does not render plugin detail tabs on the Agent entity type, even though it is fully supported by the manifest and SDK.
Because a long-lived Agent Room is represented as an assigned SPS issue (Task Room), we pivoted the design:
- Rather than maintaining an unreachable tab on the Agent Dashboard, we display the currently assigned agent's memory directly inside the **Task Room Memory** tab.
- This ensures role-specific agent memory is visible where the work happens.

---

## 2. Technical Implementation & Changes

1. **Manifest Refactoring**:
   - Removed the `agent-memory` slot from `dist/manifest.js`.
   - Added `"issues.read"` capability to the manifest to allow the worker to read issue assignee data.

2. **Worker Data Provider Refactoring**:
   - Removed the `agent-memory-view` data provider and its handler `handleAgentMemoryView` from `dist/worker.js`.
   - Updated `handleMemoryView` to fetch the issue details using `ctx.issues.get(issueId, companyId)`.
   - Retrieved the correct `projectId` from the fetched issue to prevent querying project memory from an unrelated project.
   - Checked if the issue has a truthy `assigneeAgentId`. If it does, fetched approved agent memory using exactly `/memory/items?scope=agent&companyId=<companyId>&agentId=<assigneeAgentId>`.
   - Returned `hasAssignee` and `agentMemories` back to the UI.

3. **UI Web Component Refactoring**:
   - Removed `AgentMemoryTabElement` and its exports from `src/ui/MemoryTab.jsx`.
   - Updated `MemoryTabElement` to show an `Assigned Agent Memory` section ONLY when the task has an agent assignee (`hasAssignee` is true).
   - Ensured that for an unassigned task, no empty Assigned Agent Memory section is shown.
   - Retained the existing Project Memory, Company Memory, and task-specific candidates sections with fully escaped HTML and status/date/type badges.

---

## 3. Security & Scope Boundaries

- **Minimal Capabilities**: Only `"issues.read"`, `"ui.detailTab.register"`, `"agent.tools.register"`, and `"http.outbound"` are requested.
- **Read-Only Enforces**: The plugin performs zero database or API writes.
- **Namespace Isolation**:
  - Agent memory is queried only using `agentId = issue.assigneeAgentId` under the `agent` scope.
  - Project memory is fetched using `projectId = issue.projectId`, ensuring we do not fetch project memory of unrelated projects.
  - If a task is unassigned, no agent memory queries are made to the sidecar.

---

## 4. Verification & Validation Commands

### UI Build and Static Analysis Check
Run the static syntax checks, validate the manifest schema, and bundle the custom web component:
```bash
cd sps-memory
npm run check
```
*Expected output*: `Manifest OK` and successful bundling of `dist/ui/index.js` (~14.1kb).

### Automated SDK Harness Verification
We added a new automated verification test script `sps-memory/scripts/verify-plugin.mjs` that simulates the SPS worker bridge using the official SDK test harness:
```bash
node sps-memory/scripts/verify-plugin.mjs
```
*Expected output*:
- **CMP-22 (Assigned to Code Worker)**: returns `hasAssignee: true` and 1 agent memory.
- **CMP-27 (Unassigned)**: returns `hasAssignee: false` and 0 agent memories (with no agent memory query executed).

### Memory Sidecar Namespace Filter Checks
Ensure the Memory Sidecar properly filters requests based on scope parameters:
```bash
node memory-sidecar/verify-filters.mjs
```
*Expected output*: `SUCCESS: All memory namespace filtering verification tests passed!`
