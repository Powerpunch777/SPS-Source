const escapeHtml = (value) => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#039;");

const taskStatusLabel = (status) => ({
  backlog: "대기",
  todo: "대기",
  pending: "대기",
  queued: "대기",
  running: "작업 중",
  in_progress: "작업 중",
  in_review: "검토 대기",
  blocked: "작업 불가",
  done: "완료",
  cancelled: "취소"
}[String(status || "").toLowerCase()] || "상태 미정");

const fileStatusLabel = (status) => ({
  added: "추가",
  modified: "수정",
  deleted: "삭제",
  renamed: "이름 변경",
  untracked: "새 파일"
}[String(status || "").toLowerCase()] || "변경");

const roomRoleLabel = (name, role) => {
  const normalizedName = String(name || "").toLowerCase();
  if (normalizedName.includes("code worker")) return "코드 워커";
  if (normalizedName.includes("image worker")) return "이미지 워커";
  if (normalizedName.includes("voice worker")) return "보이스 워커";
  if (normalizedName.includes("qa worker")) return "QA 워커";
  if (normalizedName.includes("document worker")) return "문서 워커";
  if (normalizedName.includes("manager")) return "매니저";
  if (normalizedName.includes("designer")) return "디자이너";
  if (normalizedName.includes("cto")) return "CTO";
  return ({ ceo: "매니저", cto: "CTO", designer: "디자이너", engineer: "코드 워커", qa: "QA 워커", general: "워커" }[role] || "Agent");
};

const chronologicalComments = (comments) => [...(comments || [])].sort((left, right) => {
  const leftTime = Date.parse(left?.createdAt || "") || 0;
  const rightTime = Date.parse(right?.createdAt || "") || 0;
  return leftTime - rightTime;
});

const renderMessageBody = (body) => escapeHtml(body).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
const isReasoningSummary = (comment) => String(comment?.body || "").includes("· 생각 요약**");

const STYLES = `
  :host {
    --ink: #182230;
    --muted: #64748b;
    --line: #d9e2ec;
    --panel: #ffffff;
    --panel-subtle: #f8fafc;
    --blue: #2563eb;
    --blue-soft: #eff6ff;
    --green: #166534;
    --green-soft: #f0fdf4;
    --amber: #92400e;
    --amber-soft: #fffbeb;
    --red: #b42318;
    --red-soft: #fef3f2;
    display: block;
    color: var(--ink);
    font: 13px/1.5 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  *, *::before, *::after { box-sizing: border-box; }
  .wrap { max-width: 1160px; margin: 0 auto; padding: 28px 24px 48px; }
  .top { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; padding-bottom: 18px; border-bottom: 1px solid var(--line); }
  .eyebrow { margin-bottom: 4px; color: var(--muted); font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
  h2 { margin: 0; color: var(--ink); font-size: 23px; line-height: 1.2; letter-spacing: 0; }
  h3 { margin: 0; color: var(--ink); font-size: 14px; line-height: 1.3; }
  .muted { color: var(--muted); font-size: 12px; }
  .subcopy { max-width: 680px; margin: 7px 0 0; color: var(--muted); font-size: 13px; }
  .status-pill { display: inline-flex; align-items: center; min-height: 28px; padding: 4px 9px; border: 1px solid #bfdbfe; border-radius: 999px; background: var(--blue-soft); color: #1d4ed8; font-size: 12px; font-weight: 700; white-space: nowrap; }
  .status-pill.ready { border-color: #bbf7d0; background: var(--green-soft); color: var(--green); }
  .status-pill.waiting { border-color: #fde68a; background: var(--amber-soft); color: var(--amber); }
  .notice, .error, .empty, .panel { margin: 18px 0; border: 1px solid var(--line); border-radius: 8px; background: var(--panel); }
  .notice { padding: 11px 13px; border-color: #fde68a; background: var(--amber-soft); color: var(--amber); }
  .error { padding: 11px 13px; border-color: #fecaca; background: var(--red-soft); color: var(--red); }
  .activity { display: grid; gap: 10px; margin: 18px 0; padding: 14px 15px; border: 1px solid #bfdbfe; border-radius: 8px; background: #f8fbff; }
  .activity-header { display: flex; align-items: center; gap: 8px; color: #1e3a8a; font-size: 13px; font-weight: 800; }
  .activity-pulse { width: 8px; height: 8px; border-radius: 50%; background: #2563eb; animation: room-working-pulse 1.2s ease-in-out infinite; }
  .activity-list { display: grid; gap: 6px; }
  .activity-step { display: grid; grid-template-columns: 6px minmax(0, 1fr); column-gap: 8px; color: #475569; font-size: 12px; }
  .activity-step::before { grid-row: 1 / span 2; align-self: start; content: ""; width: 6px; height: 6px; margin-top: 5px; border: 1px solid #94a3b8; border-radius: 50%; }
  .activity-step.working { color: #1d4ed8; font-weight: 700; }
  .activity-step.working::before { border-color: #2563eb; background: #2563eb; }
  .activity-summary { margin-top: 4px; color: #475569; font-weight: 400; white-space: pre-wrap; }
  @keyframes room-working-pulse { 50% { opacity: .35; transform: scale(.8); } }
  .empty { padding: 22px; border-style: dashed; color: var(--muted); text-align: center; }
  .panel { padding: 16px; }
  .setup { display: grid; gap: 9px; margin: 18px 0; }
  label, .field-label { color: #475569; font-size: 12px; font-weight: 700; }
  input, textarea, select { width: 100%; min-width: 0; color: var(--ink); background: #fff; border: 1px solid #cbd5e1; border-radius: 6px; padding: 9px 10px; font: inherit; outline: none; }
  input:focus, textarea:focus, select:focus { border-color: #60a5fa; box-shadow: 0 0 0 3px rgba(59, 130, 246, .13); }
  textarea { min-height: 108px; resize: vertical; }
  textarea.rule-editor { min-height: 420px; font: 13px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  button { border: 1px solid var(--blue); border-radius: 6px; padding: 8px 12px; color: #fff; background: var(--blue); font: inherit; font-weight: 700; cursor: pointer; }
  button:hover:not(:disabled) { background: #1d4ed8; }
  button.secondary { color: #334155; border-color: #cbd5e1; background: #fff; }
  button.secondary:hover:not(:disabled) { background: #f8fafc; }
  button:disabled { opacity: .55; cursor: wait; }
  .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 2px; }
  .chat { display: grid; gap: 8px; margin: 18px 0; }
  .chat-header { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 24px; }
  .msg { padding: 12px 13px; border: 1px solid var(--line); border-radius: 7px; background: var(--panel); color: #334155; white-space: pre-wrap; overflow-wrap: anywhere; }
  .msg strong { color: #1d4ed8; }
  .msg.reasoning-summary { border-color: #bfdbfe; background: #f8fbff; }
  .checkpoint { margin: 18px 0; padding: 14px 15px; border: 1px solid #bfdbfe; border-radius: 8px; background: var(--blue-soft); }
  .checkpoint pre { margin: 8px 0 0; color: #334155; white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; }
  .metrics { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin: 18px 0; }
  .metric { padding: 12px 13px; border: 1px solid var(--line); border-radius: 8px; background: var(--panel-subtle); }
  .metric-label { color: var(--muted); font-size: 11px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
  .metric-value { margin-top: 3px; color: var(--ink); font-size: 14px; font-weight: 700; overflow-wrap: anywhere; }
  .group { margin: 24px 0; }
  .group-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
  .group-count { color: var(--muted); font-size: 12px; font-weight: 700; }
  .room-grid, .task-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .issue-list { display: grid; gap: 8px; }
  .issue-link, .room-card { display: flex; min-width: 0; color: inherit; text-decoration: none; border: 1px solid var(--line); border-radius: 8px; background: var(--panel); transition: border-color .15s ease, box-shadow .15s ease, transform .15s ease; }
  .issue-link { padding: 13px; }
  .room-card { align-items: flex-start; gap: 11px; padding: 14px; }
  .issue-link:hover, .room-card:hover { border-color: #93c5fd; box-shadow: 0 5px 16px rgba(15, 23, 42, .08); transform: translateY(-1px); }
  .room-avatar { display: grid; flex: 0 0 34px; width: 34px; height: 34px; place-items: center; border-radius: 50%; background: #e0ecff; color: #1d4ed8; font-size: 12px; font-weight: 800; }
  .issue-body { min-width: 0; flex: 1; }
  .issue-kicker { color: var(--muted); font-size: 11px; font-weight: 700; }
  .issue-title { margin-top: 1px; color: var(--ink); font-weight: 800; overflow-wrap: anywhere; }
  .issue-meta { margin-top: 5px; color: var(--muted); font-size: 12px; overflow-wrap: anywhere; }
  .issue-status { display: inline-flex; margin-top: 8px; padding: 2px 7px; border-radius: 999px; background: #f1f5f9; color: #475569; font-size: 11px; font-weight: 700; }
  .compact-link { display: block; padding: 16px; color: inherit; text-decoration: none; border: 1px solid var(--line); border-radius: 8px; background: var(--panel-subtle); }
  .compact-link:hover { border-color: #93c5fd; background: var(--blue-soft); }
  .project-select { display: grid; grid-template-columns: minmax(0, 360px); gap: 8px; margin: 18px 0; }
  @media (max-width: 720px) {
    .wrap { padding: 20px 16px 36px; }
    .top { align-items: flex-start; flex-direction: column; gap: 10px; }
    .metrics, .room-grid, .task-grid { grid-template-columns: 1fr; }
    .status-pill { white-space: normal; }
    .actions { justify-content: stretch; }
    .actions button { flex: 1; }
  }
`;

