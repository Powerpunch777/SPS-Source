import { createSpsDesktopSetupReadiness } from "./setup-readiness.mjs";

const $ = (selector) => document.querySelector(selector);
const notice = $("#notice");
const DEFAULT_SPS_HUB_URL = "https://app.redongames.com";
const LOCAL_SPS_HUB_URL = "http://127.0.0.1:3100";

function showNotice(message, error = false) {
  notice.textContent = message;
  notice.className = error ? "error" : "success";
}

function pretty(value) {
  return JSON.stringify(value, null, 2);
}

let latestStatus = null;
let latestLocalHostStatus = null;

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

function usesLocalSpsHost(status) {
  try {
    const url = new URL(status?.profile?.hubUrl ?? "");
    return url.protocol === "http:" && ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname.toLowerCase());
  } catch {
    return false;
  }
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

function renderSetupReadiness(status) {
  const readiness = createSpsDesktopSetupReadiness(status);
  const list = $("#setup-steps");
  list.replaceChildren();
  for (const step of readiness.steps) {
    const item = document.createElement("li");
    item.className = `setup-step ${step.state}`;
    const marker = document.createElement("span");
    marker.className = "setup-marker";
    marker.textContent = step.state === "complete" ? "Done" : step.state === "current" ? "Next" : "Wait";
    const content = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = step.title;
    const detail = document.createElement("span");
    detail.textContent = step.detail;
    content.append(title, detail);
    item.append(marker, content);
    list.append(item);
  }
  const state = $("#setup-progress-state");
  state.textContent = readiness.ready ? "Ready for authorized work" : "Connection setup required";
  state.className = `setup-state ${readiness.ready ? "ready" : ""}`;

  $("#auth-panel").hidden = readiness.localHost;
  $("#use-local-hub").hidden = readiness.localHost;

  $("#open-invite").disabled = !readiness.canOpenInvite;
  $("#start-auth").disabled = !readiness.canStartAuth;
  $("#poll-auth").disabled = !readiness.canCheckAuth;
  $("#sign-out").disabled = !status.signedIn;
  $("#connect-node").disabled = !readiness.canConnectNode;
  $("#disconnect-node").disabled = !status.nodeId;
  $("#open-workspace").disabled = !readiness.canOpenWorkspace;
  $("#choose-project-workspace").disabled = !readiness.canManageProjects;
  $("#refresh-projects").disabled = !readiness.canManageProjects;
  $("#project-workspace-project-id").disabled = !readiness.canManageProjects || !status.projects?.length;
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
  $("#company-field").hidden = !status.signedIn;
  const localHost = usesLocalSpsHost(status);
  $("#server-route").textContent = localHost
    ? "This SPS Desktop is using the local SPS Host already running on this computer. Existing projects and Agent history stay in that local instance."
    : "This SPS Desktop connects to your shared SPS server through app.redongames.com. localhost:3100 only works on the computer running that local server.";
  renderUpdate(status.update);
  renderSetupReadiness(status);
}

function renderLocalHostStatus(status, hostStatus) {
  const isLocalHost = usesLocalSpsHost(status);
  $("#local-host-control").hidden = !isLocalHost;
  if (!isLocalHost) return;

  const detail = $("#local-host-detail");
  const startButton = $("#start-local-host");
  if (!hostStatus) {
    detail.textContent = "Could not read the local Host status yet.";
    startButton.disabled = true;
    return;
  }
  if (hostStatus.state === "adopted-external") {
    detail.textContent = "Running already. SPS Desktop is using the existing local server without taking it over.";
  } else if (hostStatus.state === "running") {
    detail.textContent = "Running under SPS Desktop control.";
  } else if (hostStatus.state === "starting") {
    detail.textContent = "Starting the local SPS Host...";
  } else {
    detail.textContent = hostStatus.lastError || "Stopped. Start the local Host to open your existing SPS instance.";
  }
  startButton.disabled = hostStatus.state !== "stopped";
}

async function refreshStatus() {
  const status = await window.spsDesktop.getStatus();
  latestStatus = status;
  renderStatus(status);
  latestLocalHostStatus = await window.spsDesktop.getLocalHostStatus().catch(() => null);
  renderLocalHostStatus(status, latestLocalHostStatus);
  if (status.profile) {
    $("#hub-url").value = status.profile.hubUrl ?? "";
    $("#company-id").value = status.profile.companyId ?? "";
    $("#display-name").value = status.profile.displayName ?? "";
    $("#default-workspace-path").value = status.profile.defaultWorkspacePath ?? "";
  }
  if (!status.profile) $("#hub-url").value = DEFAULT_SPS_HUB_URL;
  $("#hub-url-advanced").value = $("#hub-url").value || DEFAULT_SPS_HUB_URL;
  $("#launch-at-login").checked = Boolean(status.commandRunner?.launchAtLogin);
  updateCompanyPicker(status.companies, status.profile?.companyId ?? "");
  updateProjectPicker(status.projects, $("#project-workspace-project-id").value);
  refreshProjectFolderField();
  renderSetupReadiness(status);
}

