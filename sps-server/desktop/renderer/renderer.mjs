const $ = (selector) => document.querySelector(selector);

let latestStatus = null;
let ownerHostRecoveryTimer = null;
let memberInviteCode = null;
let pendingJoinHub = null;
const OWNER_HOST_RECOVERY_INTERVAL_MS = 2_000;

function account(status) {
  return status?.desktopAccount ?? {};
}

function isOwnerHost(status) {
  return status?.profile?.connectionKind === "owner-host";
}

function ownerHostReady(status) {
  return ["running", "running-existing"].includes(status?.ownerHost?.state);
}

function setNotice(message = "", error = false) {
  const notice = $("#notice");
  notice.textContent = message;
  notice.classList.toggle("error", error);
}

function show(element, visible) {
  element.hidden = !visible;
}

function setPending(pending) {
  document.body.classList.toggle("pending", pending);
}

function syncOwnerHostRecovery(status) {
  const needsRecovery = Boolean(account(status).signedIn && isOwnerHost(status) && !ownerHostReady(status));
  if (!needsRecovery) {
    if (ownerHostRecoveryTimer) clearInterval(ownerHostRecoveryTimer);
    ownerHostRecoveryTimer = null;
    return;
  }
  if (ownerHostRecoveryTimer) return;
  ownerHostRecoveryTimer = setInterval(() => {
    void refreshStatus().catch(() => {});
  }, OWNER_HOST_RECOVERY_INTERVAL_MS);
}

function renderAccount(status) {
  const desktopAccount = account(status);
  const signedIn = desktopAccount.signedIn === true;
  const pending = desktopAccount.pending === true;
  show($("#account-screen"), !signedIn);
  $("#start-sps-account").disabled = pending;
  $("#sps-action-label").textContent = pending ? "SPS 로그인 확인 중..." : "Google로 계속";
  show($("#cancel-sps-account"), pending);
  const note = $("#account-configuration-note");
  if (desktopAccount.error) {
    note.textContent = `SPS 로그인이 완료되지 않았습니다: ${desktopAccount.error}`;
  } else {
    note.textContent = "";
  }
  show(note, Boolean(desktopAccount.error));
}

function renderServerChoice(status) {
  const desktopAccount = account(status);
  const visible = desktopAccount.signedIn === true && !status?.profile;
  show($("#server-choice-screen"), visible);
  $("#account-name").textContent = desktopAccount.name ?? "SPS account";
  $("#account-email").textContent = desktopAccount.email ?? "";
  const picture = $("#account-picture");
  if (desktopAccount.picture) {
    picture.src = desktopAccount.picture;
    picture.hidden = false;
  } else {
    picture.removeAttribute("src");
    picture.hidden = true;
  }
  $("#server-data-note").textContent = "이 컴퓨터에 서버를 만들면 회사 데이터는 Owner Vault에 저장됩니다. 나중에 팀 접속을 켜면 초대된 SPS 계정별로 회사와 Agent 권한을 적용합니다.";
}