const ROOM_TASK_SUMMARY_STYLES = `
  :host { display: block; color: #182230; font: 12px/1.45 Inter, ui-sans-serif, system-ui, sans-serif; }
  * { box-sizing: border-box; }
  .card { margin-top: 14px; padding-top: 14px; border-top: 1px solid #e2e8f0; }
  .heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  h3 { margin: 0; color: #334155; font-size: 11px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; }
  .count { display: inline-flex; min-width: 22px; justify-content: center; padding: 2px 6px; border-radius: 999px; background: #eff6ff; color: #1d4ed8; font-size: 11px; font-weight: 800; }
  .copy { margin: 5px 0 10px; color: #64748b; font-size: 11px; }
  .list { display: grid; gap: 6px; }
  .task { display: block; padding: 8px; color: inherit; text-decoration: none; border: 1px solid #e2e8f0; border-radius: 6px; background: #fff; }
  .task:hover { border-color: #93c5fd; background: #f8fbff; }
  .id { color: #64748b; font-size: 10px; font-weight: 700; }
  .title { margin-top: 1px; color: #334155; font-size: 12px; font-weight: 700; overflow-wrap: anywhere; }
  .meta { margin-top: 4px; color: #64748b; font-size: 10px; overflow-wrap: anywhere; }
  .empty { padding: 9px; border: 1px dashed #cbd5e1; border-radius: 6px; color: #64748b; text-align: center; }
  .all { display: block; margin-top: 9px; color: #1d4ed8; font-size: 11px; font-weight: 700; text-decoration: none; }
  .all:hover { text-decoration: underline; }
`;

const ROOM_WORKSPACE_STYLES = `
  :host { display: block; color: #182230; font: 14px/1.55 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  *, *::before, *::after { box-sizing: border-box; }
  .workspace { display: grid; grid-template-columns: minmax(0, 1fr) 332px; gap: 32px; max-width: 1380px; height: calc(100dvh - 88px); min-height: 0; margin: 0 auto; overflow: hidden; padding: 24px 28px 28px; }
  .conversation { min-width: 0; min-height: 0; display: flex; flex-direction: column; }
  .room-list-link { display: inline-flex; align-self: flex-start; margin-bottom: 14px; color: #1d4ed8; font-size: 12px; font-weight: 800; text-decoration: none; }
  .room-list-link:hover { text-decoration: underline; }
  .conversation-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 54px; padding-bottom: 16px; border-bottom: 1px solid #e2e8f0; }
  .eyebrow { margin-bottom: 3px; color: #64748b; font-size: 11px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; }
  h1 { margin: 0; color: #182230; font-size: 20px; line-height: 1.2; }
  h2 { margin: 0; color: #334155; font-size: 13px; line-height: 1.3; }
  .subcopy { margin: 4px 0 0; color: #64748b; font-size: 12px; }
  .badge { display: inline-flex; align-items: center; min-height: 24px; padding: 3px 8px; border: 1px solid #dbeafe; border-radius: 999px; background: #eff6ff; color: #1d4ed8; font-size: 11px; font-weight: 800; white-space: nowrap; }
  .badge.ready { border-color: #bbf7d0; background: #f0fdf4; color: #166534; }
  .timeline-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 22px 0 10px; }
  .muted { color: #64748b; font-size: 12px; }
  .messages { display: grid; flex: 1; min-height: 0; align-content: start; gap: 12px; overflow-y: auto; overscroll-behavior: contain; padding-right: 12px; scrollbar-gutter: stable; }
  .message { padding: 14px 2px; border-bottom: 1px solid #eef2f7; color: #334155; white-space: pre-wrap; overflow-wrap: anywhere; }
  .empty { display: grid; min-height: 240px; place-items: center; padding: 24px; color: #64748b; text-align: center; }
  .notice { margin: 16px 0; padding: 10px 12px; border-left: 3px solid #f59e0b; background: #fffbeb; color: #92400e; font-size: 12px; }
  .error { margin: 16px 0; padding: 11px 13px; border: 1px solid #fecaca; border-radius: 6px; background: #fef3f2; color: #b42318; }
  .composer, .setup { margin-top: 20px; padding-top: 14px; border-top: 1px solid #e2e8f0; }
  .composer label, .setup label { display: block; color: #475569; font-size: 12px; font-weight: 800; }
  textarea, input { width: 100%; margin-top: 8px; color: #182230; border: 1px solid #cbd5e1; border-radius: 6px; background: #fff; padding: 10px; font: inherit; outline: none; }
  textarea { min-height: 116px; resize: vertical; }
  input:focus, textarea:focus { border-color: #60a5fa; box-shadow: 0 0 0 3px rgba(59, 130, 246, .13); }
  .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 10px; }
  button { border: 1px solid #2563eb; border-radius: 6px; padding: 8px 12px; color: #fff; background: #2563eb; font: inherit; font-weight: 800; cursor: pointer; }
  button.secondary { color: #334155; border-color: #cbd5e1; background: #fff; }
  button:disabled { opacity: .55; cursor: wait; }
  .context { align-self: stretch; min-height: 0; display: grid; gap: 0; overflow-y: auto; overscroll-behavior: contain; border-left: 1px solid #e2e8f0; padding-left: 22px; padding-right: 8px; scrollbar-gutter: stable; }
  .context-card { padding: 16px 0; border-bottom: 1px solid #e2e8f0; background: transparent; }
  .context-card:first-child { padding-top: 0; }
  .context-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
  .context-title { color: #475569; font-size: 11px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; }
  .definition { display: grid; gap: 8px; }
  .definition-row { display: grid; grid-template-columns: 84px minmax(0, 1fr); gap: 8px; }
  .definition-label { color: #94a3b8; font-size: 11px; font-weight: 700; }
  .definition-value { color: #334155; font-size: 12px; font-weight: 700; overflow-wrap: anywhere; }
  .task-list, .file-list { display: grid; gap: 6px; }
  .task { display: block; padding: 8px 0; color: inherit; text-decoration: none; border-bottom: 1px solid #f1f5f9; }
  .task:last-child { border-bottom: 0; }
  .task:hover .task-name { color: #1d4ed8; }
  .task-id, .file-meta { color: #94a3b8; font-size: 10px; font-weight: 700; }
  .task-name, .file-path { margin-top: 1px; color: #334155; font-size: 12px; font-weight: 800; overflow-wrap: anywhere; }
  .task-meta { margin-top: 3px; color: #64748b; font-size: 10px; overflow-wrap: anywhere; }
  .file-row { padding: 8px 0; border-bottom: 1px solid #f1f5f9; }
  .file-row:last-child { border-bottom: 0; }
  .file-meta { display: flex; justify-content: space-between; gap: 8px; }
  .file-kind { color: #64748b; font-size: 10px; }
  .empty-small { color: #94a3b8; font-size: 12px; }
  .link { display: block; margin-top: 10px; color: #1d4ed8; font-size: 12px; font-weight: 800; text-decoration: none; }
  .link:hover { text-decoration: underline; }
  .selection { max-width: 680px; margin: 72px auto; padding: 28px; border: 1px dashed #cbd5e1; border-radius: 8px; text-align: center; }
  .selection h1 { font-size: 20px; }
  .room-picker { max-width: 860px; margin: 32px auto; }
  .room-picker-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding-bottom: 18px; border-bottom: 1px solid #e2e8f0; }
  .room-picker-header h1 { font-size: 23px; }
  .room-picker-list { margin-top: 18px; border-top: 1px solid #e2e8f0; }
  .room-option { display: grid; grid-template-columns: 38px minmax(0, 1fr) auto; align-items: center; gap: 12px; padding: 13px 4px; color: inherit; border-bottom: 1px solid #e2e8f0; text-decoration: none; }
  .room-option:hover { background: #f8fafc; }
  .room-avatar { display: grid; width: 34px; height: 34px; place-items: center; border-radius: 50%; background: #e0ecff; color: #1d4ed8; font-size: 12px; font-weight: 800; }
  .room-option-name { color: #182230; font-size: 14px; font-weight: 800; overflow-wrap: anywhere; }
  .room-option-meta { margin-top: 2px; color: #64748b; font-size: 12px; }
  .room-option-open { color: #1d4ed8; font-size: 12px; font-weight: 800; }
  @media (max-width: 980px) { .workspace { grid-template-columns: 1fr; height: auto; overflow: visible; padding: 20px 20px 36px; } .messages { min-height: 260px; max-height: 52dvh; } .context { align-self: auto; min-height: auto; max-height: none; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 20px; overflow: visible; border-left: 0; border-top: 1px solid #e2e8f0; padding: 18px 0 0; } }
  @media (max-width: 640px) { .workspace { padding: 18px 16px 32px; } .conversation-header, .room-picker-header { align-items: flex-start; flex-direction: column; } .context { grid-template-columns: 1fr; } .actions button { flex: 1; } }
`;

