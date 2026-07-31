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
function roomFileContentHref(roomIssueId, workspaceTarget, relativePath) {
  if (!roomIssueId) return "";
  const params = new URLSearchParams({
    path: relativePath,
    projectId: workspaceTarget.projectId,
    workspaceId: workspaceTarget.workspaceId,
    download: "1"
  });
  return `/api/issues/${encodeURIComponent(roomIssueId)}/file-resources/content?${params.toString()}`;
}
function isPreviewableImagePath(relativePath) {
  return /\.(png|jpe?g|webp|gif|avif|bmp)$/i.test(String(relativePath || ""));
}
function rewriteWorkspaceMarkdownLinks(markdown, options = {}) {
  const source = String(markdown || "");
  const linkBaseHref = String(options.linkBaseHref || "").trim();
  const roomIssueId = String(options.roomIssueId || "").trim();
  const targets = normalizedTargets(options.targets);
  if (!source || !linkBaseHref || !targets.length) return source;
  return source.replace(MARKDOWN_LINK_RE, (whole, opener, rawDestination, closer) => {
    const destination = markdownDestination(rawDestination);
    if (!destination) return whole;
    const resolved = workspaceRelativeTarget(destination.target, targets);
    if (!resolved) return whole;
    const href = roomFileHref(linkBaseHref, resolved.target, resolved.relativePath);
    if (opener.startsWith("![") && roomIssueId && isPreviewableImagePath(resolved.relativePath)) {
      const contentHref = roomFileContentHref(roomIssueId, resolved.target, resolved.relativePath);
      return `[${opener}${contentHref}${destination.suffix}${closer}](${href})`;
    }
    const linkOpener = opener.startsWith("![") ? opener.slice(1) : opener;
    return `${linkOpener}${href}${destination.suffix}${closer}`;
  });
}

