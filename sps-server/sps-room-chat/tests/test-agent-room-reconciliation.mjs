import assert from "node:assert/strict";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";

process.env.PAPERCLIP_ROOM_CHAT_TEST = "1";
const pluginModule = await import("../src/worker.js");
const plugin = pluginModule.default;

const company = { id: "company-room-reconcile", name: "Room Reconcile", slug: "room-reconcile" };
const project = { id: "project-room-reconcile", companyId: company.id, name: "Workspace", slug: "workspace" };
const lead = { id: "lead-1", companyId: company.id, name: "Lead", role: "general", status: "idle", adapterConfig: {} };
const worker = { id: "worker-1", companyId: company.id, name: "Worker", role: "general", status: "idle", adapterConfig: {} };

const harness = createTestHarness({ manifest });
harness.seed({ companies: [company], projects: [project], agents: [lead, worker] });
await plugin.definition.setup(harness.ctx);

await harness.emit("project.created", {}, {
  companyId: company.id,
  entityId: project.id,
  entityType: "project"
});

let workplane = await harness.getData("project-workplane-view", {
  companyId: company.id,
  projectId: project.id
});
assert.deepEqual(workplane.rooms.map((room) => room.title).sort(), ["Lead", "Worker"]);

worker.status = "terminated";
await harness.emit("agent.updated", {}, {
  companyId: company.id,
  entityId: worker.id,
  entityType: "agent"
});

workplane = await harness.getData("project-workplane-view", {
  companyId: company.id,
  projectId: project.id
});
assert.deepEqual(workplane.rooms.map((room) => room.title), ["Lead"]);

await plugin.definition.shutdown();
console.log("Agent Room reconciliation tests passed");