const PROJECT_ROOMS_STYLES = `
  :host { display: block; color: #182230; font: 14px/1.5 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  *, *::before, *::after { box-sizing: border-box; }
  .shell { max-width: 900px; margin: 0 auto; padding: 28px 28px 48px; }
  .header { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; padding-bottom: 20px; border-bottom: 1px solid #e2e8f0; }
  .eyebrow { margin-bottom: 4px; color: #64748b; font-size: 11px; font-weight: 800; letter-spacing: .07em; text-transform: uppercase; }
  h1 { margin: 0; color: #182230; font-size: 23px; line-height: 1.25; }
  h2 { margin: 0; color: #334155; font-size: 13px; }
  .subcopy { margin: 6px 0 0; color: #64748b; font-size: 13px; }
  .task-link { display: inline-flex; align-items: center; min-height: 34px; padding: 6px 10px; color: #334155; border: 1px solid #cbd5e1; border-radius: 6px; background: #fff; font-size: 12px; font-weight: 800; text-decoration: none; white-space: nowrap; }
  .task-link:hover { border-color: #93c5fd; background: #eff6ff; color: #1d4ed8; }
  .section-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 28px 0 8px; }
  .count { color: #64748b; font-size: 12px; font-weight: 700; }
  .room-list { border-top: 1px solid #e2e8f0; }
  .room { display: grid; grid-template-columns: 38px minmax(0, 1fr) auto; align-items: center; gap: 12px; padding: 14px 4px; color: inherit; border-bottom: 1px solid #e2e8f0; text-decoration: none; }
  .room:hover { background: #f8fafc; }
  .avatar { display: grid; width: 34px; height: 34px; place-items: center; border-radius: 50%; background: #e0ecff; color: #1d4ed8; font-size: 12px; font-weight: 800; }
  .room-name { color: #182230; font-size: 14px; font-weight: 800; overflow-wrap: anywhere; }
  .room-meta { margin-top: 2px; color: #64748b; font-size: 12px; }
  .open { color: #1d4ed8; font-size: 12px; font-weight: 800; }
  .empty, .error { margin-top: 16px; padding: 20px; border: 1px dashed #cbd5e1; border-radius: 8px; color: #64748b; text-align: center; }
  .error { border-color: #fecaca; color: #b42318; background: #fef3f2; }
  @media (max-width: 640px) { .shell { padding: 20px 16px 36px; } .header { align-items: flex-start; flex-direction: column; gap: 12px; } .task-link { width: 100%; justify-content: center; } }
`;

