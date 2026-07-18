const $ = (selector) => document.querySelector(selector);
const notice = $("#notice");

function showNotice(message, error = false) {
  notice.textContent = message;
  notice.className = error ? "error" : "success";
}

function pretty(value) {
  return JSON.stringify(value, null, 2);
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

async function refreshStatus() {
  const status = await window.spsDesktop.getStatus();
  $("#status").textContent = pretty(status);
  if (status.profile) {
    $("#hub-url").value = status.profile.hubUrl ?? "";
    $("#company-id").value = status.profile.companyId ?? "";
    $("#display-name").value = status.profile.displayName ?? "";
    $("#default-workspace-path").value = status.profile.defaultWorkspacePath ?? "";
  }
  updateCompanyPicker(status.companies, status.profile?.companyId ?? "");
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

window.spsDesktop.onJoinLink((join) => {
  $("#hub-url").value = join.hub;
  $("#invite-code").value = join.code;
  showNotice("SPS invitation details received.");
});

refreshStatus().catch((error) => showNotice(error?.message ?? "Could not load SPS Desktop state", true));
