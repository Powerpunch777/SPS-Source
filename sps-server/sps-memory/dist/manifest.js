const memorySearchTool = {
  name: "memory-search",
  displayName: "Memory Search",
  description:
    "Search approved SPS workplane memory from the local Memory Sidecar. Use this for recall before planning or implementing work.",
  parametersSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search text. Keep it short and specific."
      },
      scope: {
        type: "string",
        description:
          "Optional comma-separated memory scopes, such as company, project, or agent."
      },
      limit: {
        type: "number",
        description: "Maximum results to return. Defaults to 5."
      }
    },
    required: ["query"]
  }
};

const memoryProposeTool = {
  name: "memory-propose",
  displayName: "Memory Propose",
  description:
    "Propose a memory candidate for later human or CTO approval. This does not edit approved LEARNINGS.md files.",
  parametersSchema: {
    type: "object",
    properties: {
      content: {
        type: "string",
        description: "The concise memory candidate to preserve."
      },
      scope: {
        type: "string",
        description:
          "Candidate scope. Use project by default unless the memory clearly belongs to company, agent, task, artifact, or user."
      },
      type: {
        type: "string",
        description: "Candidate type, such as decision, learning, preference, or constraint."
      },
      issueId: {
        type: "string",
        description: "Optional SPS issue or task room id that produced this candidate."
      },
      sourceKind: {
        type: "string",
        description: "Optional source kind. Defaults to paperclip_agent_tool."
      },
      sourceNote: {
        type: "string",
        description: "Optional short source note or rationale."
      },
      tags: {
        type: "array",
        items: { type: "string" },
        description: "Optional search tags."
      }
    },
    required: ["content"]
  }
};

export default {
  id: "local.memory-sidecar",
  apiVersion: 1,
  version: "0.1.4",
  displayName: "SPS Memory",
  description:
    "Exposes safe recall and memory-candidate tools backed by the local SPS Workplane Memory Sidecar.",
  author: "local",
  categories: ["automation"],
  capabilities: [
    "agent.tools.register",
    "http.outbound",
    "ui.detailTab.register",
    "issues.read",
    "events.subscribe",
    "issue.comments.read",
    "issues.create",
    "issues.update",
    "issue.comments.create",
    "plugin.state.read",
    "plugin.state.write",
    "jobs.schedule",
    "api.routes.register",
    "projects.read",
    "ui.action.register",
    "instance.settings.register"
  ],
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui"
  },
  apiRoutes: [
    {
      routeKey: "direct-tasks-submit",
      method: "POST",
      path: "/direct-tasks/submit",
      auth: "board",
      capability: "api.routes.register",
      companyResolution: {
        from: "body",
        key: "companyId"
      }
    }
  ],
  jobs: [
    {
      jobKey: "direct-task-finalizer",
      displayName: "Direct Task Finalizer",
      description: "Polls Direct Task Bridge and finalizes unassigned tasks.",
      schedule: "*/1 * * * *"
    }
  ],
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
      },
      {
        type: "detailTab",
        id: "project-memory-candidates",
        entityTypes: ["project"],
        displayName: "Memory Candidates",
        exportName: "ProjectMemoryCandidatesTab",
        order: 110
      }
    ]
  },
  instanceConfigSchema: {
    type: "object",
    properties: {
      sidecarUrl: {
        type: "string",
        description: "Memory Sidecar base URL. Defaults to http://127.0.0.1:3188."
      },
      enableManagedCandidateExtraction: {
        type: "boolean",
        description: "Enable automated candidate extraction post-run. Defaults to false."
      },
      managedCandidateCompanyId: {
        type: "string",
        description: "Must match the event company ID to permit automated extraction."
      },
      enableDirectTaskLaunch: {
        type: "boolean",
        description: "Enable direct task launch integration",
        default: false
      },
      directTaskTransport: {
        type: "string",
        description: "Direct Task transport. This local runtime supports 'windows-named-pipe'.",
        default: "windows-named-pipe"
      },
      directPipeName: {
        type: "string",
        description: "The name of the Windows Named Pipe.",
        default: "SPSDirectTaskBroker"
      },
      directBridgeUrl: {
        type: "string",
        description: "Loopback HTTP/HTTPS URL of the Direct Task Bridge"
      },
    }
  },
  tools: [memorySearchTool, memoryProposeTool]
};