class RoomChatTabElement extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._pluginSlot = null;
    this._pluginContext = null;
    this._data = null;
    this._mode = null;
    this._loading = false;
    this._busy = false;
    this._error = null;
  }

  set pluginSlot(value) { this._pluginSlot = value; this._load(); }
  get pluginSlot() { return this._pluginSlot; }
  set pluginContext(value) { this._pluginContext = value; this._load(); }
  get pluginContext() { return this._pluginContext; }
  connectedCallback() { this._load(); }

  async _request(kind, params) {
    const pluginId = this._pluginSlot?.pluginId || "local.room-chat";
    const companyId = this._pluginContext?.companyId;
    const url = `/api/plugins/${pluginId}/${kind === "data" ? "data" : "actions"}/${kind === "data" ? "room-chat-view" : kind}`;
    const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ companyId, params }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || payload.error || `HTTP ${response.status}`);
    return payload.data ?? payload.result ?? payload;
  }

  async _load() {
    const context = this._pluginContext;
    if (!context?.companyId || !context?.entityId || this._loading) { this._render(); return; }
    this._loading = true; this._error = null; this._render();
    try { this._data = await this._request("data", { companyId: context.companyId, issueId: context.entityId }); }
    catch (error) { this._error = error; }
    finally { this._loading = false; this._render(); }
  }

  async _bootstrap() {
    const input = this.shadowRoot.querySelector("#working-directory");
    await this._run("room-bootstrap", { issueId: this._pluginContext.entityId, workingDirectory: input?.value || "" });
  }

  async _send() {
    const input = this.shadowRoot.querySelector("#message");
    const message = input?.value?.trim();
    if (!message) return;
    const result = await this._run("room-send", { issueId: this._pluginContext.entityId, message });
    if (result?.ok) input.value = "";
  }

  async _compact() { await this._run("room-compact", { issueId: this._pluginContext.entityId }); }

  async _run(action, params) {
    this._busy = true; this._error = null; this._render();
    try {
      const result = await this._request(action, params);
      if (result?.ok === false) throw new Error(result.message || result.code || "Room action failed.");
      await this._load();
      return result;
    } catch (error) { this._error = error; this._render(); return null; }
    finally { this._busy = false; this._render(); }
  }

  _render() {
    const root = this.shadowRoot; if (!root) return;
    const data = this._data;
    const state = data?.state;
    const latestCheckpoint = (data?.checkpoints || []).at(-1) || state?.checkpoint || null;
    const pendingTurn = state?.pendingTurn || null;
    const messages = chronologicalComments(data?.comments).map((comment) => `<div class="msg">${renderMessageBody(comment.body)}</div>`).join("");
    const agentName = data?.room?.agentName || data?.room?.title || "Agent";
    const runtimeEnabled = Boolean(data?.runtime?.enabled);
    const status = runtimeEnabled ? "Live chat ready" : "Live runtime off";
    const setup = !state ? `<section class="panel"><div class="field-label">Start this Agent Room</div><p class="subcopy">Initialize once to bind this durable Room to the Agent's configured working directory. No Worker Task is created by this action.</p><div class="setup"><label>Working directory<input id="working-directory" value="" placeholder="Use the Agent directory or enter an absolute local path"></label><div class="actions"><button id="bootstrap" ${this._busy ? "disabled" : ""}>Initialize Room</button></div></div></section>` : "";
    const composer = state ? `<section class="panel"><div class="field-label">Message ${escapeHtml(agentName)}</div><p class="subcopy">Continue the long-lived conversation. Task work stays in a finite Task Room.</p><div class="setup"><textarea id="message" ${this._busy || !runtimeEnabled ? "disabled" : ""} placeholder="Write a message to this Agent..."></textarea><div class="actions"><button class="secondary" id="compact" ${this._busy || !runtimeEnabled ? "disabled" : ""}>Create handoff and compact</button><button id="send" ${this._busy || !runtimeEnabled ? "disabled" : ""}>Send message</button></div></div></section>` : "";
    const checkpoint = latestCheckpoint?.summary ? `<div class="checkpoint"><strong>Latest handoff</strong><div class="muted">${escapeHtml(latestCheckpoint.compactedAt ? "Native compact completed" : "Prepared before native compact")}</div><pre>${escapeHtml(latestCheckpoint.summary)}</pre></div>` : "";
    const recovery = pendingTurn ? `<div class="notice">A previous ${escapeHtml(pendingTurn.kind)} turn did not record a final Room reply. Its source message and Codex thread ID are preserved; ask this Agent to resume or review it.</div>` : "";
    const roomMetrics = state ? `<div class="metrics"><div class="metric"><div class="metric-label">Room</div><div class="metric-value">Long-lived conversation</div></div><div class="metric"><div class="metric-label">Thread</div><div class="metric-value">${state.codexThreadId ? "Connected" : "Not started"}</div></div><div class="metric"><div class="metric-label">Task handling</div><div class="metric-value">Separate Task Rooms</div></div></div>` : "";
    const conversation = state ? `<div class="chat-header"><h3>Conversation</h3><span class="muted">${(data?.comments || []).length} message(s)</span></div><div class="chat">${messages || "<div class=\"empty\">No Room messages yet. Start the conversation here.</div>"}</div>` : "";
    root.innerHTML = `<style>${STYLES}</style><div class="wrap"><div class="top"><div><div class="eyebrow">Agent Room</div><h2>${escapeHtml(agentName)}</h2><p class="subcopy">A durable project conversation for this hired Agent. It stays separate from finite implementation Tasks.</p></div><span class="status-pill ${runtimeEnabled ? "ready" : "waiting"}">${escapeHtml(status)}</span></div>${this._loading ? "<p class=\"muted\">Loading Room...</p>" : ""}${this._error ? `<p class="error">${escapeHtml(this._error.message || this._error)}</p>` : ""}${!data && !this._loading ? "<div class=\"empty\">This tab is available on an unassigned Agent Room.</div>" : ""}${!runtimeEnabled && state ? "<div class=\"notice\">The Room is ready and durable. Enable the configured runtime when you are ready to send live Agent messages.</div>" : ""}${recovery}${roomMetrics}${setup}${checkpoint}${conversation}${composer}</div>`;
    root.querySelector("#bootstrap")?.addEventListener("click", () => this._bootstrap());
    root.querySelector("#send")?.addEventListener("click", () => this._send());
    root.querySelector("#compact")?.addEventListener("click", () => this._compact());
  }
}

class TaskRoomTabElement extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._pluginSlot = null;
    this._pluginContext = null;
    this._data = null;
    this._loading = false;
    this._busy = false;
    this._error = null;
  }

  set pluginSlot(value) { this._pluginSlot = value; this._load(); }
  get pluginSlot() { return this._pluginSlot; }
  set pluginContext(value) { this._pluginContext = value; this._load(); }
  get pluginContext() { return this._pluginContext; }
  connectedCallback() { this._load(); }

  async _request(kind, params) {
    const pluginId = this._pluginSlot?.pluginId || "local.room-chat";
    const companyId = this._pluginContext?.companyId;
    const key = kind === "data" ? "task-room-view" : kind;
    const url = `/api/plugins/${pluginId}/${kind === "data" ? "data" : "actions"}/${key}`;
    const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ companyId, params }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || payload.error || `HTTP ${response.status}`);
    return payload.data ?? payload.result ?? payload;
  }

  async _load() {
    const context = this._pluginContext;
    if (!context?.companyId || !context?.entityId || this._loading) { this._render(); return; }
    this._loading = true; this._error = null; this._render();
    try { this._data = await this._request("data", { companyId: context.companyId, issueId: context.entityId }); }
    catch (error) { this._error = error; }
    finally { this._loading = false; this._render(); }
  }

  async _askOwner() {
    const input = this.shadowRoot.querySelector("#owner-feedback");
    const message = input?.value?.trim();
    if (!message) return;
    this._busy = true; this._error = null; this._render();
    try {
      const result = await this._request("task-request-owner-feedback", { issueId: this._pluginContext.entityId, message });
      if (result?.ok === false) throw new Error(result.message || result.code || "Task feedback request failed.");
      input.value = "";
      await this._load();
    } catch (error) { this._error = error; }
    finally { this._busy = false; this._render(); }
  }

  _render() {
    const root = this.shadowRoot; if (!root) return;
    const data = this._data;
    const state = data?.state;
    const comments = chronologicalComments(data?.comments).map((comment) => `<div class="msg">${renderMessageBody(comment.body)}</div>`).join("");
    const ownerAgent = state?.owningAgentName || state?.owningRole || "Task owner";
    const paths = state?.declaredAffectedPaths?.length ? state.declaredAffectedPaths.join(", ") : "Not declared";
    const review = state?.review?.required === "user" ? "User review required" : "Review not configured";
    const runtimeEnabled = Boolean(data?.runtime?.enabled);
    const worker = data?.worker?.name || state?.workerAgentName || state?.workerAgentId || "Unassigned";
    const composer = state ? `<section class="panel"><div class="field-label">Ask ${escapeHtml(ownerAgent)}</div><p class="subcopy">Use this for scope clarification, a decision, or a review of the current Task result.</p><div class="setup"><textarea id="owner-feedback" ${this._busy || !runtimeEnabled ? "disabled" : ""} placeholder="Write a focused request for the Task owner..."></textarea><div class="actions"><button id="ask-owner" ${this._busy || !runtimeEnabled ? "disabled" : ""}>Request feedback</button></div></div></section>` : "";
    const metrics = state ? `<div class="metrics"><div class="metric"><div class="metric-label">Owner</div><div class="metric-value">${escapeHtml(ownerAgent)}</div></div><div class="metric"><div class="metric-label">Worker</div><div class="metric-value">${escapeHtml(worker)}</div></div><div class="metric"><div class="metric-label">Review</div><div class="metric-value">${escapeHtml(review)}</div></div></div>` : "";
    const contract = state ? `<div class="checkpoint"><strong>Task contract</strong><div class="muted">Affected paths or assets</div><pre>${escapeHtml(paths)}</pre></div>` : "";
    const conversation = state ? `<div class="chat-header"><h3>Task conversation</h3><span class="muted">${(data?.comments || []).length} message(s)</span></div><div class="chat">${comments || "<div class=\"empty\">No Task Room messages yet.</div>"}</div>` : "";
    root.innerHTML = `<style>${STYLES}</style><div class="wrap"><div class="top"><div><div class="eyebrow">Finite Task Room</div><h2>${escapeHtml(data?.task?.title || "Task")}</h2><p class="subcopy">${escapeHtml(data?.task?.identifier || "Task")} / A focused work space owned by ${escapeHtml(ownerAgent)}.</p></div><span class="status-pill ${runtimeEnabled ? "ready" : "waiting"}">${escapeHtml(data?.task?.status || "Task")}</span></div>${this._loading ? "<p class=\"muted\">Loading Task Room...</p>" : ""}${this._error ? `<p class="error">${escapeHtml(this._error.message || this._error)}</p>` : ""}${!data && !this._loading ? "<div class=\"empty\">This tab is available on Tasks created through the Task Room workflow.</div>" : ""}${metrics}${contract}${!runtimeEnabled && state ? "<div class=\"notice\">Task comments are available. Enable the configured runtime before requesting a direct reply from the owner Agent.</div>" : ""}${conversation}${composer}</div>`;
    root.querySelector("#ask-owner")?.addEventListener("click", () => this._askOwner());
  }
}

