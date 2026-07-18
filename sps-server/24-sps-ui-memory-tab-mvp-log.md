# Implementation Log: SPS UI Memory Tab MVP

- **Task Room Identifier**: `CMP-27`
- **Issue ID**: `a41b1da7-9177-4047-a490-ed138e9e941a`
- **Title**: Build Task Room Memory tab MVP
- **Status**: Completed

---

## 1. Architectural Strategy & Safety Boundaries

The goal is to implement the first SPS-native Memory UI as a read-only `detailTab` for Task Rooms (the `issue` entity type) within the `local.memory-sidecar` plugin.

To maintain the architectural boundaries:
1. **Control Plane Integrity**: SPS remains the system of record. The Memory UI is strictly informational and has no actions to create tasks, assign agents, close tasks, promote candidates, or modify the durable approved `LEARNINGS.md` journals.
2. **CORS/Network Safety**: Browser-to-sidecar direct calls are blocked by browser CORS restrictions. Communication is routed cleanly through the Node-based SPS plugin worker bridge:
   - React UI component calls `usePluginData("memory-view", params)` to fetch data.
   - The plugin background worker handles this via a registered data handler `memory-view`.
   - The background worker performs safe local loopback HTTP calls to the Memory Sidecar (`127.0.0.1:3188`).
3. **Strict Namespace Isolation**: The worker queries the sidecar with strict filters:
   - Approved company memory is filtered by `companyId` and `company` scope.
   - Approved project memory is filtered by `companyId`/`projectId` and `project` scope.
   - Memory candidates are filtered by the current `issueId`.
4. **Clean Mounting**: The manifest declares the slot configuration specifically for the `issue` entity type and requests only the `"ui.detailTab.register"` capability.

---

## 2. Manifest & Capability Changes

The `dist/manifest.js` file was updated to register the UI bundle entrypoint, the detailTab capability, and the slot details:

- **Capabilities Added**: `"ui.detailTab.register"`
- **Entrypoints Added**: `ui: "./dist/ui"`
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
      }
    ]
  }
  ```

---

## 3. Worker Data Handler

We registered a new data handler `memory-view` in `dist/worker.js`:
- Performs three parallel queries to the loopback Memory Sidecar:
  1. `GET /memory/items?scope=company&companyId=<companyId>`
  2. `GET /memory/items?scope=project&companyId=<companyId>&projectId=<projectId>`
  3. `GET /memory/candidates?issueId=<issueId>`
- Wraps error logging with `safeDataHandler` to log warnings while bubbling up connection or request failures to the host UI.

---

## 4. UI Bundle (React ESM)

We created `src/ui/MemoryTab.jsx` using React and hooks provided by `@paperclipai/plugin-sdk/ui`:
- Utilizes `useHostContext` to extract the current company, project, and entity (issue) IDs.
- Retrieves data via `usePluginData("memory-view", { companyId, projectId, issueId: entityId })`.
- Handles states explicitly:
  - **Loading**: Renders a standard SPS `Spinner` with a status label.
  - **Error**: Displays an error boundary containing the message.
  - **Empty**: Shows an explicit blank slate when no memories or candidates exist.
  - **Success**: Renders segmented sections for *Memory Candidates*, *Project Memory*, and *Company Memory* complete with date, scope status badge, type, source provenance file paths, and lines.

---

## 5. Reproducible Build & Verification Checks

We updated `package.json` to expose local verification and build paths:
- `npm run build:ui` / `npm run build`: Bundles the React component into `dist/ui/index.js` via `esbuild`. It externalizes `react` and `@paperclipai/plugin-sdk/ui` to rely on the host's runtime exports.
- `npm run check`: Validates the worker file syntax (`node --check`), validates the manifest format against the native SPS schema, and runs the esbuild UI bundler.

Verification results:
- `npm run check` passes cleanly.
- `dist/ui/index.js` builds into a lightweight, minified 5.7kb file.

---

## 6. Mounting & Restart Verification Steps

To mount the new Memory tab in your local SPS workspace, perform the following steps:

### Step 1: Run the Build & Check
Verify that the manifest, worker syntax, and UI bundle build successfully:
```powershell
cd "C:\Users\young\Documents\AGENT 구축\sps-server\sps-memory"
npm run check
```
Make sure you see `Manifest OK: local.memory-sidecar 0.1.0` and `dist\ui\index.js` generated.

### Step 2: Restart SPS
Restart the SPS server to load the updated manifest capabilities and clear any cached plugins:
1. Locate the running SPS terminal/process or run:
   ```powershell
   Stop-Process -Name "node" -Force # This will stop the server and the old plugin worker
   ```
2. Start the SPS server again in the background or in a separate terminal:
   ```powershell
   paperclipai run
   ```
3. Verify that the plugin is detected and loaded. Run:
   ```powershell
   npx paperclip-plugin-dev-server # Or check SPS status in settings
   ```

### Step 3: Verify the UI Tab
1. Open the SPS browser UI (default: `http://127.0.0.1:3100`).
2. Navigate to any Issue (Task Room), e.g., `CMP-27`.
3. Verify that a new tab named **"Memory"** is now visible in the issue detail tab bar (alongside Comments/Documents).
4. Click the tab:
   - While loading, a spinner and `"Recalling task room memory..."` is shown.
    - Once loaded, verify that the page displays company/project memory items and any proposed candidates associated with the issue.
    - Verify that all memory entries correctly render their date, type, scope badge, and provenance block (e.g. `C:\Users\young\Documents\sps-server\LEARNINGS.md:12`).

---

## 7. Compatibility Finding: React SDK mounting vs Custom Web Component (CMP-28)

* **Finding**: The local SPS host does not inject the React plugin bridge global (`globalThis.__paperclipPluginBridge__`), which causes the React UI SDK bundle to fall back to the placeholder (or throw on hooks like `useHostContext`).
* **Fix/Migration**:
  1. Replaced React with a dependency-free custom web component.
  2. Registered a stable custom element `paperclip-memory-tab`.
  3. Exported `MemoryTab` as its tag name string (`export const MemoryTab = "paperclip-memory-tab";`).
  4. Extracted host context by defining reactive `pluginSlot` and `pluginContext` property setters.
  5. Performed same-origin POST fetches to `/api/plugins/<pluginId>/data/memory-view` with parameters from `pluginContext`.
  6. Renders beautiful, safe text-only cards (with HTML escaped to prevent XSS) and manages loading/error/empty states natively.
  7. Compiled the bundle with zero imports or unresolved bare imports using esbuild (removed React and SDK UI externals).
