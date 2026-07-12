# Implementation Log: Paperclip UI Project Hub Memory Tab

- **Task Room Identifier**: `CMP-29`
- **Issue ID**: `ae494019-604f-4a9e-b5d7-d450705adc5d`
- **Title**: Add Project Hub Memory tab
- **Status**: Completed

---

## 1. Architectural Strategy & Safety Boundaries

The goal is to extend the read-only Memory UI with a distinct Project Hub Memory tab for the `project` entity type, while preserving the existing Task Room Memory tab unchanged.

To maintain the architectural boundaries:
1. **Control Plane Integrity**: Paperclip remains the system of record. The Memory UI is strictly read-only with no actions that modify learning journals, promote candidates, close tasks, or wake agents.
2. **CORS/Network Safety**: Browser-to-sidecar direct calls are blocked by browser CORS restrictions. Communication is routed cleanly through the Node-based Paperclip plugin worker bridge. Browser code calls only the same-origin official Paperclip plugin data API (`/api/plugins/<pluginId>/data/project-memory-view`).
3. **Strict Namespace Isolation**: The worker queries the sidecar with strict filters:
   - Approved company memory is filtered by `companyId` and `company` scope.
   - Approved project memory is filtered by `companyId`/`projectId` and `project` scope.
   - Memory candidates are filtered by the current `companyId` and `projectId`.
4. **Clean Mounting**: The manifest declares the slot configuration specifically for the `project` entity type and requests the `"ui.detailTab.register"` capability.
5. **Robust Parameter Checking**: Ensure that a missing `projectId` returns an explicit error, avoiding any risk of returning unscoped results.

---

## 2. Manifest & Capability Changes

The `dist/manifest.js` file was updated to register the new UI slot:

- **Slots Added**:
  ```javascript
  ui: {
    slots: [
      {
        type: "detailTab",
        id: "memory",
        entityTypes: ["issue"],
        displayName: "Memory",
        exportName: "MemoryTab",
        order: 100
      },
      {
        type: "detailTab",
        id: "project-memory",
        entityTypes: ["project"],
        displayName: "Memory",
        exportName: "ProjectMemoryTab",
        order: 100
      }
    ]
  }
  ```

---

## 3. Worker Data Handler

We registered a new data handler `project-memory-view` in `dist/worker.js`:
- Performs three queries to the loopback Memory Sidecar:
  1. `GET /memory/items?scope=company&companyId=<companyId>`
  2. `GET /memory/items?scope=project&companyId=<companyId>&projectId=<projectId>`
  3. `GET /memory/candidates?companyId=<companyId>&projectId=<projectId>`
- Enforces presence of both `companyId` and `projectId` (throwing an explicit `Error` if missing).
- Wraps error logging with `safeDataHandler` to log warnings while bubbling up connection or request failures to the host UI.

---

## 4. UI Web Component

We implemented `ProjectMemoryTabElement` as a dependency-free custom web component in `src/ui/MemoryTab.jsx`:
- Registered under custom element tag name `paperclip-project-memory-tab`.
- Exports `ProjectMemoryTab` as its tag name string (`export const ProjectMemoryTab = "paperclip-project-memory-tab";`).
- Extracted host context by defining reactive `pluginSlot` and `pluginContext` property setters.
- Validates the context and fetches data by making a `POST` request to the official same-origin Paperclip worker endpoint `/api/plugins/<pluginId>/data/project-memory-view` with `companyId` and `projectId` from the host context.
- Renders safe text-only cards (with HTML escaped to prevent XSS) and manages loading, error, and empty states natively.
- Zero external imports or dependencies are included, matching the existing `MemoryTab` component.

---

## 5. Build & Verification Checks

Run from the plugin folder:
```powershell
npm run check
```

Verification results:
- `npm run check` compiles cleanly, runs worker syntax checks, and validates the manifest format against the native Paperclip schema.
- `dist/ui/index.js` builds into a single self-contained bundle file without external imports.

---

## 6. Mounting & Browser Verification Steps

To verify the new Project Hub Memory tab in the browser:

### Step 1: Run the Build
Verify that the manifest, worker syntax, and UI bundle build successfully:
```powershell
cd "C:\Users\young\Documents\paperclip-game-workplane\paperclip-memory-plugin"
npm run check
```

### Step 2: Restart Paperclip
Restart the Paperclip server to load the updated manifest capabilities and clear cached plugins:
1. Stop the Node/Paperclip process:
   ```powershell
   Stop-Process -Name "node" -Force
   ```
2. Start the Paperclip server again:
   ```powershell
   paperclipai run
   ```

### Step 3: Verify in the Browser
1. Open the Paperclip browser UI (default: `http://127.0.0.1:3100`).
2. Navigate to the Project Hub for your active project.
3. Verify that a new tab named **"Memory"** is now visible in the project detail tab bar.
4. Click the tab:
   - While loading, a spinner and `"Recalling project memory..."` is shown.
    - Once loaded, verify that the page displays company/project memory items and proposed candidates filtered specifically by this company/project pair.
   - Verify that all memory entries correctly render their date, type, scope status badge, and provenance block.
   - Verify that no write actions (e.g. approve/promote buttons) are present in the tab.

---

## 7. Post-Review Corrections (CMP-30)

- **Type Label Formatting**: Removed the accidental bullet prefix (`• `) before the type label in both Task Room and Project Hub `renderCard` implementations within `src/ui/MemoryTab.jsx`. The type is now rendered cleanly as an escaped plain string.
- **Candidate Namespace Filtering Review**: Reviewed and confirmed the `companyId` namespace filtering on candidates in `memory-sidecar/memory-sidecar.mjs` and its correct parameter forwarding in `paperclip-memory-plugin/dist/worker.js`. Verified via the automated test suite `memory-sidecar/verify-filters.mjs`.
