import assert from "node:assert/strict";

process.env.PAPERCLIP_ROOM_CHAT_TEST = "1";

const { handleOrganizationSettingsAccess, requireAgentConfigurationAction } = await import("../src/worker.js");

assert.throws(
  () => requireAgentConfigurationAction({
    companyId: "company-a",
    actor: { type: "user", permissions: ["tasks:assign"] }
  }),
  /owners or admins/i
);

assert.equal(
  requireAgentConfigurationAction({
    companyId: "company-a",
    actor: { type: "user", permissions: ["agents:configure"] }
  }),
  "company-a"
);

assert.deepEqual(
  await handleOrganizationSettingsAccess(null, {}, {
    companyId: "company-a",
    actor: { type: "user", permissions: ["tasks:assign"] }
  }),
  { companyId: "company-a", canConfigureAgents: false }
);

assert.deepEqual(
  await handleOrganizationSettingsAccess(null, {}, {
    companyId: "company-a",
    actor: { type: "user", permissions: ["agents:configure"] }
  }),
  { companyId: "company-a", canConfigureAgents: true }
);

console.log("organization action permission tests passed");