class RoomTaskSummaryElement extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._pluginSlot = null;
    this._pluginContext = null;
    this._data = null;
    this._loading = false;
  }

  set pluginSlot(value) { this._pluginSlot = value; this._load(); }
  get pluginSlot() { return this._pluginSlot; }
  set pluginContext(value) { this._pluginContext = value; this._load(); }
  get pluginContext() { return this._pluginContext; }
  connectedCallback() { this._load(); }

  async _load() {
    const context = this._pluginContext;
    if (!context?.companyId || !context?.entityId || this._loading) { this._render(); return; }
    this._loading = true;
    this._render();
    try {
      const pluginId = this._pluginSlot?.pluginId || "local.room-chat";
      const response = await fetch(`/api/plugins/${pluginId}/data/room-task-summary`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ companyId: context.companyId, params: { companyId: context.companyId, issueId: context.entityId } })
      });
      const payload = await response.json().catch(() => ({}));
      this._data = response.ok ? (payload.data ?? payload.result ?? payload) : null;
    } finally {
      this._loading = false;
      this._render();
    }
  }

  _issueHref(task) {
    const prefix = String(this._pluginContext?.companyPrefix || "").replace(/^\/+|\/+$/g, "");
    const base = prefix ? `/${encodeURIComponent(prefix)}` : "";
    return `${base}/issues/${encodeURIComponent(task.identifier || task.id)}`;
  }

  _taskBoardHref() {
    const prefix = String(this._pluginContext?.companyPrefix || "").replace(/^\/+|\/+$/g, "");
    const base = prefix ? `/${encodeURIComponent(prefix)}` : "";
    const projectId = this._data?.room?.projectId;
    return `${base}/tasks${projectId ? `?project=${encodeURIComponent(projectId)}` : ""}`;
  }

  _render() {
    const root = this.shadowRoot; if (!root) return;
    const data = this._data;
    if (!data?.room) {
      root.innerHTML = "<style>:host{display:none}</style>";
      return;
    }
    const tasks = data.tasks || [];
    const visibleTasks = tasks.slice(0, 6);
    const rows = visibleTasks.length
      ? visibleTasks.map((task) => {
        const worker = task.assigneeAgent?.name || "Unassigned";
        return `<a class="task" href="${escapeHtml(this._issueHref(task))}"><div class="id">${escapeHtml(task.identifier)}</div><div class="title">${escapeHtml(task.title)}</div><div class="meta">${escapeHtml(task.status)} / ${escapeHtml(worker)}</div></a>`;
      }).join("")
      : "<div class=\"empty\">No Tasks from this Agent Room.</div>";
    const allLink = tasks.length ? `<a class="all" href="${escapeHtml(this._taskBoardHref())}">Open all project Tasks</a>` : "";
    root.innerHTML = `<style>${ROOM_TASK_SUMMARY_STYLES}</style><section class="card"><div class="heading"><h3>Tasks from ${escapeHtml(data.room.title)}</h3><span class="count">${tasks.length}</span></div><p class="copy">${escapeHtml(data.activeTaskCount)} active / ${tasks.length} total</p><div class="list">${rows}</div>${allLink}</section>`;
  }
}

