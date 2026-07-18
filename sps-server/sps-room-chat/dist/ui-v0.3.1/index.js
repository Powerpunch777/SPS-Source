// src/ui/RoomWorkplane.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import {
  FileTree,
  MarkdownBlock,
  MarkdownEditor,
  StatusBadge,
  useHostLocation,
  useHostNavigation,
  usePluginAction,
  usePluginData
} from "@paperclipai/plugin-sdk/ui";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var STYLES = `
  .rw-shell { color: var(--foreground, #172033); font: 14px/1.45 system-ui, sans-serif; }
  .rw-layout { display: grid; grid-template-columns: 238px minmax(0, 1fr) 310px; height: min(760px, calc(100dvh - 150px)); min-height: 540px; overflow: hidden; border: 1px solid var(--border, #d8dee9); background: var(--background, #fff); }
  .rw-rooms, .rw-context { min-width: 0; min-height: 0; background: var(--muted, #f7f8fa); overscroll-behavior: contain; }
  .rw-rooms { border-right: 1px solid var(--border, #d8dee9); overflow: auto; }
  .rw-context { border-left: 1px solid var(--border, #d8dee9); overflow: auto; }
  .rw-main { display: grid; grid-template-rows: auto minmax(0, 1fr) auto; min-width: 0; min-height: 0; overflow: hidden; background: var(--background, #fff); }
  .rw-header { min-height: 58px; padding: 12px 16px; border-bottom: 1px solid var(--border, #d8dee9); display: flex; justify-content: space-between; gap: 12px; align-items: center; }
  .rw-title { font-size: 15px; font-weight: 700; margin: 0; }
  .rw-subtitle, .rw-muted { color: var(--muted-foreground, #667085); font-size: 12px; margin: 2px 0 0; }
  .rw-room-list { padding: 8px; }
  .rw-room { display: block; color: inherit; text-decoration: none; border-radius: 6px; padding: 10px; margin-bottom: 3px; }
  .rw-room:hover, .rw-room.active { background: var(--accent, #eaf2ff); }
  .rw-room strong, .rw-room span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rw-room span { color: var(--muted-foreground, #667085); font-size: 12px; margin-top: 2px; }
  .rw-thread { min-height: 0; overflow: auto; overscroll-behavior: contain; padding: 18px clamp(16px, 3vw, 36px); }
  .rw-message { max-width: 860px; margin: 0 auto 18px; }
  .rw-message-label { color: var(--muted-foreground, #667085); font-size: 12px; font-weight: 650; margin-bottom: 5px; }
  .rw-message-body { overflow-wrap: anywhere; }
  .rw-working { max-width: 860px; margin: 0 auto 18px; border-left: 3px solid #2563eb; background: #f4f8ff; padding: 10px 12px; }
  .rw-working strong { display: block; font-size: 13px; }
  .rw-step { margin-top: 6px; font-size: 12px; color: #40516b; }
  .rw-composer { border-top: 1px solid var(--border, #d8dee9); padding: 12px clamp(16px, 3vw, 28px); background: var(--background, #fff); }
  .rw-actions { display: flex; justify-content: flex-end; align-items: center; gap: 8px; margin-top: 8px; }
  .rw-composer-tools { display: flex; align-items: center; gap: 8px; margin-top: 9px; }
  .rw-button { appearance: none; border: 1px solid var(--border, #cfd7e3); background: var(--background, #fff); color: inherit; border-radius: 5px; padding: 7px 10px; cursor: pointer; font: inherit; }
  .rw-button.primary { background: #1d4ed8; border-color: #1d4ed8; color: #fff; }
  .rw-button:disabled { cursor: default; opacity: .55; }
  .rw-file-input { display: none; }
  .rw-attachment-queue, .rw-attachment-list { display: flex; flex-wrap: wrap; gap: 7px; }
  .rw-attachment-queue { margin-top: 9px; }
  .rw-attachment-chip { display: inline-flex; align-items: center; gap: 6px; min-width: 0; max-width: 100%; border: 1px solid var(--border, #d8dee9); border-radius: 5px; padding: 5px 7px; color: inherit; background: var(--muted, #f7f8fa); font-size: 12px; text-decoration: none; }
  .rw-attachment-chip span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rw-attachment-chip small { color: var(--muted-foreground, #667085); white-space: nowrap; }
  .rw-attachment-chip button { border: 0; padding: 0 1px; color: var(--muted-foreground, #667085); background: transparent; cursor: pointer; font: inherit; font-size: 15px; line-height: 1; }
  .rw-attachment-chip img { width: 24px; height: 24px; object-fit: cover; border-radius: 3px; background: #fff; }
  .rw-message-attachments { margin-top: 8px; }
  .rw-context-files { display: grid; gap: 6px; }
  .rw-context-files .rw-attachment-chip { width: 100%; }
  .rw-context-section { padding: 14px; border-bottom: 1px solid var(--border, #d8dee9); }
  .rw-context-section h3 { font-size: 12px; margin: 0 0 9px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted-foreground, #667085); }
  .rw-task { display: block; text-decoration: none; color: inherit; padding: 8px 0; border-top: 1px solid var(--border, #e3e8f0); }
  .rw-task:first-of-type { border-top: 0; }
  .rw-task-title { font-size: 13px; font-weight: 600; }
  .rw-task-meta { color: var(--muted-foreground, #667085); font-size: 11px; margin-top: 2px; }
  .rw-key-value { display: grid; grid-template-columns: 92px minmax(0, 1fr); gap: 5px 8px; font-size: 12px; }
  .rw-key-value dt { color: var(--muted-foreground, #667085); }
  .rw-key-value dd { margin: 0; overflow-wrap: anywhere; }
  .rw-empty, .rw-error { padding: 24px; color: var(--muted-foreground, #667085); }
  .rw-error { color: #b42318; }
  .rw-project { padding: 18px; }
  .rw-project h1 { font-size: 20px; margin: 0 0 3px; }
  .rw-project-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 8px; margin-top: 18px; }
  .rw-project-card { display: block; color: inherit; text-decoration: none; border: 1px solid var(--border, #d8dee9); border-radius: 6px; padding: 12px; background: var(--background, #fff); }
  .rw-project-card:hover { border-color: #2563eb; }
  .rw-project-card p { color: var(--muted-foreground, #667085); font-size: 12px; margin: 4px 0 0; }
  .rw-task-board { padding: 18px; }
  .rw-task-board h1 { font-size: 20px; margin: 0 0 14px; }
  .rw-task-row { display: block; padding: 10px 0; border-bottom: 1px solid var(--border, #e3e8f0); color: inherit; text-decoration: none; }
  .rw-task-row strong, .rw-task-row span { display: block; }
  .rw-task-row span { color: var(--muted-foreground, #667085); font-size: 12px; margin-top: 2px; }
  @media (max-width: 1020px) { .rw-layout { grid-template-columns: 210px minmax(0, 1fr); } .rw-context { display: none; } }
  @media (max-width: 720px) { .rw-layout { display: block; height: auto; min-height: 0; overflow: visible; } .rw-rooms { border-right: 0; border-bottom: 1px solid var(--border, #d8dee9); max-height: 210px; } .rw-main { min-height: 620px; } }
`;
function Style() {
  return /* @__PURE__ */ jsx("style", { children: STYLES });
}
function roomLabel(comment) {
  const body = String(comment?.body || "");
  const match = body.match(/^\*\*([^*]+)\*\*/);
  return match?.[1] || "Conversation";
}
function roomText(comment) {
  return String(comment?.body || "").replace(/^\*\*[^*]+\*\*\s*/m, "");
}
function roomAttachmentIds(comment) {
  const match = String(comment?.body || "").match(/<!--\s*paperclip-room-attachments:([\w,-]+)\s*-->/i);
  return match?.[1]?.split(",").map((id) => id.trim()).filter(Boolean) || [];
}
function attachmentName(attachment) {
  return attachment?.originalFilename || attachment?.filename || "attachment";
}
function attachmentHref(attachment) {
  return attachment?.openPath || attachment?.downloadPath || attachment?.contentPath || `/api/attachments/${encodeURIComponent(attachment?.id || "")}/content`;
}
function attachmentIsImage(attachment) {
  const contentType = String(attachment?.contentType || "").toLowerCase();
  return /^image\/(png|jpe?g|webp|gif|avif|bmp)$/i.test(contentType) || /\.(png|jpe?g|webp|gif|avif|bmp)$/i.test(attachmentName(attachment));
}
function formatBytes(value) {
  const bytes = Number(value) || 0;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}
