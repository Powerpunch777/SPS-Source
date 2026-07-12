export default {
  id: "local.room-chat",
  apiVersion: 1,
  version: "0.3.0",
  displayName: "Local Room Chat",
  description: "Long-lived project Agent Rooms backed by local Codex app-server sessions.",
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
    "projects.read",
    "project.workspaces.read",
    "events.subscribe",
    "plugin.state.read",
    "plugin.state.write"
  ],
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui-v0.3.0"
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
        type: "sidebar",
        id: "project-tasks-sidebar",
        displayName: "Project Tasks",
        exportName: "ProjectTasksSidebar",
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
        type: "detailTab",
        id: "project-workplane",
        entityTypes: ["project"],
        displayName: "Workplane",
        exportName: "ProjectWorkplaneTab",
        order: 89
      },
      {
        type: "detailTab",
        id: "room-chat",
        entityTypes: ["issue"],
        displayName: "Room Chat",
        exportName: "RoomChatTab",
        order: 90
      },
      {
        type: "taskDetailView",
        id: "room-task-summary",
        entityTypes: ["issue"],
        displayName: "Room Tasks",
        exportName: "RoomTaskSummary",
        order: 30
      },
      {
        type: "detailTab",
        id: "task-room",
        entityTypes: ["issue"],
        displayName: "Task Room",
        exportName: "TaskRoomTab",
        order: 91
      }
    ]
  },
  instanceConfigSchema: {
    type: "object",
    properties: {
      enableCodexRooms: {
        type: "boolean",
        description: "Enable real Codex app-server Room turns. Disabled by default.",
        default: false
      },
      codexCommand: {
        type: "string",
        description: "Local Codex CLI command. Defaults to codex."
      },
      codexModel: {
        type: "string",
        description: "Optional Codex model override for new and resumed Room threads."
      },
      enableTaskAssignment: {
        type: "boolean",
        description: "Allow CTO and Designer Room tools to create assigned worker Tasks. Disabled by default.",
        default: false
      },
      paperclipApiUrl: {
        type: "string",
        description: "Loopback Paperclip API URL used for durable Room document writes. Defaults to http://127.0.0.1:3100.",
        default: "http://127.0.0.1:3100"
      }
    }
  }
};