// src/ui/RoomWorkplane.jsx
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var AGENT_CONFIGURATION_PERMISSION_REQUEST = Object.freeze({
  __paperclipRequestedPermissions: ["agents:configure"]
});
var LEGACY_TASK_TYPES = Object.freeze([
  Object.freeze({ id: "design", label: "Design" }),
  Object.freeze({ id: "documentation", label: "Documentation" }),
  Object.freeze({ id: "implementation", label: "Implementation" }),
  Object.freeze({ id: "qa", label: "Quality assurance" }),
  Object.freeze({ id: "art", label: "Art / assets" }),
  Object.freeze({ id: "voice", label: "Voice / audio" })
]);
var TASK_TYPE_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
var ROOM_LIST_WIDTH_KEY = "sps.room-workplane.room-list-width";
var ROOM_LIST_DEFAULT_WIDTH = 236;
var ROOM_LIST_MIN_WIDTH = 184;
var ROOM_LIST_MAX_WIDTH = 360;
var ROOM_CONTEXT_WIDTH_KEY = "sps.room-workplane.context-width";
var ROOM_CONTEXT_DEFAULT_WIDTH = 348;
var ROOM_CONTEXT_MIN_WIDTH = 288;
var ROOM_CONTEXT_MAX_WIDTH = 440;
var ROOM_MAIN_MIN_WIDTH = 360;
function clampRoomListWidth(value, maximum = ROOM_LIST_MAX_WIDTH) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return ROOM_LIST_DEFAULT_WIDTH;
  const requestedMaximum = Number(maximum);
  const upperBound = Number.isFinite(requestedMaximum) ? Math.max(ROOM_LIST_MIN_WIDTH, Math.min(ROOM_LIST_MAX_WIDTH, requestedMaximum)) : ROOM_LIST_MAX_WIDTH;
  return Math.round(Math.min(upperBound, Math.max(ROOM_LIST_MIN_WIDTH, numeric)));
}
function savedRoomListWidth() {
  if (typeof window === "undefined") return ROOM_LIST_DEFAULT_WIDTH;
  try {
    const saved = window.localStorage.getItem(ROOM_LIST_WIDTH_KEY);
    return saved === null || !saved.trim() ? ROOM_LIST_DEFAULT_WIDTH : clampRoomListWidth(saved);
  } catch {
    return ROOM_LIST_DEFAULT_WIDTH;
  }
}
function clampRoomContextWidth(value, maximum = ROOM_CONTEXT_MAX_WIDTH) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return ROOM_CONTEXT_DEFAULT_WIDTH;
  const requestedMaximum = Number(maximum);
  const upperBound = Number.isFinite(requestedMaximum) ? Math.max(ROOM_CONTEXT_MIN_WIDTH, Math.min(ROOM_CONTEXT_MAX_WIDTH, requestedMaximum)) : ROOM_CONTEXT_MAX_WIDTH;
  return Math.round(Math.min(upperBound, Math.max(ROOM_CONTEXT_MIN_WIDTH, numeric)));
}
function savedRoomContextWidth() {
  if (typeof window === "undefined") return ROOM_CONTEXT_DEFAULT_WIDTH;
  try {
    const saved = window.localStorage.getItem(ROOM_CONTEXT_WIDTH_KEY);
    return saved === null || !saved.trim() ? ROOM_CONTEXT_DEFAULT_WIDTH : clampRoomContextWidth(saved);
  } catch {
    return ROOM_CONTEXT_DEFAULT_WIDTH;
  }
}
function taskTypeKey(value) {
  const key = String(value || "").trim().toLowerCase();
  return TASK_TYPE_KEY_PATTERN.test(key) ? key : "";
}
function taskTypesForProfile(profile) {
  const configured = Array.isArray(profile?.taskTypes) ? profile.taskTypes : LEGACY_TASK_TYPES;
  const types = /* @__PURE__ */ new Map();
  for (const item of configured) {
    const id = taskTypeKey(typeof item === "string" ? item : item?.id);
    if (!id || types.has(id)) continue;
    const label = String(typeof item === "string" ? item : item?.label || id).trim() || id;
    types.set(id, { id, label: label.slice(0, 80) });
  }
  for (const rawId of Object.keys(profile?.taskWorkspaceIds || {})) {
    const id = taskTypeKey(rawId);
    if (id && !types.has(id)) types.set(id, { id, label: id });
  }
  return [...types.values()];
}
var STYLES = `
  .rw-shell { color: var(--foreground, #172033); font: 14px/1.5 system-ui, sans-serif; }
  .rw-layout { --rw-room-width: 236px; --rw-context-width: 348px; position: relative; display: grid; grid-template-columns: var(--rw-room-width) minmax(0, 1fr); height: calc(100dvh - 72px); min-height: 560px; overflow: hidden; border: 1px solid var(--border, #d8dee9); border-radius: 10px; background: var(--background, #fff); box-shadow: 0 12px 34px rgba(15, 23, 42, .06); }
  .rw-layout.context-open { grid-template-columns: var(--rw-room-width) minmax(0, 1fr) var(--rw-context-width); }
  .rw-layout.rooms-collapsed { --rw-room-width: 0px; }
  .rw-rooms, .rw-context { min-width: 0; min-height: 0; overscroll-behavior: contain; }
  .rw-rooms { position: relative; border-right: 1px solid var(--border, #e3e8f0); overflow: auto; background: var(--background, #fff); }
  .rw-layout.rooms-collapsed .rw-rooms { display: none; }
  .rw-room-resizer { position: absolute; z-index: 3; inset: 0 -4px 0 auto; width: 9px; cursor: col-resize; touch-action: none; }
  .rw-room-resizer::after { position: absolute; top: 50%; left: 3px; width: 2px; height: 30px; border-radius: 999px; background: transparent; content: ""; transform: translateY(-50%); transition: background 120ms ease; }
  .rw-room-resizer:hover::after, .rw-room-resizer:focus-visible::after { background: #94a3b8; }
  .rw-room-resizer:focus-visible { outline: none; }
  .rw-context { position: absolute; inset: 0 0 0 auto; z-index: 8; display: grid; grid-template-rows: auto minmax(0, 1fr); width: min(var(--rw-context-width), calc(100% - var(--rw-room-width))); overflow: hidden; border-left: 1px solid var(--border, #d8dee9); background: var(--background, #fff); box-shadow: -18px 0 32px rgba(15, 23, 42, .11); transform: translateX(calc(100% + 16px)); transition: transform 180ms ease, box-shadow 180ms ease; }
  .rw-layout.context-open .rw-context { position: relative; grid-column: 3; grid-row: 1; width: auto; transform: translateX(0); box-shadow: none; }
  .rw-context-resizer { position: absolute; z-index: 4; inset: 0 auto 0 -4px; width: 9px; cursor: col-resize; touch-action: none; }
  .rw-context-resizer::after { position: absolute; top: 50%; right: 3px; width: 2px; height: 30px; border-radius: 999px; background: transparent; content: ""; transform: translateY(-50%); transition: background 120ms ease; }
  .rw-context-resizer:hover::after, .rw-context-resizer:focus-visible::after { background: #94a3b8; }
  .rw-context-resizer:focus-visible { outline: none; }
  .rw-main { grid-column: 2; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; min-width: 0; min-height: 0; overflow: hidden; background: var(--background, #fff); }
  .rw-header { min-height: 60px; padding: 10px clamp(16px, 2vw, 24px); border-bottom: 1px solid var(--border, #e3e8f0); display: flex; justify-content: space-between; gap: 12px; align-items: center; background: rgba(255, 255, 255, .94); }
  .rw-header-copy { min-width: 0; }
  .rw-header-actions { display: flex; align-items: center; justify-content: flex-end; gap: 6px; min-width: 0; }
  .rw-title { overflow: hidden; font-size: 15px; font-weight: 720; margin: 0; text-overflow: ellipsis; white-space: nowrap; }
  .rw-subtitle, .rw-muted { color: var(--muted-foreground, #667085); font-size: 12px; margin: 2px 0 0; }
  .rw-context-trigger, .rw-context-shortcut, .rw-room-list-trigger { appearance: none; border: 1px solid var(--border, #d8dee9); border-radius: 6px; padding: 6px 9px; background: var(--background, #fff); color: var(--muted-foreground, #667085); cursor: pointer; font: 650 12px/1.25 system-ui, sans-serif; white-space: nowrap; }
  .rw-context-trigger:hover, .rw-context-shortcut:hover, .rw-room-list-trigger:hover, .rw-context-trigger[aria-expanded="true"], .rw-room-list-trigger[aria-expanded="true"] { border-color: #a9b9d0; background: #f6f8fb; color: var(--foreground, #172033); }
  .rw-context-trigger { color: var(--foreground, #172033); }
  .rw-room-list-trigger { flex: none; padding: 6px 8px; font-size: 15px; line-height: 1; }
  .rw-room-list { padding: 8px; }
  .rw-room-project-link { display: block; margin: 2px 2px 10px; padding: 8px; color: inherit; text-decoration: none; border-bottom: 1px solid var(--border, #d8dee9); font-weight: 700; }
  .rw-room-project-link:hover { color: var(--primary, #2563eb); }
  .rw-room-project-link span { display: block; margin-top: 2px; color: var(--muted-foreground, #667085); font-size: 12px; font-weight: 400; }
  .rw-room { display: block; color: inherit; text-decoration: none; border: 1px solid transparent; border-radius: 7px; padding: 10px; margin-bottom: 3px; }
  .rw-room:hover { background: #f1f5f9; }
  .rw-room.active { border-color: #d7e0ee; background: #edf3fb; box-shadow: 0 1px 2px rgba(15, 23, 42, .03); }
  .rw-room strong, .rw-room span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rw-room span { color: var(--muted-foreground, #667085); font-size: 12px; margin-top: 2px; }
  .rw-room small { display: block; overflow: hidden; color: #9a6700; font-size: 11px; font-weight: 600; margin-top: 3px; text-overflow: ellipsis; white-space: nowrap; }
  .rw-thread { min-height: 0; overflow: auto; overscroll-behavior: contain; padding: 26px clamp(18px, 4vw, 52px) 18px; scrollbar-gutter: stable; }
  .rw-message { max-width: 860px; margin: 0 auto 24px; }
  .rw-message.user { max-width: min(680px, 100%); margin-right: max(0px, calc((100% - 860px) / 2)); margin-left: auto; padding: 13px 15px; border: 1px solid #e1e6ed; border-radius: 14px; background: #f7f8fa; box-shadow: 0 1px 2px rgba(15, 23, 42, .025); }
  .rw-message-label { color: var(--muted-foreground, #667085); font-size: 12px; font-weight: 700; margin-bottom: 6px; display: flex; align-items: center; gap: 7px; }
  .rw-message.user .rw-message-label { color: #475569; }
  .rw-message-body { overflow-wrap: anywhere; }
  .rw-message-body img { display: block; width: auto; max-width: min(100%, 760px); max-height: 520px; margin: 10px 0 4px; object-fit: contain; image-rendering: pixelated; border: 1px solid var(--border, #d8dee9); border-radius: 6px; background: repeating-conic-gradient(#eef2f7 0 25%, #fff 0 50%) 50% / 16px 16px; cursor: zoom-in; }
  .rw-message-actions { display: flex; gap: 6px; margin-top: 7px; }
  .rw-text-button { border: 0; background: transparent; color: #2563eb; padding: 0; cursor: pointer; font: inherit; font-size: 12px; }
  .rw-text-button:disabled { color: var(--muted-foreground, #667085); cursor: default; }
  .rw-working { max-width: 860px; margin: 0 auto 22px; border: 0; border-radius: 0; background: transparent; }
  .rw-working summary { cursor: pointer; list-style: none; padding: 9px 11px; display: flex; align-items: center; gap: 8px; border: 1px solid #dbe5f4; border-radius: 9px; background: #f8fbff; color: #40516b; font-size: 12px; }
  .rw-working summary::-webkit-details-marker { display: none; }
  .rw-working summary strong { flex: 1; }
  .rw-working.failed summary { border-color: #f1c1c1; background: #fff8f8; }
  .rw-working-body { padding: 5px 11px 0; }
  .rw-step { margin-top: 8px; font-size: 12px; color: #40516b; }
  .rw-step summary { padding: 0; display: block; color: inherit; cursor: pointer; }
  .rw-step pre { white-space: pre-wrap; overflow-wrap: anywhere; margin: 5px 0 0; font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace; color: #40516b; }
  .rw-composer { border-top: 1px solid var(--border, #e3e8f0); padding: 14px clamp(16px, 3vw, 36px) 18px; background: #fff; }
  .rw-composer-surface { width: min(900px, 100%); margin: 0 auto; padding: 11px; border: 1px solid #dce3ec; border-radius: 14px; background: #fff; box-shadow: 0 6px 20px rgba(15, 23, 42, .06); }
  .rw-workspace-notice { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; padding: 9px 10px; border: 1px solid #e2c46b; border-radius: 6px; background: #fffbeb; color: #634b00; font-size: 12px; }
  .rw-workspace-notice strong, .rw-workspace-notice span { display: block; }
  .rw-workspace-notice span { margin-top: 2px; }
  .rw-retry-draft { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 9px; padding: 7px 9px; border-left: 3px solid #2563eb; background: #f4f8ff; color: #40516b; font-size: 12px; }
  .rw-actions { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 9px; }
  .rw-composer-status { margin-right: auto; color: var(--muted-foreground, #667085); font-size: 11px; white-space: nowrap; }
  .rw-composer-buttons { display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
  .rw-composer-tools { display: flex; align-items: center; gap: 8px; margin-top: 9px; }
  .rw-composer-tools .rw-button { flex: 0 0 auto; white-space: nowrap; }
  .rw-button { appearance: none; border: 1px solid var(--border, #cfd7e3); background: var(--background, #fff); color: inherit; border-radius: 6px; padding: 7px 10px; cursor: pointer; font: inherit; }
  .rw-button.primary { background: #172033; border-color: #172033; color: #fff; }
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
  .rw-context-header { padding: 13px 14px 10px; border-bottom: 1px solid var(--border, #e3e8f0); background: var(--background, #fff); }
  .rw-context-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
  .rw-context-heading-actions { display: flex; align-items: center; gap: 7px; }
  .rw-context-close { appearance: none; border: 0; padding: 3px 5px; background: transparent; color: var(--muted-foreground, #667085); cursor: pointer; font: 700 15px/1 system-ui, sans-serif; }
  .rw-context-close:hover { color: var(--foreground, #172033); }
  .rw-context-heading strong { font-size: 13px; }
  .rw-context-heading span { color: var(--muted-foreground, #667085); font-size: 11px; }
  .rw-context-tabs { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px; }
  .rw-context-tab { min-width: 0; border: 1px solid transparent; border-radius: 5px; padding: 6px 4px; background: transparent; color: var(--muted-foreground, #667085); cursor: pointer; font: 650 11px/1.2 system-ui, sans-serif; white-space: nowrap; }
  .rw-context-tab:hover { background: var(--muted, #f7f8fa); color: var(--foreground, #172033); }
  .rw-context-tab.active { border-color: var(--border, #cfd7e3); background: var(--accent, #eaf2ff); color: var(--foreground, #172033); }
  .rw-context-body { min-height: 0; overflow-y: auto; overflow-x: hidden; overscroll-behavior: contain; scrollbar-gutter: stable; }
  .rw-context-panel { min-height: 100%; padding: 16px 14px; }
  .rw-context-files { display: grid; gap: 6px; }
  .rw-context-files .rw-attachment-chip { width: 100%; }
  .rw-context-task-list { display: grid; gap: 2px; }
  .rw-context-changes { min-height: 0; overflow: hidden; }
  .rw-context-empty { margin: 0; color: var(--muted-foreground, #667085); font-size: 12px; line-height: 1.5; }
  .rw-context-session { margin-top: 18px; border-top: 1px solid var(--border, #d8dee9); padding-top: 12px; }
  .rw-context-session summary { cursor: pointer; color: var(--muted-foreground, #667085); font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
  .wp-routing { margin-top: 16px; border-top: 1px solid var(--border, #d8dee9); border-bottom: 1px solid var(--border, #d8dee9); padding: 12px 0; }
  .wp-routing summary { cursor: pointer; font-weight: 700; }
  .wp-routing > p { margin: 6px 0 14px; }
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
  .rw-context-panel h3 { font-size: 12px; margin: 0 0 9px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted-foreground, #667085); }
  .rw-task { display: block; text-decoration: none; color: inherit; padding: 8px 0; border-top: 1px solid var(--border, #e3e8f0); }
  .rw-task:first-of-type { border-top: 0; }
  .rw-task-title { font-size: 13px; font-weight: 600; }
  .rw-task-meta { color: var(--muted-foreground, #667085); font-size: 11px; margin-top: 2px; }
  .rw-key-value { display: grid; grid-template-columns: 92px minmax(0, 1fr); gap: 5px 8px; font-size: 12px; }
  .rw-key-value dt { color: var(--muted-foreground, #667085); }
  .rw-key-value dd { margin: 0; overflow-wrap: anywhere; }
  .rw-focus-value { margin: 0 0 9px; overflow-wrap: anywhere; font-size: 13px; }
  .rw-focus-value:last-child { margin-bottom: 0; }
  .rw-focus-label { display: block; margin-bottom: 2px; color: var(--muted-foreground, #667085); font-size: 11px; }
  .rw-focus-sources { margin: 3px 0 0; padding-left: 16px; color: var(--muted-foreground, #667085); font-size: 11px; }
  .rw-empty, .rw-error { padding: 24px; color: var(--muted-foreground, #667085); }
  .rw-room-empty { display: grid; align-content: center; min-height: 180px; max-width: 520px; margin: 0 auto; text-align: center; }
  .rw-room-empty strong { color: var(--foreground, #172033); font-size: 15px; }
  .rw-room-empty p { margin: 6px 0 0; }
  .rw-error { color: #b42318; }
  .rw-project { padding: 22px; max-width: 1160px; margin: 0 auto; }
  .rw-project-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding-bottom: 18px; border-bottom: 1px solid var(--border, #d8dee9); }
  .rw-project h1 { font-size: 22px; margin: 0 0 4px; }
  .rw-project-header p { max-width: 620px; }
  .rw-project-actions { display: flex; flex-wrap: wrap; gap: 8px; flex: 0 0 auto; }
  .rw-project-summary { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 18px; }
  .rw-project-stat { padding: 13px 14px; border: 1px solid var(--border, #d8dee9); border-radius: 7px; background: var(--muted, #f7f8fa); }
  .rw-project-stat strong, .rw-project-stat span { display: block; }
  .rw-project-stat strong { font-size: 19px; }
  .rw-project-stat span { margin-top: 2px; color: var(--muted-foreground, #667085); font-size: 12px; }
  .rw-project-rooms-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 24px; }
  .rw-project-rooms-heading h2 { margin: 0; font-size: 15px; }
  .rw-project-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 8px; margin-top: 18px; }
  .rw-project-card { display: block; color: inherit; text-decoration: none; border: 1px solid var(--border, #d8dee9); border-radius: 6px; padding: 12px; background: var(--background, #fff); }
  .rw-project-card:hover { border-color: #2563eb; }
  .rw-project-card p { color: var(--muted-foreground, #667085); font-size: 12px; margin: 4px 0 0; }
  .wp-profile { margin-top: 18px; border: 1px solid var(--border, #d8dee9); border-radius: 6px; background: var(--background, #fff); }
  .wp-profile-details > summary { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 13px 14px; cursor: pointer; font-size: 14px; font-weight: 700; }
  .wp-profile-details[open] > summary { border-bottom: 1px solid var(--border, #d8dee9); }
  .wp-profile-content { padding: 14px; }
  .wp-profile h2 { margin: 0; font-size: 15px; }
  .wp-profile-head { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 10px; }
  .wp-profile-head p { max-width: 680px; margin: 3px 0 0; color: var(--muted-foreground, #667085); font-size: 12px; }
  .wp-workspaces, .wp-agent-map { display: grid; gap: 7px; margin-top: 12px; }
  .wp-workspace, .wp-agent { display: grid; grid-template-columns: minmax(180px, 1fr) minmax(160px, 260px); gap: 12px; align-items: center; padding: 9px; border: 1px solid var(--border, #e3e8f0); border-radius: 5px; }
  .wp-task-route { display: grid; grid-template-columns: minmax(160px, 1fr) minmax(160px, 260px) auto; gap: 12px; align-items: center; padding: 9px; border: 1px solid var(--border, #e3e8f0); border-radius: 5px; }
  .wp-task-route strong, .wp-task-route span { display: block; }
  .wp-task-route span { margin-top: 2px; color: var(--muted-foreground, #667085); font-size: 11px; overflow-wrap: anywhere; }
  .wp-workspace strong, .wp-workspace span, .wp-agent strong, .wp-agent span { display: block; }
  .wp-workspace span, .wp-agent span { margin-top: 2px; color: var(--muted-foreground, #667085); font-size: 11px; overflow-wrap: anywhere; }
  .wp-profile label { display: grid; gap: 4px; color: var(--muted-foreground, #667085); font-size: 11px; }
  .wp-profile input, .wp-profile select { min-width: 0; width: 100%; box-sizing: border-box; border: 1px solid var(--border, #cfd7e3); border-radius: 5px; padding: 7px; color: inherit; background: var(--background, #fff); font: inherit; font-size: 12px; }
  .wp-new-workspace { display: grid; grid-template-columns: minmax(140px, .7fr) minmax(220px, 1.4fr) minmax(180px, 1fr) auto; gap: 8px; align-items: end; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border, #e3e8f0); }
  .wp-new-task-type { display: grid; grid-template-columns: minmax(150px, .8fr) minmax(170px, 1fr) auto; gap: 8px; align-items: end; margin-top: 8px; }
  .wp-agent-map h3 { margin: 16px 0 0; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted-foreground, #667085); }
  .wp-profile-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; margin-top: 12px; }
  .rw-task-board { padding: 18px; }
  .rw-task-board-header { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
  .rw-task-board h1 { font-size: 20px; margin: 0; }
  .rw-task-board-header p { margin: 3px 0 0; }
  .rw-task-empty { margin-top: 18px; }
  .rw-task-empty strong { display: block; color: var(--foreground, #172033); }
  .rw-task-empty p { margin: 4px 0 0; }
  .rw-task-list { display: grid; gap: 8px; }
  .rw-task-row { display: block; padding: 13px 14px; border: 1px solid var(--border, #e3e8f0); border-radius: 7px; color: inherit; text-decoration: none; background: var(--background, #fff); }
  .rw-task-row:hover { border-color: var(--primary, #2563eb); background: var(--accent, #eaf2ff); }
  .rw-task-row-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .rw-task-row strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rw-task-status { flex: 0 0 auto; padding: 2px 7px; border-radius: 999px; font-size: 11px; font-weight: 700; background: var(--muted, #f1f5f9); color: var(--muted-foreground, #667085); }
  .rw-task-status[data-tone="done"] { background: #dcfce7; color: #166534; }
  .rw-task-status[data-tone="blocked"] { background: #fee2e2; color: #991b1b; }
  .rw-task-status[data-tone="active"] { background: #dbeafe; color: #1d4ed8; }
  .rw-task-row-meta { display: flex; flex-wrap: wrap; gap: 4px 12px; color: var(--muted-foreground, #667085); font-size: 12px; margin-top: 5px; }
  .rw-task-row-meta span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ca-page { max-width: 900px; padding: 20px; }
  .ca-page h1 { font-size: 20px; margin: 0 0 5px; }
  .ca-note { margin: 16px 0; padding: 10px 12px; border-left: 3px solid #2563eb; background: #f4f8ff; color: #40516b; font-size: 13px; }
  .ca-list { display: grid; gap: 8px; }
  .ca-agent { display: grid; grid-template-columns: minmax(180px, 1fr) minmax(220px, 1fr); gap: 12px; align-items: center; padding: 12px; border: 1px solid var(--border, #d8dee9); border-radius: 6px; background: var(--background, #fff); }
  .ca-agent strong, .ca-agent span { display: block; }
  .ca-agent span { color: var(--muted-foreground, #667085); font-size: 12px; margin-top: 3px; }
  .ca-select { width: 100%; min-width: 0; border: 1px solid var(--border, #cfd7e3); border-radius: 5px; padding: 8px; color: inherit; background: var(--background, #fff); font: inherit; }
  .ca-path { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .org-page { max-width: 1040px; padding: 20px; }
  .org-page h1 { font-size: 20px; margin: 0 0 5px; }
  .org-templates { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 8px; margin-top: 14px; }
  .org-template { display: grid; gap: 7px; align-content: start; min-height: 124px; padding: 12px; border: 1px solid var(--border, #d8dee9); border-radius: 6px; background: var(--background, #fff); }
  .org-template h2 { margin: 0; font-size: 14px; }
  .org-template p, .org-template small { margin: 0; color: var(--muted-foreground, #667085); font-size: 12px; line-height: 1.45; }
  .org-template .rw-button { justify-self: start; }
  .org-access { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin: 16px 0; padding: 12px; border: 1px solid var(--border, #d8dee9); border-radius: 6px; background: var(--background, #fff); }
  .org-access strong, .org-access span { display: block; }
  .org-access span { margin-top: 3px; color: var(--muted-foreground, #667085); font-size: 12px; }
  .org-collaboration { margin: 16px 0; padding: 14px; border: 1px solid var(--border, #d8dee9); border-radius: 6px; background: var(--background, #fff); }
  .org-collaboration-head { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 12px; }
  .org-collaboration-head strong, .org-collaboration-head span { display: block; }
  .org-collaboration-head span { margin-top: 3px; color: var(--muted-foreground, #667085); font-size: 12px; }
  .org-readiness { margin: 12px 0 0; padding: 10px 12px; border-left: 3px solid #64748b; background: #f8fafc; color: #334155; font-size: 12px; }
  .org-readiness.ready { border-color: #15803d; background: #f0fdf4; color: #166534; }
  .org-readiness.attention { border-color: #b45309; background: #fffbeb; color: #78350f; }
  .org-readiness strong, .org-readiness span { display: block; }
  .org-readiness span { margin-top: 2px; }
  .org-readiness-checks { display: grid; gap: 6px; margin: 12px 0 0; padding: 0; list-style: none; }
  .org-readiness-checks li { display: grid; grid-template-columns: minmax(110px, 160px) minmax(0, 1fr); gap: 9px; align-items: baseline; padding-top: 6px; border-top: 1px solid var(--border, #e3e8f0); font-size: 12px; }
  .org-readiness-checks li:first-child { padding-top: 0; border-top: 0; }
  .org-readiness-checks strong { color: var(--foreground, #172033); }
  .org-readiness-checks [data-status="pass"] { color: #15803d; }
  .org-readiness-checks [data-status="warn"] { color: #b45309; }
  .org-readiness-checks [data-status="fail"] { color: #b42318; }
  .org-readiness-warning { margin: 10px 0 0; color: #b45309; font-size: 12px; }
  .org-empty { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-top: 16px; padding: 16px; border: 1px dashed var(--border, #d8dee9); border-radius: 6px; }
  .org-empty strong, .org-empty span { display: block; }
  .org-empty span { margin-top: 3px; color: var(--muted-foreground, #667085); font-size: 12px; }
  .org-list { display: grid; gap: 8px; margin-top: 16px; container-type: inline-size; }
  .org-agent { display: grid; grid-template-columns: minmax(150px, 1.1fr) minmax(0, 2.8fr) auto; grid-template-areas: "meta policy actions" "status status status"; gap: 10px 14px; align-items: end; min-width: 0; padding: 12px; border: 1px solid var(--border, #d8dee9); border-radius: 6px; background: var(--background, #fff); }
  .org-agent-meta { grid-area: meta; min-width: 0; }
  .org-agent-meta strong, .org-agent-meta span { display: block; }
  .org-agent-meta span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .org-agent-meta span, .org-field label { color: var(--muted-foreground, #667085); font-size: 12px; margin-top: 3px; }
  .org-agent-policy { grid-area: policy; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; min-width: 0; }
  .org-field { display: grid; gap: 5px; min-width: 0; }
  .org-field label { margin: 0; }
  .org-field input, .org-field select { min-width: 0; width: 100%; box-sizing: border-box; border: 1px solid var(--border, #cfd7e3); border-radius: 5px; padding: 8px; color: inherit; background: var(--background, #fff); font: inherit; }
  .org-agent-actions { grid-area: actions; display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px; }
  .org-agent-status { grid-area: status; color: var(--muted-foreground, #667085); font-size: 12px; }
  .org-agent-advanced { grid-column: 1 / -1; color: var(--muted-foreground, #667085); font-size: 12px; }
  .org-agent-advanced summary { cursor: pointer; width: fit-content; }
  .org-agent-advanced-content { display: grid; grid-template-columns: minmax(180px, 260px); gap: 8px; margin-top: 9px; }
  @media (max-width: 640px) { .ca-page { padding: 16px; } .ca-agent { grid-template-columns: 1fr; } }
  @container (max-width: 920px) { .org-agent { grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "meta actions" "policy policy" "status status"; } .org-agent-policy { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @container (max-width: 560px) { .org-agent { grid-template-columns: 1fr; grid-template-areas: "meta" "policy" "actions" "status"; } .org-agent-policy, .org-agent-advanced-content { grid-template-columns: 1fr; } .org-agent-actions { justify-content: flex-start; } }
  @media (max-width: 720px) { .wp-workspace, .wp-agent, .wp-task-route, .wp-new-workspace, .wp-new-task-type { grid-template-columns: 1fr; } }
  @media (max-width: 1200px) { .rw-layout { --rw-room-width: 210px; grid-template-columns: var(--rw-room-width) minmax(0, 1fr); } .rw-context { display: none; } .rw-room-resizer, .rw-context-resizer { display: none; } .rw-actions { align-items: flex-end; flex-wrap: wrap; } .rw-composer-status { white-space: normal; } }
  @media (max-width: 720px) { .rw-layout { display: block; height: auto; min-height: 0; overflow: visible; } .rw-rooms { border-right: 0; border-bottom: 1px solid var(--border, #d8dee9); max-height: 210px; } .rw-main { min-height: 620px; } .rw-project { padding: 16px; } .rw-project-header { display: block; } .rw-project-actions { margin-top: 12px; } .rw-project-summary { grid-template-columns: 1fr; } }
  @media (max-width: 1200px) {
    .rw-layout.context-open { grid-template-columns: var(--rw-room-width) minmax(0, 1fr); }
    .rw-layout.context-open .rw-context { display: grid; position: absolute; inset: 0 0 0 auto; grid-column: auto; grid-row: auto; width: min(var(--rw-context-width), calc(100% - var(--rw-room-width))); box-shadow: -18px 0 32px rgba(15, 23, 42, .14); }
    .rw-context-shortcut { display: none; }
  }
  @media (max-width: 720px) {
    .rw-layout.context-open { display: block; height: auto; min-height: 620px; overflow: hidden; }
    .rw-layout.context-open .rw-context { position: absolute; inset: 0; width: auto; border-left: 0; box-shadow: none; }
    .rw-header-actions { gap: 5px; }
    .rw-header .rw-status-badge { display: none; }
  }
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
function taskStatusPresentation(status) {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "done" || normalized === "completed") return { label: "\uC644\uB8CC", tone: "done" };
  if (normalized === "blocked") return { label: "\uCC28\uB2E8\uB428", tone: "blocked" };
  if (normalized === "in_progress" || normalized === "in progress") return { label: "\uC9C4\uD589 \uC911", tone: "active" };
  if (normalized === "todo") return { label: "\uD560 \uC77C", tone: "active" };
  if (normalized === "backlog") return { label: "\uB300\uAE30", tone: "default" };
  return { label: status || "\uC54C \uC218 \uC5C6\uC74C", tone: "default" };
}
function roomHref(navigation, projectId, roomId) {
  const params = new URLSearchParams({ project: projectId, room: roomId });
  return navigation.resolveHref(`/agent-rooms?${params.toString()}`);
}
function roomRoleSummary(room) {
  const title = String(room?.title || "").trim().toLocaleLowerCase();
  const role = String(room?.agent?.role || "").trim();
  return !role || title === role.toLocaleLowerCase() ? "\uC9C0\uC18D \uB300\uD654 Room" : `\uC5ED\uD560: ${role}`;
}
function roomAgentAttention(room) {
  const status = String(room?.agent?.status || "").trim().toLocaleLowerCase();
  if (!status || status === "ready") return "";
  return status === "error" ? "Agent needs attention" : `Agent ${status}`;
}
function workspaceFileNodes(workspaces) {
  const filesByNodePath = /* @__PURE__ */ new Map();
  const nodes = (workspaces || []).flatMap((workspace) => (workspace.files || []).map((file, index) => {
    const path = `workspace-${workspace.id || workspace.name}-${index}`;
    filesByNodePath.set(path, { workspaceId: workspace.id, path: file.path });
    return {
      name: `${workspace.name}: ${file.path}`,
      path,
      kind: "file",
      children: []
    };
  }));
  return { nodes, filesByNodePath };
}
function RoomContext({ data, navigation, activeTab, setActiveTab, onClose, onOpenWorkspaceFile, width, onResizeStart, onResizeKeyDown, onResetWidth }) {
  const state = data?.state || {};
  const workState = data?.workState || {};
  const activity = state.runtime?.activity || {};
  const tasks = (data?.tasks || []).filter((task) => task.status !== "cancelled");
  const { nodes, filesByNodePath } = workspaceFileNodes(data?.workspaces);
  const attachments = data?.attachments || [];
  const latestOutcome = workState.latestOutcome || null;
  const nextCandidate = workState.nextCandidate || null;
  const waitingFor = workState.waitingFor || { kind: "none" };
  const tabs = [
    { id: "work", label: "\uC791\uC5C5" },
    { id: "tasks", label: `Tasks${tasks.length ? ` ${tasks.length}` : ""}` },
    { id: "changes", label: `\uBCC0\uACBD ${data?.changedFileCount || nodes.length || ""}`.trim() },
    { id: "files", label: `\uD30C\uC77C${attachments.length ? ` ${attachments.length}` : ""}` }
  ];
  return /* @__PURE__ */ jsxs("aside", { className: "rw-context", children: [
    /* @__PURE__ */ jsxs("header", { className: "rw-context-header", children: [
      /* @__PURE__ */ jsxs("div", { className: "rw-context-heading", children: [
        /* @__PURE__ */ jsx("strong", { children: "Room \uCEE8\uD14D\uC2A4\uD2B8" }),
        /* @__PURE__ */ jsxs("div", { className: "rw-context-heading-actions", children: [
          /* @__PURE__ */ jsx("span", { children: activity.status === "working" ? "\uC791\uC5C5 \uC911" : "\uC800\uC7A5\uB428" }),
          /* @__PURE__ */ jsx("button", { type: "button", className: "rw-context-close", onClick: onClose, "aria-label": "\uC791\uC5C5 \uD328\uB110 \uB2EB\uAE30", children: "\xD7" })
        ] })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "rw-context-tabs", role: "tablist", "aria-label": "Room context", children: tabs.map((tab) => /* @__PURE__ */ jsx("button", { type: "button", role: "tab", "aria-selected": activeTab === tab.id, className: `rw-context-tab ${activeTab === tab.id ? "active" : ""}`, onClick: () => setActiveTab(tab.id), children: tab.label }, tab.id)) })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "rw-context-body", children: [
      activeTab === "work" ? /* @__PURE__ */ jsxs("section", { className: "rw-context-panel", children: [
        /* @__PURE__ */ jsx("h3", { children: "\uD604\uC7AC \uC791\uC5C5" }),
        /* @__PURE__ */ jsxs("p", { className: "rw-focus-value", children: [
          /* @__PURE__ */ jsx("span", { className: "rw-focus-label", children: "\uBAA9\uD45C" }),
          workState.objective || "\uC544\uC9C1 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4."
        ] }),
        /* @__PURE__ */ jsxs("p", { className: "rw-focus-value", children: [
          /* @__PURE__ */ jsx("span", { className: "rw-focus-label", children: "\uB2E8\uACC4" }),
          workState.phase || "\uC544\uC9C1 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4."
        ] }),
        /* @__PURE__ */ jsxs("p", { className: "rw-focus-value", children: [
          /* @__PURE__ */ jsx("span", { className: "rw-focus-label", children: "\uCD5C\uADFC \uACB0\uACFC" }),
          latestOutcome ? `${latestOutcome.identifier || latestOutcome.taskId || "\uACB0\uACFC"}${latestOutcome.status ? ` \xB7 ${latestOutcome.status}` : ""}${latestOutcome.summary ? ` \xB7 ${latestOutcome.summary}` : ""}` : "\uC544\uC9C1 \uAE30\uB85D\uB41C \uACB0\uACFC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4."
        ] }),
        nextCandidate?.summary ? /* @__PURE__ */ jsxs("p", { className: "rw-focus-value", children: [
          /* @__PURE__ */ jsx("span", { className: "rw-focus-label", children: "\uB2E4\uC74C \uD6C4\uBCF4" }),
          nextCandidate.summary
        ] }) : null,
        waitingFor.kind && waitingFor.kind !== "none" ? /* @__PURE__ */ jsxs("p", { className: "rw-focus-value", children: [
          /* @__PURE__ */ jsx("span", { className: "rw-focus-label", children: "\uB300\uAE30 \uC911" }),
          waitingFor.kind,
          waitingFor.detail ? ` \xB7 ${waitingFor.detail}` : ""
        ] }) : null,
        (workState.planReferences || []).length ? /* @__PURE__ */ jsx("ul", { className: "rw-focus-sources", children: workState.planReferences.map((reference) => /* @__PURE__ */ jsx("li", { children: reference }, reference)) }) : null,
        /* @__PURE__ */ jsxs("details", { className: "rw-context-session", children: [
          /* @__PURE__ */ jsx("summary", { children: "\uC138\uC158 \uC0C1\uC138" }),
          /* @__PURE__ */ jsxs("dl", { className: "rw-key-value", children: [
            /* @__PURE__ */ jsx("dt", { children: "Runtime" }),
            /* @__PURE__ */ jsx("dd", { children: data?.runtime?.enabled ? data?.runtime?.kind === "agy_print" ? "Agy" : "Codex" : "Disabled" }),
            /* @__PURE__ */ jsx("dt", { children: "Model" }),
            /* @__PURE__ */ jsx("dd", { children: data?.runtime?.model || "Default" }),
            /* @__PURE__ */ jsx("dt", { children: "Reasoning" }),
            /* @__PURE__ */ jsx("dd", { children: data?.runtime?.reasoningEffort || "Model default" }),
            /* @__PURE__ */ jsx("dt", { children: "Workspace" }),
            /* @__PURE__ */ jsx("dd", { children: state.workspace?.name || "Not bound" }),
            /* @__PURE__ */ jsx("dt", { children: "Conversation" }),
            /* @__PURE__ */ jsx("dd", { children: state.runtime?.codexThreadId || state.runtime?.agentSessionId || data?.runtime?.kind === "agy_print" ? "Resumable" : "Not started" }),
            /* @__PURE__ */ jsx("dt", { children: "Activity" }),
            /* @__PURE__ */ jsx("dd", { children: activity.status || "idle" }),
            /* @__PURE__ */ jsx("dt", { children: "Checkpoint" }),
            /* @__PURE__ */ jsx("dd", { children: state.checkpoint?.version || 0 }),
            /* @__PURE__ */ jsx("dt", { children: "Auto compact" }),
            /* @__PURE__ */ jsx("dd", { children: data?.runtime?.kind === "codex_app_server" ? "Native Codex" : "Adapter managed" })
          ] })
        ] })
      ] }) : null,
      activeTab === "tasks" ? /* @__PURE__ */ jsxs("section", { className: "rw-context-panel", children: [
        /* @__PURE__ */ jsx("h3", { children: "\uC774 Room\uC758 Tasks" }),
        tasks.length ? /* @__PURE__ */ jsx("div", { className: "rw-context-task-list", children: tasks.map((task) => /* @__PURE__ */ jsxs("a", { className: "rw-task", ...navigation.linkProps(taskHref(navigation, task)), children: [
          /* @__PURE__ */ jsx("div", { className: "rw-task-title", children: task.title }),
          /* @__PURE__ */ jsxs("div", { className: "rw-task-meta", children: [
            task.identifier,
            " \xB7 ",
            task.status,
            " \xB7 ",
            task.assigneeAgent?.name || "Unassigned"
          ] })
        ] }, task.id)) }) : /* @__PURE__ */ jsx("p", { className: "rw-context-empty", children: "\uC774 Room\uC5D0\uC11C \uC0DD\uC131\uB41C \uC2E4\uD589 Task\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4." })
      ] }) : null,
      activeTab === "changes" ? /* @__PURE__ */ jsxs("section", { className: "rw-context-panel", children: [
        /* @__PURE__ */ jsx("h3", { children: "\uC791\uC5C5 \uD3F4\uB354 \uBCC0\uACBD\uC0AC\uD56D" }),
        /* @__PURE__ */ jsx("div", { className: "rw-context-changes", children: /* @__PURE__ */ jsx(FileTree, { nodes, wrapLabels: true, onSelectFile: (nodePath) => onOpenWorkspaceFile?.(filesByNodePath.get(nodePath)), emptyState: { title: "No workspace changes" } }) })
      ] }) : null,
      activeTab === "files" ? /* @__PURE__ */ jsxs("section", { className: "rw-context-panel", children: [
        /* @__PURE__ */ jsx("h3", { children: "Room \uD30C\uC77C" }),
        attachments.length ? /* @__PURE__ */ jsx(AttachmentList, { attachments, className: "rw-context-files" }) : /* @__PURE__ */ jsx("p", { className: "rw-context-empty", children: "\uC774 Room\uC5D0 \uCCA8\uBD80\uB41C \uD30C\uC77C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." })
      ] }) : null
    ] }),
    /* @__PURE__ */ jsx("div", { className: "rw-context-resizer", role: "separator", tabIndex: 0, "aria-label": "Room \uCEE8\uD14D\uC2A4\uD2B8 \uB108\uBE44 \uC870\uC808", "aria-orientation": "vertical", "aria-valuemin": ROOM_CONTEXT_MIN_WIDTH, "aria-valuemax": ROOM_CONTEXT_MAX_WIDTH, "aria-valuenow": width, title: "\uB4DC\uB798\uADF8\uD558\uC5EC Room \uCEE8\uD14D\uC2A4\uD2B8 \uB108\uBE44 \uC870\uC808. \uB450 \uBC88 \uD074\uB9AD\uD558\uBA74 \uAE30\uBCF8 \uB108\uBE44\uB85C \uBCF5\uC6D0\uD569\uB2C8\uB2E4.", onPointerDown: onResizeStart, onKeyDown: onResizeKeyDown, onDoubleClick: onResetWidth })
  ] });
}
function RoomActivity({ activity }) {
  if (!activity || !(activity.steps || []).length || activity.status === "completed") return null;
  const status = activity.status === "working" ? "\uC791\uC5C5 \uC911" : activity.status === "completed" ? "\uC644\uB8CC" : "\uC2E4\uD328";
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
  const [contextOpen, setContextOpen] = useState(false);
  const [contextTab, setContextTab] = useState("work");
  const [roomListOpen, setRoomListOpen] = useState(true);
  const [roomListWidth, setRoomListWidth] = useState(savedRoomListWidth);
  const [roomContextWidth, setRoomContextWidth] = useState(savedRoomContextWidth);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState("");
  const layoutRef = useRef(null);
  const threadRef = useRef(null);
  const followLatestRef = useRef(true);
  const attachmentInputRef = useRef(null);
  const contextTriggerRef = useRef(null);
  const activity = data?.state?.runtime?.activity;
  const working = activity?.status === "working";
  useEffect(() => {
    if (!working) return void 0;
    const timer = setInterval(() => {
      void refresh();
    }, 2e3);
    return () => clearInterval(timer);
  }, [working, refresh]);
  useEffect(() => {
    try {
      window.localStorage.setItem(ROOM_LIST_WIDTH_KEY, String(roomListWidth));
    } catch {
    }
  }, [roomListWidth]);
  useEffect(() => {
    try {
      window.localStorage.setItem(ROOM_CONTEXT_WIDTH_KEY, String(roomContextWidth));
    } catch {
    }
  }, [roomContextWidth]);
  useEffect(() => {
    if (!contextOpen || !roomListOpen || typeof window === "undefined" || !window.matchMedia("(min-width: 1201px)").matches) return;
    const availableWidth = layoutRef.current?.clientWidth || 0;
    if (!availableWidth) return;
    const safeContextWidth = clampRoomContextWidth(roomContextWidth, availableWidth - roomListWidth - ROOM_MAIN_MIN_WIDTH);
    const safeRoomListWidth = clampRoomListWidth(roomListWidth, availableWidth - safeContextWidth - ROOM_MAIN_MIN_WIDTH);
    if (safeContextWidth !== roomContextWidth) setRoomContextWidth(safeContextWidth);
    if (safeRoomListWidth !== roomListWidth) setRoomListWidth(safeRoomListWidth);
  }, [contextOpen, roomListOpen, roomListWidth, roomContextWidth]);
  const beginRoomListResize = (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = roomListWidth;
    const availableWidth = layoutRef.current?.clientWidth || 0;
    const maximum = contextOpen && availableWidth ? availableWidth - roomContextWidth - ROOM_MAIN_MIN_WIDTH : ROOM_LIST_MAX_WIDTH;
    const onMove = (moveEvent) => setRoomListWidth(clampRoomListWidth(startWidth + moveEvent.clientX - startX, maximum));
    const onEnd = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
  };
  const adjustRoomListWidth = (event) => {
    const adjustment = event.key === "ArrowLeft" ? -16 : event.key === "ArrowRight" ? 16 : 0;
    if (event.key === "Home") {
      event.preventDefault();
      setRoomListWidth(ROOM_LIST_MIN_WIDTH);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      setRoomListWidth(ROOM_LIST_MAX_WIDTH);
      return;
    }
    if (!adjustment) return;
    event.preventDefault();
    const availableWidth = layoutRef.current?.clientWidth || 0;
    const maximum = contextOpen && availableWidth ? availableWidth - roomContextWidth - ROOM_MAIN_MIN_WIDTH : ROOM_LIST_MAX_WIDTH;
    setRoomListWidth((current) => clampRoomListWidth(current + adjustment, maximum));
  };
  const beginRoomContextResize = (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = roomContextWidth;
    const availableWidth = layoutRef.current?.clientWidth || 0;
    const maximum = availableWidth ? availableWidth - (roomListOpen ? roomListWidth : 0) - ROOM_MAIN_MIN_WIDTH : ROOM_CONTEXT_MAX_WIDTH;
    const onMove = (moveEvent) => setRoomContextWidth(clampRoomContextWidth(startWidth + startX - moveEvent.clientX, maximum));
    const onEnd = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
  };
  const adjustRoomContextWidth = (event) => {
    const adjustment = event.key === "ArrowLeft" ? 16 : event.key === "ArrowRight" ? -16 : 0;
    if (event.key === "Home") {
      event.preventDefault();
      setRoomContextWidth(ROOM_CONTEXT_MIN_WIDTH);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      setRoomContextWidth(ROOM_CONTEXT_MAX_WIDTH);
      return;
    }
    if (!adjustment) return;
    event.preventDefault();
    const availableWidth = layoutRef.current?.clientWidth || 0;
    const maximum = availableWidth ? availableWidth - (roomListOpen ? roomListWidth : 0) - ROOM_MAIN_MIN_WIDTH : ROOM_CONTEXT_MAX_WIDTH;
    setRoomContextWidth((current) => clampRoomContextWidth(current + adjustment, maximum));
  };
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
      if (!attachment?.id) throw new Error("SPS did not return an attachment id.");
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
      const result = await sendRoom({ issueId: roomId, message: text, attachmentIds, ...retrySource?.commentId ? { retryOfCommentId: retrySource.commentId } : {} });
      if (result?.ok === false) throw new Error(result.message || result.code || "Room message could not be queued.");
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
      const result = await compactRoom({ issueId: roomId });
      if (result?.ok === false) throw new Error(result.message || result.code || "Room checkpoint could not be queued.");
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
  const workspaceSetup = data?.workspaceSetup;
  const workspaceReady = !workspaceSetup || workspaceSetup.state === "ready" || workspaceSetup.state === "legacy";
  const workspaceRouteKey = data?.project?.routeKey || currentProjectId;
  const workspaceSetupHref = workspaceRouteKey ? navigation.resolveHref(`/projects/${encodeURIComponent(workspaceRouteKey)}?tab=plugin%3Alocal.room-chat%3Aproject-workplane`) : "";
  const workspaceNotice = workspaceSetup?.state === "missing" ? "Set the Project local folder in Configuration before this Room starts an Agent turn." : workspaceSetup?.state === "unavailable" ? "The selected Project Workspace is not available on this computer. Update its local path before starting an Agent turn." : "";
  const contextTaskCount = (data?.tasks || []).filter((task) => task.status !== "cancelled").length;
  const contextChangedCount = data?.changedFileCount || workspaceFileNodes(data?.workspaces).nodes.length;
  const contextAttachmentCount = (data?.attachments || []).length;
  const closeContext = () => {
    setContextOpen(false);
    window.requestAnimationFrame(() => contextTriggerRef.current?.focus());
  };
  const openContext = (tab = "work", trigger = null) => {
    if (trigger) contextTriggerRef.current = trigger;
    setContextTab(tab);
    setContextOpen(true);
  };
  useEffect(() => {
    if (!contextOpen || filePreview) return void 0;
    const closeWithEscape = (event) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      closeContext();
    };
    window.addEventListener("keydown", closeWithEscape);
    return () => window.removeEventListener("keydown", closeWithEscape);
  }, [contextOpen, filePreview]);
  useEffect(() => {
    if (!filePreview) return void 0;
    const closePreviewWithEscape = (event) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      setFilePreview(null);
    };
    window.addEventListener("keydown", closePreviewWithEscape);
    return () => window.removeEventListener("keydown", closePreviewWithEscape);
  }, [filePreview]);
  const renderRoomText = (comment) => rewriteWorkspaceMarkdownLinks(roomText(comment), {
    linkBaseHref: roomPageHref,
    roomIssueId: roomId,
    targets: data?.workspaceLinkTargets
  });
  const openWorkspaceFile = async ({ path: file, projectId = currentProjectId, workspaceId } = {}) => {
    if (!file || !projectId || !workspaceId) return;
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
    await openWorkspaceFile({ path: file, projectId, workspaceId });
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
    setContextOpen(false);
    setContextTab("work");
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
  return /* @__PURE__ */ jsxs("div", { ref: layoutRef, className: `rw-layout ${contextOpen ? "context-open" : ""} ${roomListOpen ? "" : "rooms-collapsed"}`, style: { "--rw-room-width": roomListOpen ? `${roomListWidth}px` : "0px", "--rw-context-width": `${roomContextWidth}px` }, children: [
    roomListOpen && workplane ? /* @__PURE__ */ jsx(RoomList, { navigation, workplane, projectId: currentProjectId, roomId, width: roomListWidth, onResizeStart: beginRoomListResize, onResizeKeyDown: adjustRoomListWidth, onResetWidth: () => setRoomListWidth(ROOM_LIST_DEFAULT_WIDTH) }) : null,
    /* @__PURE__ */ jsxs("main", { className: "rw-main", children: [
      /* @__PURE__ */ jsxs("header", { className: "rw-header", children: [
        /* @__PURE__ */ jsxs("div", { className: "rw-header-copy", children: [
          /* @__PURE__ */ jsx("h1", { className: "rw-title", children: roomName }),
          /* @__PURE__ */ jsx("p", { className: "rw-subtitle", children: "\uC9C0\uC18D \uB300\uD654 Room" })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "rw-header-actions", children: [
          /* @__PURE__ */ jsx("button", { type: "button", className: "rw-room-list-trigger", onClick: () => setRoomListOpen((current) => !current), "aria-expanded": roomListOpen, "aria-label": roomListOpen ? "Room \uBAA9\uB85D \uB2EB\uAE30" : "Room \uBAA9\uB85D \uC5F4\uAE30", title: roomListOpen ? "Room \uBAA9\uB85D \uB2EB\uAE30" : "Room \uBAA9\uB85D \uC5F4\uAE30", children: "\u2630" }),
          /* @__PURE__ */ jsx(StatusBadge, { label: working ? "\uC791\uC5C5 \uC911" : data?.runtime?.enabled ? "\uC900\uBE44\uB428" : "\uB7F0\uD0C0\uC784 \uBE44\uD65C\uC131", status: working ? "warning" : data?.runtime?.enabled ? "ok" : "pending" }),
          /* @__PURE__ */ jsxs("button", { type: "button", className: "rw-context-shortcut", onClick: (event) => openContext("tasks", event.currentTarget), children: [
            "Tasks",
            contextTaskCount ? ` ${contextTaskCount}` : ""
          ] }),
          /* @__PURE__ */ jsxs("button", { type: "button", className: "rw-context-shortcut", onClick: (event) => openContext("changes", event.currentTarget), children: [
            "\uBCC0\uACBD",
            contextChangedCount ? ` ${contextChangedCount}` : ""
          ] }),
          /* @__PURE__ */ jsxs("button", { type: "button", className: "rw-context-shortcut", onClick: (event) => openContext("files", event.currentTarget), children: [
            "\uD30C\uC77C",
            contextAttachmentCount ? ` ${contextAttachmentCount}` : ""
          ] }),
          /* @__PURE__ */ jsx("button", { type: "button", className: "rw-context-trigger", onClick: (event) => contextOpen ? closeContext() : openContext(contextTab, event.currentTarget), "aria-expanded": contextOpen, children: "\uD328\uB110" })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("section", { className: "rw-thread", ref: threadRef, onScroll: trackThreadScroll, children: [
        messages.length ? messages.map((comment) => {
          const attachmentIds = roomAttachmentIds(comment);
          const attachments = attachmentIds.map((id) => (data?.attachments || []).find((attachment) => attachment.id === id)).filter(Boolean);
          const showActivity = activity?.sourceCommentId && activity.sourceCommentId === comment.id;
          const isUserMessage = roomLabel(comment) === "User";
          const isSuperseded = supersededMessageIds.has(comment.id);
          return /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsxs("article", { className: `rw-message ${isUserMessage ? "user" : "agent"}`, children: [
              /* @__PURE__ */ jsx("div", { className: "rw-message-label", children: /* @__PURE__ */ jsxs("span", { children: [
                roomLabel(comment),
                isSuperseded ? " (revised)" : ""
              ] }) }),
              /* @__PURE__ */ jsx("div", { onClick: openRoomFile, children: /* @__PURE__ */ jsx(MarkdownBlock, { className: "rw-message-body", content: renderRoomText(comment), enableWikiLinks: true }) }),
              /* @__PURE__ */ jsx(AttachmentList, { attachments, className: "rw-message-attachments" }),
              isUserMessage ? /* @__PURE__ */ jsx("div", { className: "rw-message-actions", children: /* @__PURE__ */ jsx("button", { type: "button", className: "rw-text-button", onClick: () => editAndRetry(comment), disabled: submitting || working || !data?.runtime?.enabled, children: "\uC218\uC815 \uD6C4 \uC7AC\uC2DC\uB3C4" }) }) : null
            ] }),
            showActivity ? /* @__PURE__ */ jsx(RoomActivity, { activity }) : null
          ] }, comment.id || `${comment.createdAt}-${comment.body}`);
        }) : /* @__PURE__ */ jsxs("div", { className: "rw-empty rw-room-empty", children: [
          /* @__PURE__ */ jsx("strong", { children: "\uC9C0\uC18D \uB300\uD654\uB97C \uC2DC\uC791\uD558\uC138\uC694" }),
          /* @__PURE__ */ jsx("p", { children: "\uC774 Room\uC740 Agent\uC758 \uB9E5\uB77D, \uACB0\uC815, \uCCB4\uD06C\uD3EC\uC778\uD2B8\uB97C \uC5EC\uB7EC \uC791\uC5C5\uC5D0 \uAC78\uCCD0 \uC720\uC9C0\uD569\uB2C8\uB2E4." })
        ] }),
        activity && !activity.sourceCommentId ? /* @__PURE__ */ jsx(RoomActivity, { activity }) : null
      ] }),
      /* @__PURE__ */ jsx("footer", { className: "rw-composer", children: /* @__PURE__ */ jsxs("div", { className: "rw-composer-surface", children: [
        actionError ? /* @__PURE__ */ jsx("div", { className: "rw-error", children: actionError }) : null,
        workspaceNotice ? /* @__PURE__ */ jsxs("div", { className: "rw-workspace-notice", children: [
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("strong", { children: "\uD504\uB85C\uC81D\uD2B8 \uC791\uC5C5 \uD3F4\uB354\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4" }),
            /* @__PURE__ */ jsx("span", { children: workspaceNotice })
          ] }),
          workspaceSetupHref ? /* @__PURE__ */ jsx("a", { className: "rw-button", ...navigation.linkProps(workspaceSetupHref), children: "\uC791\uC5C5\uACF5\uAC04 \uC124\uC815 \uC5F4\uAE30" }) : null
        ] }) : null,
        retrySource ? /* @__PURE__ */ jsxs("div", { className: "rw-retry-draft", children: [
          /* @__PURE__ */ jsx("span", { children: "\uC774\uC804 \uBA54\uC2DC\uC9C0\uB97C \uC218\uC815\uD558\uACE0 \uC788\uC2B5\uB2C8\uB2E4. \uBCF4\uB0B4\uBA74 \uC6D0\uBB38\uC740 Room \uC774\uB825\uC5D0 \uB0A8\uAE30\uACE0 \uC218\uC815\uBCF8\uC73C\uB85C \uC7AC\uC2DC\uB3C4\uD569\uB2C8\uB2E4." }),
          /* @__PURE__ */ jsx("button", { type: "button", className: "rw-text-button", onClick: () => setRetrySource(null), disabled: submitting, children: "\uCDE8\uC18C" })
        ] }) : null,
        /* @__PURE__ */ jsx(MarkdownEditor, { value: message, onChange: setMessage, onSubmit: send, bordered: true, placeholder: `${roomName}\uC5D0\uAC8C \uBA54\uC2DC\uC9C0` }),
        /* @__PURE__ */ jsx("input", { ref: attachmentInputRef, className: "rw-file-input", type: "file", multiple: true, onChange: queueFiles }),
        queuedAttachments.length ? /* @__PURE__ */ jsx("div", { className: "rw-attachment-queue", children: queuedAttachments.map((attachment) => /* @__PURE__ */ jsxs("div", { className: "rw-attachment-chip", children: [
          /* @__PURE__ */ jsx("span", { title: attachment.file.name, children: attachment.file.name }),
          /* @__PURE__ */ jsx("small", { children: formatBytes(attachment.file.size) }),
          /* @__PURE__ */ jsx("button", { type: "button", "aria-label": `${attachment.file.name} remove`, onClick: () => removeQueuedAttachment(attachment.clientId), disabled: submitting, children: "\xD7" })
        ] }, attachment.clientId)) }) : null,
        /* @__PURE__ */ jsxs("div", { className: "rw-composer-tools", children: [
          /* @__PURE__ */ jsx("button", { type: "button", className: "rw-button", onClick: () => attachmentInputRef.current?.click(), disabled: submitting || working || !workspaceReady || !data?.runtime?.enabled, children: "\uD30C\uC77C \uCCA8\uBD80" }),
          /* @__PURE__ */ jsx("span", { className: "rw-muted", children: "\uCCA8\uBD80 \uD30C\uC77C\uC740 \uD504\uB85C\uC81D\uD2B8 \uC800\uC7A5\uC18C\uAC00 \uC544\uB2C8\uB77C \uC774 Room\uC5D0 \uBCF4\uAD00\uB429\uB2C8\uB2E4." })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "rw-actions", children: [
          /* @__PURE__ */ jsx("span", { className: "rw-composer-status", children: "\uB300\uD654 \uC774\uB825\uC740 \uC790\uB3D9 \uC800\uC7A5\uB429\uB2C8\uB2E4" }),
          /* @__PURE__ */ jsxs("div", { className: "rw-composer-buttons", children: [
            /* @__PURE__ */ jsx("button", { type: "button", className: "rw-button", onClick: compact, disabled: submitting || working || !workspaceReady || !data?.runtime?.enabled, children: "\uC555\uCD95 \uBC0F \uCCB4\uD06C\uD3EC\uC778\uD2B8" }),
            /* @__PURE__ */ jsx("button", { type: "button", className: "rw-button primary", onClick: send, disabled: submitting || working || !workspaceReady || !message.trim() && !queuedAttachments.length && !retrySource?.attachmentIds?.length || !data?.runtime?.enabled, children: retrySource ? "\uC7AC\uC2DC\uB3C4" : "\uBCF4\uB0B4\uAE30" })
          ] })
        ] })
      ] }) })
    ] }),
    contextOpen ? /* @__PURE__ */ jsx(RoomContext, { data, navigation, activeTab: contextTab, setActiveTab: setContextTab, onClose: closeContext, onOpenWorkspaceFile: openWorkspaceFile, width: roomContextWidth, onResizeStart: beginRoomContextResize, onResizeKeyDown: adjustRoomContextWidth, onResetWidth: () => setRoomContextWidth(ROOM_CONTEXT_DEFAULT_WIDTH) }) : null,
    /* @__PURE__ */ jsx(RoomFilePreview, { preview: filePreview, onClose: () => setFilePreview(null) })
  ] });
}
function RoomList({ navigation, workplane, projectId, roomId, width, onResizeStart, onResizeKeyDown, onResetWidth }) {
  const projectRoomsHref = navigation.resolveHref(`/agent-rooms?project=${encodeURIComponent(projectId)}`);
  return /* @__PURE__ */ jsxs("aside", { className: "rw-rooms", children: [
    /* @__PURE__ */ jsxs("div", { className: "rw-room-list", children: [
      /* @__PURE__ */ jsxs("a", { className: "rw-room-project-link", ...navigation.linkProps(projectRoomsHref), children: [
        workplane.project?.name || "\uD504\uB85C\uC81D\uD2B8",
        /* @__PURE__ */ jsx("span", { children: "\uD504\uB85C\uC81D\uD2B8 Rooms" })
      ] }),
      (workplane.rooms || []).map((room) => {
        const attention = roomAgentAttention(room);
        return /* @__PURE__ */ jsxs("a", { className: `rw-room ${room.id === roomId ? "active" : ""}`, ...navigation.linkProps(roomHref(navigation, projectId, room.id)), children: [
          /* @__PURE__ */ jsx("strong", { children: room.title }),
          /* @__PURE__ */ jsx("span", { children: roomRoleSummary(room) }),
          attention ? /* @__PURE__ */ jsx("small", { children: attention }) : null
        ] }, room.id);
      })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "rw-room-resizer", role: "separator", tabIndex: 0, "aria-label": "Room \uBAA9\uB85D \uB108\uBE44 \uC870\uC808", "aria-orientation": "vertical", "aria-valuemin": ROOM_LIST_MIN_WIDTH, "aria-valuemax": ROOM_LIST_MAX_WIDTH, "aria-valuenow": width, title: "\uB4DC\uB798\uADF8\uD558\uC5EC Room \uBAA9\uB85D \uB108\uBE44 \uC870\uC808. \uB450 \uBC88 \uD074\uB9AD\uD558\uBA74 \uAE30\uBCF8 \uB108\uBE44\uB85C \uBCF5\uC6D0\uD569\uB2C8\uB2E4.", onPointerDown: onResizeStart, onKeyDown: onResizeKeyDown, onDoubleClick: onResetWidth })
  ] });
}
function WorkspaceProfile({ context, workplane, onRefresh }) {
  const getAccess = usePluginAction("workspace-profile-access");
  const saveProfile = usePluginAction("workspace-profile-save");
  const createWorkspace = usePluginAction("workspace-profile-create-workspace");
  const [canConfigure, setCanConfigure] = useState(null);
  const [draft, setDraft] = useState(null);
  const [newWorkspace, setNewWorkspace] = useState({ name: "", cwd: "", repoUrl: "" });
  const [newTaskType, setNewTaskType] = useState({ id: "", label: "" });
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const profileData = workplane?.workspaceProfile || {};
  const workspaces = profileData.workspaces || [];
  const agents = profileData.agents || [];
  const profile = profileData.profile || {};
  useEffect(() => {
    let current = true;
    getAccess({ ...AGENT_CONFIGURATION_PERMISSION_REQUEST }).then((result) => {
      if (current) setCanConfigure(result?.canConfigure === true);
    }).catch(() => {
      if (current) setCanConfigure(false);
    });
    return () => {
      current = false;
    };
  }, [context.companyId]);
  useEffect(() => {
    setDraft({
      defaultWorkspaceId: profile.defaultWorkspaceId || "",
      agentWorkspaceIds: { ...profile.agentWorkspaceIds || {} },
      taskWorkspaceIds: { ...profile.taskWorkspaceIds || {} },
      taskTypes: taskTypesForProfile(profile)
    });
  }, [profile.defaultWorkspaceId, JSON.stringify(profile.agentWorkspaceIds || {}), JSON.stringify(profile.taskWorkspaceIds || {}), JSON.stringify(profile.taskTypes || [])]);
  const updateAgentWorkspace = (agentId, workspaceId) => {
    setDraft((current) => ({
      ...current || {},
      agentWorkspaceIds: { ...current?.agentWorkspaceIds || {}, [agentId]: workspaceId }
    }));
  };
  const updateTaskWorkspace = (taskType, workspaceId) => {
    setDraft((current) => ({
      ...current || {},
      taskWorkspaceIds: { ...current?.taskWorkspaceIds || {}, [taskType]: workspaceId }
    }));
  };
  const addTaskType = () => {
    const id = taskTypeKey(newTaskType.id);
    if (!id) {
      setError("Task type key must use lowercase letters, numbers, hyphens, or underscores.");
      return;
    }
    if ((draft?.taskTypes || []).some((candidate) => candidate.id === id)) {
      setError("That Task type key already exists.");
      return;
    }
    setDraft((current) => ({
      ...current || {},
      taskTypes: [...current?.taskTypes || [], { id, label: newTaskType.label.trim() || id }]
    }));
    setNewTaskType({ id: "", label: "" });
    setError("");
  };
  const removeTaskType = (taskType) => {
    setDraft((current) => {
      const mappings = { ...current?.taskWorkspaceIds || {} };
      delete mappings[taskType];
      return {
        ...current || {},
        taskTypes: (current?.taskTypes || []).filter((candidate) => candidate.id !== taskType),
        taskWorkspaceIds: mappings
      };
    });
  };
  const save = async () => {
    if (!draft || saving || !canConfigure) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await saveProfile({ ...AGENT_CONFIGURATION_PERMISSION_REQUEST, projectId: workplane.project.id, profile: draft });
      setNotice("Workspace Profile saved. New Room and Task turns use these project-specific defaults.");
      await onRefresh();
    } catch (caught) {
      setError(caught?.message || "Workspace Profile could not be saved.");
    } finally {
      setSaving(false);
    }
  };
  const addWorkspace = async () => {
    if (creating || !canConfigure) return;
    setCreating(true);
    setError("");
    setNotice("");
    try {
      const result = await createWorkspace({
        ...AGENT_CONFIGURATION_PERMISSION_REQUEST,
        projectId: workplane.project.id,
        name: newWorkspace.name,
        cwd: newWorkspace.cwd,
        repoUrl: newWorkspace.repoUrl
      });
      setNewWorkspace({ name: "", cwd: "", repoUrl: "" });
      setNotice(`${result?.workspace?.name || "Workspace"} was added to this Project.`);
      await onRefresh();
    } catch (caught) {
      setError(caught?.message || "Workspace could not be added.");
    } finally {
      setCreating(false);
    }
  };
  return /* @__PURE__ */ jsx("section", { className: "wp-profile", children: /* @__PURE__ */ jsxs("details", { className: "wp-profile-details", children: [
    /* @__PURE__ */ jsxs("summary", { children: [
      /* @__PURE__ */ jsx("span", { children: "Workspace & task routing" }),
      /* @__PURE__ */ jsx("span", { className: "rw-muted", children: profile.configured ? "Project profile active" : "Setup required" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "wp-profile-content", children: [
      /* @__PURE__ */ jsxs("div", { className: "wp-profile-head", children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("h2", { children: "Workspace Profile" }),
          /* @__PURE__ */ jsx("p", { children: "Define this Project's folders and each Agent's Room location. Task mappings take priority for finite work, so one repository, separate repositories, research folders, shared references, or another workflow can coexist." })
        ] }),
        /* @__PURE__ */ jsx("span", { className: "rw-muted", children: profile.configured ? "Project profile active" : "Using legacy fallback until saved" })
      ] }),
      canConfigure === false ? /* @__PURE__ */ jsx("div", { className: "ca-note", children: "Only company Owners and Admins can change Workspace Profiles. You can still view the current Project layout." }) : null,
      error ? /* @__PURE__ */ jsx("div", { className: "rw-error", children: error }) : null,
      notice ? /* @__PURE__ */ jsx("div", { className: "ca-note", children: notice }) : null,
      /* @__PURE__ */ jsx("div", { className: "wp-workspaces", children: workspaces.length ? workspaces.map((workspace) => /* @__PURE__ */ jsx("div", { className: "wp-workspace", children: /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsxs("strong", { children: [
          workspace.name,
          workspace.isPrimary ? " (primary)" : ""
        ] }),
        /* @__PURE__ */ jsx("span", { children: workspace.path || workspace.repoUrl || "Remote workspace" })
      ] }) }, workspace.id)) : /* @__PURE__ */ jsx("div", { className: "rw-empty", children: "This Project has no registered Workspace yet. Add the first local folder or repository below." }) }),
      workspaces.length ? /* @__PURE__ */ jsxs("label", { className: "wp-profile-default", children: [
        "Default Room Workspace",
        /* @__PURE__ */ jsxs("select", { value: draft?.defaultWorkspaceId || "", onChange: (event) => setDraft((current) => ({ ...current || {}, defaultWorkspaceId: event.target.value })), disabled: !canConfigure || saving || creating, children: [
          /* @__PURE__ */ jsx("option", { value: "", children: "No explicit default" }),
          workspaces.map((candidate) => /* @__PURE__ */ jsx("option", { value: candidate.id, children: candidate.name }, candidate.id))
        ] })
      ] }) : null,
      /* @__PURE__ */ jsxs("div", { className: "wp-new-workspace", children: [
        /* @__PURE__ */ jsxs("label", { children: [
          "Name",
          /* @__PURE__ */ jsx("input", { value: newWorkspace.name, onChange: (event) => setNewWorkspace((current) => ({ ...current, name: event.target.value })), placeholder: "e.g. Research", disabled: !canConfigure || creating || saving })
        ] }),
        /* @__PURE__ */ jsxs("label", { children: [
          "Local folder",
          /* @__PURE__ */ jsx("input", { value: newWorkspace.cwd, onChange: (event) => setNewWorkspace((current) => ({ ...current, cwd: event.target.value })), placeholder: "C:\\\\absolute\\\\path\\\\to\\\\folder", disabled: !canConfigure || creating || saving })
        ] }),
        /* @__PURE__ */ jsxs("label", { children: [
          "Repository URL (optional)",
          /* @__PURE__ */ jsx("input", { value: newWorkspace.repoUrl, onChange: (event) => setNewWorkspace((current) => ({ ...current, repoUrl: event.target.value })), placeholder: "https://github.com/org/repo", disabled: !canConfigure || creating || saving })
        ] }),
        /* @__PURE__ */ jsx("button", { type: "button", className: "rw-button", onClick: addWorkspace, disabled: !canConfigure || creating || saving, children: creating ? "Adding..." : "Add Workspace" })
      ] }),
      workspaces.length ? /* @__PURE__ */ jsxs("details", { className: "wp-routing", children: [
        /* @__PURE__ */ jsx("summary", { children: "Advanced routing" }),
        /* @__PURE__ */ jsx("p", { className: "rw-muted", children: "Set persistent Room locations per Agent and explicit Workspaces per Task type. A Lead can still choose a different Workspace for an individual Task." }),
        /* @__PURE__ */ jsxs("div", { className: "wp-agent-map", children: [
          /* @__PURE__ */ jsx("h3", { children: "Team Room defaults" }),
          agents.map((agent) => /* @__PURE__ */ jsxs("div", { className: "wp-agent", children: [
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("strong", { children: agent.name }),
              /* @__PURE__ */ jsx("span", { children: agent.role || "Agent" })
            ] }),
            /* @__PURE__ */ jsxs("label", { children: [
              "Room Workspace",
              /* @__PURE__ */ jsxs("select", { "aria-label": `${agent.name} Room Workspace`, value: draft?.agentWorkspaceIds?.[agent.id] || "", onChange: (event) => updateAgentWorkspace(agent.id, event.target.value), disabled: !canConfigure || saving || creating, children: [
                /* @__PURE__ */ jsx("option", { value: "", children: "Use Room default" }),
                workspaces.map((workspace) => /* @__PURE__ */ jsx("option", { value: workspace.id, children: workspace.name }, workspace.id))
              ] })
            ] })
          ] }, agent.id))
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "wp-agent-map", children: [
          /* @__PURE__ */ jsx("h3", { children: "Task workspace defaults" }),
          /* @__PURE__ */ jsx("p", { className: "rw-muted", children: "These keys are Project-specific. Leads can use any configured key when creating a finite Task." }),
          (draft?.taskTypes || []).map((taskType) => /* @__PURE__ */ jsxs("div", { className: "wp-task-route", children: [
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("strong", { children: taskType.label }),
              /* @__PURE__ */ jsx("span", { children: taskType.id })
            ] }),
            /* @__PURE__ */ jsxs("label", { children: [
              "Workspace",
              /* @__PURE__ */ jsxs("select", { "aria-label": `${taskType.id} Task Workspace`, value: draft?.taskWorkspaceIds?.[taskType.id] || "", onChange: (event) => updateTaskWorkspace(taskType.id, event.target.value), disabled: !canConfigure || saving || creating, children: [
                /* @__PURE__ */ jsx("option", { value: "", children: "Choose by task type" }),
                workspaces.map((workspace) => /* @__PURE__ */ jsx("option", { value: workspace.id, children: workspace.name }, workspace.id))
              ] })
            ] }),
            /* @__PURE__ */ jsx("button", { type: "button", className: "rw-button", onClick: () => removeTaskType(taskType.id), disabled: !canConfigure || saving || creating, children: "Remove" })
          ] }, taskType.id)),
          /* @__PURE__ */ jsxs("div", { className: "wp-new-task-type", children: [
            /* @__PURE__ */ jsxs("label", { children: [
              "Task type key",
              /* @__PURE__ */ jsx("input", { value: newTaskType.id, onChange: (event) => setNewTaskType((current) => ({ ...current, id: event.target.value })), placeholder: "e.g. research", disabled: !canConfigure || saving || creating })
            ] }),
            /* @__PURE__ */ jsxs("label", { children: [
              "Label (optional)",
              /* @__PURE__ */ jsx("input", { value: newTaskType.label, onChange: (event) => setNewTaskType((current) => ({ ...current, label: event.target.value })), placeholder: "e.g. Research and discovery", disabled: !canConfigure || saving || creating })
            ] }),
            /* @__PURE__ */ jsx("button", { type: "button", className: "rw-button", onClick: addTaskType, disabled: !canConfigure || saving || creating, children: "Add Task type" })
          ] })
        ] })
      ] }) : null,
      /* @__PURE__ */ jsx("div", { className: "wp-profile-actions", children: /* @__PURE__ */ jsx("button", { type: "button", className: "rw-button primary", onClick: save, disabled: !canConfigure || !draft || saving || creating, children: saving ? "Saving..." : "Save Workspace Profile" }) })
    ] })
  ] }) });
}
function ProjectWorkplaneHome({ context, projectId, workplane, onRefresh, navigation }) {
  const rooms = workplane?.rooms || [];
  const tasksHref = navigation.resolveHref(`/tasks?project=${encodeURIComponent(projectId)}`);
  return /* @__PURE__ */ jsxs("div", { className: "rw-project", children: [
    /* @__PURE__ */ jsxs("header", { className: "rw-project-header", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("h1", { children: workplane?.project?.name || "\uD504\uB85C\uC81D\uD2B8" }),
        /* @__PURE__ */ jsx("p", { className: "rw-muted", children: "\uC774 \uD504\uB85C\uC81D\uD2B8\uC758 \uC9C0\uC18D\uC801\uC778 \uB300\uD654\uC640 \uACB0\uC815\uC740 Room\uC5D0\uC11C \uC774\uC5B4\uC9D1\uB2C8\uB2E4. Lead\uB294 \uC791\uC5C5\uC774 \uC900\uBE44\uB418\uC5C8\uC744 \uB54C\uB9CC Worker\uC5D0\uAC8C \uC720\uD55C\uD55C Task\uB97C \uC0DD\uC131\uD558\uACE0 \uBC30\uC815\uD569\uB2C8\uB2E4." })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "rw-project-actions", children: /* @__PURE__ */ jsx("a", { className: "rw-button", ...navigation.linkProps(tasksHref), children: "\uD504\uB85C\uC81D\uD2B8 Tasks" }) })
    ] }),
    /* @__PURE__ */ jsxs("section", { className: "rw-project-summary", "aria-label": "Project work summary", children: [
      /* @__PURE__ */ jsxs("div", { className: "rw-project-stat", children: [
        /* @__PURE__ */ jsx("strong", { children: rooms.length }),
        /* @__PURE__ */ jsx("span", { children: "\uD65C\uC131 Room" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "rw-project-stat", children: [
        /* @__PURE__ */ jsx("strong", { children: workplane?.taskCount || 0 }),
        /* @__PURE__ */ jsx("span", { children: "\uD504\uB85C\uC81D\uD2B8 Task" })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "rw-project-rooms-heading", children: [
      /* @__PURE__ */ jsx("h2", { children: "Rooms" }),
      /* @__PURE__ */ jsx("span", { className: "rw-muted", children: "\uC9C0\uC18D\uC801\uC778 \uB300\uD654\uC640 \uC758\uC0AC\uACB0\uC815" })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "rw-project-grid", children: rooms.map((room) => /* @__PURE__ */ jsxs("a", { className: "rw-project-card", ...navigation.linkProps(roomHref(navigation, projectId, room.id)), children: [
      /* @__PURE__ */ jsx("strong", { children: room.title }),
      /* @__PURE__ */ jsx("p", { children: roomRoleSummary(room) })
    ] }, room.id)) }),
    /* @__PURE__ */ jsx(WorkspaceProfile, { context, workplane, onRefresh })
  ] });
}
function ProjectRooms({ context, projectId, roomId }) {
  const navigation = useHostNavigation();
  const { data, loading, error, refresh } = usePluginData("project-workplane-view", { companyId: context.companyId, projectId });
  if (roomId) return /* @__PURE__ */ jsx(RoomConversation, { context, roomId, workplane: data });
  if (loading) return /* @__PURE__ */ jsx("div", { className: "rw-empty", children: "Rooms\uB97C \uBD88\uB7EC\uC624\uB294 \uC911..." });
  if (error) return /* @__PURE__ */ jsx("div", { className: "rw-error", children: error.message });
  if (!roomId) return /* @__PURE__ */ jsx(ProjectWorkplaneHome, { context, projectId, workplane: data, onRefresh: refresh, navigation });
  return /* @__PURE__ */ jsxs("div", { className: "rw-project", children: [
    /* @__PURE__ */ jsx("h1", { children: data?.project?.name || "\uD504\uB85C\uC81D\uD2B8" }),
    /* @__PURE__ */ jsx("p", { className: "rw-muted", children: "\uC9C0\uC18D\uC801\uC778 \uD611\uC5C5\uC744 \uC774\uC5B4\uAC08 Room\uC744 \uC120\uD0DD\uD558\uC138\uC694. \uC720\uD55C\uD55C \uC2E4\uD589 \uC791\uC5C5\uC740 Tasks\uC5D0\uC11C \uAD00\uB9AC\uB429\uB2C8\uB2E4." }),
    /* @__PURE__ */ jsx("div", { className: "rw-project-grid", children: (data?.rooms || []).map((room) => /* @__PURE__ */ jsxs("a", { className: "rw-project-card", ...navigation.linkProps(roomHref(navigation, projectId, room.id)), children: [
      /* @__PURE__ */ jsx("strong", { children: room.title }),
      /* @__PURE__ */ jsx("p", { children: roomRoleSummary(room) })
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
    /* @__PURE__ */ jsx("div", { className: "rw-empty", children: "\uD504\uB85C\uC81D\uD2B8\uB97C \uC120\uD0DD\uD574 \uD574\uB2F9 \uD504\uB85C\uC81D\uD2B8\uC758 Rooms\uB97C \uC5EC\uC138\uC694." })
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
function ProjectTasksPage({ context }) {
  const location = useHostLocation();
  const navigation = useHostNavigation();
  const projectId = new URLSearchParams(location.search).get("project");
  const { data, loading, error } = usePluginData("project-tasks-view", { companyId: context.companyId, projectId: projectId || "" });
  const projectName = data?.project?.name || "\uD504\uB85C\uC81D\uD2B8";
  const roomsHref = projectId ? navigation.resolveHref(`/agent-rooms?project=${encodeURIComponent(projectId)}`) : "";
  const tasks = data?.tasks || [];
  return /* @__PURE__ */ jsxs("div", { className: "rw-task-board", children: [
    /* @__PURE__ */ jsx(Style, {}),
    /* @__PURE__ */ jsxs("header", { className: "rw-task-board-header", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("h1", { children: projectId ? `${projectName} Tasks` : "\uD504\uB85C\uC81D\uD2B8 Tasks" }),
        /* @__PURE__ */ jsx("p", { className: "rw-muted", children: "Room\uC5D0\uC11C \uC0DD\uC131\uB41C \uC720\uD55C\uD55C \uC2E4\uD589 \uC791\uC5C5\uC785\uB2C8\uB2E4. \uC791\uC5C5 \uB300\uD654\uB294 SPS \uAE30\uBCF8 Task \uCC44\uD305\uC5D0\uC11C \uC774\uC5B4\uC9D1\uB2C8\uB2E4." })
      ] }),
      roomsHref ? /* @__PURE__ */ jsx("a", { className: "rw-button", ...navigation.linkProps(roomsHref), children: "Rooms \uC5F4\uAE30" }) : null
    ] }),
    !projectId ? /* @__PURE__ */ jsx("div", { className: "rw-empty", children: "\uD504\uB85C\uC81D\uD2B8\uC5D0\uC11C Tasks\uB97C \uC5F4\uC5B4 Room\uACFC \uC720\uD55C\uD55C \uC2E4\uD589 \uC791\uC5C5\uC744 \uD568\uAED8 \uAD00\uB9AC\uD558\uC138\uC694." }) : loading ? /* @__PURE__ */ jsx("div", { className: "rw-empty", children: "Tasks\uB97C \uBD88\uB7EC\uC624\uB294 \uC911..." }) : error ? /* @__PURE__ */ jsx("div", { className: "rw-error", children: error.message }) : tasks.length ? /* @__PURE__ */ jsx("div", { className: "rw-task-list", children: tasks.map((task) => {
      const status = taskStatusPresentation(task.status);
      return /* @__PURE__ */ jsxs("a", { className: "rw-task-row", ...navigation.linkProps(taskHref(navigation, task)), children: [
        /* @__PURE__ */ jsxs("div", { className: "rw-task-row-head", children: [
          /* @__PURE__ */ jsx("strong", { children: task.title }),
          /* @__PURE__ */ jsx("span", { className: "rw-task-status", "data-tone": status.tone, children: status.label })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "rw-task-row-meta", children: [
          /* @__PURE__ */ jsx("span", { children: task.identifier }),
          /* @__PURE__ */ jsxs("span", { children: [
            "\uB2F4\uB2F9: ",
            task.assigneeAgent?.name || "\uBBF8\uBC30\uC815"
          ] }),
          /* @__PURE__ */ jsxs("span", { children: [
            "\uC0DD\uC131 Room: ",
            task.parentRoom?.title || "\uC5C6\uC74C"
          ] })
        ] })
      ] }, task.id);
    }) }) : /* @__PURE__ */ jsxs("div", { className: "rw-empty rw-task-empty", children: [
      /* @__PURE__ */ jsx("strong", { children: "\uC544\uC9C1 \uC2E4\uD589 Task\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4." }),
      /* @__PURE__ */ jsx("p", { children: "\uC791\uC5C5\uC774 \uC900\uBE44\uB418\uBA74 \uAD8C\uD55C\uC774 \uC788\uB294 Lead\uAC00 Room\uC5D0\uC11C Task\uB97C \uC0DD\uC131\uD558\uACE0 Worker\uC5D0\uAC8C \uBC30\uC815\uD569\uB2C8\uB2E4." })
    ] })
  ] });
}
function CodexAccountsPage({ context }) {
  const setAccount = usePluginAction("codex-account-select");
  const getOrganizationSettingsAccess = usePluginAction("organization-settings-access");
  const { data, loading, error, refresh } = usePluginData("codex-accounts-view", { companyId: context.companyId });
  const [updatingAgentId, setUpdatingAgentId] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [canConfigureAgents, setCanConfigureAgents] = useState(null);
  useEffect(() => {
    let current = true;
    getOrganizationSettingsAccess({ ...AGENT_CONFIGURATION_PERMISSION_REQUEST }).then((result) => {
      if (current) setCanConfigureAgents(result?.canConfigureAgents === true);
    }).catch(() => {
      if (current) setCanConfigureAgents(false);
    });
    return () => {
      current = false;
    };
  }, [context.companyId]);
  const chooseAccount = async (agent, accountId) => {
    if (!accountId || accountId === agent.selectedAccountId || updatingAgentId) return;
    setUpdatingAgentId(agent.id);
    setActionError("");
    setNotice("");
    try {
      const result = await setAccount({ ...AGENT_CONFIGURATION_PERMISSION_REQUEST, agentId: agent.id, accountId });
      setNotice(`${agent.name} now uses ${result?.account?.label || "the selected Codex account"}. The next Room message begins a new CLI session with preserved SPS context.`);
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
      /* @__PURE__ */ jsx("div", { className: "ca-note", children: "Changing an account updates that Agent's `CODEX_HOME` for both Team Rooms and normal SPS Tasks. Existing Room history and checkpoints remain in SPS; only the underlying Codex CLI session changes on the next message." }),
      canConfigureAgents === false ? /* @__PURE__ */ jsx("div", { className: "ca-note", children: "Only company Owners and Admins can change Agent CLI accounts." }) : null,
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
        /* @__PURE__ */ jsxs("select", { className: "ca-select", value: agent.selectedAccountId || "", onChange: (event) => chooseAccount(agent, event.target.value), disabled: !canConfigureAgents || Boolean(updatingAgentId), "aria-label": `${agent.name} Codex account`, children: [
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
  const getOrganizationSettingsAccess = usePluginAction("organization-settings-access");
  const { data, loading, error, refresh } = usePluginData("codex-accounts-view", { companyId: context.companyId });
  const [updating, setUpdating] = useState(false);
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [canConfigureAgents, setCanConfigureAgents] = useState(null);
  const agent = (data?.agents || []).find((candidate) => candidate.id === context.entityId);
  useEffect(() => {
    let current = true;
    getOrganizationSettingsAccess({ ...AGENT_CONFIGURATION_PERMISSION_REQUEST }).then((result) => {
      if (current) setCanConfigureAgents(result?.canConfigureAgents === true);
    }).catch(() => {
      if (current) setCanConfigureAgents(false);
    });
    return () => {
      current = false;
    };
  }, [context.companyId]);
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
      const result = await setAccount({ ...AGENT_CONFIGURATION_PERMISSION_REQUEST, agentId: agent.id, accountId });
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
    /* @__PURE__ */ jsx("p", { className: "rw-muted", children: "Choose the signed-in Codex CLI profile used by this Agent. Room history and checkpoints stay in SPS." }),
    canConfigureAgents === false ? /* @__PURE__ */ jsx("div", { className: "ca-note", children: "Only company Owners and Admins can change Agent CLI accounts." }) : null,
    actionError ? /* @__PURE__ */ jsx("div", { className: "rw-error", children: actionError }) : null,
    notice ? /* @__PURE__ */ jsx("div", { className: "ca-note", children: notice }) : null,
    !(data?.accounts || []).length ? /* @__PURE__ */ jsx("div", { className: "rw-empty", children: "No signed-in local Codex profiles were found. Sign in with a separate CODEX_HOME, then refresh." }) : /* @__PURE__ */ jsxs("div", { className: "ca-agent ca-agent-config", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("strong", { children: agent.name }),
        /* @__PURE__ */ jsx("span", { className: "ca-path", title: agent.effectiveHome, children: agent.effectiveHome })
      ] }),
      /* @__PURE__ */ jsxs("select", { className: "ca-select", value: agent.selectedAccountId || "", onChange: (event) => chooseAccount(event.target.value), disabled: !canConfigureAgents || updating, "aria-label": "Codex CLI account", children: [
        !agent.selectedAccountId ? /* @__PURE__ */ jsx("option", { value: "", children: "Current profile is not registered" }) : null,
        (data?.accounts || []).map((account) => /* @__PURE__ */ jsx("option", { value: account.id, children: account.label }, account.id))
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "rw-actions", children: /* @__PURE__ */ jsx("button", { type: "button", className: "rw-button", onClick: () => refresh(), disabled: updating, children: "Refresh accounts" }) })
  ] });
}
function OrganizationSettingsPage({ context }) {
  const navigation = useHostNavigation();
  const savePolicy = usePluginAction("organization-agent-policy-save");
  const getOrganizationSettingsAccess = usePluginAction("organization-settings-access");
  const getCollaborationReadiness = usePluginAction("organization-collaboration-readiness");
  const applyTemplatePolicy = usePluginAction("organization-template-apply");
  const { data, loading, error, refresh } = usePluginData("organization-settings-view", { companyId: context.companyId });
  const [drafts, setDrafts] = useState({});
  const [savingAgentId, setSavingAgentId] = useState("");
  const [applyingTemplateId, setApplyingTemplateId] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [canConfigureAgents, setCanConfigureAgents] = useState(null);
  const [collaborationReadiness, setCollaborationReadiness] = useState(null);
  const [collaborationLoading, setCollaborationLoading] = useState(false);
  useEffect(() => {
    let current = true;
    getOrganizationSettingsAccess({ ...AGENT_CONFIGURATION_PERMISSION_REQUEST }).then((result) => {
      if (current) setCanConfigureAgents(result?.canConfigureAgents === true);
    }).catch(() => {
      if (current) setCanConfigureAgents(false);
    });
    return () => {
      current = false;
    };
  }, [context.companyId]);
  const refreshCollaborationReadiness = async () => {
    if (!canConfigureAgents) return;
    setCollaborationLoading(true);
    try {
      setCollaborationReadiness(await getCollaborationReadiness({ ...AGENT_CONFIGURATION_PERMISSION_REQUEST }));
    } catch {
      setCollaborationReadiness({
        state: "configuration_unavailable",
        checks: [{ label: "\uD300 \uC5F0\uACB0 \uC0C1\uD0DC", status: "fail", message: "\uC900\uBE44 \uC0C1\uD0DC \uD655\uC778\uC744 \uC2E4\uD589\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4." }],
        warnings: [],
        recommendation: "Check the SPS service, then try again."
      });
    } finally {
      setCollaborationLoading(false);
    }
  };
  useEffect(() => {
    if (canConfigureAgents === true) refreshCollaborationReadiness();
    if (canConfigureAgents === false) setCollaborationReadiness(null);
  }, [canConfigureAgents]);
  useEffect(() => {
    const agents = data?.agents || [];
    if (!agents.length) return;
    setDrafts((current) => {
      const next = { ...current };
      for (const agent of agents) {
        if (next[agent.id]) continue;
        next[agent.id] = {
          roleId: agent.workplane?.roleId === "unconfigured" ? "worker" : agent.workplane?.roleId || "worker",
          kind: agent.workplane?.kind === "unconfigured" ? "worker" : agent.workplane?.kind || "worker",
          assignableRoleIds: (agent.workplane?.assignableRoleIds || []).join(", "),
          memoryAccess: agent.workplane?.memoryAccess || "read",
          reviewMode: agent.workplane?.reviewMode || "automatic"
        };
      }
      return next;
    });
  }, [data?.agents]);
  const updateDraft = (agentId, field, value) => {
    setDrafts((current) => ({ ...current, [agentId]: { ...current[agentId] || {}, [field]: value } }));
  };
  const save = async (agent) => {
    const draft = drafts[agent.id] || {};
    setSavingAgentId(agent.id);
    setActionError("");
    setNotice("");
    try {
      const targets = String(draft.assignableRoleIds || "").split(",").map((value) => value.trim()).filter(Boolean);
      const result = await savePolicy({
        ...AGENT_CONFIGURATION_PERMISSION_REQUEST,
        agentId: agent.id,
        roleId: draft.roleId || draft.kind || "worker",
        kind: draft.kind || "worker",
        assignableRoleIds: targets,
        memoryAccess: draft.memoryAccess || "read",
        reviewMode: draft.reviewMode || "automatic"
      });
      setNotice(`${result?.agent?.name || agent.name}\uC758 Workplane \uC5ED\uD560\uC744 \uC800\uC7A5\uD588\uC2B5\uB2C8\uB2E4. \uB2E4\uC74C Room \uB610\uB294 Task turn\uBD80\uD130 \uC801\uC6A9\uB429\uB2C8\uB2E4.`);
      await refresh();
    } catch (caught) {
      setActionError(caught?.message || "Workplane \uC5ED\uD560\uC744 \uC800\uC7A5\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.");
    } finally {
      setSavingAgentId("");
    }
  };
  const applyTemplate = async (template) => {
    if (!template?.actionable || applyingTemplateId) return;
    setApplyingTemplateId(template.id);
    setActionError("");
    setNotice("");
    try {
      const result = await applyTemplatePolicy({ ...AGENT_CONFIGURATION_PERMISSION_REQUEST, templateId: template.id });
      const updatedCount = result?.updated?.length || 0;
      const failureCount = result?.failures?.length || 0;
      setNotice(`${template.displayName}: ${updatedCount}\uAC1C Agent\uC5D0 \uBA85\uC2DC\uC801 Workplane \uC815\uCC45\uC744 \uC801\uC6A9\uD588\uC2B5\uB2C8\uB2E4.${failureCount ? ` ${failureCount}\uAC1C\uB294 \uC801\uC6A9\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.` : ""}`);
      await refresh();
    } catch (caught) {
      setActionError(caught?.message || "Workplane \uD15C\uD50C\uB9BF\uC744 \uC801\uC6A9\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.");
    } finally {
      setApplyingTemplateId("");
    }
  };
  return /* @__PURE__ */ jsxs("div", { className: "rw-shell", children: [
    /* @__PURE__ */ jsx(Style, {}),
    /* @__PURE__ */ jsxs("main", { className: "org-page", children: [
      /* @__PURE__ */ jsx("h1", { children: "Workplane \uC6B4\uC601" }),
      /* @__PURE__ */ jsx("p", { className: "rw-muted", children: "Lead\uB294 \uBAA9\uD45C \uC548\uC5D0\uC11C Worker Task\uB97C \uB9CC\uB4E4\uACE0 \uAC80\uD1A0\uD569\uB2C8\uB2E4. Worker\uB294 \uBC30\uC815\uBC1B\uC740 Task\uB9CC \uC2E4\uD589\uD569\uB2C8\uB2E4." }),
      /* @__PURE__ */ jsx("div", { className: "ca-note", children: "\uC5ED\uD560 \uC774\uB984\uC740 \uC790\uC720\uB86D\uAC8C \uC815\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4. Task \uAD8C\uD55C\uC740 \uC870\uC9C1\uB3C4\uB098 `reportsTo`\uAC00 \uC544\uB2C8\uB77C \uC5EC\uAE30\uC758 Lead/Worker \uC720\uD615\uACFC \uC704\uC784 \uB300\uC0C1 \uC124\uC815\uC73C\uB85C \uACB0\uC815\uB429\uB2C8\uB2E4." }),
      /* @__PURE__ */ jsxs("section", { className: "org-access", children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("strong", { children: "\uAD6C\uC131\uC6D0\uACFC \uAD8C\uD55C" }),
          /* @__PURE__ */ jsx("span", { children: "Owner/Admin\uC740 Workplane \uC815\uCC45\uACFC CLI \uACC4\uC815\uC744 \uAD00\uB9AC\uD558\uACE0, Operator\uB294 Project, Room, Task \uD611\uC5C5\uC744 \uC9C4\uD589\uD569\uB2C8\uB2E4." })
        ] }),
        /* @__PURE__ */ jsx("a", { className: "rw-button", ...navigation.linkProps("/company/settings/members"), children: "\uAD6C\uC131\uC6D0 \uAD00\uB9AC" })
      ] }),
      canConfigureAgents ? /* @__PURE__ */ jsxs("section", { className: "org-collaboration", children: [
        /* @__PURE__ */ jsxs("div", { className: "org-collaboration-head", children: [
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("strong", { children: "\uD300 \uC5F0\uACB0 \uC0C1\uD0DC" }),
            /* @__PURE__ */ jsx("span", { children: "\uAC1C\uC778 \uC791\uC5C5\uC740 \uAE30\uBCF8 \uB85C\uCEEC \uC804\uC6A9 \uBAA8\uB4DC\uB97C \uC720\uC9C0\uD558\uC138\uC694. \uC774 \uD655\uC778\uC740 \uD3EC\uD2B8\uB97C \uC5F4\uAC70\uB098 \uC778\uC99D \uC815\uBCF4\uB97C \uB178\uCD9C\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4." })
          ] }),
          /* @__PURE__ */ jsx("button", { type: "button", className: "rw-button", onClick: refreshCollaborationReadiness, disabled: collaborationLoading, children: collaborationLoading ? "\uD655\uC778 \uC911..." : "\uC0C1\uD0DC \uD655\uC778" })
        ] }),
        collaborationReadiness ? /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsxs("div", { className: `org-readiness ${collaborationReadiness.state === "collaboration_ready" ? "ready" : collaborationReadiness.state === "local_only" ? "" : "attention"}`, children: [
            /* @__PURE__ */ jsx("strong", { children: collaborationReadiness.state === "collaboration_ready" ? "\uBE44\uACF5\uAC1C \uD611\uC5C5 \uC900\uBE44 \uC644\uB8CC" : collaborationReadiness.state === "local_only" ? "\uB85C\uCEEC \uC804\uC6A9 \uBAA8\uB4DC (\uAE30\uBCF8 \uAD8C\uC7A5)" : "\uD300 \uC5F0\uACB0 \uC124\uC815\uC744 \uD655\uC778\uD558\uC138\uC694" }),
            /* @__PURE__ */ jsx("span", { children: collaborationReadiness.recommendation })
          ] }),
          /* @__PURE__ */ jsx("ul", { className: "org-readiness-checks", children: (collaborationReadiness.checks || []).map((check, index) => /* @__PURE__ */ jsxs("li", { children: [
            /* @__PURE__ */ jsx("strong", { children: check.label }),
            /* @__PURE__ */ jsx("span", { "data-status": check.status, children: check.message })
          ] }, `${check.label}-${index}`)) }),
          (collaborationReadiness.warnings || []).map((warning, index) => /* @__PURE__ */ jsx("p", { className: "org-readiness-warning", children: warning }, `${warning}-${index}`))
        ] }) : /* @__PURE__ */ jsx("div", { className: "rw-muted", style: { marginTop: 12 }, children: "\uB85C\uCEEC \uC124\uC815\uC744 \uD655\uC778\uD558\uB294 \uC911..." })
      ] }) : null,
      canConfigureAgents === null ? /* @__PURE__ */ jsx("div", { className: "ca-note", children: "Workplane \uC124\uC815 \uAD8C\uD55C\uC744 \uD655\uC778\uD558\uB294 \uC911..." }) : canConfigureAgents ? null : /* @__PURE__ */ jsx("div", { className: "ca-note", children: "Workplane \uC815\uCC45\uACFC CLI \uACC4\uC815 \uBCC0\uACBD\uC740 Owner\uC640 Admin\uB9CC \uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4. \uAD6C\uC131\uC6D0 \uAD8C\uD55C\uC73C\uB85C\uB3C4 Project, Room, Task \uD611\uC5C5\uC740 \uACC4\uC18D\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4." }),
      actionError ? /* @__PURE__ */ jsx("div", { className: "rw-error", children: actionError }) : null,
      notice ? /* @__PURE__ */ jsx("div", { className: "ca-note", children: notice }) : null,
      loading ? /* @__PURE__ */ jsx("div", { className: "rw-empty", children: "Workplane \uC6B4\uC601 \uC815\uBCF4\uB97C \uBD88\uB7EC\uC624\uB294 \uC911..." }) : error ? /* @__PURE__ */ jsx("div", { className: "rw-error", children: error.message }) : /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx("div", { className: "org-templates", children: (data?.templates || []).map((template) => /* @__PURE__ */ jsxs("section", { className: "org-template", children: [
          /* @__PURE__ */ jsx("h2", { children: template.displayName }),
          /* @__PURE__ */ jsx("p", { children: template.description }),
          /* @__PURE__ */ jsx("small", { children: template.actionable ? `${template.eligibleAgentCount || 0}\uAC1C Agent\uC5D0 \uC801\uC6A9 \uAC00\uB2A5 \xB7 \uC218\uB3D9 \uC124\uC815 Agent ${template.configuredAgentCount || 0}\uAC1C\uB294 \uC720\uC9C0` : "\uC5ED\uD560 \uD589\uC5D0\uC11C \uAC01 Agent\uC758 \uC815\uCC45\uC744 \uC9C1\uC811 \uC124\uC815" }),
          template.actionable ? /* @__PURE__ */ jsx("button", { type: "button", className: "rw-button", onClick: () => applyTemplate(template), disabled: !canConfigureAgents || (template.eligibleAgentCount || 0) === 0 || Boolean(savingAgentId) || Boolean(applyingTemplateId), children: applyingTemplateId === template.id ? "\uC801\uC6A9 \uC911..." : (template.eligibleAgentCount || 0) === 0 ? "\uBA3C\uC800 \uB9DE\uB294 Agent\uB97C \uCD94\uAC00\uD558\uC138\uC694" : template.actionLabel || "\uD15C\uD50C\uB9BF \uC801\uC6A9" }) : null
        ] }, template.id)) }),
        (data?.agents || []).length ? /* @__PURE__ */ jsx("div", { className: "org-list", children: (data?.agents || []).map((agent) => {
          const draft = drafts[agent.id] || {};
          const isWorker = draft.kind === "worker";
          return /* @__PURE__ */ jsxs("section", { className: "org-agent", children: [
            /* @__PURE__ */ jsxs("div", { className: "org-agent-meta", children: [
              /* @__PURE__ */ jsx("strong", { children: agent.name }),
              /* @__PURE__ */ jsxs("span", { children: [
                agent.spsRole,
                " \xB7 ",
                agent.adapterType || "\uC5F0\uACB0 \uBC29\uC2DD",
                agent.model ? ` \xB7 ${agent.model}` : ""
              ] })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "org-agent-policy", children: [
              /* @__PURE__ */ jsxs("div", { className: "org-field", children: [
                /* @__PURE__ */ jsx("label", { children: "Workplane \uC720\uD615" }),
                /* @__PURE__ */ jsxs("select", { value: draft.kind || "worker", onChange: (event) => updateDraft(agent.id, "kind", event.target.value), disabled: !canConfigureAgents || Boolean(savingAgentId), children: [
                  /* @__PURE__ */ jsx("option", { value: "lead", children: "Lead" }),
                  /* @__PURE__ */ jsx("option", { value: "worker", children: "Worker" }),
                  /* @__PURE__ */ jsx("option", { value: "hybrid", children: "Hybrid" })
                ] })
              ] }),
              /* @__PURE__ */ jsxs("div", { className: "org-field", children: [
                /* @__PURE__ */ jsx("label", { children: "\uC5ED\uD560 ID" }),
                /* @__PURE__ */ jsx("input", { value: draft.roleId || "", onChange: (event) => updateDraft(agent.id, "roleId", event.target.value), disabled: !canConfigureAgents || Boolean(savingAgentId) })
              ] }),
              /* @__PURE__ */ jsxs("div", { className: "org-field", children: [
                /* @__PURE__ */ jsx("label", { children: "\uD560\uB2F9 \uAC00\uB2A5 \uC5ED\uD560" }),
                /* @__PURE__ */ jsx("input", { value: draft.assignableRoleIds || "", onChange: (event) => updateDraft(agent.id, "assignableRoleIds", event.target.value), disabled: !canConfigureAgents || Boolean(savingAgentId) || isWorker, placeholder: "worker, art-production" })
              ] }),
              /* @__PURE__ */ jsxs("div", { className: "org-field", children: [
                /* @__PURE__ */ jsx("label", { children: "Worker \uACB0\uACFC \uAC80\uD1A0" }),
                /* @__PURE__ */ jsxs("select", { value: draft.reviewMode || "automatic", onChange: (event) => updateDraft(agent.id, "reviewMode", event.target.value), disabled: !canConfigureAgents || Boolean(savingAgentId) || isWorker, children: [
                  /* @__PURE__ */ jsx("option", { value: "automatic", children: "Lead \uAC80\uD1A0 \uC790\uB3D9 \uC2DC\uC791" }),
                  /* @__PURE__ */ jsx("option", { value: "manual", children: "Lead Room\uC5D0 \uBCF4\uACE0\uB9CC \uB0A8\uAE30\uAE30" })
                ] })
              ] })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "org-agent-actions", children: [
              /* @__PURE__ */ jsx("button", { type: "button", className: "rw-button primary", onClick: () => save(agent), disabled: !canConfigureAgents || Boolean(savingAgentId), children: savingAgentId === agent.id ? "\uC800\uC7A5 \uC911..." : "Workplane \uC815\uCC45 \uC800\uC7A5" }),
              /* @__PURE__ */ jsx("a", { className: "rw-button", ...navigation.linkProps(`/agents/${encodeURIComponent(agent.urlKey || agent.id)}/configuration`), children: "\uBAA8\uB378\uACFC \uB3C4\uAD6C \uC124\uC815" })
            ] }),
            /* @__PURE__ */ jsx("div", { className: "org-agent-status", children: agent.workplane?.source === "legacy" ? "\uD604\uC7AC \uD638\uD658 \uADDC\uCE59\uC5D0\uC11C \uC790\uB3D9 \uC778\uC2DD\uB428" : agent.workplane?.source === "configured" ? "Workplane \uC124\uC815\uC73C\uB85C \uAD00\uB9AC\uB428" : "\uC544\uC9C1 Workplane \uC5ED\uD560\uC774 \uC124\uC815\uB418\uC9C0 \uC54A\uC74C" }),
            /* @__PURE__ */ jsxs("details", { className: "org-agent-advanced", children: [
              /* @__PURE__ */ jsx("summary", { children: "\uACE0\uAE09" }),
              /* @__PURE__ */ jsx("div", { className: "org-agent-advanced-content", children: /* @__PURE__ */ jsxs("div", { className: "org-field", children: [
                /* @__PURE__ */ jsx("label", { children: "SPS \uBA54\uBAA8\uB9AC" }),
                /* @__PURE__ */ jsxs("select", { value: draft.memoryAccess || "read", onChange: (event) => updateDraft(agent.id, "memoryAccess", event.target.value), disabled: !canConfigureAgents || Boolean(savingAgentId), children: [
                  /* @__PURE__ */ jsx("option", { value: "read_write", children: "\uC77D\uACE0 \uC81C\uC548" }),
                  /* @__PURE__ */ jsx("option", { value: "read", children: "\uC77D\uAE30 \uC804\uC6A9" }),
                  /* @__PURE__ */ jsx("option", { value: "none", children: "\uC0AC\uC6A9 \uC548 \uD568" })
                ] })
              ] }) })
            ] })
          ] }, agent.id);
        }) }) : /* @__PURE__ */ jsxs("section", { className: "org-empty", children: [
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("strong", { children: "\uACE0\uC6A9\uB41C Agent\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4" }),
            /* @__PURE__ */ jsx("span", { children: "\uBA3C\uC800 Lead\uB97C \uCD94\uAC00\uD558\uACE0, \uD544\uC694\uD55C \uB9CC\uD07C Worker\uB97C \uCD94\uAC00\uD558\uC138\uC694." })
          ] }),
          canConfigureAgents ? /* @__PURE__ */ jsx("a", { className: "rw-button primary", ...navigation.linkProps("/agents/all"), children: "Agent \uAD00\uB9AC" }) : null
        ] })
      ] })
    ] })
  ] });
}
function ProjectTasksProjectLink({ context }) {
  const navigation = useHostNavigation();
  return /* @__PURE__ */ jsx("a", { className: "rw-room", ...navigation.linkProps(`/tasks?project=${encodeURIComponent(context.entityId)}`), children: "Tasks" });
}
function CodexAccountsSidebar() {
  const navigation = useHostNavigation();
  return /* @__PURE__ */ jsx("a", { className: "rw-room", ...navigation.linkProps("/codex-accounts"), children: "Codex Accounts" });
}
function ProjectWorkplaneLink({ context }) {
  const navigation = useHostNavigation();
  return /* @__PURE__ */ jsx("a", { className: "rw-room", ...navigation.linkProps(`/agent-rooms?project=${encodeURIComponent(context.entityId)}`), children: "Team Rooms" });
}
function TeamWorkplaneDashboardWidget({ data, loading, error }) {
  const navigation = useHostNavigation();
  const style = { display: "grid", gap: 10, minHeight: 112, color: "var(--foreground, #172033)", font: "14px/1.45 system-ui, sans-serif" };
  if (loading) return /* @__PURE__ */ jsx("div", { style, children: "Loading Team Workplane..." });
  if (error) return /* @__PURE__ */ jsxs("div", { style, children: [
    "Team Workplane status is unavailable: ",
    error.message
  ] });
  const latest = data?.latestReport;
  return /* @__PURE__ */ jsxs("div", { style, children: [
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexWrap: "wrap", gap: "6px 14px", color: "var(--muted-foreground, #667085)", fontSize: 13 }, children: [
      /* @__PURE__ */ jsxs("span", { children: [
        data?.projectCount ?? 0,
        " projects"
      ] }),
      /* @__PURE__ */ jsxs("span", { children: [
        data?.roomCount ?? 0,
        " Rooms"
      ] }),
      /* @__PURE__ */ jsxs("span", { children: [
        data?.activeTaskCount ?? 0,
        " active work items"
      ] }),
      /* @__PURE__ */ jsxs("span", { children: [
        data?.reportCount ?? 0,
        " Room reports waiting"
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsx("strong", { style: { display: "block", fontSize: 15 }, children: latest ? `${latest.identifier}: ${latest.title}` : "No Room reports waiting" }),
      /* @__PURE__ */ jsx("span", { style: { color: "var(--muted-foreground, #667085)", fontSize: 13 }, children: latest ? `${latest.projectName ? `${latest.projectName} / ` : ""}${latest.status}` : "Open a Team Room to start a conversation or inspect project work." })
    ] }),
    /* @__PURE__ */ jsx(
      "button",
      {
        type: "button",
        onClick: () => navigation.navigate("/agent-rooms"),
        style: {
          justifySelf: "start",
          border: "1px solid #1f5eb8",
          borderRadius: 7,
          background: "#2563bf",
          color: "#fff",
          padding: "8px 11px",
          font: "650 13px/1.2 system-ui, sans-serif",
          cursor: "pointer"
        },
        children: "Open Team Rooms"
      }
    )
  ] });
}
export {
  AgentRoomsPage,
  CodexAccountsPage,
  CodexAccountsSidebar,
  CodexAgentAccountConfiguration,
  OrganizationSettingsPage,
  ProjectTasksPage,
  ProjectTasksProjectLink,
  ProjectWorkplaneLink,
  ProjectWorkplaneTab,
  RoomChatTab,
  TeamWorkplaneDashboardWidget
};