function renderOwnerServer(status) {
  const desktopAccount = account(status);
  const visible = desktopAccount.signedIn === true && isOwnerHost(status) && ownerHostReady(status);
  show($("#owner-server-screen"), visible);
  if (!visible) return;

  $("#owner-account-name").textContent = desktopAccount.name ?? "SPS account";
  $("#owner-account-email").textContent = desktopAccount.email ?? "";
  const picture = $("#owner-account-picture");
  if (desktopAccount.picture) {
    picture.src = desktopAccount.picture;
    picture.hidden = false;
  } else {
    picture.removeAttribute("src");
    picture.hidden = true;
  }

  const teamEnabled = status?.teamAccess?.enabled === true;
  const companies = Array.isArray(status?.ownerHostCompanies) ? status.ownerHostCompanies : [];
  const companySelect = $("#private-team-company");
  const previousCompany = companySelect.value;
  companySelect.replaceChildren(...companies.map((company) => {
    const option = document.createElement("option");
    option.value = company.id;
    option.textContent = company.name;
    return option;
  }));
  if (companies.some((company) => company.id === previousCompany)) companySelect.value = previousCompany;
  $("#enable-private-team").disabled = companies.length === 0;

  show($("#owner-team-setup"), !teamEnabled);
  show($("#owner-member-invite"), teamEnabled);
  $("#owner-server-detail").textContent = teamEnabled
    ? `팀 접근이 ${status.teamAccess.url}에서 활성화되어 있습니다.`
    : companies.length > 0
      ? "팀 접근을 활성화한 뒤 전체 SPS2 초대 코드를 만들어 전달하세요."
      : "Workspace에서 회사를 만든 뒤 팀 접근을 활성화할 수 있습니다.";
  $("#member-invite-code").value = memberInviteCode ?? "";
  $("#copy-member-invite").disabled = !memberInviteCode;
  const packs = Array.isArray(status?.agentRuntimePacks) ? status.agentRuntimePacks : [];
  const list = $("#agent-runtime-pack-list");
  list.replaceChildren(...packs.map((pack) => {
    const row = document.createElement("div");
    row.className = "runtime-pack-row";
    const name = document.createElement("strong");
    name.textContent = `${pack.label} ${pack.version}`;
    const detail = document.createElement("span");
    detail.textContent = pack.complete ? pack.commands.join(", ") : "Incomplete";
    row.append(name, detail);
    return row;
  }));
  if (packs.length === 0) {
    const empty = document.createElement("span");
    empty.textContent = "No optional runtime packs installed. Existing local CLIs remain available.";
    list.append(empty);
  }
}

function renderWorkspace(status) {
  const hasProfile = Boolean(status?.profile) && account(status).signedIn === true;
  const local = isOwnerHost(status);
  const ready = local ? ownerHostReady(status) : Boolean(status.signedIn);
  const visible = hasProfile && !ready;
  show($("#workspace-screen"), visible);
  if (!visible) return;
  const complete = $("#complete-server-access");
  const check = $("#check-server-access");
  $("#workspace-eyebrow").textContent = local ? "THIS COMPUTER'S SPS SERVER" : "SPS SERVER";
  if (local && !ready) {
    $("#workspace-title").textContent = "SPS Server를 시작하는 중";
    $("#workspace-detail").textContent = status?.ownerHost?.lastError ?? "Owner Vault와 기본 서비스가 준비되면 Workspace를 자동으로 엽니다.";
    show(complete, false);
    show(check, false);
    return;
  }
  if (!local && !status.signedIn) {
    $("#workspace-title").textContent = "서버 접근을 확인하세요";
    $("#workspace-detail").textContent = "브라우저에서 초대를 수락한 같은 SPS 계정으로 이 SPS Server 접근을 확인합니다.";
    show(complete, true);
    show(check, Boolean(status.pendingAuth));
  }
}

function renderLocalFolders(status) {
  const hasProfile = Boolean(status?.profile) && account(status).signedIn === true;
  const local = isOwnerHost(status);
  const ready = local ? ownerHostReady(status) : Boolean(status.signedIn);
  const visible = hasProfile && local && ready && status?.setupMode === true;
  show($("#local-folders-screen"), visible);
  if (!visible) return;

  const profile = status.profile ?? {};
  $("#default-workspace-path").value = profile.defaultWorkspacePath ?? "";
  $("#clear-default-workspace").disabled = !profile.defaultWorkspacePath;

  const mappings = profile.projectWorkspaces ?? {};
  const list = $("#project-folder-list");
  const projects = Array.isArray(status.projects) ? status.projects : [];
  list.replaceChildren(...projects.map((project) => {
    const row = document.createElement("article");
    row.className = "project-folder-row";

    const copy = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = project.name;
    const detail = document.createElement("span");
    detail.textContent = mappings[project.id] || "No Host source folder selected";
    copy.append(title, detail);

    const actions = document.createElement("div");
    actions.className = "project-folder-actions";
    const choose = document.createElement("button");
    choose.type = "button";
    choose.className = "secondary-action compact-action";
    choose.dataset.action = "choose";
    choose.dataset.projectId = project.id;
    choose.textContent = "Choose folder";
    const share = document.createElement("button");
    share.type = "button";
    share.className = "secondary-action compact-action";
    share.dataset.action = "share";
    share.dataset.projectId = project.id;
    share.textContent = "Share with Member";
    share.disabled = !mappings[project.id];
    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "text-action inline-action";
    clear.dataset.action = "clear";
    clear.dataset.projectId = project.id;
    clear.textContent = "Clear";
    clear.disabled = !mappings[project.id];
    actions.append(choose, share, clear);
    row.append(copy, actions);
    return row;
  }));

  if (projects.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-project-folders";
    empty.textContent = "No SPS projects are available for this account yet.";
    list.append(empty);
  }
}

