const $ = (selector) => document.querySelector(selector);
const notice = $("#notice");

function showNotice(message, error = false) {
  notice.textContent = message;
  notice.className = error ? "error" : "success";
}

function pretty(value) {
  return JSON.stringify(value, null, 2);
}

let latestStatus = null;

function updateCompanyPicker(companies, selectedId) {
  const picker = $("#company-picker");
  picker.replaceChildren();
  const entries = Array.isArray(companies) ? companies : [];
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = entries.length ? "Choose a company" : "Sign in with Google first";
  picker.append(placeholder);
  for (const company of entries) {
    const option = document.createElement("option");
    option.value = company.id;
    option.textContent = company.name;
    option.selected = company.id === selectedId;
    picker.append(option);
  }
  picker.disabled = entries.length === 0;
}

function updateProjectPicker(projects, selectedId) {
  const picker = $("#project-workspace-project-id");
  const previousSelection = selectedId || picker.value;
  picker.replaceChildren();
  const entries = Array.isArray(projects) ? projects : [];
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = entries.length ? "Choose a project" : "No accessible projects found";
  picker.append(placeholder);
  for (const project of entries) {
    const option = document.createElement("option");
    option.value = project.id;
    option.textContent = project.name;
    option.selected = project.id === previousSelection;
    picker.append(option);
  }
  picker.disabled = entries.length === 0;
}

function refreshProjectFolderField() {
  const projectId = $("#project-workspace-project-id").value;
  const mapping = latestStatus?.profile?.projectWorkspaces ?? {};
  $("#project-workspace-path").value = projectId ? (mapping[projectId] ?? "") : "";
}

function formatStatusTime(value) {
  if (!value) return "waiting";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "waiting" : date.toLocaleString();
}

function renderUpdate(update) {
  const current = update?.currentVersion ?? "unknown";
  const available = update?.availableVersion ? ` ${update.availableVersion}` : "";
  const percent = Number.isFinite(update?.percent) ? ` ${update.percent}%` : "";
  $("#update-detail").textContent = `SPS Desktop ${current}\n${update?.message ?? "Desktop update service is starting."}${available}${percent}`;
  const state = update?.state;
  $("#check-updates").disabled = ["disabled", "unavailable", "checking", "downloading"].includes(state);
  $("#download-update").disabled = state !== "available";
  $("#install-update").disabled = state !== "ready";
}

function renderStatus(status) {
  const profile = status.profile;
  const connection = status.nodeConnection;
  const lines = [
    `Hub: ${profile?.hubUrl ?? "not configured"}`,
    `Google sign-in: ${status.signedIn ? "connected" : "not connected"}`,
    `Company: ${profile?.companyId ? (status.companies.find((company) => company.id === profile.companyId)?.name ?? profile.companyId) : "not selected"}`,
    `This computer: ${status.nodeId ? `registered (${status.nodeStatus === "active" ? "approved" : status.nodeStatus === "pending" ? "waiting for Owner approval" : status.nodeStatus === "revoked" ? "revoked" : "checking approval"})` : "not registered"}`,
    `Command runner: ${status.commandRunner?.active ? "running" : status.nodeId ? "waiting for Node approval" : "waiting for registration"}`,
    `Launch at Windows sign-in: ${status.commandRunner?.launchAtLogin ? "enabled" : "disabled"}`,
  ];
  if (connection) {
    lines.push(`Last Hub heartbeat: ${formatStatusTime(connection.lastHeartbeatAt)}`);
    lines.push(`Last command poll: ${formatStatusTime(connection.lastCommandPollAt)}`);
    if (connection.heartbeatError) lines.push(`Connection notice: ${connection.heartbeatError}`);
    if (connection.commandPollError) lines.push(`Command notice: ${connection.commandPollError}`);
  }
  if (status.update) lines.push(`Desktop update: ${status.update.message}`);
  $("#status").textContent = lines.join("\n");
  renderUpdate(status.update);
}

async function refreshStatus() {
  const status = await window.spsDesktop.getStatus();
  latestStatus = status;
  renderStatus(status);
  if (status.profile) {
    $("#hub-url").value = status.profile.hubUrl ?? "";
    $("#company-id").value = status.profile.companyId ?? "";
    $("#display-name").value = status.profile.displayName ?? "";
    $("#default-workspace-path").value = status.profile.defaultWorkspacePath ?? "";
  }
  $("#launch-at-login").checked = Boolean(status.commandRunner?.launchAtLogin);
  updateCompanyPicker(status.companies, status.profile?.companyId ?? "");
  updateProjectPicker(status.projects, $("#project-workspace-project-id").value);
  refreshProjectFolderField();
}

function applyJoinFields(join) {
  $("#hub-url").value = join.hub;
  $("#invite-code").value = join.code;
  $("#company-id").value = "";
}