function AttachmentList({ attachments, className = "" }) {
  if (!attachments?.length) return null;
  return /* @__PURE__ */ jsx("div", { className: `rw-attachment-list ${className}`.trim(), children: attachments.map((attachment) => /* @__PURE__ */ jsxs("a", { className: "rw-attachment-chip", href: attachmentHref(attachment), target: "_blank", rel: "noreferrer", children: [
    attachmentIsImage(attachment) ? /* @__PURE__ */ jsx("img", { src: attachmentHref(attachment), alt: "" }) : null,
    /* @__PURE__ */ jsx("span", { title: attachmentName(attachment), children: attachmentName(attachment) }),
    /* @__PURE__ */ jsx("small", { children: formatBytes(attachment.byteSize) })
  ] }, attachment.id)) });
}
function taskHref(navigation, task) {
  return navigation.resolveHref(`/issues/${encodeURIComponent(task.identifier || task.id)}`);
}
function roomHref(navigation, projectId, roomId) {
  const params = new URLSearchParams({ project: projectId, room: roomId });
  return navigation.resolveHref(`/agent-rooms?${params.toString()}`);
}
function fileNodes(workspaces) {
  return (workspaces || []).flatMap((workspace) => (workspace.files || []).map((file) => ({
    name: `${workspace.name}: ${file.path}`,
    path: `${workspace.id || workspace.name}/${file.path}`,
    kind: "file",
    children: []
  })));
}
function RoomContext({ data, navigation }) {
  const state = data?.state || {};
  const activity = state.runtime?.activity || {};
  const tasks = data?.tasks || [];
  const nodes = fileNodes(data?.workspaces);
  const attachments = data?.attachments || [];
  return /* @__PURE__ */ jsxs("aside", { className: "rw-context", children: [
    /* @__PURE__ */ jsxs("section", { className: "rw-context-section", children: [
      /* @__PURE__ */ jsx("h3", { children: "Tasks" }),
      tasks.length ? tasks.map((task) => /* @__PURE__ */ jsxs("a", { className: "rw-task", ...navigation.linkProps(taskHref(navigation, task)), children: [
        /* @__PURE__ */ jsx("div", { className: "rw-task-title", children: task.title }),
        /* @__PURE__ */ jsxs("div", { className: "rw-task-meta", children: [
          task.identifier,
          " \xB7 ",
          task.status,
          " \xB7 ",
          task.assigneeAgent?.name || "Unassigned"
        ] })
      ] }, task.id)) : /* @__PURE__ */ jsx("div", { className: "rw-muted", children: "No finite Tasks from this Room." })
    ] }),
    /* @__PURE__ */ jsxs("section", { className: "rw-context-section", children: [
      /* @__PURE__ */ jsx("h3", { children: "Changes" }),
      /* @__PURE__ */ jsx(FileTree, { nodes, wrapLabels: true, emptyState: { title: "No workspace changes" } })
    ] }),
    /* @__PURE__ */ jsxs("section", { className: "rw-context-section", children: [
      /* @__PURE__ */ jsx("h3", { children: "Room files" }),
      attachments.length ? /* @__PURE__ */ jsx(AttachmentList, { attachments, className: "rw-context-files" }) : /* @__PURE__ */ jsx("div", { className: "rw-muted", children: "No files attached in this Room." })
    ] }),
    /* @__PURE__ */ jsxs("section", { className: "rw-context-section", children: [
      /* @__PURE__ */ jsx("h3", { children: "Session" }),
      /* @__PURE__ */ jsxs("dl", { className: "rw-key-value", children: [
        /* @__PURE__ */ jsx("dt", { children: "Runtime" }),
        /* @__PURE__ */ jsx("dd", { children: data?.runtime?.enabled ? "Ready" : "Disabled" }),
        /* @__PURE__ */ jsx("dt", { children: "Workspace" }),
        /* @__PURE__ */ jsx("dd", { children: state.workspace?.name || "Not bound" }),
        /* @__PURE__ */ jsx("dt", { children: "Session" }),
        /* @__PURE__ */ jsx("dd", { children: state.runtime?.codexThreadId || "Not started" }),
        /* @__PURE__ */ jsx("dt", { children: "Activity" }),
        /* @__PURE__ */ jsx("dd", { children: activity.status || "idle" }),
        /* @__PURE__ */ jsx("dt", { children: "Checkpoint" }),
        /* @__PURE__ */ jsx("dd", { children: state.checkpoint?.version || 0 })
      ] })
    ] })
  ] });
}
function RoomConversation({ context, roomId, workplane }) {
  const navigation = useHostNavigation();
  const sendRoom = usePluginAction("room-send");
  const compactRoom = usePluginAction("room-compact");
  const { data, loading, error, refresh } = usePluginData("room-workspace-view", { companyId: context.companyId, issueId: roomId });
  const [message, setMessage] = useState("");
  const [queuedAttachments, setQueuedAttachments] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState("");
  const threadRef = useRef(null);
  const followLatestRef = useRef(true);
  const attachmentInputRef = useRef(null);
  const activity = data?.state?.runtime?.activity;
  const working = activity?.status === "working";
  useEffect(() => {
    if (!working) return void 0;
    const timer = setInterval(() => {
      void refresh();
    }, 2e3);
    return () => clearInterval(timer);
  }, [working, refresh]);
  const queueFiles = (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    setQueuedAttachments((current) => [...current, ...files.map((file, index) => ({
      clientId: `${file.name}-${file.lastModified}-${file.size}-${Date.now()}-${index}`,
      file,
      attachmentId: null
    }))]);
    event.target.value = "";
  };
  const removeQueuedAttachment = (clientId) => {
    setQueuedAttachments((current) => current.filter((attachment) => attachment.clientId !== clientId));
  };
  const uploadQueuedAttachments = async () => {
    let resolved = queuedAttachments;
    for (const item of resolved) {
      if (item.attachmentId) continue;
      const form = new FormData();
      form.set("file", item.file, item.file.name);
      const response = await fetch(`/api/companies/${encodeURIComponent(context.companyId)}/issues/${encodeURIComponent(roomId)}/attachments`, {
        method: "POST",
        body: form,
        credentials: "same-origin"
      });
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || `File upload failed (HTTP ${response.status}).`);
      }
      const attachment = await response.json();
      if (!attachment?.id) throw new Error("Paperclip did not return an attachment id.");
      resolved = resolved.map((current) => current.clientId === item.clientId ? { ...current, attachmentId: attachment.id } : current);
      setQueuedAttachments(resolved);
    }
    return resolved.map((attachment) => attachment.attachmentId).filter(Boolean);
  };
  const send = async () => {
    const text = message.trim();
    if (!text && !queuedAttachments.length || submitting || working) return;
    followLatestRef.current = true;
    setSubmitting(true);
    setActionError("");
    try {
      const attachmentIds = await uploadQueuedAttachments();
      await sendRoom({ issueId: roomId, message: text, attachmentIds });
      setMessage("");
      setQueuedAttachments([]);
      await refresh();
    } catch (caught) {
      setActionError(caught?.message || "Room message could not be queued.");
    } finally {
      setSubmitting(false);
    }
  };
  const compact = async () => {
    if (submitting || working) return;
    setSubmitting(true);
    setActionError("");
    try {
      await compactRoom({ issueId: roomId });
      await refresh();
    } catch (caught) {
      setActionError(caught?.message || "Room compact could not be queued.");
    } finally {
      setSubmitting(false);
    }
  };
  const roomName = data?.room?.agentName || data?.room?.title || "Agent";
  const messages = useMemo(() => [...data?.comments || []].sort((left, right) => {
    return new Date(left.createdAt || 0).getTime() - new Date(right.createdAt || 0).getTime();
  }), [data?.comments]);
  const currentProjectId = data?.project?.id || workplane?.project?.id || context.projectId;
  useEffect(() => {
    followLatestRef.current = true;
    setQueuedAttachments([]);
  }, [roomId]);
  useEffect(() => {
    const thread = threadRef.current;
    if (thread && followLatestRef.current) thread.scrollTop = thread.scrollHeight;
  }, [roomId, messages.length, working, activity?.steps?.length]);
  const trackThreadScroll = () => {
    const thread = threadRef.current;
    if (!thread) return;
    followLatestRef.current = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 96;
  };
  if (loading && !data) return /* @__PURE__ */ jsx("div", { className: "rw-empty", children: "Loading Room..." });
  if (error && !data) return /* @__PURE__ */ jsx("div", { className: "rw-error", children: error.message });
  return /* @__PURE__ */ jsxs("div", { className: "rw-layout", children: [
    workplane ? /* @__PURE__ */ jsx(RoomList, { navigation, workplane, projectId: currentProjectId, roomId }) : /* @__PURE__ */ jsx("div", { className: "rw-rooms" }),
    /* @__PURE__ */ jsxs("main", { className: "rw-main", children: [
      /* @__PURE__ */ jsxs("header", { className: "rw-header", children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("h1", { className: "rw-title", children: roomName }),
          /* @__PURE__ */ jsx("p", { className: "rw-subtitle", children: "Long-lived Agent Room" })
        ] }),
        /* @__PURE__ */ jsx(StatusBadge, { label: working ? "Working" : data?.runtime?.enabled ? "Ready" : "Runtime disabled", status: working ? "warning" : data?.runtime?.enabled ? "ok" : "pending" })
      ] }),
      /* @__PURE__ */ jsxs("section", { className: "rw-thread", ref: threadRef, onScroll: trackThreadScroll, children: [
        messages.length ? messages.map((comment) => {
          const attachmentIds = roomAttachmentIds(comment);
          const attachments = attachmentIds.map((id) => (data?.attachments || []).find((attachment) => attachment.id === id)).filter(Boolean);
          return /* @__PURE__ */ jsxs("article", { className: "rw-message", children: [
            /* @__PURE__ */ jsx("div", { className: "rw-message-label", children: roomLabel(comment) }),
            /* @__PURE__ */ jsx(MarkdownBlock, { className: "rw-message-body", content: roomText(comment), enableWikiLinks: true }),
            /* @__PURE__ */ jsx(AttachmentList, { attachments, className: "rw-message-attachments" })
          ] }, comment.id || `${comment.createdAt}-${comment.body}`);
        }) : /* @__PURE__ */ jsx("div", { className: "rw-empty", children: "Start the long-lived conversation with this Agent." }),
        working ? /* @__PURE__ */ jsxs("section", { className: "rw-working", children: [
          /* @__PURE__ */ jsx("strong", { children: "Working" }),
          (activity.steps || []).slice(-8).map((step) => /* @__PURE__ */ jsxs("div", { className: "rw-step", children: [
            step.label,
            step.summary ? `: ${step.summary}` : ""
          ] }, step.id))
        ] }) : null
      ] }),
      /* @__PURE__ */ jsxs("footer", { className: "rw-composer", children: [
        actionError ? /* @__PURE__ */ jsx("div", { className: "rw-error", children: actionError }) : null,
        /* @__PURE__ */ jsx(MarkdownEditor, { value: message, onChange: setMessage, onSubmit: send, bordered: true, placeholder: `${roomName}\uC5D0\uAC8C \uBA54\uC2DC\uC9C0` }),
        /* @__PURE__ */ jsx("input", { ref: attachmentInputRef, className: "rw-file-input", type: "file", multiple: true, onChange: queueFiles }),
        queuedAttachments.length ? /* @__PURE__ */ jsx("div", { className: "rw-attachment-queue", children: queuedAttachments.map((attachment) => /* @__PURE__ */ jsxs("div", { className: "rw-attachment-chip", children: [
          /* @__PURE__ */ jsx("span", { title: attachment.file.name, children: attachment.file.name }),
          /* @__PURE__ */ jsx("small", { children: formatBytes(attachment.file.size) }),
          /* @__PURE__ */ jsx("button", { type: "button", "aria-label": `${attachment.file.name} remove`, onClick: () => removeQueuedAttachment(attachment.clientId), disabled: submitting, children: "\xD7" })
        ] }, attachment.clientId)) }) : null,
        /* @__PURE__ */ jsxs("div", { className: "rw-composer-tools", children: [
          /* @__PURE__ */ jsx("button", { type: "button", className: "rw-button", onClick: () => attachmentInputRef.current?.click(), disabled: submitting || working || !data?.runtime?.enabled, children: "Attach files" }),
          /* @__PURE__ */ jsx("span", { className: "rw-muted", children: "Files are stored in this Room, not the project repository." })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "rw-actions", children: [
          /* @__PURE__ */ jsx("span", { className: "rw-muted", children: "Saved state" }),
          /* @__PURE__ */ jsx("button", { type: "button", className: "rw-button", onClick: compact, disabled: submitting || working || !data?.runtime?.enabled, children: "Compact" }),
          /* @__PURE__ */ jsx("button", { type: "button", className: "rw-button primary", onClick: send, disabled: submitting || working || !message.trim() && !queuedAttachments.length || !data?.runtime?.enabled, children: "Send" })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsx(RoomContext, { data, navigation })
  ] });
}
function RoomList({ navigation, workplane, projectId, roomId }) {
  return /* @__PURE__ */ jsx("aside", { className: "rw-rooms", children: /* @__PURE__ */ jsxs("div", { className: "rw-room-list", children: [
    /* @__PURE__ */ jsx("div", { className: "rw-muted", children: workplane.project?.name || "Project" }),
    (workplane.rooms || []).map((room) => /* @__PURE__ */ jsxs("a", { className: `rw-room ${room.id === roomId ? "active" : ""}`, ...navigation.linkProps(roomHref(navigation, projectId, room.id)), children: [
      /* @__PURE__ */ jsx("strong", { children: room.title }),
      /* @__PURE__ */ jsxs("span", { children: [
        room.agent?.role || "Agent",
        " \xB7 long-lived"
      ] })
    ] }, room.id))
  ] }) });
}
function ProjectRooms({ context, projectId, roomId }) {
  const navigation = useHostNavigation();
  const { data, loading, error } = usePluginData("project-workplane-view", { companyId: context.companyId, projectId });
  if (roomId) return /* @__PURE__ */ jsx(RoomConversation, { context, roomId, workplane: data });
  if (loading) return /* @__PURE__ */ jsx("div", { className: "rw-empty", children: "Loading Rooms..." });
  if (error) return /* @__PURE__ */ jsx("div", { className: "rw-error", children: error.message });
  return /* @__PURE__ */ jsxs("div", { className: "rw-project", children: [
    /* @__PURE__ */ jsx("h1", { children: data?.project?.name || "Project" }),
    /* @__PURE__ */ jsx("p", { className: "rw-muted", children: "Choose an Agent Room. Finite work remains in Tasks." }),
    /* @__PURE__ */ jsx("div", { className: "rw-project-grid", children: (data?.rooms || []).map((room) => /* @__PURE__ */ jsxs("a", { className: "rw-project-card", ...navigation.linkProps(roomHref(navigation, projectId, room.id)), children: [
      /* @__PURE__ */ jsx("strong", { children: room.title }),
      /* @__PURE__ */ jsxs("p", { children: [
        room.agent?.role || "Agent",
        " \xB7 Long-lived conversation"
      ] })
    ] }, room.id)) })
  ] });
}
function AgentRoomsPage({ context }) {
  const location = useHostLocation();
  const query = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const projectId = query.get("project") || context.projectId;
  const roomId = query.get("room");
  if (!projectId && !roomId) return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx(Style, {}),
    /* @__PURE__ */ jsx("div", { className: "rw-empty", children: "Choose a Project to open its Agent Rooms." })
  ] });
  return /* @__PURE__ */ jsxs("div", { className: "rw-shell", children: [
    /* @__PURE__ */ jsx(Style, {}),
    /* @__PURE__ */ jsx(ProjectRooms, { context, projectId, roomId })
  ] });
}
function RoomChatTab({ context }) {
  return /* @__PURE__ */ jsxs("div", { className: "rw-shell", children: [
    /* @__PURE__ */ jsx(Style, {}),
    /* @__PURE__ */ jsx(RoomConversation, { context, roomId: context.entityId })
  ] });
}
function ProjectWorkplaneTab({ context }) {
  return /* @__PURE__ */ jsxs("div", { className: "rw-shell", children: [
    /* @__PURE__ */ jsx(Style, {}),
    /* @__PURE__ */ jsx(ProjectRooms, { context, projectId: context.entityId, roomId: null })
  ] });
}
function RoomTaskSummary({ context }) {
  const navigation = useHostNavigation();
  const { data, loading, error } = usePluginData("room-task-summary", { companyId: context.companyId, issueId: context.entityId });
  if (loading) return /* @__PURE__ */ jsx("div", { className: "rw-empty", children: "Loading Tasks..." });
  if (error) return /* @__PURE__ */ jsx("div", { className: "rw-error", children: error.message });
  return /* @__PURE__ */ jsxs("div", { className: "rw-task-board", children: [
    /* @__PURE__ */ jsx(Style, {}),
    /* @__PURE__ */ jsx("h1", { children: "Room Tasks" }),
    (data?.tasks || []).length ? data.tasks.map((task) => /* @__PURE__ */ jsxs("a", { className: "rw-task-row", ...navigation.linkProps(taskHref(navigation, task)), children: [
      /* @__PURE__ */ jsx("strong", { children: task.title }),
      /* @__PURE__ */ jsxs("span", { children: [
        task.identifier,
        " \xB7 ",
        task.status
      ] })
    ] }, task.id)) : /* @__PURE__ */ jsx("div", { className: "rw-muted", children: "No finite Tasks from this Room." })
  ] });
}
function TaskRoomTab({ context }) {
  const navigation = useHostNavigation();
  const { data, loading, error } = usePluginData("task-room-view", { companyId: context.companyId, issueId: context.entityId });
  if (loading) return /* @__PURE__ */ jsx("div", { className: "rw-empty", children: "Loading Task contract..." });
  if (error) return /* @__PURE__ */ jsx("div", { className: "rw-error", children: error.message });
  return /* @__PURE__ */ jsxs("div", { className: "rw-task-board", children: [
    /* @__PURE__ */ jsx(Style, {}),
    /* @__PURE__ */ jsx("h1", { children: data?.task?.title || "Task" }),
    /* @__PURE__ */ jsx("p", { className: "rw-muted", children: "Use the native Paperclip Task chat for Worker collaboration and review." }),
    /* @__PURE__ */ jsx("a", { className: "rw-button", ...navigation.linkProps(taskHref(navigation, data.task)), children: "Open native Task chat" }),
    /* @__PURE__ */ jsx(MarkdownBlock, { content: `## Task contract

${JSON.stringify(data?.state || {}, null, 2)}` })
  ] });
}
function ProjectTasksPage({ context }) {
  const location = useHostLocation();
  const navigation = useHostNavigation();
  const projectId = new URLSearchParams(location.search).get("project");
  const { data, loading, error } = usePluginData("project-tasks-view", { companyId: context.companyId, projectId: projectId || "" });
  return /* @__PURE__ */ jsxs("div", { className: "rw-task-board", children: [
    /* @__PURE__ */ jsx(Style, {}),
    /* @__PURE__ */ jsx("h1", { children: "Project Tasks" }),
    !projectId ? /* @__PURE__ */ jsx("div", { className: "rw-empty", children: "Choose a Project to view finite Tasks." }) : loading ? /* @__PURE__ */ jsx("div", { className: "rw-empty", children: "Loading Tasks..." }) : error ? /* @__PURE__ */ jsx("div", { className: "rw-error", children: error.message }) : (data?.tasks || []).map((task) => /* @__PURE__ */ jsxs("a", { className: "rw-task-row", ...navigation.linkProps(taskHref(navigation, task)), children: [
      /* @__PURE__ */ jsx("strong", { children: task.title }),
      /* @__PURE__ */ jsxs("span", { children: [
        task.identifier,
        " \xB7 ",
        task.status,
        " \xB7 ",
        task.parentRoom?.title || "No owner Room"
      ] })
    ] }, task.id))
  ] });
}
function ProjectTasksSidebar() {
  const navigation = useHostNavigation();
  return /* @__PURE__ */ jsx("a", { className: "rw-room", ...navigation.linkProps("/tasks"), children: "Project Tasks" });
}
function ProjectWorkplaneLink({ context }) {
  const navigation = useHostNavigation();
  return /* @__PURE__ */ jsx("a", { className: "rw-room", ...navigation.linkProps(`/agent-rooms?project=${encodeURIComponent(context.entityId)}`), children: "Agent Rooms" });
}
export {
  AgentRoomsPage,
  ProjectTasksPage,
  ProjectTasksSidebar,
  ProjectWorkplaneLink,
  ProjectWorkplaneTab,
  RoomChatTab,
  RoomTaskSummary,
  TaskRoomTab
};
