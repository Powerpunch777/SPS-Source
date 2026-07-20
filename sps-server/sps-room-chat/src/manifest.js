export default {
  id: "local.room-chat",
  apiVersion: 1,
  version: "0.3.60",
  displayName: "SPS Rooms",
  description: "Long-lived project Agent Rooms backed by SPS Agent Sessions.",
  author: "local",
  categories: ["automation"],
  capabilities: [
    "ui.page.register",
    "ui.sidebar.register",
    "ui.detailTab.register",
    "issues.read",
    "issues.create",
    "issues.update",
    "issue.comments.read",
    "issue.comments.create",
    "issue.documents.read",
    "issue.documents.write",
    "agents.read",
    "companies.read",
    "agent.sessions.create",
    "agent.sessions.list",
    "agent.sessions.send",
    "agent.sessions.close",
    "projects.read",
    "project.workspaces.read",
    "project.workspaces.write",
    "events.subscribe",
    "jobs.schedule",
    "plugin.state.read",
    "plugin.state.write",
    "instance.settings.register"
  ],
  agentPlatform: {
    contractVersion: "1.0",
    kind: "workplane",
    profileKey: "sps-lead-worker"
  },
  jobs: [
    {
      jobKey: "workplane-reconcile",
      displayName: "Workplane reconciliation",
      description: "Recovers missed Task owner reports and preserves visible Worker quota blocks without automatic retries.",
      schedule: "* * * * *"
    }
  ],
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui-v0.3.60"
  },
  ui: {
    slots: [
      {
        type: "page",
        id: "agent-rooms",
        routePath: "agent-rooms",
        displayName: "Agent Rooms",
        exportName: "AgentRoomsPage",
        order: 9
      },
      {
        type: "page",
        id: "project-tasks",
        routePath: "tasks",
        displayName: "Tasks",
        exportName: "ProjectTasksPage",
        order: 10
      },
      {
        type: "projectSidebarItem",
        id: "project-workplane-link",
        entityTypes: ["project"],
        displayName: "Rooms",
        exportName: "ProjectWorkplaneLink",
        order: 10
      },
      {
        type: "projectSidebarItem",
        id: "project-tasks-link",
        entityTypes: ["project"],
        displayName: "Tasks",
        exportName: "ProjectTasksProjectLink",
        order: 11
      },
      {
        type: "detailTab",
        id: "project-workplane",
        entityTypes: ["project"],
        displayName: "Workplane",
        exportName: "ProjectWorkplaneTab",
        order: 89
      },
      {
        type: "agentConfiguration",
        id: "codex-account-configuration",
        entityTypes: ["agent"],
        displayName: "Codex CLI Account",
        exportName: "CodexAgentAccountConfiguration",
        order: 20
      },
      {
        type: "companySettingsPage",
        id: "organization-settings",
        displayName: "Organization",
        exportName: "OrganizationSettingsPage",
        routePath: "organization",
        order: 20
      },
      {
        type: "detailTab",
        id: "room-chat",
        entityTypes: ["issue"],
        displayName: "Room Chat",
        exportName: "RoomChatTab",
        order: 90
      }
    ]
  },
  instanceConfigSchema: {
    type: "object",
    properties: {
      spsApiUrl: {
        type: "string",
        title: "SPS API URL",
        description: "Loopback SPS API URL used for durable Room documents and attachment staging.",
        default: "http://127.0.0.1:3100"
      },
      enableAgyQuotaFallback: {
        type: "boolean",
        description: "Opt in to continuing a Codex Room turn through Agy when the selected Codex account reaches provider quota. Disabled by default because this changes the selected provider and cost boundary.",
        default: false
      },
      agyFallbackCommand: {
        type: "string",
        description: "Optional Agy CLI command used for Codex quota fallback. The installed per-user Agy executable is detected by default."
      },
      agyFallbackModel: {
        type: "string",
        description: "Agy model used for reasoning-agent quota fallback.",
        default: "gemini-3.1-pro-high"
      },
      agyFallbackPrintTimeout: {
        type: "string",
        description: "Agy CLI print-mode wait used for long-running reasoning-agent fallback turns.",
        default: "2h"
      }
    }
  }
};
