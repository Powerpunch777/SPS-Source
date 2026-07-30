const searchExtensionsTool = {
  name: "search-sps-extensions",
  displayName: "Search SPS Extensions",
  description: "Search the verified SPS Official Registry catalog. This returns recommendation metadata only and never installs, enables, updates, or removes a plugin.",
  parametersSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Words to match against plugin names, summaries, IDs, publishers, or declared capabilities." },
      limit: { type: "number", description: "Maximum recommendations from 1 to 12. Defaults to 6." },
    },
  },
};

const draftExtensionTool = {
  name: "draft-sps-extension",
  displayName: "Draft SPS Extension",
  description: "Prepare a neutral SPS extension brief and manifest outline. This does not create files, install a package, activate a plugin, or change the Workspace.",
  parametersSchema: {
    type: "object",
    properties: {
      goal: { type: "string", description: "The user goal the extension should address." },
      displayName: { type: "string", description: "Optional human-readable extension name." },
      pluginId: { type: "string", description: "Optional stable plugin ID. A draft ID is proposed when omitted." },
      features: {
        type: "array",
        items: {
          type: "string",
          enum: ["tools", "surface", "automation", "integration", "workspace_source", "runtime_execution", "artifacts", "secrets"],
        },
        description: "Optional workflow-neutral implementation surfaces chosen by the Agent.",
      },
    },
    required: ["goal"],
  },
};

export default {
  id: "sps.plugin-discovery",
  apiVersion: 1,
  version: "0.3.1",
  displayName: "Plugin Discovery & Builder",
  description: "A conversational starting point for verified SPS extension discovery and non-destructive extension drafting.",
  author: "SPS",
  categories: ["automation", "ui"],
  capabilities: [
    "agent.tools.register",
    "agents.read",
    "agent.sessions.create",
    "agent.sessions.list",
    "agent.sessions.send",
    "agent.sessions.close",
    "registry.catalog.read",
    "plugin.state.read",
    "plugin.state.write",
    "instance.settings.register",
  ],
  companyActivation: { defaultEnabled: true },
  agentPlatform: {
    contractVersion: "1.0",
    kind: "tool_provider",
    profileKey: "sps-plugin-discovery",
  },
  sps: {
    contractVersion: "2.0",
    primitives: [],
  },
  entrypoints: { worker: "./dist/worker.js", ui: "./dist/ui-v0.3.1" },
  ui: {
    slots: [
      {
        type: "companySettingsPage",
        id: "plugin-discovery-settings-page",
        routePath: "discover",
        displayName: "Discovery & Builder",
        exportName: "PluginDiscoveryPage",
        order: 1,
      },
    ],
  },
  tools: [searchExtensionsTool, draftExtensionTool],
};