class AgentRoomsPageElement extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._pluginSlot = null;
    this._pluginContext = null;
    this._data = null;
    this._loading = false;
    this._busy = false;
    this._error = null;
    this._activityTimer = null;
    this._activityRefreshing = false;
    this._handlePopState = () => {
      this._data = null;
      this._error = null;
      this._load();
    };
  }

  set pluginSlot(value) { this._pluginSlot = value; this._load(); }
  get pluginSlot() { return this._pluginSlot; }
  set pluginContext(value) { this._pluginContext = value; this._load(); }
  get pluginContext() { return this._pluginContext; }
  connectedCallback() { window.addEventListener("popstate", this._handlePopState); this._load(); }
  disconnectedCallback() { window.removeEventListener("popstate", this._handlePopState); this._stopActivityPolling(); }

  _roomId() { return new URLSearchParams(window.location.search).get("room") || ""; }
  _projectId() { return new URLSearchParams(window.location.search).get("project") || ""; }

  _basePath(path) {
    const prefix = String(this._pluginContext?.companyPrefix || "").replace(/^\/+|\/+$/g, "");
    return `${prefix ? `/${encodeURIComponent(prefix)}` : ""}${path}`;
  }

  async _request(kind, params, dataKey = "room-workspace-view") {
    const pluginId = this._pluginSlot?.pluginId || "local.room-chat";
    const companyId = this._pluginContext?.companyId;
    const url = `/api/plugins/${pluginId}/${kind === "data" ? "data" : "actions"}/${kind === "data" ? dataKey : kind}`;
    const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ companyId, params }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || payload.error || `HTTP ${response.status}`);
    return payload.data ?? payload.result ?? payload;
  }

  _startActivityPolling() {
    this._stopActivityPolling();
    const refresh = () => { void this._refreshRoomActivity(); };
    refresh();
    this._activityTimer = window.setInterval(refresh, 700);
  }

  _stopActivityPolling() {
    if (this._activityTimer !== null) window.clearInterval(this._activityTimer);
    this._activityTimer = null;
  }

  async _refreshRoomActivity() {
    const issueId = this._roomId();
    const roomIsWorking = this._data?.state?.runtime?.activity?.status === "working";
    if ((!this._busy && !roomIsWorking) || this._activityRefreshing || !issueId || !this._pluginContext?.companyId) return;
    this._activityRefreshing = true;
    try {
      this._mode = "room";
      this._data = await this._request("data", { companyId: this._pluginContext.companyId, issueId });
      this._render();
      if (!this._busy && this._data?.state?.runtime?.activity?.status !== "working") this._stopActivityPolling();
    } catch {
      // The action response remains the authoritative error surface.
    } finally {
      this._activityRefreshing = false;
    }
  }

  async _load() {
    const context = this._pluginContext;
    const issueId = this._roomId();
    const projectId = this._projectId();
    if (!context?.companyId || this._loading || (!issueId && !projectId)) { this._render(); return; }
    if (issueId) this._ensureProjectRoomsBackRoute();
    this._loading = true; this._error = null; this._render();
    try {
      if (issueId) {
        this._mode = "room";
        this._data = await this._request("data", { companyId: context.companyId, issueId });
      } else {
        this._mode = "project";
        this._data = await this._request("data", { companyId: context.companyId, projectId }, "project-workplane-view");
      }
    }
    catch (error) { this._error = error; }
    finally { this._loading = false; this._render(); }
  }

  async _run(action, params) {
    this._busy = true; this._error = null; this._render();
    this._startActivityPolling();
    try {
      const result = await this._request(action, params);
      if (result?.ok === false) throw new Error(result.message || result.code || "Room action failed.");
      await this._load();
      return result;
    } catch (error) { this._error = error; this._render(); return null; }
    finally {
      this._busy = false;
      this._render();
      if (this._data?.state?.runtime?.activity?.status === "working") this._startActivityPolling();
      else this._stopActivityPolling();
    }
  }

  async _bootstrap() {
    const input = this.shadowRoot.querySelector("#workspace-directory");
    await this._run("room-bootstrap", { issueId: this._roomId(), workingDirectory: input?.value || "" });
  }

  async _send() {
    const input = this.shadowRoot.querySelector("#workspace-message");
    const message = input?.value?.trim();
    if (!message) return;
    const result = await this._run("room-send", { issueId: this._roomId(), message });
    if (result?.ok) input.value = "";
  }

  async _compact() { await this._run("room-compact", { issueId: this._roomId() }); }

  _issueHref(issue) { return this._basePath(`/issues/${encodeURIComponent(issue.identifier || issue.id)}`); }

  _taskBoardHref() {
    const projectId = this._data?.project?.id || this._data?.room?.projectId;
    return this._basePath(`/tasks${projectId ? `?project=${encodeURIComponent(projectId)}` : ""}`);
  }

  _projectRoomsHref() {
    const projectId = this._data?.project?.id || this._data?.room?.projectId || "";
    if (!projectId) return this._basePath("/projects");
    return this._basePath(`/agent-rooms?project=${encodeURIComponent(projectId)}`);
  }

  _ensureProjectRoomsBackRoute() {
    const roomId = this._roomId();
    const projectId = this._projectId();
    if (!roomId || !projectId) return;
    const routeKey = `${projectId}:${roomId}`;
    const currentState = window.history.state && typeof window.history.state === "object" ? window.history.state : {};
    if (currentState.paperclipRoomChatRouteKey === routeKey && currentState.paperclipRoomChatRouteKind === "room") return;
    const roomPath = this._basePath(`/agent-rooms?room=${encodeURIComponent(roomId)}&project=${encodeURIComponent(projectId)}`);
    const projectRoomsPath = this._basePath(`/agent-rooms?project=${encodeURIComponent(projectId)}`);
    window.history.replaceState({ ...currentState, paperclipRoomChatRouteKey: routeKey, paperclipRoomChatRouteKind: "project_rooms" }, "", projectRoomsPath);
    window.history.pushState({ ...currentState, paperclipRoomChatRouteKey: routeKey, paperclipRoomChatRouteKind: "room" }, "", roomPath);
  }

  _agentRoomHref(room, projectId) {
    const params = new URLSearchParams({ room: room.id });
    if (projectId) params.set("project", projectId);
    return this._basePath(`/agent-rooms?${params.toString()}`);
  }

  _initials(value) {
    const words = String(value || "Agent").trim().split(/\s+/).filter(Boolean);
    if (words.length > 1) return words.slice(0, 2).map((word) => Array.from(word)[0] || "").join("").toUpperCase();
    return Array.from(words[0] || "A").slice(0, 2).join("").toUpperCase();
  }

  _render() {
    const root = this.shadowRoot; if (!root) return;
    const requestedRoomId = this._roomId();
    if (!requestedRoomId) {
      const projectData = this._mode === "project" ? this._data : null;
      const rooms = projectData?.rooms || [];
      const roomRows = rooms.length ? rooms.map((room) => `<a class="room-option" href="${escapeHtml(this._agentRoomHref(room, projectData?.project?.id))}"><div class="room-avatar">${escapeHtml(this._initials(room.title))}</div><div><div class="room-option-name">${escapeHtml(room.title)}</div><div class="room-option-meta">${escapeHtml(roomRoleLabel(room.title, room.agent?.role))} · 장기 대화</div></div><span class="room-option-open">열기</span></a>`).join("") : "<div class=\"empty\">고용된 Agent Room이 아직 없습니다.</div>";
      const projectBody = projectData ? `<div class="room-picker"><header class="room-picker-header"><div><div class="eyebrow">프로젝트 Room</div><h1>${escapeHtml(projectData.project?.name || "프로젝트")}</h1><p class="subcopy">대화할 Agent를 선택하세요. 실제 작업은 Task에서 별도로 관리합니다.</p></div><a class="link" href="${escapeHtml(this._basePath(`/tasks?project=${encodeURIComponent(projectData.project?.id || "")}`))}">Task 보기 · ${escapeHtml(projectData.taskCount || 0)}개</a></header><div class="timeline-heading"><h2>Agent Room</h2><span class="muted">${escapeHtml(rooms.length)}명</span></div><div class="room-picker-list">${roomRows}</div></div>` : "";
      root.innerHTML = `<style>${ROOM_WORKSPACE_STYLES}</style>${this._loading ? "<div class=\"selection\"><span class=\"muted\">Room을 불러오는 중입니다.</span></div>" : ""}${this._error ? `<div class="selection"><div class="error">${escapeHtml(this._error.message || this._error)}</div></div>` : ""}${projectBody || (!this._loading && !this._error ? "<div class=\"selection\"><div class=\"eyebrow\">Agent Room</div><h1>프로젝트를 먼저 선택하세요</h1><p class=\"subcopy\">프로젝트의 Room 메뉴에서 Agent Room을 엽니다.</p></div>" : "")}`;
      return;
    }
    const data = this._data;
    const state = data?.state;
    const runtimeEnabled = Boolean(data?.runtime?.enabled);
    const agentName = data?.room?.agentName || data?.room?.title || "Agent";
    const messages = chronologicalComments(data?.comments).map((comment) => `<div class="msg${isReasoningSummary(comment) ? " reasoning-summary" : ""}">${renderMessageBody(comment.body)}</div>`).join("");
    const activity = state?.runtime?.activity || null;
    const isWorking = this._busy || ["working", "finishing"].includes(activity?.status);
    const activitySteps = (activity?.steps || []).slice(-6);
    const activityRows = (activitySteps.length ? activitySteps : [{ label: "요청을 분석하는 중", status: "working" }])
      .map((step) => `<div class="activity-step ${step.status === "working" ? "working" : ""}"><span>${escapeHtml(step.label)}</span>${step.summary ? `<div class="activity-summary">${escapeHtml(step.summary)}</div>` : ""}</div>`).join("");
    const activityPanel = isWorking ? `<section class="activity"><div class="activity-header"><span class="activity-pulse"></span>Working</div><div class="activity-list">${activityRows}</div></section>` : "";
    const composer = `<section class="panel"><div class="field-label">${escapeHtml(agentName)}에게 메시지</div><p class="subcopy">이 Agent와 장기 대화를 계속합니다. 실제 작업은 별도 Task에서 관리됩니다.</p><div class="setup"><textarea id="workspace-message" ${this._busy || isWorking || !runtimeEnabled ? "disabled" : ""} placeholder="메시지를 입력하세요"></textarea><div class="actions"><button class="secondary" id="compact" ${this._busy || isWorking || !runtimeEnabled ? "disabled" : ""}>대화 정리</button><button id="send" ${this._busy || isWorking || !runtimeEnabled ? "disabled" : ""}>보내기</button></div></div></section>`;
    const runtimeNotice = state && !runtimeEnabled ? "<div class=\"notice\">Room 기록은 준비됐습니다. 실제 Agent 대화는 런타임을 켠 뒤에만 시작됩니다.</div>" : "";
    const pendingNotice = state?.pendingTurn ? "<div class=\"notice\">이전 대화 응답이 복구 대기 중입니다. 보낸 메시지와 Room 연결 정보는 보존됐습니다.</div>" : "";
    const metrics = data ? `<div class="metrics"><div class="metric"><div class="metric-label">Project</div><div class="metric-value">${escapeHtml(data.project?.name || "프로젝트")}</div></div><div class="metric"><div class="metric-label">Role</div><div class="metric-value">${escapeHtml(roomRoleLabel(agentName, data.room.agentRole))}</div></div><div class="metric"><div class="metric-label">Session</div><div class="metric-value">${state?.runtime?.codexThreadId ? "연결됨" : "시작 전"}</div></div></div>` : "";
    const body = data ? `<div class="top"><div><div class="eyebrow">Agent Room</div><h2>${escapeHtml(agentName)}</h2><p class="subcopy">${escapeHtml(data?.project?.name || "프로젝트")} · 장기 대화</p></div><span class="status-pill ${runtimeEnabled ? "ready" : "waiting"}">${runtimeEnabled ? "대화 준비" : "런타임 꺼짐"}</span></div>${runtimeNotice}${pendingNotice}${metrics}<div class="chat-header"><h3>대화</h3><span class="muted">${(data.comments || []).length}개 메시지</span></div><div class="chat">${messages || "<div class=\"empty\">아직 대화가 없습니다. 이 Room에서 Agent와 장기 대화를 시작하세요.</div>"}</div>${activityPanel}${composer}` : "<div class=\"empty\">Agent Room을 불러올 수 없습니다.</div>";
    root.innerHTML = `<style>${STYLES}</style><div class="wrap">${this._loading ? "<p class=\"muted\">Room을 불러오는 중입니다.</p>" : ""}${this._error ? `<div class="error">${escapeHtml(this._error.message || this._error)}</div>` : ""}${body}</div>`;
    root.querySelector("#bootstrap")?.addEventListener("click", () => this._bootstrap());
    root.querySelector("#send")?.addEventListener("click", () => this._send());
    root.querySelector("#compact")?.addEventListener("click", () => this._compact());
  }
}

