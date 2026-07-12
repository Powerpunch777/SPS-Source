import { useEffect, useMemo, useRef, useState } from "react";
import {
  FileTree,
  MarkdownBlock,
  MarkdownEditor,
  StatusBadge,
  useHostLocation,
  useHostNavigation,
  usePluginAction,
  usePluginData,
  usePluginStream
} from "@paperclipai/plugin-sdk/ui";

const STYLES = `
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
  return <style>{STYLES}</style>;
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
  return <div className={`rw-attachment-list ${className}`.trim()}>{attachments.map((attachment) => <a className="rw-attachment-chip" key={attachment.id} href={attachmentHref(attachment)} target="_blank" rel="noreferrer">
    {attachmentIsImage(attachment) ? <img src={attachmentHref(attachment)} alt="" /> : null}
    <span title={attachmentName(attachment)}>{attachmentName(attachment)}</span><small>{formatBytes(attachment.byteSize)}</small>
  </a>)}</div>;
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
  return <aside className="rw-context">
    <section className="rw-context-section">
      <h3>Tasks</h3>
      {tasks.length ? tasks.map((task) => <a className="rw-task" key={task.id} {...navigation.linkProps(taskHref(navigation, task))}>
        <div className="rw-task-title">{task.title}</div>
        <div className="rw-task-meta">{task.identifier} · {task.status} · {task.assigneeAgent?.name || "Unassigned"}</div>
      </a>) : <div className="rw-muted">No finite Tasks from this Room.</div>}
    </section>
    <section className="rw-context-section">
      <h3>Changes</h3>
      <FileTree nodes={nodes} wrapLabels emptyState={{ title: "No workspace changes" }} />
    </section>
    <section className="rw-context-section">
      <h3>Room files</h3>
      {attachments.length ? <AttachmentList attachments={attachments} className="rw-context-files" /> : <div className="rw-muted">No files attached in this Room.</div>}
    </section>
    <section className="rw-context-section">
      <h3>Session</h3>
      <dl className="rw-key-value">
        <dt>Runtime</dt><dd>{data?.runtime?.enabled ? "Ready" : "Disabled"}</dd>
        <dt>Workspace</dt><dd>{state.workspace?.name || "Not bound"}</dd>
        <dt>Session</dt><dd>{state.runtime?.codexThreadId || "Not started"}</dd>
        <dt>Activity</dt><dd>{activity.status || "idle"}</dd>
        <dt>Checkpoint</dt><dd>{state.checkpoint?.version || 0}</dd>
      </dl>
    </section>
  </aside>;
}

function RoomConversation({ context, roomId, workplane }) {
  const navigation = useHostNavigation();
  const sendRoom = usePluginAction("room-send");
  const compactRoom = usePluginAction("room-compact");
  const { data, loading, error, refresh } = usePluginData("room-workspace-view", { companyId: context.companyId, issueId: roomId });
  const stream = usePluginStream(`room:${roomId}`, { companyId: context.companyId });
  const [message, setMessage] = useState("");
  const [queuedAttachments, setQueuedAttachments] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState("");
  const threadRef = useRef(null);
  const followLatestRef = useRef(true);
  const attachmentInputRef = useRef(null);

  useEffect(() => {
    if (stream.lastEvent) void refresh();
  }, [stream.lastEvent, refresh]);

  const activity = data?.state?.runtime?.activity;
  const working = activity?.status === "working";

  useEffect(() => {
    if (!working) return undefined;
    const timer = setInterval(() => { void refresh(); }, 2000);
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
    if ((!text && !queuedAttachments.length) || submitting || working) return;
    followLatestRef.current = true;
    setSubmitting(true); setActionError("");
    try {
      const attachmentIds = await uploadQueuedAttachments();
      await sendRoom({ issueId: roomId, message: text, attachmentIds });
      setMessage("");
      setQueuedAttachments([]);
      await refresh();
    } catch (caught) {
      setActionError(caught?.message || "Room message could not be queued.");
    } finally { setSubmitting(false); }
  };
  const compact = async () => {
    if (submitting || working) return;
    setSubmitting(true); setActionError("");
    try { await compactRoom({ issueId: roomId }); await refresh(); }
    catch (caught) { setActionError(caught?.message || "Room compact could not be queued."); }
    finally { setSubmitting(false); }
  };
  const roomName = data?.room?.agentName || data?.room?.title || "Agent";
  const messages = useMemo(() => [...(data?.comments || [])].sort((left, right) => {
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

  if (loading && !data) return <div className="rw-empty">Loading Room...</div>;
  if (error && !data) return <div className="rw-error">{error.message}</div>;
  return <div className="rw-layout">
    {workplane ? <RoomList navigation={navigation} workplane={workplane} projectId={currentProjectId} roomId={roomId} /> : <div className="rw-rooms" />}
    <main className="rw-main">
      <header className="rw-header">
        <div><h1 className="rw-title">{roomName}</h1><p className="rw-subtitle">Long-lived Agent Room</p></div>
        <StatusBadge label={working ? "Working" : data?.runtime?.enabled ? "Ready" : "Runtime disabled"} status={working ? "warning" : data?.runtime?.enabled ? "ok" : "pending"} />
      </header>
      <section className="rw-thread" ref={threadRef} onScroll={trackThreadScroll}>
        {messages.length ? messages.map((comment) => {
          const attachmentIds = roomAttachmentIds(comment);
          const attachments = attachmentIds.map((id) => (data?.attachments || []).find((attachment) => attachment.id === id)).filter(Boolean);
          return <article className="rw-message" key={comment.id || `${comment.createdAt}-${comment.body}`}>
            <div className="rw-message-label">{roomLabel(comment)}</div>
            <MarkdownBlock className="rw-message-body" content={roomText(comment)} enableWikiLinks />
            <AttachmentList attachments={attachments} className="rw-message-attachments" />
          </article>;
        }) : <div className="rw-empty">Start the long-lived conversation with this Agent.</div>}
        {working ? <section className="rw-working"><strong>Working</strong>{(activity.steps || []).slice(-8).map((step) => <div className="rw-step" key={step.id}>{step.label}{step.summary ? `: ${step.summary}` : ""}</div>)}</section> : null}
      </section>
      <footer className="rw-composer">
        {actionError ? <div className="rw-error">{actionError}</div> : null}
        <MarkdownEditor value={message} onChange={setMessage} onSubmit={send} bordered placeholder={`${roomName}에게 메시지`} />
        <input ref={attachmentInputRef} className="rw-file-input" type="file" multiple onChange={queueFiles} />
        {queuedAttachments.length ? <div className="rw-attachment-queue">{queuedAttachments.map((attachment) => <div className="rw-attachment-chip" key={attachment.clientId}><span title={attachment.file.name}>{attachment.file.name}</span><small>{formatBytes(attachment.file.size)}</small><button type="button" aria-label={`${attachment.file.name} remove`} onClick={() => removeQueuedAttachment(attachment.clientId)} disabled={submitting}>×</button></div>)}</div> : null}
        <div className="rw-composer-tools"><button type="button" className="rw-button" onClick={() => attachmentInputRef.current?.click()} disabled={submitting || working || !data?.runtime?.enabled}>Attach files</button><span className="rw-muted">Files are stored in this Room, not the project repository.</span></div>
        <div className="rw-actions"><span className="rw-muted">{stream.connected ? "Live" : "Saved state"}</span><button type="button" className="rw-button" onClick={compact} disabled={submitting || working || !data?.runtime?.enabled}>Compact</button><button type="button" className="rw-button primary" onClick={send} disabled={submitting || working || (!message.trim() && !queuedAttachments.length) || !data?.runtime?.enabled}>Send</button></div>
      </footer>
    </main>
    <RoomContext data={data} navigation={navigation} />
  </div>;
}

function RoomList({ navigation, workplane, projectId, roomId }) {
  return <aside className="rw-rooms"><div className="rw-room-list"><div className="rw-muted">{workplane.project?.name || "Project"}</div>{(workplane.rooms || []).map((room) => <a className={`rw-room ${room.id === roomId ? "active" : ""}`} key={room.id} {...navigation.linkProps(roomHref(navigation, projectId, room.id))}><strong>{room.title}</strong><span>{room.agent?.role || "Agent"} · long-lived</span></a>)}</div></aside>;
}

function ProjectRooms({ context, projectId, roomId }) {
  const navigation = useHostNavigation();
  const { data, loading, error } = usePluginData("project-workplane-view", { companyId: context.companyId, projectId });
  if (roomId) return <RoomConversation context={context} roomId={roomId} workplane={data} />;
  if (loading) return <div className="rw-empty">Loading Rooms...</div>;
  if (error) return <div className="rw-error">{error.message}</div>;
  return <div className="rw-project"><h1>{data?.project?.name || "Project"}</h1><p className="rw-muted">Choose an Agent Room. Finite work remains in Tasks.</p><div className="rw-project-grid">{(data?.rooms || []).map((room) => <a className="rw-project-card" key={room.id} {...navigation.linkProps(roomHref(navigation, projectId, room.id))}><strong>{room.title}</strong><p>{room.agent?.role || "Agent"} · Long-lived conversation</p></a>)}</div></div>;
}

export function AgentRoomsPage({ context }) {
  const location = useHostLocation();
  const query = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const projectId = query.get("project") || context.projectId;
  const roomId = query.get("room");
  if (!projectId && !roomId) return <><Style /><div className="rw-empty">Choose a Project to open its Agent Rooms.</div></>;
  return <div className="rw-shell"><Style /><ProjectRooms context={context} projectId={projectId} roomId={roomId} /></div>;
}

export function RoomChatTab({ context }) {
  return <div className="rw-shell"><Style /><RoomConversation context={context} roomId={context.entityId} /></div>;
}

export function ProjectWorkplaneTab({ context }) {
  return <div className="rw-shell"><Style /><ProjectRooms context={context} projectId={context.entityId} roomId={null} /></div>;
}

export function RoomTaskSummary({ context }) {
  const navigation = useHostNavigation();
  const { data, loading, error } = usePluginData("room-task-summary", { companyId: context.companyId, issueId: context.entityId });
  if (loading) return <div className="rw-empty">Loading Tasks...</div>;
  if (error) return <div className="rw-error">{error.message}</div>;
  return <div className="rw-task-board"><Style /><h1>Room Tasks</h1>{(data?.tasks || []).length ? data.tasks.map((task) => <a className="rw-task-row" key={task.id} {...navigation.linkProps(taskHref(navigation, task))}><strong>{task.title}</strong><span>{task.identifier} · {task.status}</span></a>) : <div className="rw-muted">No finite Tasks from this Room.</div>}</div>;
}

export function TaskRoomTab({ context }) {
  const navigation = useHostNavigation();
  const { data, loading, error } = usePluginData("task-room-view", { companyId: context.companyId, issueId: context.entityId });
  if (loading) return <div className="rw-empty">Loading Task contract...</div>;
  if (error) return <div className="rw-error">{error.message}</div>;
  return <div className="rw-task-board"><Style /><h1>{data?.task?.title || "Task"}</h1><p className="rw-muted">Use the native Paperclip Task chat for Worker collaboration and review.</p><a className="rw-button" {...navigation.linkProps(taskHref(navigation, data.task))}>Open native Task chat</a><MarkdownBlock content={`## Task contract\n\n${JSON.stringify(data?.state || {}, null, 2)}`} /></div>;
}

