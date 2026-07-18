import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const manifest = await import(pathToFileURL(path.join(root, "dist", "manifest.js")).href);
assert.equal(manifest.default.id, "local.room-chat");
assert.equal(manifest.default.version, packageJson.version);
assert.equal(manifest.default.entrypoints.ui, `./dist/ui-v${packageJson.version}`);
assert.ok(fs.existsSync(path.join(root, manifest.default.entrypoints.ui, "index.js")));
assert.ok(manifest.default.capabilities.includes("issue.documents.write"));
assert.ok(manifest.default.capabilities.includes("issue.comments.create"));
assert.ok(manifest.default.capabilities.includes("events.subscribe"));
assert.ok(manifest.default.capabilities.includes("companies.read"));
assert.ok(manifest.default.capabilities.includes("project.workspaces.read"));
assert.ok(manifest.default.capabilities.includes("ui.page.register"));
assert.ok(manifest.default.capabilities.includes("ui.sidebar.register"));
assert.ok(manifest.default.ui.slots.some((slot) => slot.id === "project-tasks" && slot.routePath === "tasks"));
assert.ok(!manifest.default.ui.slots.some((slot) => slot.id === "project-tasks-sidebar"));
assert.ok(manifest.default.ui.slots.some((slot) => (
  slot.id === "project-tasks-link"
  && slot.type === "projectSidebarItem"
  && slot.entityTypes?.includes("project")
)));
assert.ok(!manifest.default.ui.slots.some((slot) => slot.id === "codex-accounts"));
assert.ok(!manifest.default.ui.slots.some((slot) => slot.id === "codex-accounts-sidebar"));
assert.ok(manifest.default.ui.slots.some((slot) => (
  slot.id === "codex-account-configuration"
  && slot.type === "agentConfiguration"
  && slot.entityTypes?.includes("agent")
)));
assert.ok(manifest.default.ui.slots.some((slot) => slot.id === "project-workplane-link"));
assert.ok(!manifest.default.ui.slots.some((slot) => slot.id === "role-rules"));
assert.ok(manifest.default.ui.slots.some((slot) => slot.id === "room-chat"));
assert.ok(!manifest.default.ui.slots.some((slot) => slot.id === "room-task-summary"));
assert.ok(!manifest.default.ui.slots.some((slot) => slot.id === "task-room"));
const worker = fs.readFileSync(path.join(root, "dist", "worker.js"), "utf8");
const client = fs.readFileSync(path.join(root, "dist", "codex-app-server-client.js"), "utf8");
const agyClient = fs.readFileSync(path.join(root, "dist", "agy-room-client.js"), "utf8");
assert.match(client, /thread\/compact\/start/);
assert.match(worker, /ROOM_STATE/);
assert.match(worker, /TASK_ROOM_STATE/);
assert.match(worker, /enableTaskAssignment/);
assert.match(worker, /CODEX_HOME/);
assert.match(worker, /ROOM_MESSAGE_MODES/);
assert.match(worker, /tool_not_available_in_room_mode/);
assert.match(worker, /roomModeSandbox/);
assert.match(worker, /codex-account-select/);
assert.match(worker, /codex-accounts-view/);
assert.match(worker, /codexClients/);
assert.match(worker, /AgyRoomClient/);
assert.match(worker, /enableAgyRooms/);
assert.match(agyClient, /--dangerously-skip-permissions/);
assert.match(worker, /preview_task/);
assert.match(worker, /task_path_conflict/);
assert.match(worker, /invalid_task_maturity/);
assert.match(worker, /post_task_feedback/);
assert.match(worker, /complete_task/);
assert.match(worker, /Only the Agent Room that created this Task/);
assert.match(worker, /likely lossy encoding sequence/);
assert.match(worker, /task-request-owner-feedback/);
assert.match(worker, /handleTaskStatusUpdated/);
assert.match(worker, /continueTaskOwnerReportAfterStatusNormalization/);
assert.match(worker, /reconcileTaskOwnerReportBoundaries/);
assert.match(worker, /ctx\.jobs\.register\("workplane-reconcile"/);
assert.ok(manifest.default.capabilities.includes("jobs.schedule"));
assert.ok(manifest.default.jobs?.some((job) => job.jobKey === "workplane-reconcile"));
assert.match(worker, /task_owner_report/);
assert.match(worker, /worker_done_requires_task_owner_verification/);
assert.match(worker, /owner_verified/);
assert.match(worker, /Task Owner technical verification/);
assert.match(worker, /provisionProjectAgentRooms/);
assert.match(worker, /reconcileAllProjectAgentRooms/);
assert.match(worker, /agent\.deleted/);
const ui = fs.readFileSync(path.join(root, manifest.default.entrypoints.ui, "index.js"), "utf8");
assert.match(ui, /Manage Agents/);
assert.match(worker, /PROVISIONED_AGENT_ROOM_ORIGIN/);
assert.match(worker, /loadAgentInstructions/);
assert.match(worker, /handleProjectTasksView/);
assert.match(worker, /project-tasks-view/);
assert.match(worker, /Update Room Workspace binding/);
assert.match(worker, /ROOM_JOB_ENTITY_TYPE/);
assert.match(worker, /reconcileInterruptedRoomJobs/);
assert.match(worker, /projectWorkspaceId/);
assert.match(worker, /baseRevisionId/);
assert.match(worker, /loopbackSPSApiUrl/);
assert.match(worker, /\/api\/issues\/\$\{encodeURIComponent\(input\.issueId\)\}\/documents/);
console.log("PASS Room Chat plugin manifest and safety gates");