function applyJoinFields(join) {
  $("#hub-url").value = join.hub;
  $("#hub-url-advanced").value = join.hub;
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
$("#use-local-hub").addEventListener("click", () => run(async () => {
  const displayName = $("#display-name").value.trim();
  if (!displayName) throw new Error("Name this computer before using its local SPS server.");
  await window.spsDesktop.checkHub({ hubUrl: LOCAL_SPS_HUB_URL });
  await window.spsDesktop.saveProfile({
    hubUrl: LOCAL_SPS_HUB_URL,
    companyId: "",
    displayName,
    defaultWorkspacePath: "",
  });
  showNotice("This computer's local SPS Host is ready. Open the SPS workspace to use your existing projects.");
}));
$("#refresh-local-host").addEventListener("click", () => run(async () => {
  latestLocalHostStatus = await window.spsDesktop.getLocalHostStatus();
  renderLocalHostStatus(latestStatus, latestLocalHostStatus);
  showNotice("Local SPS Host status refreshed.");
}));
$("#start-local-host").addEventListener("click", () => run(async () => {
  latestLocalHostStatus = await window.spsDesktop.startLocalHost();
  renderLocalHostStatus(latestStatus, latestLocalHostStatus);
  showNotice(latestLocalHostStatus.state === "running"
    ? "Local SPS Host started."
    : latestLocalHostStatus.lastError || "Local SPS Host start was requested.");
}));
$("#check-hub").addEventListener("click", () => run(async () => {
  const advancedHubUrl = $("#hub-url-advanced").value.trim();
  if (!advancedHubUrl) throw new Error("SPS Hub address is required");
  $("#hub-url").value = advancedHubUrl;
  const result = await window.spsDesktop.checkHub({ hubUrl: advancedHubUrl });
  showNotice(`SPS Hub is reachable at ${result.hubUrl}.`);
}));
$("#hub-url-advanced").addEventListener("input", (event) => {
  $("#hub-url").value = event.target.value.trim();
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
$("#choose-project-workspace").addEventListener("click", () => run(async () => {
  const workspacePath = await window.spsDesktop.chooseProjectWorkspace();
  if (!workspacePath) return;
  $("#project-workspace-path").value = workspacePath;
  showNotice("Project folder selected. Save it to map this SPS project on this computer.");
}));
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
  const result = await window.spsDesktop.signOut();
  const outcome = result.nodeDisconnect;
  showNotice(outcome?.remoteDisconnected
    ? "Signed out and disconnected this computer from SPS."
    : outcome?.remoteError ?? "Local SPS Desktop token removed.");
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
  const output = $("#capabilities");
  output.textContent = pretty(capabilities);
  output.classList.add("has-content");
  showNotice("Local runtimes scanned.");
}));
$("#connect-node").addEventListener("click", () => run(async () => {
  const wasRegistered = Boolean(latestStatus?.nodeId);
  const result = await window.spsDesktop.connectNode();
  const output = $("#capabilities");
  output.textContent = pretty(result.capabilities);
  output.classList.add("has-content");
  showNotice(result.node.status === "pending"
    ? "Computer registered and key verified. Approve it in SPS Hub > Settings > Nodes."
    : wasRegistered
      ? "Computer and local capabilities refreshed."
      : "Computer registered and heartbeat completed.");
}));
$("#disconnect-node").addEventListener("click", () => run(async () => {
  if (!window.confirm("Disconnect this computer from SPS? Its Agent access and running work will be revoked immediately.")) return;
  const result = await window.spsDesktop.disconnectNode();
  const outcome = result.nodeDisconnect;
  if (outcome?.remoteDisconnected) {
    showNotice("This computer was disconnected. Reconnecting creates a new Node that needs Owner approval.");
  } else {
    showNotice(outcome?.remoteError ?? "This computer was disconnected locally. An Owner may need to revoke the old Node in SPS Hub.", true);
  }
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
  void refreshStatus().catch(() => undefined);
}, 5_000);
