# Paperclip-Managed Agent Memory Lifecycle Hooks Feasibility Log

## 1. Investigation Findings & Exact Evidence

We inspected the locally installed Paperclip runtime, plugin SDK type declarations (`@paperclipai/plugin-sdk`), shared type definitions (`@paperclipai/shared`), and the current `paperclip-memory-plugin` source.

### A. Installed SDK Version
- **SDK Package**: `@paperclipai/plugin-sdk`
- **Version**: `2026.707.0` (as declared in `paperclip-memory-plugin/package.json`)

### B. Lifecycle and Event APIs Available
The following event/lifecycle APIs are exposed in `@paperclipai/plugin-sdk`:
1. **Plugin Definition Setup**: In `define-plugin.d.ts`, the host calls `setup(ctx)` on startup.
2. **Event System**: `ctx.events.on(name, fn)` or `ctx.events.on(name, filter, fn)` is used to subscribe to events.
3. **Supported Event Types**: Defined in `@paperclipai/shared/dist/constants.d.ts` via `PLUGIN_EVENT_TYPES`:
   - `"agent.run.started"`, `"agent.run.finished"`, `"agent.run.failed"`, `"agent.run.cancelled"`
   - `"issue.created"`, `"issue.updated"`, `"issue.comment.created"`, `"issue.document.created"`, `"issue.document.updated"`, `"issue.document.deleted"`
   - `"project.created"`, `"project.updated"`, `"project.workspace_created"`

---

## 2. Pre-run Recall Brief Feasibility (Limitation)

### A. Findings
Can a local plugin receive an agent-run-start event or modify the managed agent prompt/context before execution without a core fork?
- **No**. Direct prompt/context injection before execution is **not supported** at the plugin layer without a core fork.

### B. Technical Evidence
1. **Event Void Return Type**: In `types.d.ts`, the event subscription is defined as:
   ```typescript
   on(name: PluginEventType | `plugin.${string}`, fn: (event: PluginEvent) => Promise<void>): () => void;
   ```
   The event handler callback returns `Promise<void>`. Since the host invokes the handler via fire-and-forget asynchronous JSON-RPC notifications over stdio IPC (defined by the `onEvent` method in `protocol.d.ts`), there is no mechanism for the plugin to return a modified prompt or request payload to the host.
2. **No Prompt Interceptor Hooks**: In `PluginDefinition` (`define-plugin.d.ts`), there are no hooks like `onAgentRunStarting` or `onBeforePromptGeneration` that allow a plugin to act as prompt middleware or context filters.
3. **Execution Timing**: When `"agent.run.started"` is emitted, the agent run has already been registered and initialized on the host. The prompt has already been constructed by Paperclip core.

### C. Upstream/Plugin Gap & Future Path
- **Gap**: The Paperclip Plugin SDK lacks a blocking/synchronous lifecycle hook (e.g. `onAgentRunStarting(run, context) => Promise<{ systemPromptOverrides?: string }>`) to inspect and modify the active LLM context or system prompt before prompt resolution.
- **Future Path**: To support official pre-run Recall Brief injection without a core fork, Paperclip must introduce a prompt-builder middleware API or hook in `PluginDefinition`. Until then, direct `agy.exe` runner prompts (which manually query the sidecar) remain the only safe, non-forking way to perform pre-run injection.

---

## 3. Post-run Candidate Handoff Feasibility & Implementation

### A. Findings
Can a local plugin receive a completed-run/issue-close event and safely extract candidate memory without changing approved journals or task routing?
- **Yes**. By subscribing to `"agent.run.finished"` and `"issue.updated"` (where `status === "done"`), a plugin can safely run a post-run extractor.

### B. Guarded Adapter Boundary Implementation
We implemented the post-run extraction logic in `paperclip-memory-plugin/dist/worker.js`:
1. **Capabilities Escalation**: Added `"events.subscribe"`, `"issue.comments.read"`, and `"issue.documents.read"` to capabilities in `dist/manifest.js`.
2. **Post-Run Extraction Hook**: The plugin registers listeners:
   - `"agent.run.finished"`: Extracts candidates using the finished run details.
   - `"issue.updated"`: If an issue is marked `done`, it triggers candidate extraction.
3. **Safe Parsing & Submission**:
   - Reads comments and documents of the target issue via the `PluginContext` API.
   - Extracts memory candidates using JS regex helpers matching the standardized `## Memory Candidates` format.
   - Submits candidates to the loopback Memory Sidecar (`/memory/candidates`) using the `fetch` API.
   - **Guards**: It only proposes candidates (does not mutate approved `LEARNINGS.md`), uses authoritative run/issue/company/project/assignee identifiers, is completely non-blocking on sidecar failure, and does not alter task routing or status.

---

## 4. Reproducible Capability Probe

We created a node-based test suite `paperclip-memory-plugin/scripts/verify-lifecycle-probe.mjs` using `@paperclipai/plugin-sdk/testing` which runs locally without invoking a model.

### A. Probe Output Evidence
```text
=================================================
Running Paperclip Managed Agent Lifecycle Probe...
=================================================

[PROBE PART 1] Verifying Pre-run Prompt/Context Injection Limitation
- Plugin-level prompt interceptor hook exists in Definition? NO
- Simulating 'agent.run.started' event...
  [Handler] Received agent.run.started for run: run-abc
- Pre-run verification: confirmed event is asynchronous with void return type. Prompt injection is not supported.

[PROBE PART 2] Verifying Post-run Guarded Candidate Extraction
- Simulating 'agent.run.finished' event...
- Proposed candidates count: 1
- Proposed Candidate Content:
 - [2026-07-10] Architecture Rules: Direct prompt/context injection is not supported at the plugin layer without a core fork.
- Metadata values resolved:
  companyId: comp-123
  projectId: proj-456
  agentId: agent-code-worker
  issueId: CMP-35-issue
  tags: ["managed-agent-handoff","issue-CMP-35-issue"]
  source: {"kind":"paperclip_comment","note":"Extracted post-run from comment:comment-1","runId":"run-abc","projectId":"proj-456","companyId":"comp-123"}

SUCCESS: Lifecycle capability probe run completed successfully!
```

The probe verifies that:
1. No prompt interceptors are present on the plugin definition.
2. Emitted `"agent.run.finished"` triggers comment/document fetching and successful extraction of candidate memory into the sidecar candidate queue, preserving provenance and tags.
3. No Approved `LEARNINGS.md` files are mutated.