class ProjectWorkplaneTabElement extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._pluginSlot = null;
    this._pluginContext = null;
    this._data = null;
    this._loading = false;
    this._error = null;
  }

  set pluginSlot(value) { this._pluginSlot = value; this._load(); }
  get pluginSlot() { return this._pluginSlot; }
  set pluginContext(value) { this._pluginContext = value; this._load(); }
  get pluginContext() { return this._pluginContext; }
  connectedCallback() { this._load(); }

  async _load() {
    const context = this._pluginContext;
    if (!context?.companyId || !context?.entityId || this._loading) { this._render(); return; }
    this._loading = true; this._error = null; this._render();
    try {
      const pluginId = this._pluginSlot?.pluginId || "local.room-chat";
      const response = await fetch(`/api/plugins/${pluginId}/data/project-workplane-view`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ companyId: context.companyId, params: { companyId: context.companyId, projectId: context.entityId } })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || payload.error || `HTTP ${response.status}`);
      this._data = payload.data ?? payload.result ?? payload;
    } catch (error) { this._error = error; }
    finally { this._loading = false; this._render(); }
  }

  _issueHref(issue) {
    const prefix = String(this._pluginContext?.companyPrefix || "").replace(/^\/+|\/+$/g, "");
    const base = prefix ? `/${encodeURIComponent(prefix)}` : "";
    return `${base}/issues/${encodeURIComponent(issue.identifier || issue.id)}`;
  }

  _agentRoomHref(issue) {
    const prefix = String(this._pluginContext?.companyPrefix || "").replace(/^\/+|\/+$/g, "");
    const base = prefix ? `/${encodeURIComponent(prefix)}` : "";
    const projectId = this._data?.project?.id || this._pluginContext?.entityId;
    return `${base}/agent-rooms?room=${encodeURIComponent(issue.id)}${projectId ? `&project=${encodeURIComponent(projectId)}` : ""}`;
  }

  _taskBoardHref() {
    const prefix = String(this._pluginContext?.companyPrefix || "").replace(/^\/+|\/+$/g, "");
    const base = prefix ? `/${encodeURIComponent(prefix)}` : "";
    const projectId = this._data?.project?.id || this._pluginContext?.entityId;
    return `${base}/tasks${projectId ? `?project=${encodeURIComponent(projectId)}` : ""}`;
  }

  _initials(value) {
    const words = String(value || "Agent").trim().split(/\s+/).filter(Boolean);
    if (words.length > 1) return words.slice(0, 2).map((word) => Array.from(word)[0] || "").join("").toUpperCase();
    return Array.from(words[0] || "A").slice(0, 2).join("").toUpperCase();
  }

  _roomRow(room) {
    const role = roomRoleLabel(room.title, room.agent?.role);
    return `<a class="room" href="${escapeHtml(this._agentRoomHref(room))}"><div class="avatar">${escapeHtml(this._initials(room.title))}</div><div><div class="room-name">${escapeHtml(room.title)}</div><div class="room-meta">${escapeHtml(role)} · 장기 대화</div></div><span class="open">열기</span></a>`;
  }

  _render() {
    const root = this.shadowRoot; if (!root) return;
    const data = this._data;
    const rooms = data?.rooms || [];
    const roomRows = rooms.length ? rooms.map((room) => this._roomRow(room)).join("") : "<div class=\"empty\">고용된 Agent Room이 아직 없습니다.</div>";
    root.innerHTML = `<style>${PROJECT_ROOMS_STYLES}</style><div class="shell"><header class="header"><div><div class="eyebrow">프로젝트 Room</div><h1>${escapeHtml(data?.project?.name || "프로젝트")}</h1><p class="subcopy">대화할 Agent를 선택하세요. 실제 작업은 Task에서 별도로 관리합니다.</p></div>${data ? `<a class="task-link" href="${escapeHtml(this._taskBoardHref())}">Task 보기 · ${escapeHtml(data.taskCount || 0)}개</a>` : ""}</header>${this._loading ? "<p class=\"subcopy\">Room을 불러오는 중입니다.</p>" : ""}${this._error ? `<p class="error">${escapeHtml(this._error.message || this._error)}</p>` : ""}${data ? `<section><div class="section-heading"><h2>Agent Room</h2><span class="count">${escapeHtml(rooms.length)}명</span></div><div class="room-list">${roomRows}</div></section>` : ""}</div>`;
  }
}

