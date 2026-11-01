import { pathToFileURL } from "node:url";
import path from "node:path";

const root = process.env.SPS_ARTIFACT_TEST_ROOT;
const core = process.env.SPS_ARTIFACT_TEST_CORE;
if (!root || !path.isAbsolute(root) || !core || !path.isAbsolute(core) || process.connected !== true) throw new Error("Missing isolated artifact channel fixture.");
const load = name => import(pathToFileURL(path.join(core, "server", "src", "services", name)).href);
const { createSpsPluginArtifactMaintenance } = await load("sps-plugin-artifact-maintenance.ts");
const { createSpsPluginArtifactReferenceReader } = await load("sps-plugin-artifact-references.ts");
const { createSpsPluginArtifactParentChannel } = await load("sps-plugin-artifact-parent-channel.ts");
const maintenance = createSpsPluginArtifactMaintenance();
const reader = createSpsPluginArtifactReferenceReader({ localPluginDir: root, maintenance, readers: {
  listPlugins: async () => [], listPending: async () => [], listRetainedReviews: async () => [],
  readWorkers: () => [], readPreparations: () => [], readRegistryStages: async () => [],
} });
const channel = createSpsPluginArtifactParentChannel(reader, process);
process.on("message", async value => {
  if (value?.kind !== "sps.test.artifact") return;
  if (value.operation === "probe") {
    let admitted = false;
    try { await maintenance.withActivity(async () => { admitted = true; }); } catch {}
    process.send?.({ kind: "sps.test.artifact.result", id: value.id, admitted });
  } else if (value.operation === "exit") {
    channel.dispose();
    process.exit(0);
  }
});
process.on("disconnect", () => process.exit(0));
