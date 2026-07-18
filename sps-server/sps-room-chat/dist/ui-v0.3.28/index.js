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

// src/ui/workspace-links.js
var MARKDOWN_LINK_RE = /(!?\[[^\]\r\n]*\]\()([^)]+)(\))/g;
function decodePath(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
function normalizeWindowsPath(value) {
  let normalized = decodePath(String(value || "").trim());
  normalized = normalized.replace(/^file:\/{2,3}(?:localhost\/)?/i, "");
  if (/^\/[a-z]:[\\/]/i.test(normalized)) normalized = normalized.slice(1);
  normalized = normalized.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
  if (!/^[a-z]:\//i.test(normalized)) return null;
  const drive = normalized.slice(0, 2);
  const segments = [];
  for (const segment of normalized.slice(3).split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (!segments.length) return null;
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return `${drive}/${segments.join("/")}`;
}
function markdownDestination(value) {
  const source = String(value || "").trim();
  if (!source) return null;
  if (source.startsWith("<")) {
    const closing = source.indexOf(">");
    if (closing < 0) return null;
    return { target: source.slice(1, closing), suffix: source.slice(closing + 1) };
  }
  const titled = source.match(/^(\S+)(\s+(?:"[^"]*"|'[^']*'))$/);
  return titled ? { target: titled[1], suffix: titled[2] } : { target: source, suffix: "" };
}
function normalizedTargets(targets) {
  return (Array.isArray(targets) ? targets : []).map((target) => ({
    ...target,
    normalizedRoot: normalizeWindowsPath(target?.rootPath)
  })).filter((target) => target.projectId && target.workspaceId && target.normalizedRoot).sort((left, right) => right.normalizedRoot.length - left.normalizedRoot.length);
}
function workspaceRelativeTarget(absolutePath, targets) {
  const normalizedPath = normalizeWindowsPath(absolutePath);
  if (!normalizedPath) return null;
  const lowerPath = normalizedPath.toLocaleLowerCase("en-US");
  for (const target of targets) {
    const root = target.normalizedRoot.replace(/\/$/, "");
    const lowerRoot = root.toLocaleLowerCase("en-US");
    if (!lowerPath.startsWith(`${lowerRoot}/`)) continue;
    const relativePath = normalizedPath.slice(root.length + 1);
    if (!relativePath) continue;
    return { target, relativePath };
  }
  return null;
}
function roomFileHref(linkBaseHref, workspaceTarget, relativePath) {
  const [baseHref, query = ""] = linkBaseHref.split("?", 2);
  const params = new URLSearchParams(query);
  params.set("file", relativePath);
  params.set("projectId", workspaceTarget.projectId);
  params.set("workspaceId", workspaceTarget.workspaceId);
  params.set("roomFile", "1");
  return `${baseHref}?${params.toString()}`;
}
function rewriteWorkspaceMarkdownLinks(markdown, options = {}) {
  const source = String(markdown || "");
  const linkBaseHref = String(options.linkBaseHref || "").trim();
  const targets = normalizedTargets(options.targets);
  if (!source || !linkBaseHref || !targets.length) return source;
  return source.replace(MARKDOWN_LINK_RE, (whole, opener, rawDestination, closer) => {
    const destination = markdownDestination(rawDestination);
    if (!destination) return whole;
    const resolved = workspaceRelativeTarget(destination.target, targets);
    if (!resolved) return whole;
    const href = roomFileHref(linkBaseHref, resolved.target, resolved.relativePath);
    const linkOpener = opener.startsWith("![") ? opener.slice(1) : opener;
    return `${linkOpener}${href}${destination.suffix}${closer}`;
  });
}

// src/ui/RoomWorkplane.jsx
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
  .rw-message-label { color: var(--muted-foreground, #667085); font-size: 12px; font-weight: 650; margin-bottom: 5px; display: flex; align-items: center; gap: 7px; }
  .rw-message-body { overflow-wrap: anywhere; }
  .rw-message-actions { display: flex; gap: 6px; margin-top: 7px; }
  .rw-text-button { border: 0; background: transparent; color: #2563eb; padding: 0; cursor: pointer; font: inherit; font-size: 12px; }
  .rw-text-button:disabled { color: var(--muted-foreground, #667085); cursor: default; }
  .rw-working { max-width: 860px; margin: 0 auto 18px; border: 1px solid #c9d8f7; border-radius: 6px; background: #f7faff; }
  .rw-working summary { cursor: pointer; list-style: none; padding: 10px 12px; display: flex; align-items: center; gap: 8px; font-size: 13px; }
  .rw-working summary::-webkit-details-marker { display: none; }
  .rw-working summary strong { flex: 1; }
  .rw-working.failed { border-color: #f1c1c1; background: #fff8f8; }
  .rw-working-body { border-top: 1px solid #dbe6fa; padding: 2px 12px 10px; }
  .rw-step { margin-top: 8px; font-size: 12px; color: #40516b; }
  .rw-step summary { padding: 0; display: block; color: inherit; cursor: pointer; }
  .rw-step pre { white-space: pre-wrap; overflow-wrap: anywhere; margin: 5px 0 0; font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace; color: #40516b; }
  .rw-composer { border-top: 1px solid var(--border, #d8dee9); padding: 12px clamp(16px, 3vw, 28px); background: var(--background, #fff); }
  .rw-retry-draft { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 9px; padding: 7px 9px; border-left: 3px solid #2563eb; background: #f4f8ff; color: #40516b; font-size: 12px; }
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
  .rw-file-preview-backdrop { position: fixed; inset: 0; z-index: 80; display: grid; place-items: center; padding: 24px; background: rgba(15, 23, 42, .58); }
  .rw-file-preview { display: grid; grid-template-rows: auto minmax(0, 1fr); width: min(960px, calc(100vw - 48px)); max-height: calc(100dvh - 48px); overflow: hidden; border: 1px solid var(--border, #d8dee9); border-radius: 7px; background: var(--background, #fff); box-shadow: 0 24px 64px rgba(15, 23, 42, .28); }
  .rw-file-preview-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 11px 13px; border-bottom: 1px solid var(--border, #d8dee9); }
  .rw-file-preview-title { min-width: 0; }
  .rw-file-preview-title strong, .rw-file-preview-title span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rw-file-preview-title span { color: var(--muted-foreground, #667085); font-size: 11px; margin-top: 2px; }
  .rw-file-preview-actions { display: flex; align-items: center; gap: 7px; flex: none; }
  .rw-file-preview-body { min-height: 240px; overflow: auto; padding: 18px; background: var(--muted, #f7f8fa); }
  .rw-file-preview-image { display: block; max-width: 100%; max-height: calc(100dvh - 150px); margin: 0 auto; object-fit: contain; image-rendering: pixelated; background: repeating-conic-gradient(#eef2f7 0 25%, #fff 0 50%) 50% / 16px 16px; }
  .rw-file-preview-text { min-height: 100%; margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; font: 12px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--foreground, #172033); }
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
  .ca-page { max-width: 900px; padding: 20px; }
  .ca-page h1 { font-size: 20px; margin: 0 0 5px; }
  .ca-note { margin: 16px 0; padding: 10px 12px; border-left: 3px solid #2563eb; background: #f4f8ff; color: #40516b; font-size: 13px; }
  .ca-list { display: grid; gap: 8px; }
  .ca-agent { display: grid; grid-template-columns: minmax(180px, 1fr) minmax(220px, 1fr); gap: 12px; align-items: center; padding: 12px; border: 1px solid var(--border, #d8dee9); border-radius: 6px; background: var(--background, #fff); }
  .ca-agent strong, .ca-agent span { display: block; }
  .ca-agent span { color: var(--muted-foreground, #667085); font-size: 12px; margin-top: 3px; }
  .ca-select { width: 100%; min-width: 0; border: 1px solid var(--border, #cfd7e3); border-radius: 5px; padding: 8px; color: inherit; background: var(--background, #fff); font: inherit; }
  .ca-path { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  @media (max-width: 640px) { .ca-page { padding: 16px; } .ca-agent { grid-template-columns: 1fr; } }
  @media (max-width: 1020px) { .rw-layout { grid-template-columns: 210px minmax(0, 1fr); } .rw-context { display: none; } }
  @media (max-width: 720px) { .rw-layout { display: block; height: auto; min-height: 0; overflow: visible; } .rw-rooms { border-right: 0; border-bottom: 1px solid var(--border, #d8dee9); max-height: 210px; } .rw-main { min-height: 620px; } }
`;
function Style() {
  return /* @__PURE__ */ jsx("style", { children: STYLES });
}
function repairVisibleMojibake(value) {
  const source = String(value ?? "");
  const mojibake = /(?:Ã.|Â.|â..|ð...|ì[\u0080-\u00bf]|í[\u0080-\u00bf]|ë[\u0080-\u00bf]|ê[\u0080-\u00bf])/;
  if (!source || /[^\u0000-\u00ff]/.test(source) || !mojibake.test(source)) return source;
  let repaired = source;
  for (let attempt = 0; attempt < 2 && mojibake.test(repaired); attempt += 1) {
    try {
      const candidate = new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(repaired, (character) => character.charCodeAt(0)));
      if (!candidate || candidate === repaired) break;
      repaired = candidate;
    } catch {
      break;
    }
  }
  return repaired;
}
function roomLabel(comment) {
  const body = repairVisibleMojibake(comment?.body || "");
  const match = body.match(/^\*\*([^*]+)\*\*/);
  return match?.[1] || "Conversation";
}
function roomText(comment) {
  return repairVisibleMojibake(comment?.body || "").replace(/^\*\*[^*]+\*\*\s*/m, "").replace(/\n?<!--\s*paperclip-room-mode:(agent|plan|ask)\s*-->\s*/gi, "").replace(/\n?<!--\s*paperclip-room-retry-of:[\w-]+\s*-->\s*/gi, "").replace(/\n\n\*\*Attached files\*\*[\s\S]*?<!--\s*paperclip-room-attachments:[\w,-]+\s*-->/gi, "").trimEnd();
}
function roomRetryOf(comment) {
  return repairVisibleMojibake(comment?.body || "").match(/<!--\s*paperclip-room-retry-of:([\w-]+)\s*-->/i)?.[1] || null;
}
function roomAttachmentIds(comment) {
  const match = repairVisibleMojibake(comment?.body || "").match(/<!--\s*paperclip-room-attachments:([\w,-]+)\s*-->/i);
  return match?.[1]?.split(",").map((id) => id.trim()).filter(Boolean) || [];
}
function attachmentName(attachment) {
  const source = String(attachment?.originalFilename || attachment?.filename || "attachment");
  return repairVisibleMojibake(source);
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
function RoomFilePreview({ preview, onClose }) {
  useEffect(() => {
    if (!preview) return void 0;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [preview, onClose]);
  if (!preview) return null;
  const content = preview.content || {};
  const isImage = preview.resource?.previewKind === "image" && content.encoding === "base64";
  const imageSource = isImage ? `data:${preview.resource?.contentType || "image/png"};base64,${content.data || ""}` : "";
  const isText = content.encoding === "utf8" || content.encoding === "text";
  return /* @__PURE__ */ jsx("div", { className: "rw-file-preview-backdrop", role: "presentation", onMouseDown: (event) => {
    if (event.target === event.currentTarget) onClose();
  }, children: /* @__PURE__ */ jsxs("section", { className: "rw-file-preview", role: "dialog", "aria-modal": "true", "aria-label": preview.resource?.title || preview.path, children: [
    /* @__PURE__ */ jsxs("header", { className: "rw-file-preview-header", children: [
      /* @__PURE__ */ jsxs("div", { className: "rw-file-preview-title", children: [
        /* @__PURE__ */ jsx("strong", { children: preview.resource?.title || preview.path }),
        /* @__PURE__ */ jsx("span", { children: preview.resource?.displayPath || preview.path })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "rw-file-preview-actions", children: [
        /* @__PURE__ */ jsx("a", { className: "rw-button", href: preview.downloadHref, children: "Download" }),
        /* @__PURE__ */ jsx("button", { type: "button", className: "rw-button", onClick: onClose, children: "Close" })
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "rw-file-preview-body", children: preview.loading ? /* @__PURE__ */ jsx("div", { className: "rw-empty", children: "Loading file..." }) : preview.error ? /* @__PURE__ */ jsx("div", { className: "rw-error", children: preview.error }) : isImage ? /* @__PURE__ */ jsx("img", { className: "rw-file-preview-image", src: imageSource, alt: preview.resource?.title || preview.path }) : isText ? /* @__PURE__ */ jsx("pre", { className: "rw-file-preview-text", children: content.data || "" }) : /* @__PURE__ */ jsx("div", { className: "rw-empty", children: "Preview is unavailable for this file type. Use Download to open the original file." }) })
  ] }) });
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
        /* @__PURE__ */ jsx("dd", { children: data?.runtime?.enabled ? data?.runtime?.kind === "agy_print" ? "Agy" : "Codex" : "Disabled" }),
        /* @__PURE__ */ jsx("dt", { children: "Model" }),
        /* @__PURE__ */ jsx("dd", { children: data?.runtime?.model || "Default" }),
        /* @__PURE__ */ jsx("dt", { children: "Workspace" }),
        /* @__PURE__ */ jsx("dd", { children: state.workspace?.name || "Not bound" }),
        /* @__PURE__ */ jsx("dt", { children: "Session" }),
        /* @__PURE__ */ jsx("dd", { children: state.runtime?.codexThreadId || state.runtime?.agentSessionId || (data?.runtime?.kind === "agy_print" ? "Durable Paperclip context" : "Not started") }),
        /* @__PURE__ */ jsx("dt", { children: "Activity" }),
        /* @__PURE__ */ jsx("dd", { children: activity.status || "idle" }),
        /* @__PURE__ */ jsx("dt", { children: "Checkpoint" }),
        /* @__PURE__ */ jsx("dd", { children: state.checkpoint?.version || 0 }),
        /* @__PURE__ */ jsx("dt", { children: "Auto compact" }),
        /* @__PURE__ */ jsx("dd", { children: "Managed by Agent CLI" })
      ] })
    ] })
  ] });
}
function RoomActivity({ activity }) {
  if (!activity || !(activity.steps || []).length) return null;
  const status = activity.status === "working" ? "Working" : activity.status === "completed" ? "Completed" : "Failed";
  return /* @__PURE__ */ jsx("section", { className: `rw-working ${activity.status === "failed" ? "failed" : ""}`, children: /* @__PURE__ */ jsxs("details", { open: activity.status === "working", children: [
    /* @__PURE__ */ jsx("summary", { children: /* @__PURE__ */ jsx("strong", { children: status }) }),
    /* @__PURE__ */ jsxs("div", { className: "rw-working-body", children: [
      (activity.steps || []).map((step) => /* @__PURE__ */ jsx("div", { className: "rw-step", children: step.summary ? /* @__PURE__ */ jsxs("details", { children: [
        /* @__PURE__ */ jsx("summary", { children: step.label }),
        /* @__PURE__ */ jsx("pre", { children: step.summary })
      ] }) : step.label }, step.id)),
      activity.error ? /* @__PURE__ */ jsx("div", { className: "rw-step", children: activity.error }) : null
    ] })
  ] }) });
}
function RoomConversation({ context, roomId, workplane }) {
  const navigation = useHostNavigation();
  const sendRoom = usePluginAction("room-send");
  const compactRoom = usePluginAction("room-compact");
  const { data, loading, error, refresh } = usePluginData("room-workspace-view", { companyId: context.companyId, issueId: roomId });
  const [message, setMessage] = useState("");
  const [queuedAttachments, setQueuedAttachments] = useState([]);
  const [retrySource, setRetrySource] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
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
    const hasRetryAttachments = Boolean(retrySource?.attachmentIds?.length);
    if (!text && !queuedAttachments.length && !hasRetryAttachments || submitting || working) return;
    followLatestRef.current = true;
    setSubmitting(true);
    setActionError("");
    try {
      const uploadedAttachmentIds = await uploadQueuedAttachments();
      const attachmentIds = [.../* @__PURE__ */ new Set([...retrySource?.attachmentIds || [], ...uploadedAttachmentIds])];
      await sendRoom({ issueId: roomId, message: text, attachmentIds, ...retrySource?.commentId ? { retryOfCommentId: retrySource.commentId } : {} });
      setMessage("");
      setQueuedAttachments([]);
      setRetrySource(null);
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
      setActionError(caught?.message || "Room checkpoint could not be queued.");
    } finally {
      setSubmitting(false);
    }
  };
  const roomName = data?.room?.agentName || data?.room?.title || "Agent";
  const messages = useMemo(() => [...data?.comments || []].sort((left, right) => {
    return new Date(left.createdAt || 0).getTime() - new Date(right.createdAt || 0).getTime();
  }), [data?.comments]);
  const supersededMessageIds = useMemo(() => new Set(messages.map(roomRetryOf).filter(Boolean)), [messages]);
  const currentProjectId = data?.project?.id || workplane?.project?.id || context.projectId;
  const roomPageHref = currentProjectId ? roomHref(navigation, currentProjectId, roomId) : "";
  const renderRoomText = (comment) => rewriteWorkspaceMarkdownLinks(roomText(comment), {
    linkBaseHref: roomPageHref,
    targets: data?.workspaceLinkTargets
  });
  const openRoomFile = async (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = event.target?.closest?.("a");
    if (!anchor) return;
    const href = anchor.getAttribute("href") || "";
    if (!href.includes("roomFile=1")) return;
    const source = new URL(href, window.location.href);
    const file = source.searchParams.get("file");
    const projectId = source.searchParams.get("projectId");
    const workspaceId = source.searchParams.get("workspaceId");
    if (!file || !projectId || !workspaceId) return;
    event.preventDefault();
    const params = new URLSearchParams({ path: file, projectId, workspaceId });
    const contentHref = `/api/issues/${encodeURIComponent(roomId)}/file-resources/content?${params.toString()}`;
    setFilePreview({ path: file, loading: true, error: "", resource: null, content: null, downloadHref: `${contentHref}&download=1` });
    try {
      const response = await fetch(contentHref, { credentials: "same-origin" });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error || result?.message || `File preview failed (HTTP ${response.status}).`);
      setFilePreview({ path: file, loading: false, error: "", resource: result.resource, content: result.content, downloadHref: `${contentHref}&download=1` });
    } catch (caught) {
      setFilePreview((current) => current?.path === file ? { ...current, loading: false, error: caught?.message || "File preview failed." } : current);
    }
  };
  const editAndRetry = (comment) => {
    if (!comment?.id || working || submitting) return;
    setMessage(roomText(comment));
    setQueuedAttachments([]);
    setRetrySource({ commentId: comment.id, attachmentIds: roomAttachmentIds(comment) });
    setActionError("");
  };
  useEffect(() => {
    followLatestRef.current = true;
    setQueuedAttachments([]);
    setRetrySource(null);
    setFilePreview(null);
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
          const showActivity = activity?.sourceCommentId && activity.sourceCommentId === comment.id;
          const isUserMessage = roomLabel(comment) === "User";
          const isSuperseded = supersededMessageIds.has(comment.id);
          return /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsxs("article", { className: "rw-message", children: [
              /* @__PURE__ */ jsx("div", { className: "rw-message-label", children: /* @__PURE__ */ jsxs("span", { children: [
                roomLabel(comment),
                isSuperseded ? " (revised)" : ""
              ] }) }),
              /* @__PURE__ */ jsx("div", { onClick: openRoomFile, children: /* @__PURE__ */ jsx(MarkdownBlock, { className: "rw-message-body", content: renderRoomText(comment), enableWikiLinks: true }) }),
              /* @__PURE__ */ jsx(AttachmentList, { attachments, className: "rw-message-attachments" }),
              isUserMessage ? /* @__PURE__ */ jsx("div", { className: "rw-message-actions", children: /* @__PURE__ */ jsx("button", { type: "button", className: "rw-text-button", onClick: () => editAndRetry(comment), disabled: submitting || working || !data?.runtime?.enabled, children: "Edit and retry" }) }) : null
            ] }),
            showActivity ? /* @__PURE__ */ jsx(RoomActivity, { activity }) : null
          ] }, comment.id || `${comment.createdAt}-${comment.body}`);
        }) : /* @__PURE__ */ jsx("div", { className: "rw-empty", children: "Start the long-lived conversation with this Agent." }),
        activity && !activity.sourceCommentId ? /* @__PURE__ */ jsx(RoomActivity, { activity }) : null
      ] }),
      /* @__PURE__ */ jsxs("footer", { className: "rw-composer", children: [
        actionError ? /* @__PURE__ */ jsx("div", { className: "rw-error", children: actionError }) : null,
        retrySource ? /* @__PURE__ */ jsxs("div", { className: "rw-retry-draft", children: [
          /* @__PURE__ */ jsx("span", { children: "Editing a prior message. Sending creates a revised retry and keeps the original in Room history." }),
          /* @__PURE__ */ jsx("button", { type: "button", className: "rw-text-button", onClick: () => setRetrySource(null), disabled: submitting, children: "Cancel" })
        ] }) : null,
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
          /* @__PURE__ */ jsx("button", { type: "button", className: "rw-button", onClick: compact, disabled: submitting || working || !data?.runtime?.enabled, children: "Save checkpoint" }),
          /* @__PURE__ */ jsx("button", { type: "button", className: "rw-button primary", onClick: send, disabled: submitting || working || !message.trim() && !queuedAttachments.length && !retrySource?.attachmentIds?.length || !data?.runtime?.enabled, children: retrySource ? "Retry" : "Send" })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsx(RoomContext, { data, navigation }),
    /* @__PURE__ */ jsx(RoomFilePreview, { preview: filePreview, onClose: () => setFilePreview(null) })
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
  if (!data?.room) return null;
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
function CodexAccountsPage({ context }) {
  const setAccount = usePluginAction("codex-account-select");
  const { data, loading, error, refresh } = usePluginData("codex-accounts-view", { companyId: context.companyId });
  const [updatingAgentId, setUpdatingAgentId] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const chooseAccount = async (agent, accountId) => {
    if (!accountId || accountId === agent.selectedAccountId || updatingAgentId) return;
    setUpdatingAgentId(agent.id);
    setActionError("");
    setNotice("");
    try {
      const result = await setAccount({ agentId: agent.id, accountId });
      setNotice(`${agent.name} now uses ${result?.account?.label || "the selected Codex account"}. The next Room message begins a new CLI session with preserved Paperclip context.`);
      await refresh();
    } catch (caught) {
      setActionError(caught?.message || "Codex account could not be changed.");
    } finally {
      setUpdatingAgentId("");
    }
  };
  return /* @__PURE__ */ jsxs("div", { className: "rw-shell", children: [
    /* @__PURE__ */ jsx(Style, {}),
    /* @__PURE__ */ jsxs("main", { className: "ca-page", children: [
      /* @__PURE__ */ jsx("h1", { children: "Codex Accounts" }),
      /* @__PURE__ */ jsx("p", { className: "rw-muted", children: "Choose the ChatGPT/Codex CLI profile used by each Codex Agent." }),
      /* @__PURE__ */ jsx("div", { className: "ca-note", children: "Changing an account updates that Agent's `CODEX_HOME` for both Agent Rooms and normal Paperclip Tasks. Existing Room history and checkpoints remain in Paperclip; only the underlying Codex CLI session changes on the next message." }),
      actionError ? /* @__PURE__ */ jsx("div", { className: "rw-error", children: actionError }) : null,
      notice ? /* @__PURE__ */ jsx("div", { className: "ca-note", children: notice }) : null,
      loading ? /* @__PURE__ */ jsx("div", { className: "rw-empty", children: "Loading local Codex accounts..." }) : error ? /* @__PURE__ */ jsx("div", { className: "rw-error", children: error.message }) : !(data?.accounts || []).length ? /* @__PURE__ */ jsx("div", { className: "rw-empty", children: "No signed-in local Codex profiles were found. Run `codex login` in a separate CODEX_HOME first." }) : /* @__PURE__ */ jsx("div", { className: "ca-list", children: (data?.agents || []).map((agent) => /* @__PURE__ */ jsxs("section", { className: "ca-agent", children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("strong", { children: agent.name }),
          /* @__PURE__ */ jsxs("span", { children: [
            agent.role,
            " - ",
            agent.model
          ] }),
          /* @__PURE__ */ jsx("span", { className: "ca-path", title: agent.effectiveHome, children: agent.effectiveHome })
        ] }),
        /* @__PURE__ */ jsxs("select", { className: "ca-select", value: agent.selectedAccountId || "", onChange: (event) => chooseAccount(agent, event.target.value), disabled: Boolean(updatingAgentId), "aria-label": `${agent.name} Codex account`, children: [
          !agent.selectedAccountId ? /* @__PURE__ */ jsx("option", { value: "", children: "Current profile is not registered" }) : null,
          (data?.accounts || []).map((account) => /* @__PURE__ */ jsx("option", { value: account.id, children: account.label }, account.id))
        ] })
      ] }, agent.id)) }),
      /* @__PURE__ */ jsx("div", { className: "rw-actions", children: /* @__PURE__ */ jsx("button", { type: "button", className: "rw-button", onClick: () => refresh(), disabled: Boolean(updatingAgentId), children: "Refresh" }) })
    ] })
  ] });
}
function CodexAgentAccountConfiguration({ context }) {
  const setAccount = usePluginAction("codex-account-select");
  const { data, loading, error, refresh } = usePluginData("codex-accounts-view", { companyId: context.companyId });
  const [updating, setUpdating] = useState(false);
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const agent = (data?.agents || []).find((candidate) => candidate.id === context.entityId);
  if (loading) return /* @__PURE__ */ jsxs("section", { className: "ca-page", children: [
    /* @__PURE__ */ jsx(Style, {}),
    /* @__PURE__ */ jsx("h3", { children: "Codex CLI Account" }),
    /* @__PURE__ */ jsx("div", { className: "rw-empty", children: "Loading local Codex accounts..." })
  ] });
  if (error) return /* @__PURE__ */ jsxs("section", { className: "ca-page", children: [
    /* @__PURE__ */ jsx(Style, {}),
    /* @__PURE__ */ jsx("h3", { children: "Codex CLI Account" }),
    /* @__PURE__ */ jsx("div", { className: "rw-error", children: error.message })
  ] });
  if (!agent) return null;
  const chooseAccount = async (accountId) => {
    if (!accountId || accountId === agent.selectedAccountId || updating) return;
    setUpdating(true);
    setActionError("");
    setNotice("");
    try {
      const result = await setAccount({ agentId: agent.id, accountId });
      setNotice(`${result?.account?.label || "The selected Codex account"} will be used for the next Agent run and Room turn.`);
      await refresh();
    } catch (caught) {
      setActionError(caught?.message || "Codex account could not be changed.");
    } finally {
      setUpdating(false);
    }
  };
  return /* @__PURE__ */ jsxs("section", { className: "ca-page", children: [
    /* @__PURE__ */ jsx(Style, {}),
    /* @__PURE__ */ jsx("h3", { children: "Codex CLI Account" }),
    /* @__PURE__ */ jsx("p", { className: "rw-muted", children: "Choose the signed-in Codex CLI profile used by this Agent. Room history and checkpoints stay in Paperclip." }),
    actionError ? /* @__PURE__ */ jsx("div", { className: "rw-error", children: actionError }) : null,
    notice ? /* @__PURE__ */ jsx("div", { className: "ca-note", children: notice }) : null,
    !(data?.accounts || []).length ? /* @__PURE__ */ jsx("div", { className: "rw-empty", children: "No signed-in local Codex profiles were found. Sign in with a separate CODEX_HOME, then refresh." }) : /* @__PURE__ */ jsxs("div", { className: "ca-agent ca-agent-config", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("strong", { children: agent.name }),
        /* @__PURE__ */ jsx("span", { className: "ca-path", title: agent.effectiveHome, children: agent.effectiveHome })
      ] }),
      /* @__PURE__ */ jsxs("select", { className: "ca-select", value: agent.selectedAccountId || "", onChange: (event) => chooseAccount(event.target.value), disabled: updating, "aria-label": "Codex CLI account", children: [
        !agent.selectedAccountId ? /* @__PURE__ */ jsx("option", { value: "", children: "Current profile is not registered" }) : null,
        (data?.accounts || []).map((account) => /* @__PURE__ */ jsx("option", { value: account.id, children: account.label }, account.id))
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "rw-actions", children: /* @__PURE__ */ jsx("button", { type: "button", className: "rw-button", onClick: () => refresh(), disabled: updating, children: "Refresh accounts" }) })
  ] });
}
function ProjectTasksSidebar() {
  const navigation = useHostNavigation();
  return /* @__PURE__ */ jsx("a", { className: "rw-room", ...navigation.linkProps("/tasks"), children: "Project Tasks" });
}
function CodexAccountsSidebar() {
  const navigation = useHostNavigation();
  return /* @__PURE__ */ jsx("a", { className: "rw-room", ...navigation.linkProps("/codex-accounts"), children: "Codex Accounts" });
}
function ProjectWorkplaneLink({ context }) {
  const navigation = useHostNavigation();
  return /* @__PURE__ */ jsx("a", { className: "rw-room", ...navigation.linkProps(`/agent-rooms?project=${encodeURIComponent(context.entityId)}`), children: "Agent Rooms" });
}
export {
  AgentRoomsPage,
  CodexAccountsPage,
  CodexAccountsSidebar,
  CodexAgentAccountConfiguration,
  ProjectTasksPage,
  ProjectTasksSidebar,
  ProjectWorkplaneLink,
  ProjectWorkplaneTab,
  RoomChatTab,
  RoomTaskSummary,
  TaskRoomTab
};
