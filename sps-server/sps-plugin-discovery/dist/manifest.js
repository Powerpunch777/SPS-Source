const evidenceSchema = {
  type: "array",
  items: {
    type: "object",
    properties: {
      kind: { type: "string", enum: ["workspace_file", "run", "test", "diagnostic", "artifact", "preview", "package"] },
      ref: { type: "string", description: "Opaque ID or project-relative reference. Absolute paths and URLs are rejected." },
      label: { type: "string" },
      digest: { type: "string", description: "Optional SHA-256 digest." },
    },
    required: ["kind", "ref"],
  },
};

const createPluginProjectTool = {
  name: "create-sps-plugin-project",
  displayName: "Create SPS Plugin Project",
  description: "Open an append-only SPS plugin authoring session and return the exact public project contract. The Agent performs file work with its own approved workspace tools; this call does not install or activate a plugin.",
  parametersSchema: {
    type: "object",
    properties: {
      goal: { type: "string" },
      displayName: { type: "string" },
      pluginId: { type: "string" },
      projectRef: { type: "string", description: "Project-relative or opaque reference to the external plugin project." },
    },
    required: ["goal"],
  },
};

const runAuthoringStepTool = {
  name: "run-sps-authoring-step",
  displayName: "Record SPS Authoring Step",
  description: "Record one Agent-executed authoring step and its inspectable evidence in the session ledger. This never treats an Agent claim as a passed Core build gate.",
  parametersSchema: {
    type: "object",
    properties: {
      authoringSessionId: { type: "string" },
      objective: { type: "string" },
      status: { type: "string", enum: ["requested", "running", "passed", "failed", "blocked"] },
      evidence: evidenceSchema,
    },
    required: ["authoringSessionId", "objective", "status"],
  },
};

const inspectBuildTool = {
  name: "inspect-sps-plugin-build",
  displayName: "Inspect SPS Plugin Build",
  description: "Attach build, validation, or test evidence to an authoring session. Desktop Developer Mode reruns mandatory gates before Preview.",
  parametersSchema: {
    type: "object",
    properties: {
      authoringSessionId: { type: "string" },
      status: { type: "string", enum: ["running", "passed", "failed", "blocked"] },
      summary: { type: "string" },
      evidence: evidenceSchema,
    },
    required: ["authoringSessionId", "status", "summary", "evidence"],
  },
};

const openPreviewTool = {
  name: "open-sps-plugin-preview",
  displayName: "Request SPS Plugin Preview",
  description: "Record a request to open the current verified candidate in Desktop's isolated Plugin Preview. The request does not affect the production Workspace or plugin lifecycle.",
  parametersSchema: {
    type: "object",
    properties: {
      authoringSessionId: { type: "string" },
      summary: { type: "string" },
      evidence: evidenceSchema,
    },
    required: ["authoringSessionId"],
  },
};

const packageTool = {
  name: "create-sps-plugin-package",
  displayName: "Create SPS Plugin Package",
  description: "Record the package produced from a passed Builder project and attach its immutable evidence. This creates a candidate package record only; it never installs, enables, updates, disables, or removes a plugin.",
  parametersSchema: {
    type: "object",
    properties: {
      authoringSessionId: { type: "string" },
      packageRef: { type: "string", description: "Project-relative or opaque reference to the package produced by the approved workspace packaging tool." },
      packageVersion: { type: "string" },
      summary: { type: "string" },
      evidence: evidenceSchema,
    },
    required: ["authoringSessionId", "packageRef", "evidence"],
  },
};

export default {
  id: "sps.plugin-discovery",
  apiVersion: 1,
  version: "0.4.0",
  displayName: "Plugin Builder",
  description: "An independent workspace for creating, validating, previewing, and packaging SPS plugins.",
  author: "SPS",
  categories: ["automation", "ui"],
  capabilities: [
    "agent.tools.register",
    "plugin.state.read",
    "plugin.state.write",
    "ui.page.register",
  ],
  companyActivation: { defaultEnabled: true },
  agentPlatform: {
    contractVersion: "1.0",
    kind: "tool_provider",
    profileKey: "sps-plugin-builder",
  },
  sps: {
    contractVersion: "2.0",
    primitives: [],
  },
  entrypoints: { worker: "./dist/worker.js", ui: "./dist/ui-v0.4.0" },
  ui: {
    slots: [
      {
        type: "page",
        id: "plugin-builder-page",
        routePath: "builder",
        displayName: "Plugin Builder",
        exportName: "PluginBuilderPage",
        order: 1,
      },
    ],
  },
  tools: [
    createPluginProjectTool,
    runAuthoringStepTool,
    inspectBuildTool,
    openPreviewTool,
    packageTool,
  ],
};
