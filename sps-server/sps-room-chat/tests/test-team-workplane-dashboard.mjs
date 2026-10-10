import assert from "node:assert/strict";

process.env.PAPERCLIP_ROOM_CHAT_TEST = "1";
const { handleTeamWorkplaneDashboard } = await import("../dist/worker.js");

const result = await handleTeamWorkplaneDashboard({
  projects: {
    list: async () => [
      { id: "project-a", name: "Alpha" },
      { id: "project-b", name: "Beta" }
    ]
  },
  issues: {
    list: async () => [
      {
        id: "room-a",
        projectId: "project-a",
        status: "todo",
        originKind: "plugin:local.room-chat:agent-room-provisioning",
        originId: "project:project-a:agent-room:lead-a"
      },
      {
        id: "task-active",
        identifier: "SPS-1",
        projectId: "project-a",
        parentId: "room-a",
        title: "Prepare the release notes",
        status: "in_progress",
        updatedAt: "2026-07-31T00:00:00.000Z"
      },
      {
        id: "task-report",
        identifier: "SPS-2",
        projectId: "project-b",
        parentId: "room-a",
        title: "Review the interface build",
        status: "in_review",
        updatedAt: "2026-07-31T01:00:00.000Z"
      },
      {
        id: "task-cancelled",
        projectId: "project-b",
        parentId: "room-a",
        title: "Discarded work",
        status: "cancelled"
      }
    ]
  }
}, { companyId: "company-a" });

assert.equal(result.projectCount, 2);
assert.equal(result.roomCount, 1);
assert.equal(result.taskCount, 2);
assert.equal(result.activeTaskCount, 2);
assert.equal(result.reportCount, 1);
assert.deepEqual(result.latestReport, {
  id: "task-report",
  identifier: "SPS-2",
  title: "Review the interface build",
  status: "in_review",
  projectName: "Beta"
});

console.log("PASS Team Workplane Dashboard remains scoped to the plugin's Room and Task records");
