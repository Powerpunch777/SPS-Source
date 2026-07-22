// Product identity is deliberately independent from the legacy plugin ID.
// Existing SPS Rooms data stores that ID in origin and plugin-state records.
export const SPS_TEAM_WORKPLANE_PROFILE = Object.freeze({
  productId: "sps.team-workplane",
  legacyPluginId: "local.room-chat",
  contractVersion: "1.0",
  kind: "workplane",
  profileKey: "sps-lead-worker",
  displayName: "SPS Team Workplane",
  description: "Long-lived Team Rooms, bounded Task Rooms, and lead-to-worker delivery for SPS projects.",
  author: "SPS",
  compatibility: Object.freeze({
    preservesExistingRooms: true,
    preservesExistingTasks: true,
    preservesExistingOriginKinds: true,
  }),
});
