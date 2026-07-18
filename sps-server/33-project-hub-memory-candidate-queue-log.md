# Project Hub Memory Candidate Queue Log (CMP-37)

## 1. Objective
Implement the next safe UI layer from the operating model: a native SPS **Project Hub Memory Candidates Queue** detail tab for the existing Memory Sidecar. This tab makes pending memory candidates scannable in the Project Hub for manual user/CTO review without giving any plugin or agent automated promotion or write authority.

## 2. Implementation Details

### A. Manifest Expansion
- Added a new `detailTab` slot definition in [manifest.js](file:///C:/Users/young/Documents/AGENT%20%EA%B5%AC%EC%B6%95/sps-server/sps-memory/dist/manifest.js):
  - **Slot ID**: `project-memory-candidates`
  - **Entity Type**: `project`
  - **Display Name**: `Memory Candidates`
  - **Export Name**: `ProjectMemoryCandidatesTab`
  - **Order**: `110` (placed directly after the main Memory tab)

### B. Worker Data Handler Hardening
- Registered `project-memory-candidates-view` data provider in [worker.js](file:///C:/Users/young/Documents/AGENT%20%EA%B5%AC%EC%B6%95/sps-server/sps-memory/dist/worker.js).
- **Authoritative Keys**: Explicitly extracts `companyId` and `projectId` from host context params.
- **Fail Closed**: Throws an explicit error if `companyId` or `projectId` are missing or empty, blocking any data leak.
- **Project Isolation**: Fetches candidates from the Memory Sidecar via `/memory/candidates` using the authoritative filters, and applies a strict client-side filter (`cand.companyId === companyId && cand.projectId === projectId`) to ensure legacy candidates lacking metadata or mismatched entries remain completely hidden from the queue.

### C. Web Component UI
- Added `ProjectMemoryCandidatesTabElement` defining the custom element `paperclip-project-memory-candidates-tab` in [MemoryTab.jsx](file:///C:/Users/young/Documents/AGENT%20%EA%B5%AC%EC%B6%95/sps-server/sps-memory/src/ui/MemoryTab.jsx).
- **Read-Only**: Strictly displays candidates with zero write/promotion actions (no approve, reject, promote, or edit buttons).
- **Metadata Rendering**: Renders the candidate's content, status, scope, type, created date, source/provenance, issue identifier (if present), and any idempotency or review metadata (like `idempotencyKey` or explicit review action logs) only if they exist on the candidate.
- **State Handling**: Implements clean loading (spinner), empty (clean placeholder banner), and failure (red warning block) states.
- **Same-Origin Calls**: Fetches data from the plugin worker bridge at `/api/plugins/<pluginId>/data/project-memory-candidates-view` to satisfy local network and browser CORS policies.

## 3. Automated Verification

- Added focused test cases to the existing test runner in [verify-plugin.mjs](file:///C:/Users/young/Documents/AGENT%20%EA%B5%AC%EC%B6%95/sps-server/sps-memory/scripts/verify-plugin.mjs):
  - **Case 4**: Checks that legacy candidates missing IDs or mismatched company/project pairs are correctly excluded (Project Isolation).
  - **Case 5**: Verifies fail-closed behavior when `companyId` is missing.
  - **Case 6**: Verifies fail-closed behavior when `projectId` is missing.
- Verification checks run and pass successfully via `npm run check`:
  ```text
  --- Testing Project Hub Candidates Queue (Success) ---
  Candidates count: 1
  Candidate content: Matching candidate

  --- Testing Project Hub Candidates Queue (Fail Closed - Missing companyId) ---

  --- Testing Project Hub Candidates Queue (Fail Closed - Missing projectId) ---

  SUCCESS: All automated validation checks passed!
  ```

## 4. Manual Browser Verification Steps

To manually inspect the candidates queue UI in the browser, follow these steps:
1. Start the SPS local host (listening on `127.0.0.1:3100`) and the Memory Sidecar (listening on `127.0.0.1:3188`).
2. Soft-uninstall and reinstall the plugin to register the new slots:
   - Navigate to **Plugins** in the SPS UI.
   - Deactivate the `local.memory-sidecar` plugin.
   - Click **Install Local Plugin** and point it to the ASCII workspace alias `C:\Users\young\Documents\sps-server\sps-memory`.
3. Open the **Project Hub** for a specific project.
4. Locate the new tab labeled **Memory Candidates** (next to the existing **Memory** tab).
5. Verify the following:
   - A list of proposed candidates is rendered densely and readably.
   - The cards show metadata (created date, scope, type, provenance source, and idempotency key/review events if present).
   - Verify that there are no interactive write buttons (strictly read-only).
   - If no candidates exist for the current project, verify that the clean empty placeholder banner is rendered.
   - If the sidecar is stopped, verify that the failure warning box is correctly rendered.