function render(status) {
  latestStatus = status;
  renderAccount(status);
  renderServerChoice(status);
  renderOwnerServer(status);
  renderWorkspace(status);
  renderLocalFolders(status);
  setPending(Boolean(account(status).pending));
  syncOwnerHostRecovery(status);
}

async function refreshStatus() {
  const status = await window.spsDesktop.getStatus();
  render(status);
  const workspaceReady = account(status).signedIn
    && status?.profile
    && (isOwnerHost(status) ? ownerHostReady(status) : Boolean(status.signedIn));
  if (workspaceReady && status?.setupMode !== true) {
    await window.spsDesktop.openWorkspace();
  }
}

async function run(action) {
  try {
    setNotice("");
    await action();
    await refreshStatus();
  } catch (error) {
    setNotice(error instanceof Error ? error.message : "SPS Desktop 요청을 완료하지 못했습니다.", true);
    await refreshStatus().catch(() => {});
  }
}

$("#start-sps-account").addEventListener("click", () => run(async () => {
  await window.spsDesktop.startSpsAccount();
  setNotice("브라우저에서 Google 로그인을 완료하면 SPS Desktop으로 자동으로 이어집니다.");
}));

$("#cancel-sps-account").addEventListener("click", () => run(async () => {
  await window.spsDesktop.signOutSpsAccount();
  setNotice("SPS 로그인 요청을 취소했습니다. 다시 시도할 수 있습니다.");
}));

$("#sign-out-sps-account").addEventListener("click", () => run(async () => {
  await window.spsDesktop.signOutSpsAccount();
}));

$("#owner-sign-out").addEventListener("click", () => run(async () => {
  await window.spsDesktop.signOutSpsAccount();
}));

$("#enable-private-team").addEventListener("click", () => run(async () => {
  const companyId = $("#private-team-company").value;
  if (!companyId) throw new Error("Workspace에서 먼저 팀 접근을 연결할 회사를 만드세요.");
  await window.spsDesktop.enablePrivateTeamAccess({ companyId });
  memberInviteCode = null;
  setNotice("팀 접근을 활성화했습니다. 이제 전체 SPS2 초대 코드를 만들 수 있습니다.");
}));

$("#install-agent-runtime-pack").addEventListener("click", () => run(async () => {
  await window.spsDesktop.installAgentRuntimePack();
  setNotice("Agent Runtime pack installation finished. Restart the Owner Host before running an Agent that uses it.");
}));

$("#create-member-invite").addEventListener("click", () => run(async () => {
  const invite = await window.spsDesktop.createMemberInvite();
  memberInviteCode = invite.code;
  if (invite.membershipRecovered) {
    setNotice("Owner membership was repaired and the SPS2 invitation is ready to copy.");
  } else {
    setNotice("전체 SPS2 초대 코드를 만들었습니다. 팀원에게 그대로 전달하세요.");
  }
}));

$("#copy-member-invite").addEventListener("click", () => run(async () => {
  if (!memberInviteCode) throw new Error("먼저 팀원 초대를 만드세요.");
  await window.spsDesktop.copyText({ text: memberInviteCode });
  setNotice("전체 SPS2 초대 코드를 복사했습니다.");
}));

$("#owner-open-workspace").addEventListener("click", () => run(async () => {
  await window.spsDesktop.openWorkspace();
}));

