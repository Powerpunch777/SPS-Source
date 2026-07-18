# Exploration Log: SPS UI Agent Room Memory Tab

- **Task Room Identifier**: `CMP-31`
- **Issue ID**: `acf058bf-de23-4f9c-8eda-4d3036212161`
- **Title**: Add Agent Room Memory tab
- **Status**: Blocked by the local Agent dashboard host surface.

---

## Runtime Outcome

The manifest slot and worker endpoint compiled, but the local SPS Agent dashboard did not render the registered `agent` detail tab after a plugin upgrade and browser reload. The experimental slot, component, and worker endpoint were removed in CMP-32 rather than requiring a SPS core UI fork.

The supported replacement is documented in `27-task-room-assigned-agent-memory-log.md`: a long-lived Agent Room is an assigned SPS issue, and its visible Task Room Memory tab reads the current assignee through the official SDK.

---

## 1. Architectural Strategy & Safety Boundaries

The goal is to implement a read-only Agent Room Memory tab for the agent detail plane, keeping SPS as the control plane.
To maintain strict boundaries:
1. **Control Plane Integrity**: No promote, edit, task close, assignment, agent wake, journal write, or core SPS changes are made.
2. **CORS/Network Safety**: No direct browser-to-sidecar requests. All requests are routed through the same-origin SPS data API endpoint `/api/plugins/<pluginId>/data/agent-memory-view`.
3. **Strict Namespace Isolation**:
   - Approved company memory is filtered by `companyId` and `company` scope.
   - Approved agent memory is filtered by `companyId`/`agentId` and `agent` scope.
   - Memory candidates are filtered by `companyId` and `agentId`.
   - Never substitute or query project memory from the agent page.
4. **Clean Web Component Rendering**: Extracted shared, dependency-free Web Component rendering helpers (`escapeHtml`, `formatDate`, `renderCard`, `renderSection`, `SHARED_STYLES`) to module scope in `src/ui/MemoryTab.jsx`. This avoids duplicating visual/DOM render code and reduced the bundled UI output size by ~32% (from 25.0kb to 17.0kb).

---

## 2. Manifest Registration

We registered the new UI detailTab slot in `dist/manifest.js`:

```javascript
      {
        type: "detailTab",
        id: "agent-memory",
        entityTypes: ["agent"],
        displayName: "Memory",
        exportName: "AgentMemoryTab",
        order: 100
      }
```

---

## 3. Worker Data Handler

We registered a new data handler `agent-memory-view` in `dist/worker.js`:
- Enforces presence of both `companyId` and `agentId` (throwing explicit `Error` objects if missing).
- Performs three queries to the loopback Memory Sidecar:
  1. `GET /memory/items?scope=company&companyId=<companyId>`
  2. `GET /memory/items?scope=agent&companyId=<companyId>&agentId=<agentId>`
  3. `GET /memory/candidates?companyId=<companyId>&agentId=<agentId>`
- Wraps execution using `safeDataHandler` to log warnings while bubbling connection/request failures to the host UI.

---

## 4. UI Web Component

We implemented `AgentMemoryTabElement` in `src/ui/MemoryTab.jsx`:
- Registered under custom element tag name `paperclip-agent-memory-tab`.
- Exports `AgentMemoryTab` as its tag name string (`export const AgentMemoryTab = "paperclip-agent-memory-tab";`).
- Obtains context parameters using `context.agentId` if available, falling back to `context.entityId`.
- Makes a `POST` request to `/api/plugins/<pluginId>/data/agent-memory-view` with `companyId` and `agentId`.
- Displays memory items for "Memory Candidates", "Agent Memory", and "Company Memory", using the clear tab title "Agent Memory".
- Employs the shared rendering helpers and CSS rules.

---

## 5. Verification Results

1. **Esbuild UI Bundling & Manifest Validation**:
   - Running `npm run check` compiles cleanly, runs worker syntax checks, and validates the manifest against SPS's validator schema.
   - Bundle size decreased significantly because of extracted renderers:
     ```
     dist\ui\index.js      17.0kb
     dist\ui\index.js.map  33.9kb
     ```
2. **Automated Memory Sidecar Filtering Suite**:
   - Ran `node verify-filters.mjs` which spawns the memory-sidecar and tests querying approved company/agent memory and candidates under proper filters.
   - Result:
     ```
     SUCCESS: All memory namespace filtering verification tests passed!
     ```
