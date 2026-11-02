import { pathToFileURL } from "node:url";
import path from "node:path";

const root = process.env.SPS_ARTIFACT_TEST_ROOT;
const core = process.env.SPS_ARTIFACT_TEST_CORE;
if (!root || !path.isAbsolute(root) || !core || !path.isAbsolute(core) || process.connected !== true) throw new Error("Missing isolated artifact channel fixture.");
const load = name => import(pathToFileURL(path.join(core, "server", "src", "services", name)).href);
const { createSpsPluginArtifactMaintenance } = await load("sps-plugin-artifact-maintenance.ts");
const { createSpsPluginArtifactReferenceReader } = await load("sps-plugin-artifact-references.ts");
const { createSpsPluginArtifactParentChannel } = await load("sps-plugin-artifact-parent-channel.ts");
const { projectSpsSourceArtifactInventory } = await load("sps-source-artifact-inventory.ts");
const maintenance = createSpsPluginArtifactMaintenance();
let sourceRevision = "2026-11-02T03:04:05.006Z";
const reader = createSpsPluginArtifactReferenceReader({ localPluginDir: root, maintenance, readers: {
  listPlugins: async () => [], listPending: async () => [], listRetainedReviews: async () => [],
  readWorkers: () => [], readPreparations: () => [], readRegistryStages: async () => [],
  readSourceInventory: async () => projectSpsSourceArtifactInventory({ sources: [{
    kind: "workspace", id: "11111111-1111-4111-8111-111111111111",
    workspaceId: "22222222-2222-4222-8222-222222222222", resourceId: "11111111-1111-4111-8111-111111111111",
    status: "available", route: null, revision: sourceRevision,
  }], grants: [] }),
} });
const channel = createSpsPluginArtifactParentChannel(reader, process);
process.on("message", async value => {
  if (value?.kind !== "sps.test.artifact") return;
  if (value.operation === "probe") {
    let admitted = false;
    try { await maintenance.withActivity(async () => { admitted = true; }); } catch {}
    process.send?.({ kind: "sps.test.artifact.result", id: value.id, admitted });
  } else if (value.operation === "advance-source") {
    sourceRevision = "2026-11-02T03:04:06.006Z";
    process.send?.({ kind: "sps.test.artifact.result", id: value.id, changed: true });
  } else if (value.operation === "exit") {
    channel.dispose();
    process.exit(0);
  }
});
process.on("disconnect", () => process.exit(0));