$("#create-owner-server").addEventListener("click", () => run(async () => {
  setNotice("이 컴퓨터에 SPS Server와 Owner Vault를 준비하고 있습니다.");
  await window.spsDesktop.createOwnerServer();
  await window.spsDesktop.openWorkspace();
}));

$("#show-join-server").addEventListener("click", () => {
  const form = $("#join-server-form");
  form.hidden = !form.hidden;
  if (!form.hidden) $("#invite-code").focus();
});

$("#join-server-form").addEventListener("submit", (event) => run(async () => {
  event.preventDefault();
  await window.spsDesktop.joinServer({
    code: $("#invite-code").value,
    hub: pendingJoinHub ?? undefined,
  });
  pendingJoinHub = null;
  setNotice("브라우저에서 초대를 수락한 뒤 이 창에서 서버 접근을 계속하세요.");
}));

$("#complete-server-access").addEventListener("click", () => run(async () => {
  await window.spsDesktop.startAuth();
  setNotice("브라우저에서 서버 접근을 완료한 뒤 이 창으로 돌아오세요.");
}));

$("#check-server-access").addEventListener("click", () => run(async () => {
  const result = await window.spsDesktop.pollAuth();
  if (result.auth?.status !== "approved") throw new Error("서버 접근 확인이 아직 완료되지 않았습니다.");
  setNotice("SPS Server 접근을 확인했습니다.");
}));

$("#choose-default-workspace").addEventListener("click", () => run(async () => {
  const workspacePath = await window.spsDesktop.chooseProjectWorkspace();
  if (!workspacePath) return;
  await window.spsDesktop.saveDefaultWorkspace({ workspacePath });
  setNotice("Default local task folder saved.");
}));

$("#clear-default-workspace").addEventListener("click", () => run(async () => {
  await window.spsDesktop.saveDefaultWorkspace({ workspacePath: "" });
  setNotice("Default local task folder cleared.");
}));

$("#project-folder-list").addEventListener("click", (event) => run(async () => {
  const button = event.target.closest("button[data-project-id]");
  if (!button) return;
  const projectId = button.dataset.projectId;
  if (!projectId) throw new Error("The SPS project folder selection is incomplete.");
  if (button.dataset.action === "clear") {
    await window.spsDesktop.saveProjectWorkspace({ projectId, workspacePath: "" });
    setNotice("Project folder cleared.");
    return;
  }
  if (button.dataset.action === "share") {
    await window.spsDesktop.manageHostProjectSource({ projectId });
    setNotice("Project source access updated for the selected SPS Member Node.");
    return;
  }
  const workspacePath = await window.spsDesktop.chooseProjectWorkspace();
  if (!workspacePath) return;
  await window.spsDesktop.saveProjectWorkspace({ projectId, workspacePath });
  setNotice("Project source folder saved on this Owner Host.");
}));

$("#open-workspace-from-folders").addEventListener("click", () => run(async () => {
  await window.spsDesktop.openWorkspace();
}));

window.spsDesktop.onDesktopAccountChanged((status) => {
  render(status);
  if (account(status).signedIn) {
    setNotice("SPS account is confirmed. Choose whether this computer creates or joins an SPS Server.");
  } else if (account(status).lastAttempt?.status === "failed") {
    setNotice(account(status).lastAttempt.error ?? "SPS sign-in did not finish.", true);
  }
});

window.spsDesktop.readyForJoinLink().then((join) => {
  if (!join) return;
  $("#invite-code").value = join.code;
  pendingJoinHub = join.hub ?? null;
  $("#join-server-form").hidden = false;
  $("#invite-code").focus();
  if (join.error) queueMicrotask(() => setNotice(join.error, true));
  setNotice("초대 코드가 입력되었습니다. SPS 로그인 후 참여를 계속하세요.");
});

window.spsDesktop.onJoinLink((join) => {
  $("#invite-code").value = join.code;
  pendingJoinHub = join.hub ?? null;
  $("#join-server-form").hidden = false;
  $("#invite-code").focus();
  if (join.error) queueMicrotask(() => setNotice(join.error, true));
  setNotice("초대 코드가 입력되었습니다. 참여를 계속하세요.");
});

await refreshStatus();
