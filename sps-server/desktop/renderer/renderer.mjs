const $ = (selector) => document.querySelector(selector);

let latestStatus = null;
let ownerHostRecoveryTimer = null;
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

function render(status) {
  latestStatus = status;
  renderAccount(status);
  renderServerChoice(status);
  renderWorkspace(status);
  setPending(Boolean(account(status).pending));
  syncOwnerHostRecovery(status);
}

async function refreshStatus() {
  const status = await window.spsDesktop.getStatus();
  render(status);
  if (account(status).signedIn && isOwnerHost(status) && ownerHostReady(status)) {
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
  $("#join-server-form").hidden = false;
  setNotice("초대 코드가 입력되었습니다. SPS 로그인 후 참여를 계속하세요.");
});

window.spsDesktop.onJoinLink((join) => {
  $("#invite-code").value = join.code;
  $("#join-server-form").hidden = false;
  setNotice("초대 코드가 입력되었습니다. 참여를 계속하세요.");
});

await refreshStatus();
