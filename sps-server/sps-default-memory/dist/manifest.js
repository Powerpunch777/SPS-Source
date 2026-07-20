const memoryRecallTool = {
  name: "memory-recall",
  displayName: "Memory Recall",
  description: "Recall approved SPS memory that is visible to the current company, project, room, task, or agent context.",
  parametersSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Short, specific recall query." },
      scopes: {
        type: "array",
        items: { type: "string" },
        description: "Optional memory scopes. Defaults to the current context.",
      },
      limit: { type: "number", description: "Maximum results from 1 to 10. Defaults to 5." },
    },
    required: ["query"],
  },
};

const memoryProposeTool = {
  name: "memory-propose",
  displayName: "Memory Propose",
  description: "Record a concise, reviewable long-term-memory candidate from the current work. It does not silently rewrite source documents.",
  parametersSchema: {
    type: "object",
    properties: {
      content: { type: "string", description: "The concise fact, decision, constraint, or preference to preserve." },
      scope: {
        type: "string",
        description: "Memory boundary. Use project by default; use room or task for local context and company for shared policy.",
      },
      type: { type: "string", description: "Candidate type such as decision, learning, constraint, or preference." },
      tags: { type: "array", items: { type: "string" }, description: "Optional retrieval tags." },
      sourceNote: { type: "string", description: "Short explanation of why this should be remembered." },
    },
    required: ["content"],
  },
};

export default {
  id: "sps.default-memory",
  apiVersion: 1,
  version: "0.1.0",
  displayName: "SPS Default Memory",
  description: "First-party, local-first memory for SPS Desktop Owner Host.",
  author: "SPS",
  categories: ["automation"],
  capabilities: ["agent.tools.register", "memory.providers.register"],
  agentPlatform: {
    contractVersion: "1.0",
    kind: "store_provider"
  },
  entrypoints: { worker: "./dist/worker.js" },
  tools: [memoryRecallTool, memoryProposeTool],
  memoryProvider: {
    providerKey: "sps-default",
    displayName: "SPS Default Memory",
    scopes: ["company", "project", "agent", "room", "task", "artifact", "user"],
    lifecycleEvents: ["project.created", "room.checkpoint", "room.compacted", "task.completed", "task.blocked", "artifact.published"],
    recallToolName: "memory-recall",
    proposeToolName: "memory-propose",
    defaultForNewCompanies: true,
  },
};