export function ProjectTasksPage({ context }) {
  const location = useHostLocation();
  const navigation = useHostNavigation();
  const projectId = new URLSearchParams(location.search).get("project");
  const { data, loading, error } = usePluginData("project-tasks-view", { companyId: context.companyId, projectId: projectId || "" });
  return <div className="rw-task-board"><Style /><h1>Project Tasks</h1>{!projectId ? <div className="rw-empty">Choose a Project to view finite Tasks.</div> : loading ? <div className="rw-empty">Loading Tasks...</div> : error ? <div className="rw-error">{error.message}</div> : (data?.tasks || []).map((task) => <a className="rw-task-row" key={task.id} {...navigation.linkProps(taskHref(navigation, task))}><strong>{task.title}</strong><span>{task.identifier} · {task.status} · {task.parentRoom?.title || "No owner Room"}</span></a>)}</div>;
}

export function ProjectTasksSidebar() {
  const navigation = useHostNavigation();
  return <a className="rw-room" {...navigation.linkProps("/tasks")}>Project Tasks</a>;
}

export function ProjectWorkplaneLink({ context }) {
  const navigation = useHostNavigation();
  return <a className="rw-room" {...navigation.linkProps(`/agent-rooms?project=${encodeURIComponent(context.entityId)}`)}>Agent Rooms</a>;
}