async function handleJoinLink(join) {
  applyJoinFields(join);
  const displayName = $("#display-name").value.trim();
  if (!displayName) {
    showNotice("Invitation received. Name this computer, save the Hub profile, then open the invitation.");
    return;
  }
  await window.spsDesktop.saveProfile({
    hubUrl: join.hub,
    companyId: "",
    displayName,
    defaultWorkspacePath: $("#default-workspace-path").value,
  });
  await window.spsDesktop.openInvite({ code: join.code });
  await refreshStatus();
  showNotice("Invitation opened in your browser. Complete Google sign-in, return here, then continue with Google.");
}

async function run(action) {
  try {
    const result = await action();
    await refreshStatus();
    return result;
  } catch (error) {
    showNotice(error?.message ?? "SPS Desktop action failed", true);
    throw error;
  }
}

$("#profile-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  await run(async () => {
    await window.spsDesktop.saveProfile({
      hubUrl: $("#hub-url").value,
      companyId: $("#company-id").value,
      displayName: $("#display-name").value,
      defaultWorkspacePath: $("#default-workspace-path").value,
    });
    showNotice("Hub profile saved.");
  });
});
$("#company-picker").addEventListener("change", async (event) => {
  $("#company-id").value = event.target.value;
  if (!event.target.value) return;
  await run(async () => {
    await window.spsDesktop.saveProfile({
      hubUrl: $("#hub-url").value,
      companyId: event.target.value,
      displayName: $("#display-name").value,
      defaultWorkspacePath: $("#default-workspace-path").value,
    });
    showNotice("Company selected.");
  });
});

$("#open-invite").addEventListener("click", () => run(async () => {
  await window.spsDesktop.openInvite({ code: $("#invite-code").value });
  showNotice("Invitation opened in your default browser.");
}));

$("#project-workspace-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  await run(async () => {
    await window.spsDesktop.saveProjectWorkspace({
      projectId: $("#project-workspace-project-id").value,
      workspacePath: $("#project-workspace-path").value,
    });
    showNotice("Project folder mapping saved.");
  });
});
$("#project-workspace-project-id").addEventListener("change", refreshProjectFolderField);
$("#refresh-projects").addEventListener("click", () => run(async () => {
  await window.spsDesktop.refreshProjects();
  showNotice("Accessible SPS projects refreshed.");
}));
$("#start-auth").addEventListener("click", () => run(async () => {
  await window.spsDesktop.startAuth();
  showNotice("Google sign-in opened in your browser. Approve the SPS Desktop connection, then return here.");
}));
$("#poll-auth").addEventListener("click", () => run(async () => {
  const result = await window.spsDesktop.pollAuth();
  showNotice(result.auth?.status === "approved"
    ? "Google sign-in is complete. Select a company if you have more than one."
    : "Approval is still waiting.");
}));
$("#sign-out").addEventListener("click", () => run(async () => {
  await window.spsDesktop.signOut();
  showNotice("Local SPS Desktop token removed.");
}));
$("#check-updates").addEventListener("click", () => run(async () => {
  await window.spsDesktop.checkUpdates();
  showNotice("SPS Desktop update check completed.");
}));
$("#download-update").addEventListener("click", () => run(async () => {
  await window.spsDesktop.downloadUpdate();
  showNotice("SPS Desktop update download completed. Restart when it is ready.");
}));
$("#install-update").addEventListener("click", () => run(async () => {
  await window.spsDesktop.installUpdate();
  showNotice("SPS Desktop is restarting to install the update.");
}));
$("#scan-capabilities").addEventListener("click", () => run(async () => {
  const capabilities = await window.spsDesktop.scanCapabilities();
  $("#capabilities").textContent = pretty(capabilities);
  showNotice("Local runtimes scanned.");
}));
$("#connect-node").addEventListener("click", () => run(async () => {
  const result = await window.spsDesktop.connectNode();
  $("#capabilities").textContent = pretty(result.capabilities);
  showNotice(result.node.status === "pending"
    ? "Computer registered and key verified. Approve it in SPS Hub > Settings > Nodes."
    : "Computer heartbeat completed.");
}));
$("#launch-at-login").addEventListener("change", (event) => run(async () => {
  await window.spsDesktop.setLaunchAtLogin({ enabled: event.target.checked });
  showNotice(event.target.checked
    ? "SPS Desktop will start in the tray after you sign in to Windows."
    : "SPS Desktop will no longer start automatically at Windows sign-in.");
}));
$("#open-workspace").addEventListener("click", () => run(async () => {
  await window.spsDesktop.openWorkspace();
}));

window.spsDesktop.onJoinLink((join) => {
  void handleJoinLink(join).catch((error) => showNotice(error?.message ?? "Could not open the SPS invitation", true));
});

Promise.all([
  refreshStatus(),
  window.spsDesktop.readyForJoinLink(),
]).then(([, join]) => {
  if (join) return handleJoinLink(join);
  return undefined;
}).catch((error) => showNotice(error?.message ?? "Could not load SPS Desktop state", true));

setInterval(() => {
  void window.spsDesktop.getStatus().then(renderStatus).catch(() => undefined);
}, 5_000);