class ProjectTasksPageElement extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._pluginSlot = null;
    this._pluginContext = null;
    this._data = null;
    this._selectedProjectId = null;
    this._loading = false;
    this._error = null;
  }

  set pluginSlot(value) { this._pluginSlot = value; this._load(); }
  get pluginSlot() { return this._pluginSlot; }
  set pluginContext(value) { this._pluginContext = value; this._load(); }
  get pluginContext() { return this._pluginContext; }
  connectedCallback() { this._load(); }

  _basePath(path) {
    const prefix = String(this._pluginContext?.companyPrefix || "").replace(/^\/+|\/+$/g, "");
    return `${prefix ? `/${encodeURIComponent(prefix)}` : ""}${path}`;
  }

  _initialProjectId() {
    return new URLSearchParams(window.location.search).get("project") || null;
  }

  async _load() {
    const context = this._pluginContext;
    if (!context?.companyId || this._loading) { this._render(); return; }
    this._loading = true; this._error = null; this._render();
    try {
      const pluginId = this._pluginSlot?.pluginId || "local.room-chat";
      const projectId = this._selectedProjectId ?? this._initialProjectId();
      const response = await fetch(`/api/plugins/${pluginId}/data/project-tasks-view`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ companyId: context.companyId, params: { companyId: context.companyId, projectId: projectId || "" } })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || payload.error || `HTTP ${response.status}`);
      this._data = payload.data ?? payload.result ?? payload;
      this._selectedProjectId = this._data?.selectedProjectId || null;
    } catch (error) { this._error = error; }
    finally { this._loading = false; this._render(); }
  }

  _issueHref(issue) { return this._basePath(`/issues/${encodeURIComponent(issue.identifier || issue.id)}`); }

  _projectHref(projectId) { return this._basePath(`/tasks?project=${encodeURIComponent(projectId)}`); }

  _ownerLabel(value) {
    return String(value || "Unattached Task").replace(/^\[Agent Room\]\s*/i, "");
  }

  _tasksByProject() {
    if (!this._selectedProjectId) return [];
    const tasks = this._data?.tasks || [];
    const groups = new Map();
    for (const task of tasks) {
      const projectId = task.project?.id || "unknown";
      const group = groups.get(projectId) || { project: task.project || { id: projectId, name: "Unknown Project" }, tasks: [] };
      group.tasks.push(task);
      groups.set(projectId, group);
    }
    return [...groups.values()];
  }

  _taskRow(task) {
    const owner = this._ownerLabel(task.parentRoom?.title);
    const worker = task.assigneeAgent?.name || task.assigneeAgentId || "Unassigned";
    return `<a class="issue-link" href="${escapeHtml(this._issueHref(task))}"><div class="issue-body"><div class="issue-kicker">${escapeHtml(task.identifier)}</div><div class="issue-title">${escapeHtml(task.title)}</div><div class="issue-meta">Owner: ${escapeHtml(owner)} / Worker: ${escapeHtml(worker)}</div><span class="issue-status">${escapeHtml(task.status)}</span></div></a>`;
  }

  _render() {
    const root = this.shadowRoot; if (!root) return;
    const projects = this._data?.projects || [];
    const groups = this._tasksByProject();
    const select = `<div class="project-select"><label>Project<select id="project-filter"><option value="">Select a project</option>${projects.map((project) => `<option value="${escapeHtml(project.id)}" ${project.id === this._selectedProjectId ? "selected" : ""}>${escapeHtml(project.name)}</option>`).join("")}</select></label></div>`;
    const groupsMarkup = !this._selectedProjectId
      ? `<div class="empty">Select a project to view finite Tasks. Agent Rooms are intentionally kept out of this board.</div>`
      : groups.length
      ? groups.map((group) => `<section class="group"><div class="group-heading"><h3>${escapeHtml(group.project.name)}</h3><span class="group-count">${group.tasks.length} Task(s)</span></div><div class="task-grid">${group.tasks.map((task) => this._taskRow(task)).join("")}</div></section>`).join("")
      : `<div class="empty">No Tasks in this project yet.</div>`;
    const taskState = this._selectedProjectId ? `${(this._data?.tasks || []).length} Tasks` : "Select a project";
    const activeTasks = (this._data?.tasks || []).filter((task) => !["done", "cancelled"].includes(task.status)).length;
    const metrics = this._selectedProjectId ? `<div class="metrics"><div class="metric"><div class="metric-label">All Tasks</div><div class="metric-value">${escapeHtml((this._data?.tasks || []).length)}</div></div><div class="metric"><div class="metric-label">Open</div><div class="metric-value">${escapeHtml(activeTasks)}</div></div><div class="metric"><div class="metric-label">Structure</div><div class="metric-value">Finite work only</div></div></div>` : "";
    root.innerHTML = `<style>${STYLES}</style><div class="wrap"><div class="top"><div><div class="eyebrow">Project Tasks</div><h2>Task Board</h2><p class="subcopy">Finite project work only. Long-lived Agent Rooms are managed separately from this board.</p></div><span class="status-pill ${this._selectedProjectId ? "ready" : "waiting"}">${escapeHtml(taskState)}</span></div>${select}${this._loading ? "<p class=\"muted\">Loading Tasks...</p>" : ""}${this._error ? `<p class="error">${escapeHtml(this._error.message || this._error)}</p>` : ""}${metrics}${this._data ? groupsMarkup : ""}</div>`;
    root.querySelector("#project-filter")?.addEventListener("change", (event) => {
      this._selectedProjectId = event.target.value || null;
      const path = this._selectedProjectId ? `/tasks?project=${encodeURIComponent(this._selectedProjectId)}` : "/tasks";
      window.history.replaceState({}, "", this._basePath(path));
      this._load();
    });
  }
}

class ProjectTasksSidebarElement extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._pluginContext = null;
  }

  set pluginContext(value) { this._pluginContext = value; this._render(); }
  get pluginContext() { return this._pluginContext; }
  connectedCallback() { this._render(); }

  _render() {
    const root = this.shadowRoot; if (!root) return;
    const prefix = String(this._pluginContext?.companyPrefix || "").replace(/^\/+|\/+$/g, "");
    const href = `${prefix ? `/${encodeURIComponent(prefix)}` : ""}/tasks`;
    root.innerHTML = `<style>:host{display:block}a{display:block;color:#475569;text-decoration:none;padding:8px 10px;border-radius:6px;font:13px/1.3 system-ui,sans-serif}a:hover{color:#1d4ed8;background:#eff6ff}</style><a href="${escapeHtml(href)}">Project Tasks</a>`;
  }
}

class ProjectWorkplaneLinkElement extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._pluginContext = null;
  }

  set pluginContext(value) { this._pluginContext = value; this._render(); }
  get pluginContext() { return this._pluginContext; }
  connectedCallback() { this._render(); }

  _render() {
    const root = this.shadowRoot; if (!root) return;
    const context = this._pluginContext || {};
    const prefix = String(context.companyPrefix || "").replace(/^\/+|\/+$/g, "");
    const projectId = context.entityId;
    if (!projectId) { root.innerHTML = ""; return; }
    const base = prefix ? `/${encodeURIComponent(prefix)}` : "";
    const href = `${base}/agent-rooms?project=${encodeURIComponent(projectId)}`;
    root.innerHTML = `<style>:host{display:block}a{display:block;color:#64748b;text-decoration:none;padding:6px 8px;border-radius:5px;font:12px/1.3 system-ui,sans-serif}a:hover{color:#1d4ed8;background:#eff6ff}</style><a href="${escapeHtml(href)}">Agent Rooms</a>`;
  }
}

if (!customElements.get("paperclip-room-chat-tab")) customElements.define("paperclip-room-chat-tab", RoomChatTabElement);
if (!customElements.get("paperclip-task-room-tab")) customElements.define("paperclip-task-room-tab", TaskRoomTabElement);
if (!customElements.get("paperclip-room-task-summary")) customElements.define("paperclip-room-task-summary", RoomTaskSummaryElement);
if (!customElements.get("paperclip-agent-rooms-page")) customElements.define("paperclip-agent-rooms-page", AgentRoomsPageElement);
if (!customElements.get("paperclip-project-workplane-tab")) customElements.define("paperclip-project-workplane-tab", ProjectWorkplaneTabElement);
if (!customElements.get("paperclip-project-tasks-page")) customElements.define("paperclip-project-tasks-page", ProjectTasksPageElement);
if (!customElements.get("paperclip-project-tasks-sidebar")) customElements.define("paperclip-project-tasks-sidebar", ProjectTasksSidebarElement);
if (!customElements.get("paperclip-project-workplane-link")) customElements.define("paperclip-project-workplane-link", ProjectWorkplaneLinkElement);
export const RoomChatTab = "paperclip-room-chat-tab";
export const TaskRoomTab = "paperclip-task-room-tab";
export const RoomTaskSummary = "paperclip-room-task-summary";
export const AgentRoomsPage = "paperclip-agent-rooms-page";
export const ProjectWorkplaneTab = "paperclip-project-workplane-tab";
export const ProjectTasksPage = "paperclip-project-tasks-page";
export const ProjectTasksSidebar = "paperclip-project-tasks-sidebar";
export const ProjectWorkplaneLink = "paperclip-project-workplane-link";
