process.env.SPS_ROOM_CHAT_TEST = "1";

const { updateRoomWorkStateOutsideInvocation } = await import("../dist/worker.js");

const required = (name) => {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
};

const patch = JSON.parse(Buffer.from(required("ROOM_PATCH_B64"), "base64").toString("utf8"));
const state = await updateRoomWorkStateOutsideInvocation(
  {
    spsApiUrl: process.env.SPS_API_URL || process.env.PAPERCLIP_API_URL || "http://127.0.0.1:3100",
    issueId: required("ROOM_ISSUE_ID"),
    projectId: required("ROOM_PROJECT_ID")
  },
  patch,
  process.env.ROOM_CHANGE_SUMMARY || "Update Room operating focus",
  {
    kind: process.env.ROOM_UPDATED_BY_KIND || "operator",
    agentId: process.env.ROOM_UPDATED_BY_AGENT_ID || null,
    agentName: process.env.ROOM_UPDATED_BY_AGENT_NAME || "Codex CTO"
  }
);

process.stdout.write(Buffer.from(JSON.stringify(state), "utf8").toString("base64"));
