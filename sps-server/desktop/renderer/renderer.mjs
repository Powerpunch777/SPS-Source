const $ = (selector) => document.querySelector(selector);

let latestStatus = null;

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

function renderAccount(status) {
  const desktopAccount = account(status);
  const signedIn = desktopAccount.signedIn === true;
  const configured = desktopAccount.configured === true;
  const pending = desktopAccount.pending === true;
  // A legacy Desktop profile can exist before the SPS Desktop account was
  // introduced. Keep its server connection, but never skip identity setup.
  show($("#account-screen"), !signedIn);
  $("#start-google-account").disabled = pending || !configured;
  $("#google-action-label").textContent = pending ? "Google 로그인 확인 중..." : "Google로 계속";
  const note = $("#account-configuration-note");
  if (!configured) {
    note.textContent = "이 개발 설치에는 Google Desktop 로그인 client ID가 아직 설정되지 않았습니다.";
  } else if (desktopAccount.error) {
    note.textContent = desktopAccount.error;
  } else {
    note.textContent = "";
  }
  show(note, !configured || Boolean(desktopAccount.error));
  show($("#show-google-configuration"), !configured);
}

function renderServerChoice(status) {
  const desktopAccount = account(status);
  const visible = desktopAccount.signedIn === true && !status?.profile;
  show($("#server-choice-screen"), visible);
  $("#account-name").textContent = desktopAccount.name ?? "Google account";
  $("#account-email").textContent = desktopAccount.email ?? "";
  const picture = $("#account-picture");
  if (desktopAccount.picture) {
    picture.src = desktopAccount.picture;
    picture.hidden = false;
  } else {
    picture.removeAttribute("src");
    picture.hidden = true;
  }
}

function renderWorkspace(status) {
  const visible = Boolean(status?.profile) && account(status).signedIn === true;
  show($("#workspace-screen"), visible);
  show($("#open-workspace-header"), visible);
  if (!visible) return;
  const local = isOwnerHost(status);
  const ready = local ? ownerHostReady(status) : Boolean(status.signedIn);
  const workspaceButton = $("#open-workspace");
  const complete = $("#complete-server-access");
  const check = $("#check-server-access");
  $("#workspace-eyebrow").textContent = local ? "YOUR SPS SERVER" : "SPS SERVER";
  if (local && !ready) {
    $("#workspace-title").textContent = "SPS Server를 시작하는 중";
    $("#workspace-detail").textContent = status?.ownerHost?.lastError ?? "Owner Vault와 기본 서비스가 준비되면 Workspace를 열 수 있습니다.";
    workspaceButton.disabled = true;
    show(complete, false);
    show(check, false);
    return;
  }
  if (!local && !status.signedIn) {
    $("#workspace-title").textContent = "서버 접근을 확인하세요";
    $("#workspace-detail").textContent = "브라우저에서 초대를 수락한 같은 Google 계정으로 이 SPS Server 접근을 확인합니다.";
    workspaceButton.disabled = true;
    show(complete, true);
    show(check, Boolean(status.pendingAuth));
    return;
  }
  $("#workspace-title").textContent = local ? "SPS Server 준비됨" : "SPS Workspace 준비됨";
  $("#workspace-detail").textContent = "프로젝트, Rooms, Tasks, Agents와 서버 설정을 엽니다.";
  workspaceButton.disabled = false;
  show(complete, false);
  show(check, false);
}

function render(status) {
  latestStatus = status;
  renderAccount(status);
  renderServerChoice(status);
  renderWorkspace(status);
  const pending = Boolean(account(status).pending);
  setPending(pending);
}

async function refreshStatus() {
  render(await window.spsDesktop.getStatus());
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

$("#start-google-account").addEventListener("click", () => run(async () => {
  await window.spsDesktop.startGoogleAccount();
  setNotice("브라우저에서 Google 로그인을 완료하면 SPS Desktop이 자동으로 이어집니다.");
}));

$("#show-google-configuration").addEventListener("click", () => {
  const form = $("#google-configuration-form");
  form.hidden = !form.hidden;
  if (!form.hidden) $("#google-client-id").focus();
});

$("#google-configuration-form").addEventListener("submit", (event) => run(async () => {
  event.preventDefault();
  await window.spsDesktop.configureGoogleAccount({ clientId: $("#google-client-id").value });
  $("#google-configuration-form").hidden = true;
  $("#google-client-id").value = "";
  setNotice("Google Desktop 로그인 설정을 저장했습니다.");
}));

$("#sign-out-google-account").addEventListener("click", () => run(async () => {
  await window.spsDesktop.signOutGoogleAccount();
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
  await window.spsDesktop.joinServer({ code: $("#invite-code").value });
  setNotice("브라우저에서 초대를 수락한 뒤, 이 창에서 서버 접근을 계속하세요.");
}));

async function openWorkspace() {
  await run(async () => {
    await window.spsDesktop.openWorkspace();
  });
}

$("#open-workspace").addEventListener("click", openWorkspace);
$("#open-workspace-header").addEventListener("click", openWorkspace);
$("#complete-server-access").addEventListener("click", () => run(async () => {
  await window.spsDesktop.startAuth();
  setNotice("브라우저에서 서버 접근을 완료한 뒤 이 창으로 돌아오세요.");
}));
$("#check-server-access").addEventListener("click", () => run(async () => {
  const result = await window.spsDesktop.pollAuth();
  if (result.auth?.status !== "approved") throw new Error("서버 접근 승인이 아직 완료되지 않았습니다.");
  setNotice("SPS Server 접근이 확인되었습니다.");
}));

window.spsDesktop.onDesktopAccountChanged((status) => {
  render(status);
  if (account(status).signedIn) setNotice("Google 계정이 확인되었습니다.");
});

window.spsDesktop.readyForJoinLink().then(async (join) => {
  if (!join) return;
  $("#invite-code").value = join.code;
  $("#join-server-form").hidden = false;
  setNotice("초대 코드가 입력되었습니다. Google 로그인 후 참여를 계속하세요.");
});

window.spsDesktop.onJoinLink((join) => {
  $("#invite-code").value = join.code;
  $("#join-server-form").hidden = false;
  setNotice("초대 코드가 입력되었습니다. 참여를 계속하세요.");
});

await refreshStatus();
