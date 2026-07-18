# Feasibility Log: SPS UI Memory Extension Strategy

- **Task Room Identifier**: `CMP-25`
- **Issue ID**: `226633d7-9f0e-4fce-8810-f9c0119b9154`
- **Title**: Assess SPS memory UI extension feasibility
- **Status**: Checked / Feasibility Completed

---

## 1. Feasibility Assessment Summary

It is feasible to add Project, Agent, and Task Room Memory tabs to the SPS UI without a core fork. The installed `@paperclipai/plugin-sdk` exposes standard UI slots, a UI-to-worker data bridge, and a worker action bridge for this purpose.

This is an SDK feasibility result. A mounted browser tab has not yet been implemented or runtime-verified.

---

## 2. Exact Supported Extension Points

Based on inspection of the `@paperclipai/plugin-sdk` and `@paperclipai/shared` packages, the following extension points are native and supported:

1. **Frontend UI Slots (`PluginUiSlotType`)**:
   - **`detailTab`**: Configured as an additional tab inside the entity detail pane.
   - **`taskDetailView`**: Configured for custom rendering inside task-focused views.
   - **`page`**: Configured to render a full custom standalone page.
2. **Entity Targets (`PluginUiSlotEntityType`)**:
   - **`"project"`** (for Project Memory tab)
   - **`"agent"`** (for Agent Memory tab)
   - **`"issue"`** (for Task Room Memory tab)
3. **Core Server Serving Routes**:
   - **`/api/plugins/ui-contributions`**: Serializes registered frontend UI slots and exports. Mapped in [plugins.js](file:///C:/Users/young/AppData/Local/npm-cache/_npx/43414d9b790239bb/node_modules/@paperclipai/server/dist/routes/plugins.js).
   - **`/_plugins/:pluginId/ui/*filePath`**: Serves precompiled plugin ESM bundles dynamically from the plugin's `dist/ui/` directory. Mapped in [plugin-ui-static.js](file:///C:/Users/young/AppData/Local/npm-cache/_npx/43414d9b790239bb/node_modules/@paperclipai/server/dist/routes/plugin-ui-static.js).

---

## 3. Unsupported Requirements & Security Boundaries

* **Direct UI-to-Sidecar loopback fetch calls (CORS block)**:
  * *Constraint*: Modern browsers block direct XMLHttpRequests/fetch requests from the web UI to arbitrary loopback ports (`127.0.0.1:3188`) due to local network access policies and CORS rules.
  * *Mitigation*: The plugin UI component must communicate through the **Plugin Worker Bridge**. The UI component calls SDK hooks `usePluginData` or `usePluginAction` defined in [index.d.ts](file:///C:/Users/young/Documents/AGENT%20%EA%B5%AC%EC%B6%95/sps-server/sps-memory/node_modules/@paperclipai/plugin-sdk/dist/ui/index.d.ts) which send requests to the server backend. The server proxies the requests to the plugin's background worker process. The background worker, running inside Node.js, calls the local loopback Memory Sidecar API without browser sandbox constraints.

---

## 4. Recommended Minimal Implementation Path

To implement the Memory tab without modifying the SPS Core:

1. **Manifest Configuration**:
   Update `manifest.js` in `sps-memory` to declare the UI entrypoint, capability, and slots. The installed manifest schema requires `displayName`, not `label`, and requires a stable `id` for every slot:
   ```javascript
   export default {
     id: "local.memory-sidecar",
     entrypoints: {
       worker: "./dist/worker.js",
       ui: "./dist/ui"
     },
     capabilities: [
       "agent.tools.register",
       "http.outbound",
       "ui.detailTab.register"
     ],
     ui: {
       slots: [
         {
           type: "detailTab",
           id: "memory",
           entityTypes: ["project", "agent", "issue"],
           displayName: "Memory",
           exportName: "MemoryTab",
           order: 100
         }
       ]
     }
   };
   ```
2. **React UI Component Implementation**:
   Create the React component in `sps-memory/src/ui/MemoryTabComponent.tsx`:
   * Use `useHostContext` to retrieve the current entity type (`"project"`, `"agent"`, or `"issue"`) and entity ID.
   * Register a `ctx.data` handler in the worker, then call it from the component with `usePluginData("memory-view", { entityType, entityId })`.
   * Register a guarded `ctx.actions` handler in the worker, then call it from the component with `usePluginAction("memory-propose")` to create only candidates.
   * Leverages hooks described in [index.d.ts](file:///C:/Users/young/Documents/AGENT%20%EA%B5%AC%EC%B6%95/sps-server/sps-memory/node_modules/@paperclipai/plugin-sdk/dist/ui/index.d.ts) and props defined in [types.d.ts](file:///C:/Users/young/Documents/AGENT%20%EA%B5%AC%EC%B6%95/sps-server/sps-memory/node_modules/@paperclipai/plugin-sdk/dist/ui/types.d.ts).
3. **Build Configuration**:
   * Add a Vite config (`vite.config.ts`) to bundle the UI code into a single ESM file (`dist/ui/index.js`).
   * Ensure Vite outputs code with external React imports resolved to the host application (i.e. React is externalized).
4. **Validation**:
   * Build using `npm run build`.
   * Validate manifest and syntax using `npm run check`.
   * Restart SPS to verify UI mounting.

---

## 5. Temporary Surface Acceptability

* **Sidecar-Only Page (Standalone UI)**:
  * A standalone sidecar UI page served directly by the Memory Sidecar daemon (e.g. `127.0.0.1:3188/operator`) is acceptable as a temporary candidate-review surface during early prototyping.
  * Browser-to-sidecar calls must still obey the configured CORS and local-network policy. For the integrated SPS tab, the plugin worker bridge is the preferred path because it keeps the sidecar loopback-only and avoids exposing a browser-facing write API.
  * Since SPS provides built-in `detailTab` and `page` slots, using native plugin slots remains the target for the unified workplane experience.

---

## 6. Comparison to Design Strategy

The feasibility results align perfectly with [00-final-architecture.md](file:///C:/Users/young/Documents/AGENT%20%EA%B5%AC%EC%B6%95/sps-server/00-final-architecture.md). The plugin-based extension approach keeps the Core repository clean, restricts raw filesystem/network access to backend processes, and integrates Memory directly into Project, Agent, and Task views.

---
*Created by Antigravity (Direct Local Worker) on behalf of Codex CTO.*
