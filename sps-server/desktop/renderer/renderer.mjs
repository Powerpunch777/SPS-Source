import { createSpsDesktopSetupReadiness } from "./setup-readiness.mjs";

const $ = (selector) => document.querySelector(selector);
const notice = $("#notice");
const DEFAULT_SPS_HUB_URL = "";

function showNotice(message, error = false) {
  notice.textContent = message;
  notice.className = error ? "error" : "success";
}

function pretty(value) {
  return JSON.stringify(value, null, 2);
}

let latestStatus = null;

function isOwnerHostProfile(status) {
  return status?.profile?.connectionKind === "owner-host";
}

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

function updateTeamCompanyPicker(companies, selectedId) {
  const picker = $("#team-access-company");
  picker.replaceChildren();
  const entries = Array.isArray(companies) ? companies : [];
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = entries.length ? "Choose a local company" : "Detect Tailscale and load local companies";
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
  state.textContent = readiness.ready
    ? (isOwnerHostProfile(status) ? "Owner Host ready" : "Ready for authorized work")
    : "Connection setup required";
  state.className = `setup-state ${readiness.ready ? "ready" : ""}`;

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

function renderOwnerHost(status) {
  const ownerHost = status.ownerHost ?? {};
  const ready = ["running", "running-existing"].includes(ownerHost.state);
  const usingOwnerHost = isOwnerHostProfile(status);
  const privateTeamHost = Boolean(status.teamAccess?.enabled);
  const detail = privateTeamHost
    ? `This Desktop is hosting a private SPS team at ${status.teamAccess.url}. Sign in with Google to use it.`
    : ready
      ? (usingOwnerHost
      ? `This Desktop is using its internal Owner Host at ${ownerHost.url}.`
      : `Ready at ${ownerHost.url}. Choose it to keep company data on this computer.`)
    : ownerHost.lastError ?? "Starting the encrypted local SPS Host...";
  $("#owner-host-detail").textContent = detail;
  $("#use-owner-host").disabled = !ready || usingOwnerHost || privateTeamHost;
  $("#use-owner-host").textContent = privateTeamHost
    ? "Private team Host active"
    : usingOwnerHost ? "Using Owner Host" : ready ? "Use Owner Host" : "Starting Owner Host";
}

function renderTeamAccess(status) {
  const ownerHost = isOwnerHostProfile(status);
  const teamAccess = status.teamAccess;
  const panel = $("#team-access-panel");
  panel.hidden = !ownerHost && !teamAccess?.enabled;
  if (panel.hidden) return;

  const detail = $("#team-access-detail");
  const enableButton = $("#enable-private-team-access");
  const inspectButton = $("#inspect-team-access");
  const disableButton = $("#disable-private-team-access");
  const form = $("#team-access-form");
  if (teamAccess?.enabled) {
    const recovering = teamAccess.phase === "preparing";
    detail.textContent = [
      recovering ? "Private team Host transition was interrupted before completion." : "Private team Host is active.",
      `Address: ${teamAccess.url}`,
      `Company: ${status.companies?.find((company) => company.id === teamAccess.companyId)?.name ?? teamAccess.companyId}`,
      "Returning to local-only removes only the HTTPS route SPS created. If that route was changed outside SPS, SPS stops and asks you to review it in Tailscale instead of deleting it blindly.",
      ...(recovering ? ["Choose Return to local-only, verify Tailscale Serve is clear, then enable private team access again."] : []),
    ].join("\n");
    detail.classList.add("has-content");
    form.hidden = true;
    inspectButton.disabled = true;
    enableButton.disabled = true;
    disableButton.disabled = false;
    return;
  }
  form.hidden = !ownerHost;
  inspectButton.disabled = !ownerHost;
  enableButton.disabled = !ownerHost;
  disableButton.disabled = true;
  detail.classList.remove("has-content");
  updateTeamCompanyPicker(status.ownerHostCompanies, $("#team-access-company").value);
}

function renderStatus(status) {
  const profile = status.profile;
  const connection = status.nodeConnection;
  const lines = [
    `Team address: ${profile?.hubUrl ?? "not configured"}`,
    `Google sign-in: ${status.signedIn ? "connected" : "not connected"}`,
    `Company: ${profile?.companyId ? (status.companies.find((company) => company.id === profile.companyId)?.name ?? profile.companyId) : "not selected"}`,
    `This computer: ${status.nodeId ? `registered (${status.nodeStatus === "active" ? "approved" : status.nodeStatus === "pending" ? "waiting for Owner approval" : status.nodeStatus === "revoked" ? "revoked" : "checking approval"})` : "not registered"}`,
    `Command runner: ${status.commandRunner?.active ? "running" : status.nodeId ? "waiting for Node approval" : "waiting for registration"}`,
    `Launch at Windows sign-in: ${status.commandRunner?.launchAtLogin ? "enabled" : "disabled"}`,
  ];
  if (status.ownerHost) {
    lines.push(`Owner Host: ${status.ownerHost.state ?? "initializing"}${status.ownerHost.url ? ` (${status.ownerHost.url})` : ""}`);
    if (status.ownerHost.lastError) lines.push(`Owner Host notice: ${status.ownerHost.lastError}`);
  }
  if (status.teamAccess?.enabled) lines.push(`Private team Host: active (${status.teamAccess.url})`);
  if (connection) {
    lines.push(`Last team Host heartbeat: ${formatStatusTime(connection.lastHeartbeatAt)}`);
    lines.push(`Last command poll: ${formatStatusTime(connection.lastCommandPollAt)}`);
    if (connection.heartbeatError) lines.push(`Connection notice: ${connection.heartbeatError}`);
    if (connection.commandPollError) lines.push(`Command notice: ${connection.commandPollError}`);
  }
  if (status.update) lines.push(`Desktop update: ${status.update.message}`);
  $("#status").textContent = lines.join("\n");
  const ownerHost = isOwnerHostProfile(status);
  $("#company-field").hidden = ownerHost || !status.signedIn;
  $("#remote-profile-panel").hidden = ownerHost;
  $("#auth-panel").hidden = ownerHost;
  $("#server-route").textContent = ownerHost
    ? "This SPS Desktop runs the SPS Owner Host internally. Company data, Rooms, Tasks, files, and memory stay in this computer's Owner Vault."
    : "This SPS Desktop joins a shared private SPS team address. This computer runs only its approved local Agent work.";
  renderOwnerHost(status);
  renderTeamAccess(status);
  renderUpdate(status.update);
  renderSetupReadiness(status);
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
  await window.spsDesktop.saveProfile({
    hubUrl: join.hub,
    companyId: "",
    displayName: $("#display-name").value,
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
$("#use-owner-host").addEventListener("click", () => run(async () => {
  if (latestStatus?.profile && !isOwnerHostProfile(latestStatus)) {
    const confirmed = window.confirm("Switch this Desktop to its local Owner Host? Any current remote Node registration on this computer will be disconnected.");
    if (!confirmed) return;
  }
  await window.spsDesktop.useOwnerHost();
  showNotice("This computer is now using its internal SPS Owner Host.");
}));
$("#check-hub").addEventListener("click", () => run(async () => {
  const advancedHubUrl = $("#hub-url-advanced").value.trim();
  if (!advancedHubUrl) throw new Error("Enter the private SPS team address from an invitation.");
  $("#hub-url").value = advancedHubUrl;
  const result = await window.spsDesktop.checkHub({ hubUrl: advancedHubUrl });
  showNotice(`SPS team address is reachable at ${result.hubUrl}.`);
}));
$("#inspect-team-access").addEventListener("click", () => run(async () => {
  const setup = await window.spsDesktop.inspectTeamAccess();
  updateTeamCompanyPicker(setup.companies, "");
  const detail = $("#team-access-detail");
  detail.textContent = [
    `Tailscale device: ${setup.tailnet.deviceName}`,
    `Private team address: ${setup.tailnet.url}`,
    `Tailscale HTTPS: ${setup.tailnet.httpsAvailable ? "ready" : "not enabled"}`,
    `Google redirect URI: ${setup.googleRedirectUrl}`,
    ...(setup.tailnet.httpsAvailable
      ? ["Add this redirect URI to the Google OAuth client before enabling the private team Host."]
      : ["Enable HTTPS certificates for this tailnet in Tailscale Admin first. SPS will keep private team access disabled until it is ready."]),
  ].join("\n");
  detail.classList.add("has-content");
  showNotice(setup.tailnet.httpsAvailable
    ? "Tailscale is ready. Add the shown Google redirect URI, then choose a company and enable the private team Host."
    : "Tailscale is connected, but its HTTPS certificate feature must be enabled before a private SPS team Host can be created.");
}));
$("#team-access-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  await run(async () => {
    const result = await window.spsDesktop.enablePrivateTeamAccess({
      companyId: $("#team-access-company").value,
      googleClientId: $("#team-google-client-id").value,
      googleClientSecret: $("#team-google-client-secret").value,
    });
    $("#invite-code").value = result.invitation.code ?? result.invitation.token;
    $("#team-google-client-secret").value = "";
    showNotice("Private team Host is running. The one-time Owner invitation opened in your browser. Finish Google sign-in, then return and continue with Google.");
  });
});
$("#disable-private-team-access").addEventListener("click", () => run(async () => {
  if (!window.confirm("Return this SPS Owner Host to local-only mode? Existing team members and Nodes will no longer be able to connect.")) return;
  await window.spsDesktop.disablePrivateTeamAccess();
  showNotice("This SPS Owner Host is local-only again. The HTTPS route created by SPS was removed after ownership verification.");
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
    ? "Computer registered and key verified. Approve it in Company settings > Nodes."
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
    showNotice(outcome?.remoteError ?? "This computer was disconnected locally. An Owner may need to revoke the old Node in Company settings > Nodes.", true);
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
