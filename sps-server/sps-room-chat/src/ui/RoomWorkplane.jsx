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
import { rewriteWorkspaceMarkdownLinks } from "./workspace-links.js";

const AGENT_CONFIGURATION_PERMISSION_REQUEST = Object.freeze({
  __paperclipRequestedPermissions: ["agents:configure"]
});

const LEGACY_TASK_TYPES = Object.freeze([
  Object.freeze({ id: "design", label: "Design" }),
  Object.freeze({ id: "documentation", label: "Documentation" }),
  Object.freeze({ id: "implementation", label: "Implementation" }),
  Object.freeze({ id: "qa", label: "Quality assurance" }),
  Object.freeze({ id: "art", label: "Art / assets" }),
  Object.freeze({ id: "voice", label: "Voice / audio" })
]);
const TASK_TYPE_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

function taskTypeKey(value) {
  const key = String(value || "").trim().toLowerCase();
  return TASK_TYPE_KEY_PATTERN.test(key) ? key : "";
}

function taskTypesForProfile(profile) {
  const configured = Array.isArray(profile?.taskTypes) ? profile.taskTypes : LEGACY_TASK_TYPES;
  const types = new Map();
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

const STYLES = `
  .rw-shell { color: var(--foreground, #172033); font: 14px/1.45 system-ui, sans-serif; }
  .rw-layout { display: grid; grid-template-columns: 238px minmax(0, 1fr) 310px; height: min(760px, calc(100dvh - 150px)); min-height: 540px; overflow: hidden; border: 1px solid var(--border, #d8dee9); background: var(--background, #fff); }
  .rw-rooms, .rw-context { min-width: 0; min-height: 0; background: var(--muted, #f7f8fa); overscroll-behavior: contain; }
  .rw-rooms { border-right: 1px solid var(--border, #d8dee9); overflow: auto; }
  .rw-context { border-left: 1px solid var(--border, #d8dee9); display: flex; flex-direction: column; overflow: hidden; }
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
  .rw-message-body img { display: block; width: auto; max-width: min(100%, 760px); max-height: 520px; margin: 10px 0 4px; object-fit: contain; image-rendering: pixelated; border: 1px solid var(--border, #d8dee9); border-radius: 6px; background: repeating-conic-gradient(#eef2f7 0 25%, #fff 0 50%) 50% / 16px 16px; cursor: zoom-in; }
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
  .rw-workspace-notice { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; padding: 9px 10px; border: 1px solid #e2c46b; border-radius: 6px; background: #fffbeb; color: #634b00; font-size: 12px; }
  .rw-workspace-notice strong, .rw-workspace-notice span { display: block; }
  .rw-workspace-notice span { margin-top: 2px; }
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
  .rw-context-focus { flex: 0 1 210px; overflow: auto; }
  .rw-context-tasks { flex: 0 1 170px; overflow: auto; }
  .rw-context-changes-section { display: flex; flex: 1 1 180px; flex-direction: column; min-height: 150px; overflow: hidden; }
  .rw-context-changes { min-height: 0; flex: 1 1 auto; overflow-y: auto; overflow-x: hidden; overscroll-behavior: contain; scrollbar-gutter: stable; padding-right: 4px; }
  .rw-context-session { flex: 0 0 auto; max-height: 156px; overflow: auto; }
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
  .rw-context-section { padding: 14px; border-bottom: 1px solid var(--border, #d8dee9); }
  .rw-context-section h3 { font-size: 12px; margin: 0 0 9px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted-foreground, #667085); }
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
  .rw-error { color: #b42318; }
  .rw-project { padding: 18px; }
  .rw-project h1 { font-size: 20px; margin: 0 0 3px; }
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
  @media (max-width: 1020px) { .rw-layout { grid-template-columns: 210px minmax(0, 1fr); } .rw-context { display: none; } }
  @media (max-width: 720px) { .rw-layout { display: block; height: auto; min-height: 0; overflow: visible; } .rw-rooms { border-right: 0; border-bottom: 1px solid var(--border, #d8dee9); max-height: 210px; } .rw-main { min-height: 620px; } }
`;

function Style() {
  return <style>{STYLES}</style>;
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
  return repairVisibleMojibake(comment?.body || "")
    .replace(/^\*\*[^*]+\*\*\s*/m, "")
    .replace(/\n?<!--\s*paperclip-room-mode:(agent|plan|ask)\s*-->\s*/gi, "")
    .replace(/\n?<!--\s*paperclip-room-retry-of:[\w-]+\s*-->\s*/gi, "")
    .replace(/\n\n\*\*Attached files\*\*[\s\S]*?<!--\s*paperclip-room-attachments:[\w,-]+\s*-->/gi, "")
    .trimEnd();
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
  return <div className={`rw-attachment-list ${className}`.trim()}>{attachments.map((attachment) => <a className="rw-attachment-chip" key={attachment.id} href={attachmentHref(attachment)} target="_blank" rel="noreferrer">
    {attachmentIsImage(attachment) ? <img src={attachmentHref(attachment)} alt="" /> : null}
    <span title={attachmentName(attachment)}>{attachmentName(attachment)}</span><small>{formatBytes(attachment.byteSize)}</small>
  </a>)}</div>;
}

function RoomFilePreview({ preview, onClose }) {
  useEffect(() => {
    if (!preview) return undefined;
    const closeOnEscape = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [preview, onClose]);
  if (!preview) return null;

  const content = preview.content || {};
  const isImage = preview.resource?.previewKind === "image" && content.encoding === "base64";
  const imageSource = isImage ? `data:${preview.resource?.contentType || "image/png"};base64,${content.data || ""}` : "";
  const isText = content.encoding === "utf8" || content.encoding === "text";
  return <div className="rw-file-preview-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="rw-file-preview" role="dialog" aria-modal="true" aria-label={preview.resource?.title || preview.path}>
      <header className="rw-file-preview-header">
        <div className="rw-file-preview-title"><strong>{preview.resource?.title || preview.path}</strong><span>{preview.resource?.displayPath || preview.path}</span></div>
        <div className="rw-file-preview-actions"><a className="rw-button" href={preview.downloadHref}>Download</a><button type="button" className="rw-button" onClick={onClose}>Close</button></div>
      </header>
      <div className="rw-file-preview-body">
        {preview.loading ? <div className="rw-empty">Loading file...</div>
          : preview.error ? <div className="rw-error">{preview.error}</div>
            : isImage ? <img className="rw-file-preview-image" src={imageSource} alt={preview.resource?.title || preview.path} />
              : isText ? <pre className="rw-file-preview-text">{content.data || ""}</pre>
                : <div className="rw-empty">Preview is unavailable for this file type. Use Download to open the original file.</div>}
      </div>
    </section>
  </div>;
}

function taskHref(navigation, task) {
  return navigation.resolveHref(`/issues/${encodeURIComponent(task.identifier || task.id)}`);
}

function roomHref(navigation, projectId, roomId) {
  const params = new URLSearchParams({ project: projectId, room: roomId });
  return navigation.resolveHref(`/agent-rooms?${params.toString()}`);
}

function roomRoleSummary(room, { withState = false } = {}) {
  const title = String(room?.title || "").trim().toLocaleLowerCase();
  const role = String(room?.agent?.role || "").trim();
  const label = !role || title === role.toLocaleLowerCase() ? "Agent Room" : `${role} Room`;
  return withState ? `${label} - ${room?.agent?.status || "unknown"}` : label;
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
  const workState = data?.workState || {};
  const activity = state.runtime?.activity || {};
  const tasks = (data?.tasks || []).filter((task) => task.status !== "cancelled");
  const nodes = fileNodes(data?.workspaces);
  const attachments = data?.attachments || [];
  const latestOutcome = workState.latestOutcome || null;
  const nextCandidate = workState.nextCandidate || null;
  const waitingFor = workState.waitingFor || { kind: "none" };
  return <aside className="rw-context">
    <section className="rw-context-section rw-context-focus">
      <h3>Focus</h3>
      <p className="rw-focus-value"><span className="rw-focus-label">Objective</span>{workState.objective || "Not established yet"}</p>
      <p className="rw-focus-value"><span className="rw-focus-label">Phase</span>{workState.phase || "Not established yet"}</p>
      <p className="rw-focus-value"><span className="rw-focus-label">Latest outcome</span>{latestOutcome ? `${latestOutcome.identifier || latestOutcome.taskId || "Outcome"}${latestOutcome.status ? ` · ${latestOutcome.status}` : ""}${latestOutcome.summary ? ` · ${latestOutcome.summary}` : ""}` : "Not recorded yet"}</p>
      {nextCandidate?.summary ? <p className="rw-focus-value"><span className="rw-focus-label">Next candidate</span>{nextCandidate.summary}</p> : null}
      {waitingFor.kind && waitingFor.kind !== "none" ? <p className="rw-focus-value"><span className="rw-focus-label">Waiting for</span>{waitingFor.kind}{waitingFor.detail ? ` · ${waitingFor.detail}` : ""}</p> : null}
      {(workState.planReferences || []).length ? <ul className="rw-focus-sources">{workState.planReferences.map((reference) => <li key={reference}>{reference}</li>)}</ul> : null}
    </section>
    <section className="rw-context-section rw-context-tasks">
      <h3>Tasks</h3>
      {tasks.length ? tasks.map((task) => <a className="rw-task" key={task.id} {...navigation.linkProps(taskHref(navigation, task))}>
        <div className="rw-task-title">{task.title}</div>
        <div className="rw-task-meta">{task.identifier} · {task.status} · {task.assigneeAgent?.name || "Unassigned"}</div>
      </a>) : <div className="rw-muted">No finite Tasks from this Room.</div>}
    </section>
    <section className="rw-context-section rw-context-changes-section">
      <h3>Changes</h3>
      <div className="rw-context-changes">
        <FileTree nodes={nodes} wrapLabels emptyState={{ title: "No workspace changes" }} />
      </div>
    </section>
    {attachments.length ? <section className="rw-context-section">
      <h3>Room files</h3>
      <AttachmentList attachments={attachments} className="rw-context-files" />
    </section> : null}
    <details className="rw-context-section rw-context-session">
      <summary>Session details</summary>
      <dl className="rw-key-value">
        <dt>Runtime</dt><dd>{data?.runtime?.enabled ? (data?.runtime?.kind === "agy_print" ? "Agy" : "Codex") : "Disabled"}</dd>
        <dt>Model</dt><dd>{data?.runtime?.model || "Default"}</dd>
        <dt>Reasoning</dt><dd>{data?.runtime?.reasoningEffort || "Model default"}</dd>
        <dt>Workspace</dt><dd>{state.workspace?.name || "Not bound"}</dd>
        <dt>Conversation</dt><dd>{state.runtime?.codexThreadId || state.runtime?.agentSessionId || data?.runtime?.kind === "agy_print" ? "Resumable" : "Not started"}</dd>
        <dt>Activity</dt><dd>{activity.status || "idle"}</dd>
        <dt>Checkpoint</dt><dd>{state.checkpoint?.version || 0}</dd>
        <dt>Auto compact</dt><dd>{data?.runtime?.kind === "codex_app_server" ? "Native Codex" : "Adapter managed"}</dd>
      </dl>
    </details>
  </aside>;
}

function RoomActivity({ activity }) {
  if (!activity || !(activity.steps || []).length || activity.status === "completed") return null;
  const status = activity.status === "working" ? "Working" : activity.status === "completed" ? "Completed" : "Failed";
  return <section className={`rw-working ${activity.status === "failed" ? "failed" : ""}`}>
    <details open={activity.status === "working"}>
      <summary><strong>{status}</strong></summary>
      <div className="rw-working-body">
        {(activity.steps || []).map((step) => <div className="rw-step" key={step.id}>
          {step.summary ? <details><summary>{step.label}</summary><pre>{step.summary}</pre></details> : step.label}
        </div>)}
        {activity.error ? <div className="rw-step">{activity.error}</div> : null}
      </div>
    </details>
  </section>;
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
      if (!attachment?.id) throw new Error("SPS did not return an attachment id.");
      resolved = resolved.map((current) => current.clientId === item.clientId ? { ...current, attachmentId: attachment.id } : current);
      setQueuedAttachments(resolved);
    }
    return resolved.map((attachment) => attachment.attachmentId).filter(Boolean);
  };
  const send = async () => {
    const text = message.trim();
    const hasRetryAttachments = Boolean(retrySource?.attachmentIds?.length);
    if ((!text && !queuedAttachments.length && !hasRetryAttachments) || submitting || working) return;
    followLatestRef.current = true;
    setSubmitting(true); setActionError("");
    try {
      const uploadedAttachmentIds = await uploadQueuedAttachments();
      const attachmentIds = [...new Set([...(retrySource?.attachmentIds || []), ...uploadedAttachmentIds])];
      const result = await sendRoom({ issueId: roomId, message: text, attachmentIds, ...(retrySource?.commentId ? { retryOfCommentId: retrySource.commentId } : {}) });
      if (result?.ok === false) throw new Error(result.message || result.code || "Room message could not be queued.");
      setMessage("");
      setQueuedAttachments([]);
      setRetrySource(null);
      await refresh();
    } catch (caught) {
      setActionError(caught?.message || "Room message could not be queued.");
    } finally { setSubmitting(false); }
  };
  const compact = async () => {
    if (submitting || working) return;
    setSubmitting(true); setActionError("");
    try {
      const result = await compactRoom({ issueId: roomId });
      if (result?.ok === false) throw new Error(result.message || result.code || "Room checkpoint could not be queued.");
      await refresh();
    }
    catch (caught) { setActionError(caught?.message || "Room checkpoint could not be queued."); }
    finally { setSubmitting(false); }
  };
  const roomName = data?.room?.agentName || data?.room?.title || "Agent";
  const messages = useMemo(() => [...(data?.comments || [])].sort((left, right) => {
    return new Date(left.createdAt || 0).getTime() - new Date(right.createdAt || 0).getTime();
  }), [data?.comments]);
  const supersededMessageIds = useMemo(() => new Set(messages.map(roomRetryOf).filter(Boolean)), [messages]);
  const currentProjectId = data?.project?.id || workplane?.project?.id || context.projectId;
  const roomPageHref = currentProjectId ? roomHref(navigation, currentProjectId, roomId) : "";
  const workspaceSetup = data?.workspaceSetup;
  const workspaceReady = !workspaceSetup || workspaceSetup.state === "ready" || workspaceSetup.state === "legacy";
  const workspaceRouteKey = data?.project?.routeKey || currentProjectId;
  const workspaceSetupHref = workspaceRouteKey ? navigation.resolveHref(`/projects/${encodeURIComponent(workspaceRouteKey)}?tab=plugin%3Alocal.room-chat%3Aproject-workplane`) : "";
  const workspaceNotice = workspaceSetup?.state === "missing"
    ? "Set the Project local folder in Configuration before this Room starts an Agent turn."
    : workspaceSetup?.state === "unavailable"
      ? "The selected Project Workspace is not available on this computer. Update its local path before starting an Agent turn."
      : "";

  const renderRoomText = (comment) => rewriteWorkspaceMarkdownLinks(roomText(comment), {
    linkBaseHref: roomPageHref,
    roomIssueId: roomId,
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

  if (loading && !data) return <div className="rw-empty">Loading Room...</div>;
  if (error && !data) return <div className="rw-error">{error.message}</div>;
  return <div className="rw-layout">
    {workplane ? <RoomList navigation={navigation} workplane={workplane} projectId={currentProjectId} roomId={roomId} /> : <div className="rw-rooms" />}
    <main className="rw-main">
      <header className="rw-header">
        <div><h1 className="rw-title">{roomName}</h1><p className="rw-subtitle">Agent Room</p></div>
        <StatusBadge label={working ? "Working" : data?.runtime?.enabled ? "Ready" : "Runtime disabled"} status={working ? "warning" : data?.runtime?.enabled ? "ok" : "pending"} />
      </header>
      <section className="rw-thread" ref={threadRef} onScroll={trackThreadScroll}>
        {messages.length ? messages.map((comment) => {
          const attachmentIds = roomAttachmentIds(comment);
          const attachments = attachmentIds.map((id) => (data?.attachments || []).find((attachment) => attachment.id === id)).filter(Boolean);
          const showActivity = activity?.sourceCommentId && activity.sourceCommentId === comment.id;
          const isUserMessage = roomLabel(comment) === "User";
          const isSuperseded = supersededMessageIds.has(comment.id);
          return <div key={comment.id || `${comment.createdAt}-${comment.body}`}>
            <article className="rw-message">
              <div className="rw-message-label"><span>{roomLabel(comment)}{isSuperseded ? " (revised)" : ""}</span></div>
              <div onClick={openRoomFile}><MarkdownBlock className="rw-message-body" content={renderRoomText(comment)} enableWikiLinks /></div>
              <AttachmentList attachments={attachments} className="rw-message-attachments" />
              {isUserMessage ? <div className="rw-message-actions"><button type="button" className="rw-text-button" onClick={() => editAndRetry(comment)} disabled={submitting || working || !data?.runtime?.enabled}>Edit and retry</button></div> : null}
            </article>
            {showActivity ? <RoomActivity activity={activity} /> : null}
          </div>;
        }) : <div className="rw-empty">Start the long-lived conversation with this Agent.</div>}
        {activity && !activity.sourceCommentId ? <RoomActivity activity={activity} /> : null}
      </section>
      <footer className="rw-composer">
        {actionError ? <div className="rw-error">{actionError}</div> : null}
        {workspaceNotice ? <div className="rw-workspace-notice"><div><strong>Project folder required</strong><span>{workspaceNotice}</span></div>{workspaceSetupHref ? <a className="rw-button" {...navigation.linkProps(workspaceSetupHref)}>Open Workspace Profile</a> : null}</div> : null}
        {retrySource ? <div className="rw-retry-draft"><span>Editing a prior message. Sending creates a revised retry and keeps the original in Room history.</span><button type="button" className="rw-text-button" onClick={() => setRetrySource(null)} disabled={submitting}>Cancel</button></div> : null}
        <MarkdownEditor value={message} onChange={setMessage} onSubmit={send} bordered placeholder={`${roomName}에게 메시지`} />
        <input ref={attachmentInputRef} className="rw-file-input" type="file" multiple onChange={queueFiles} />
        {queuedAttachments.length ? <div className="rw-attachment-queue">{queuedAttachments.map((attachment) => <div className="rw-attachment-chip" key={attachment.clientId}><span title={attachment.file.name}>{attachment.file.name}</span><small>{formatBytes(attachment.file.size)}</small><button type="button" aria-label={`${attachment.file.name} remove`} onClick={() => removeQueuedAttachment(attachment.clientId)} disabled={submitting}>×</button></div>)}</div> : null}
        <div className="rw-composer-tools">
          <button type="button" className="rw-button" onClick={() => attachmentInputRef.current?.click()} disabled={submitting || working || !workspaceReady || !data?.runtime?.enabled}>Attach files</button>
          <span className="rw-muted">Files are stored in this Room, not the project repository.</span>
        </div>
        <div className="rw-actions"><span className="rw-muted">History saved automatically</span><button type="button" className="rw-button" onClick={compact} disabled={submitting || working || !workspaceReady || !data?.runtime?.enabled}>Compact &amp; checkpoint</button><button type="button" className="rw-button primary" onClick={send} disabled={submitting || working || !workspaceReady || (!message.trim() && !queuedAttachments.length && !retrySource?.attachmentIds?.length) || !data?.runtime?.enabled}>{retrySource ? "Retry" : "Send"}</button></div>
      </footer>
    </main>
    <RoomContext data={data} navigation={navigation} />
    <RoomFilePreview preview={filePreview} onClose={() => setFilePreview(null)} />
  </div>;
}

function RoomList({ navigation, workplane, projectId, roomId }) {
  return <aside className="rw-rooms"><div className="rw-room-list"><div className="rw-muted">{workplane.project?.name || "Project"}</div>{(workplane.rooms || []).map((room) => <a className={`rw-room ${room.id === roomId ? "active" : ""}`} key={room.id} {...navigation.linkProps(roomHref(navigation, projectId, room.id))}><strong>{room.title}</strong><span>{roomRoleSummary(room, { withState: true })}</span></a>)}</div></aside>;
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
    getAccess({ ...AGENT_CONFIGURATION_PERMISSION_REQUEST })
      .then((result) => { if (current) setCanConfigure(result?.canConfigure === true); })
      .catch(() => { if (current) setCanConfigure(false); });
    return () => { current = false; };
  }, [context.companyId]);

  useEffect(() => {
    setDraft({
      defaultWorkspaceId: profile.defaultWorkspaceId || "",
      agentWorkspaceIds: { ...(profile.agentWorkspaceIds || {}) },
      taskWorkspaceIds: { ...(profile.taskWorkspaceIds || {}) },
      taskTypes: taskTypesForProfile(profile)
    });
  }, [profile.defaultWorkspaceId, JSON.stringify(profile.agentWorkspaceIds || {}), JSON.stringify(profile.taskWorkspaceIds || {}), JSON.stringify(profile.taskTypes || [])]);

  const updateAgentWorkspace = (agentId, workspaceId) => {
    setDraft((current) => ({
      ...(current || {}),
      agentWorkspaceIds: { ...(current?.agentWorkspaceIds || {}), [agentId]: workspaceId }
    }));
  };

  const updateTaskWorkspace = (taskType, workspaceId) => {
    setDraft((current) => ({
      ...(current || {}),
      taskWorkspaceIds: { ...(current?.taskWorkspaceIds || {}), [taskType]: workspaceId }
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
      ...(current || {}),
      taskTypes: [...(current?.taskTypes || []), { id, label: newTaskType.label.trim() || id }]
    }));
    setNewTaskType({ id: "", label: "" });
    setError("");
  };

  const removeTaskType = (taskType) => {
    setDraft((current) => {
      const mappings = { ...(current?.taskWorkspaceIds || {}) };
      delete mappings[taskType];
      return {
        ...(current || {}),
        taskTypes: (current?.taskTypes || []).filter((candidate) => candidate.id !== taskType),
        taskWorkspaceIds: mappings
      };
    });
  };

  const save = async () => {
    if (!draft || saving || !canConfigure) return;
    setSaving(true); setError(""); setNotice("");
    try {
      await saveProfile({ ...AGENT_CONFIGURATION_PERMISSION_REQUEST, projectId: workplane.project.id, profile: draft });
      setNotice("Workspace Profile saved. New Room and Task turns use these project-specific defaults.");
      await onRefresh();
    } catch (caught) {
      setError(caught?.message || "Workspace Profile could not be saved.");
    } finally { setSaving(false); }
  };

  const addWorkspace = async () => {
    if (creating || !canConfigure) return;
    setCreating(true); setError(""); setNotice("");
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
    } finally { setCreating(false); }
  };

  return <section className="wp-profile"><details className="wp-profile-details">
    <summary><span>Workspace &amp; task routing</span><span className="rw-muted">{profile.configured ? "Project profile active" : "Setup required"}</span></summary>
    <div className="wp-profile-content">
    <div className="wp-profile-head">
      <div><h2>Workspace Profile</h2><p>Define this Project's folders and each Agent's Room location. Task mappings take priority for finite work, so one repository, separate repositories, research folders, shared references, or another workflow can coexist.</p></div>
      <span className="rw-muted">{profile.configured ? "Project profile active" : "Using legacy fallback until saved"}</span>
    </div>
    {canConfigure === false ? <div className="ca-note">Only company Owners and Admins can change Workspace Profiles. You can still view the current Project layout.</div> : null}
    {error ? <div className="rw-error">{error}</div> : null}
    {notice ? <div className="ca-note">{notice}</div> : null}
    <div className="wp-workspaces">
      {workspaces.length ? workspaces.map((workspace) => <div className="wp-workspace" key={workspace.id}>
        <div><strong>{workspace.name}{workspace.isPrimary ? " (primary)" : ""}</strong><span>{workspace.path || workspace.repoUrl || "Remote workspace"}</span></div>
      </div>) : <div className="rw-empty">This Project has no registered Workspace yet. Add the first local folder or repository below.</div>}
    </div>
    {workspaces.length ? <label className="wp-profile-default">Default Room Workspace<select value={draft?.defaultWorkspaceId || ""} onChange={(event) => setDraft((current) => ({ ...(current || {}), defaultWorkspaceId: event.target.value }))} disabled={!canConfigure || saving || creating}><option value="">No explicit default</option>{workspaces.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select></label> : null}
    <div className="wp-new-workspace">
      <label>Name<input value={newWorkspace.name} onChange={(event) => setNewWorkspace((current) => ({ ...current, name: event.target.value }))} placeholder="e.g. Research" disabled={!canConfigure || creating || saving} /></label>
      <label>Local folder<input value={newWorkspace.cwd} onChange={(event) => setNewWorkspace((current) => ({ ...current, cwd: event.target.value }))} placeholder="C:\\absolute\\path\\to\\folder" disabled={!canConfigure || creating || saving} /></label>
      <label>Repository URL (optional)<input value={newWorkspace.repoUrl} onChange={(event) => setNewWorkspace((current) => ({ ...current, repoUrl: event.target.value }))} placeholder="https://github.com/org/repo" disabled={!canConfigure || creating || saving} /></label>
      <button type="button" className="rw-button" onClick={addWorkspace} disabled={!canConfigure || creating || saving}>{creating ? "Adding..." : "Add Workspace"}</button>
    </div>
    {workspaces.length ? <details className="wp-routing"><summary>Advanced routing</summary><p className="rw-muted">Set persistent Room locations per Agent and explicit Workspaces per Task type. A Lead can still choose a different Workspace for an individual Task.</p><div className="wp-agent-map"><h3>Agent Room defaults</h3>{agents.map((agent) => <div className="wp-agent" key={agent.id}><div><strong>{agent.name}</strong><span>{agent.role || "Agent"}</span></div><label>Room Workspace<select aria-label={`${agent.name} Room Workspace`} value={draft?.agentWorkspaceIds?.[agent.id] || ""} onChange={(event) => updateAgentWorkspace(agent.id, event.target.value)} disabled={!canConfigure || saving || creating}><option value="">Use Room default</option>{workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select></label></div>)}</div><div className="wp-agent-map"><h3>Task workspace defaults</h3><p className="rw-muted">These keys are Project-specific. Leads can use any configured key when creating a finite Task.</p>{(draft?.taskTypes || []).map((taskType) => <div className="wp-task-route" key={taskType.id}><div><strong>{taskType.label}</strong><span>{taskType.id}</span></div><label>Workspace<select aria-label={`${taskType.id} Task Workspace`} value={draft?.taskWorkspaceIds?.[taskType.id] || ""} onChange={(event) => updateTaskWorkspace(taskType.id, event.target.value)} disabled={!canConfigure || saving || creating}><option value="">Choose by task type</option>{workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select></label><button type="button" className="rw-button" onClick={() => removeTaskType(taskType.id)} disabled={!canConfigure || saving || creating}>Remove</button></div>)}<div className="wp-new-task-type"><label>Task type key<input value={newTaskType.id} onChange={(event) => setNewTaskType((current) => ({ ...current, id: event.target.value }))} placeholder="e.g. research" disabled={!canConfigure || saving || creating} /></label><label>Label (optional)<input value={newTaskType.label} onChange={(event) => setNewTaskType((current) => ({ ...current, label: event.target.value }))} placeholder="e.g. Research and discovery" disabled={!canConfigure || saving || creating} /></label><button type="button" className="rw-button" onClick={addTaskType} disabled={!canConfigure || saving || creating}>Add Task type</button></div></div></details> : null}
    <div className="wp-profile-actions"><button type="button" className="rw-button primary" onClick={save} disabled={!canConfigure || !draft || saving || creating}>{saving ? "Saving..." : "Save Workspace Profile"}</button></div>
    </div>
  </details></section>;
}

function ProjectWorkplaneHome({ context, projectId, workplane, onRefresh, navigation }) {
  return <div className="rw-project">
    <h1>{workplane?.project?.name || "Project"}</h1>
    <p className="rw-muted">Choose an Agent Room. Finite work remains in Tasks.</p>
    <div className="rw-project-grid">
      {(workplane?.rooms || []).map((room) => <a className="rw-project-card" key={room.id} {...navigation.linkProps(roomHref(navigation, projectId, room.id))}>
        <strong>{room.title}</strong><p>{roomRoleSummary(room)}</p>
      </a>)}
    </div>
    <WorkspaceProfile context={context} workplane={workplane} onRefresh={onRefresh} />
  </div>;
}

function ProjectRooms({ context, projectId, roomId }) {
  const navigation = useHostNavigation();
  const { data, loading, error, refresh } = usePluginData("project-workplane-view", { companyId: context.companyId, projectId });
  if (roomId) return <RoomConversation context={context} roomId={roomId} workplane={data} />;
  if (loading) return <div className="rw-empty">Loading Rooms...</div>;
  if (error) return <div className="rw-error">{error.message}</div>;
  if (!roomId) return <ProjectWorkplaneHome context={context} projectId={projectId} workplane={data} onRefresh={refresh} navigation={navigation} />;
  return <div className="rw-project"><h1>{data?.project?.name || "Project"}</h1><p className="rw-muted">Choose an Agent Room. Finite work remains in Tasks.</p><div className="rw-project-grid">{(data?.rooms || []).map((room) => <a className="rw-project-card" key={room.id} {...navigation.linkProps(roomHref(navigation, projectId, room.id))}><strong>{room.title}</strong><p>{roomRoleSummary(room)}</p></a>)}</div></div>;
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

export function ProjectTasksPage({ context }) {
  const location = useHostLocation();
  const navigation = useHostNavigation();
  const projectId = new URLSearchParams(location.search).get("project");
  const { data, loading, error } = usePluginData("project-tasks-view", { companyId: context.companyId, projectId: projectId || "" });
  const projectName = data?.project?.name || "Project";
  const roomsHref = projectId ? navigation.resolveHref(`/agent-rooms?project=${encodeURIComponent(projectId)}`) : "";
  const tasks = data?.tasks || [];
  return <div className="rw-task-board"><Style />
    <header className="rw-task-board-header"><div><h1>{projectId ? `${projectName} Tasks` : "Project Tasks"}</h1><p className="rw-muted">Finite work created from an Agent Room. Task conversations stay in native SPS Task chat.</p></div>{roomsHref ? <a className="rw-button" {...navigation.linkProps(roomsHref)}>Open Agent Rooms</a> : null}</header>
    {!projectId ? <div className="rw-empty">Open Tasks from a Project to keep the Project, its Rooms, and finite work together.</div>
      : loading ? <div className="rw-empty">Loading Tasks...</div>
        : error ? <div className="rw-error">{error.message}</div>
          : tasks.length ? tasks.map((task) => <a className="rw-task-row" key={task.id} {...navigation.linkProps(taskHref(navigation, task))}><strong>{task.title}</strong><span>{task.identifier} · {task.status} · {task.parentRoom?.title || "No owner Room"}</span></a>)
            : <div className="rw-empty rw-task-empty"><strong>No finite Tasks yet.</strong><p>A configured Lead can create and assign a Task from its Agent Room when work is ready.</p></div>}
  </div>;
}

export function CodexAccountsPage({ context }) {
  const setAccount = usePluginAction("codex-account-select");
  const getOrganizationSettingsAccess = usePluginAction("organization-settings-access");
  const { data, loading, error, refresh } = usePluginData("codex-accounts-view", { companyId: context.companyId });
  const [updatingAgentId, setUpdatingAgentId] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [canConfigureAgents, setCanConfigureAgents] = useState(null);
  useEffect(() => {
    let current = true;
    getOrganizationSettingsAccess({ ...AGENT_CONFIGURATION_PERMISSION_REQUEST })
      .then((result) => { if (current) setCanConfigureAgents(result?.canConfigureAgents === true); })
      .catch(() => { if (current) setCanConfigureAgents(false); });
    return () => { current = false; };
  }, [context.companyId]);
  const chooseAccount = async (agent, accountId) => {
    if (!accountId || accountId === agent.selectedAccountId || updatingAgentId) return;
    setUpdatingAgentId(agent.id); setActionError(""); setNotice("");
    try {
      const result = await setAccount({ ...AGENT_CONFIGURATION_PERMISSION_REQUEST, agentId: agent.id, accountId });
      setNotice(`${agent.name} now uses ${result?.account?.label || "the selected Codex account"}. The next Room message begins a new CLI session with preserved SPS context.`);
      await refresh();
    } catch (caught) {
      setActionError(caught?.message || "Codex account could not be changed.");
    } finally { setUpdatingAgentId(""); }
  };
  return <div className="rw-shell"><Style /><main className="ca-page">
    <h1>Codex Accounts</h1>
    <p className="rw-muted">Choose the ChatGPT/Codex CLI profile used by each Codex Agent.</p>
    <div className="ca-note">Changing an account updates that Agent's `CODEX_HOME` for both Agent Rooms and normal SPS Tasks. Existing Room history and checkpoints remain in SPS; only the underlying Codex CLI session changes on the next message.</div>
    {canConfigureAgents === false ? <div className="ca-note">Only company Owners and Admins can change Agent CLI accounts.</div> : null}
    {actionError ? <div className="rw-error">{actionError}</div> : null}
    {notice ? <div className="ca-note">{notice}</div> : null}
    {loading ? <div className="rw-empty">Loading local Codex accounts...</div> : error ? <div className="rw-error">{error.message}</div> : !(data?.accounts || []).length ? <div className="rw-empty">No signed-in local Codex profiles were found. Run `codex login` in a separate CODEX_HOME first.</div> : <div className="ca-list">
      {(data?.agents || []).map((agent) => <section className="ca-agent" key={agent.id}>
        <div><strong>{agent.name}</strong><span>{agent.role} - {agent.model}</span><span className="ca-path" title={agent.effectiveHome}>{agent.effectiveHome}</span></div>
        <select className="ca-select" value={agent.selectedAccountId || ""} onChange={(event) => chooseAccount(agent, event.target.value)} disabled={!canConfigureAgents || Boolean(updatingAgentId)} aria-label={`${agent.name} Codex account`}>
          {!agent.selectedAccountId ? <option value="">Current profile is not registered</option> : null}
          {(data?.accounts || []).map((account) => <option key={account.id} value={account.id}>{account.label}</option>)}
        </select>
      </section>)}
    </div>}
    <div className="rw-actions"><button type="button" className="rw-button" onClick={() => refresh()} disabled={Boolean(updatingAgentId)}>Refresh</button></div>
  </main></div>;
}

export function CodexAgentAccountConfiguration({ context }) {
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
    getOrganizationSettingsAccess({ ...AGENT_CONFIGURATION_PERMISSION_REQUEST })
      .then((result) => { if (current) setCanConfigureAgents(result?.canConfigureAgents === true); })
      .catch(() => { if (current) setCanConfigureAgents(false); });
    return () => { current = false; };
  }, [context.companyId]);

  if (loading) return <section className="ca-page"><Style /><h3>Codex CLI Account</h3><div className="rw-empty">Loading local Codex accounts...</div></section>;
  if (error) return <section className="ca-page"><Style /><h3>Codex CLI Account</h3><div className="rw-error">{error.message}</div></section>;
  if (!agent) return null;

  const chooseAccount = async (accountId) => {
    if (!accountId || accountId === agent.selectedAccountId || updating) return;
    setUpdating(true); setActionError(""); setNotice("");
    try {
      const result = await setAccount({ ...AGENT_CONFIGURATION_PERMISSION_REQUEST, agentId: agent.id, accountId });
      setNotice(`${result?.account?.label || "The selected Codex account"} will be used for the next Agent run and Room turn.`);
      await refresh();
    } catch (caught) {
      setActionError(caught?.message || "Codex account could not be changed.");
    } finally { setUpdating(false); }
  };

  return <section className="ca-page"><Style />
    <h3>Codex CLI Account</h3>
    <p className="rw-muted">Choose the signed-in Codex CLI profile used by this Agent. Room history and checkpoints stay in SPS.</p>
    {canConfigureAgents === false ? <div className="ca-note">Only company Owners and Admins can change Agent CLI accounts.</div> : null}
    {actionError ? <div className="rw-error">{actionError}</div> : null}
    {notice ? <div className="ca-note">{notice}</div> : null}
    {!(data?.accounts || []).length ? <div className="rw-empty">No signed-in local Codex profiles were found. Sign in with a separate CODEX_HOME, then refresh.</div> : <div className="ca-agent ca-agent-config">
      <div><strong>{agent.name}</strong><span className="ca-path" title={agent.effectiveHome}>{agent.effectiveHome}</span></div>
      <select className="ca-select" value={agent.selectedAccountId || ""} onChange={(event) => chooseAccount(event.target.value)} disabled={!canConfigureAgents || updating} aria-label="Codex CLI account">
        {!agent.selectedAccountId ? <option value="">Current profile is not registered</option> : null}
        {(data?.accounts || []).map((account) => <option key={account.id} value={account.id}>{account.label}</option>)}
      </select>
    </div>}
    <div className="rw-actions"><button type="button" className="rw-button" onClick={() => refresh()} disabled={updating}>Refresh accounts</button></div>
  </section>;
}

export function OrganizationSettingsPage({ context }) {
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
    getOrganizationSettingsAccess({ ...AGENT_CONFIGURATION_PERMISSION_REQUEST })
      .then((result) => { if (current) setCanConfigureAgents(result?.canConfigureAgents === true); })
      .catch(() => { if (current) setCanConfigureAgents(false); });
    return () => { current = false; };
  }, [context.companyId]);

  const refreshCollaborationReadiness = async () => {
    if (!canConfigureAgents) return;
    setCollaborationLoading(true);
    try {
      setCollaborationReadiness(await getCollaborationReadiness({ ...AGENT_CONFIGURATION_PERMISSION_REQUEST }));
    } catch {
      setCollaborationReadiness({
        state: "configuration_unavailable",
        checks: [{ label: "Collaboration access", status: "fail", message: "The readiness check could not run." }],
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
    setDrafts((current) => ({ ...current, [agentId]: { ...(current[agentId] || {}), [field]: value } }));
  };

  const save = async (agent) => {
    const draft = drafts[agent.id] || {};
    setSavingAgentId(agent.id); setActionError(""); setNotice("");
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
      setNotice(`${result?.agent?.name || agent.name}의 Workplane 역할을 저장했습니다. 다음 Room 또는 Task turn부터 적용됩니다.`);
      await refresh();
    } catch (caught) {
      setActionError(caught?.message || "Workplane 역할을 저장하지 못했습니다.");
    } finally { setSavingAgentId(""); }
  };

  const applyTemplate = async (template) => {
    if (!template?.actionable || applyingTemplateId) return;
    setApplyingTemplateId(template.id); setActionError(""); setNotice("");
    try {
      const result = await applyTemplatePolicy({ ...AGENT_CONFIGURATION_PERMISSION_REQUEST, templateId: template.id });
      const updatedCount = result?.updated?.length || 0;
      const failureCount = result?.failures?.length || 0;
      setNotice(`${template.displayName}: ${updatedCount}개 Agent에 명시적 Workplane 정책을 적용했습니다.${failureCount ? ` ${failureCount}개는 적용하지 못했습니다.` : ""}`);
      await refresh();
    } catch (caught) {
      setActionError(caught?.message || "Organization 템플릿을 적용하지 못했습니다.");
    } finally { setApplyingTemplateId(""); }
  };

  return <div className="rw-shell"><Style /><main className="org-page">
    <h1>Organization</h1>
    <p className="rw-muted">Lead는 목표 안에서 Worker Task를 만들고 검토합니다. Worker는 배정받은 Task만 실행합니다.</p>
    <div className="ca-note">역할 이름은 자유롭게 정할 수 있습니다. Task 권한은 조직도나 `reportsTo`가 아니라 여기의 Lead/Worker 유형과 위임 대상 설정으로 결정됩니다.</div>
    <section className="org-access">
      <div><strong>People and access</strong><span>Owner/Admin은 조직 정책과 CLI 계정을 관리하고, Operator는 Project, Room, Task 협업을 진행합니다.</span></div>
      <a className="rw-button" {...navigation.linkProps("/company/settings/members")}>Manage members</a>
    </section>
    {canConfigureAgents ? <section className="org-collaboration">
      <div className="org-collaboration-head">
        <div><strong>Collaboration access</strong><span>Keep the default local-only mode for solo work. This check never opens a port or reveals authentication secrets.</span></div>
        <button type="button" className="rw-button" onClick={refreshCollaborationReadiness} disabled={collaborationLoading}>{collaborationLoading ? "Checking..." : "Check readiness"}</button>
      </div>
      {collaborationReadiness ? <>
        <div className={`org-readiness ${collaborationReadiness.state === "collaboration_ready" ? "ready" : collaborationReadiness.state === "local_only" ? "" : "attention"}`}>
          <strong>{collaborationReadiness.state === "collaboration_ready" ? "Ready for private collaboration" : collaborationReadiness.state === "local_only" ? "Local-only mode (safe default)" : "Collaboration setup needs attention"}</strong>
          <span>{collaborationReadiness.recommendation}</span>
        </div>
        <ul className="org-readiness-checks">{(collaborationReadiness.checks || []).map((check, index) => <li key={`${check.label}-${index}`}><strong>{check.label}</strong><span data-status={check.status}>{check.message}</span></li>)}</ul>
        {(collaborationReadiness.warnings || []).map((warning, index) => <p className="org-readiness-warning" key={`${warning}-${index}`}>{warning}</p>)}
      </> : <div className="rw-muted" style={{ marginTop: 12 }}>Checking the local configuration...</div>}
    </section> : null}
    {canConfigureAgents === null ? <div className="ca-note">Checking Organization configuration access...</div> : canConfigureAgents ? null : <div className="ca-note">Organization policy and CLI account changes are restricted to company Owners and Admins. Project, Room, and Task work remains available through your member role.</div>}
    {actionError ? <div className="rw-error">{actionError}</div> : null}
    {notice ? <div className="ca-note">{notice}</div> : null}
    {loading ? <div className="rw-empty">Organization을 불러오는 중...</div> : error ? <div className="rw-error">{error.message}</div> : <><div className="org-templates">
      {(data?.templates || []).map((template) => <section className="org-template" key={template.id}>
        <h2>{template.displayName}</h2>
        <p>{template.description}</p>
        <small>{template.actionable ? `${template.eligibleAgentCount || 0}개 Agent에 적용 가능 · 수동 설정 Agent ${template.configuredAgentCount || 0}개는 유지` : "역할 행에서 각 Agent의 정책을 직접 설정"}</small>
        {template.actionable ? <button type="button" className="rw-button" onClick={() => applyTemplate(template)} disabled={!canConfigureAgents || (template.eligibleAgentCount || 0) === 0 || Boolean(savingAgentId) || Boolean(applyingTemplateId)}>{applyingTemplateId === template.id ? "Applying..." : (template.eligibleAgentCount || 0) === 0 ? "Add matching Agents first" : (template.actionLabel || "Apply template")}</button> : null}
      </section>)}
    </div>{(data?.agents || []).length ? <div className="org-list">
      {(data?.agents || []).map((agent) => {
        const draft = drafts[agent.id] || {};
        const isWorker = draft.kind === "worker";
        return <section className="org-agent" key={agent.id}>
          <div className="org-agent-meta"><strong>{agent.name}</strong><span>{agent.spsRole} · {agent.adapterType || "adapter"}{agent.model ? ` · ${agent.model}` : ""}</span></div>
          <div className="org-agent-policy">
            <div className="org-field"><label>Workplane type</label><select value={draft.kind || "worker"} onChange={(event) => updateDraft(agent.id, "kind", event.target.value)} disabled={!canConfigureAgents || Boolean(savingAgentId)}><option value="lead">Lead</option><option value="worker">Worker</option><option value="hybrid">Hybrid</option></select></div>
            <div className="org-field"><label>Role ID</label><input value={draft.roleId || ""} onChange={(event) => updateDraft(agent.id, "roleId", event.target.value)} disabled={!canConfigureAgents || Boolean(savingAgentId)} /></div>
            <div className="org-field"><label>Can assign roles</label><input value={draft.assignableRoleIds || ""} onChange={(event) => updateDraft(agent.id, "assignableRoleIds", event.target.value)} disabled={!canConfigureAgents || Boolean(savingAgentId) || isWorker} placeholder="worker, art-production" /></div>
            <div className="org-field"><label>Worker result review</label><select value={draft.reviewMode || "automatic"} onChange={(event) => updateDraft(agent.id, "reviewMode", event.target.value)} disabled={!canConfigureAgents || Boolean(savingAgentId) || isWorker}><option value="automatic">Start Lead review automatically</option><option value="manual">Leave a Lead Room report only</option></select></div>
          </div>
          <div className="org-agent-actions"><button type="button" className="rw-button primary" onClick={() => save(agent)} disabled={!canConfigureAgents || Boolean(savingAgentId)}>{savingAgentId === agent.id ? "Saving..." : "Save Workplane policy"}</button><a className="rw-button" {...navigation.linkProps(`/agents/${encodeURIComponent(agent.urlKey || agent.id)}/configuration`)}>Configure model &amp; tools</a></div>
          <div className="org-agent-status">{agent.workplane?.source === "legacy" ? "현재 호환 규칙에서 자동 인식됨" : agent.workplane?.source === "configured" ? "Organization 설정으로 관리됨" : "아직 Workplane 역할이 설정되지 않음"}</div>
          <details className="org-agent-advanced"><summary>Advanced</summary><div className="org-agent-advanced-content"><div className="org-field"><label>SPS memory</label><select value={draft.memoryAccess || "read"} onChange={(event) => updateDraft(agent.id, "memoryAccess", event.target.value)} disabled={!canConfigureAgents || Boolean(savingAgentId)}><option value="read_write">Read and propose</option><option value="read">Read only</option><option value="none">Disabled</option></select></div></div></details>
        </section>;
      })}
    </div> : <section className="org-empty"><div><strong>No hired Agents</strong><span>Add a Lead first, then add Workers as your organization needs them.</span></div>{canConfigureAgents ? <a className="rw-button primary" {...navigation.linkProps("/agents/all")}>Manage Agents</a> : null}</section>}</>}
  </main></div>;
}

export function ProjectTasksProjectLink({ context }) {
  const navigation = useHostNavigation();
  return <a className="rw-room" {...navigation.linkProps(`/tasks?project=${encodeURIComponent(context.entityId)}`)}>Tasks</a>;
}

export function CodexAccountsSidebar() {
  const navigation = useHostNavigation();
  return <a className="rw-room" {...navigation.linkProps("/codex-accounts")}>Codex Accounts</a>;
}

export function ProjectWorkplaneLink({ context }) {
  const navigation = useHostNavigation();
  return <a className="rw-room" {...navigation.linkProps(`/agent-rooms?project=${encodeURIComponent(context.entityId)}`)}>Agent Rooms</a>;
}
