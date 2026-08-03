import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOM_ATTACHMENT_CACHE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const ROOM_RESPONSE_CONTRACT = [
  "SYSTEM-PROVIDED ROOM RESPONSE CONTRACT:",
  "- When the current request asks to show or preview an existing Workspace image, the final response must embed at least one relevant image with Markdown image syntax and a verified absolute local path.",
  "- On Windows, use this form: `![description](<C:/absolute/path/to/image.png>)`. The Room UI converts verified Workspace paths into safe inline previews and clickable file links.",
  "- Do not merely say that an image is shown. If no relevant image exists or its path cannot be verified, say that clearly instead of emitting a broken or invented path.",
  "- Use ordinary Markdown links with verified absolute local paths for other Workspace files that the user should inspect."
].join("\n");

function textParam(params, key, fallback = "") {
  const value = params?.[key];
  return value === undefined || value === null ? fallback : String(value).trim();
}

function listParam(params, key) {
  const value = params?.[key];
  return Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean) : [];
}

export function attachmentIdsParam(params) {
  return [...new Set(listParam(params, "attachmentIds"))];
}

export function repairUtf8Mojibake(value) {
  const source = String(value ?? "");
  const mojibake = /(?:Ã.|Â.|â..|ð...|ì[\u0080-\u00bf]|í[\u0080-\u00bf]|ë[\u0080-\u00bf]|ê[\u0080-\u00bf])/;
  if (!source || /[^\u0000-\u00ff]/.test(source) || !mojibake.test(source)) return source;
  let repaired = source;
  for (let attempt = 0; attempt < 2 && mojibake.test(repaired); attempt += 1) {
    try {
      const candidate = Buffer.from(repaired, "latin1").toString("utf8");
      if (!candidate || candidate.includes("\ufffd") || candidate === repaired) break;
      repaired = candidate;
    } catch {
      break;
    }
  }
  return repaired;
}

export function enforceUtf8Text(value, label = "Text") {
  const text = repairUtf8Mojibake(value).replace(/\r\n/g, "\n");
  if (text.includes("\ufffd")) {
    throw new Error(`${label} contains an invalid UTF-8 replacement character and was not saved to avoid corrupted text.`);
  }
  return text;
}

export function enforceTaskContractText(value, label = "Task text") {
  const text = enforceUtf8Text(value, label);
  if (/\?{2,}/.test(text)) {
    throw new Error(`${label} contains a likely lossy encoding sequence (??) and was not saved.`);
  }
  return text;
}

export function roomAttachmentName(attachment) {
  const filename = textParam(attachment, "originalFilename") || textParam(attachment, "filename");
  return repairUtf8Mojibake(filename) || `attachment-${textParam(attachment, "id", "file")}`;
}

export function safeAttachmentFilename(filename) {
  const basename = path.basename(String(filename || "attachment"));
  const cleaned = basename.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").trim().slice(0, 120);
  return cleaned || "attachment";
}

export function safeAttachmentPathSegment(value) {
  return String(value || "unknown").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 160) || "unknown";
}

export function attachmentContentPath(attachment) {
  const contentPath = textParam(attachment, "contentPath");
  return contentPath || `/api/attachments/${encodeURIComponent(textParam(attachment, "id"))}/content`;
}

function roomAttachmentContentUrl(apiUrl, attachment, loopbackSPSApiUrl) {
  return new URL(attachmentContentPath(attachment), `${loopbackSPSApiUrl(apiUrl)}/`).toString();
}

export function isCodexImageAttachment(attachment) {
  const contentType = textParam(attachment, "contentType").toLowerCase();
  if (/^image\/(png|jpe?g|webp|gif|avif|bmp)$/i.test(contentType)) return true;
  return /\.(png|jpe?g|webp|gif|avif|bmp)$/i.test(roomAttachmentName(attachment));
}

export function roomAttachmentCacheRoot() {
  const paperclipHome = String(process.env.PAPERCLIP_HOME || "").trim();
  return paperclipHome
    ? path.join(paperclipHome, "room-attachments")
    : path.join(os.homedir(), ".sps", "room-attachments");
}

export function roomAttachmentWorkspaceRoot(workingDirectory) {
  const requestedWorkspace = String(workingDirectory || "").trim();
  if (!requestedWorkspace) {
    throw new Error("A Room Workspace is required before attached files can be prepared for an Agent.");
  }
  const workspaceRoot = path.resolve(requestedWorkspace);
  const attachmentRoot = path.resolve(workspaceRoot, ".sps", "room-attachments");
  const relative = path.relative(workspaceRoot, attachmentRoot);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("The Room attachment staging path must stay inside the selected Project Workspace.");
  }
  return attachmentRoot;
}

export function workspaceGitExcludePath(workingDirectory) {
  const dotGitPath = path.join(workingDirectory, ".git");
  if (!fs.existsSync(dotGitPath)) return null;
  const stats = fs.statSync(dotGitPath);
  if (stats.isDirectory()) return path.join(dotGitPath, "info", "exclude");
  if (!stats.isFile()) return null;
  const match = fs.readFileSync(dotGitPath, "utf8").match(/^gitdir:\s*(.+)\s*$/im);
  return match ? path.join(path.resolve(workingDirectory, match[1]), "info", "exclude") : null;
}

export function excludeWorkspaceRoomAttachments(workingDirectory) {
  const excludePath = workspaceGitExcludePath(workingDirectory);
  if (!excludePath) return null;
  const rule = ".sps/room-attachments/";
  const existing = fs.existsSync(excludePath) ? fs.readFileSync(excludePath, "utf8") : "";
  if (existing.split(/\r?\n/).some((line) => line.trim().replace(/\\/g, "/") === rule)) return excludePath;
  fs.mkdirSync(path.dirname(excludePath), { recursive: true });
  fs.appendFileSync(excludePath, `${existing && !existing.endsWith("\n") ? "\n" : ""}${rule}\n`, "utf8");
  return excludePath;
}

export function cleanupRoomAttachmentCache(root = roomAttachmentCacheRoot(), nowMs = Date.now()) {
  if (!fs.existsSync(root)) return [];
  const removed = [];
  for (const roomEntry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!roomEntry.isDirectory()) continue;
    const roomPath = path.join(root, roomEntry.name);
    for (const attachmentEntry of fs.readdirSync(roomPath, { withFileTypes: true })) {
      if (!attachmentEntry.isDirectory()) continue;
      const attachmentPath = path.join(roomPath, attachmentEntry.name);
      const modifiedAt = fs.statSync(attachmentPath).mtimeMs;
      if (nowMs - modifiedAt <= ROOM_ATTACHMENT_CACHE_RETENTION_MS) continue;
      fs.rmSync(attachmentPath, { recursive: true, force: true });
      removed.push(attachmentPath);
    }
    if (!fs.readdirSync(roomPath).length) fs.rmdirSync(roomPath);
  }
  return removed;
}

export function attachmentSnapshot(attachment) {
  return {
    id: textParam(attachment, "id"),
    originalFilename: roomAttachmentName(attachment),
    contentType: textParam(attachment, "contentType") || "application/octet-stream",
    byteSize: Number(attachment?.byteSize) || 0,
    contentPath: attachmentContentPath(attachment),
    openPath: textParam(attachment, "openPath") || null,
    downloadPath: textParam(attachment, "downloadPath") || null
  };
}

export async function listIssueAttachmentsDirect(apiUrl, issueId, { fetchImpl = globalThis.fetch, loopbackSPSApiUrl, spsDesktopAccessHeaders } = {}) {
  const endpoint = `${loopbackSPSApiUrl(apiUrl)}/api/issues/${encodeURIComponent(issueId)}/attachments`;
  const response = await fetchImpl(endpoint, { headers: spsDesktopAccessHeaders() });
  if (!response.ok) throw new Error(`SPS attachment list failed (HTTP ${response.status}).`);
  const result = await response.json();
  return Array.isArray(result) ? result : Array.isArray(result?.attachments) ? result.attachments : [];
}

export async function resolveRoomAttachments(apiUrl, issueId, attachmentIds, network) {
  if (!attachmentIds.length) return [];
  const available = await listIssueAttachmentsDirect(apiUrl, issueId, network);
  const byId = new Map(available.map((attachment) => [textParam(attachment, "id"), attachment]));
  const missing = attachmentIds.filter((id) => !byId.has(id));
  if (missing.length) throw new Error("One or more selected files are no longer attached to this Room.");
  return attachmentIds.map((id) => attachmentSnapshot(byId.get(id)));
}

export function mergeRoomAttachments(...groups) {
  const byId = new Map();
  for (const group of groups) {
    for (const attachment of Array.isArray(group) ? group : []) {
      const snapshot = attachmentSnapshot(attachment);
      if (!snapshot.id || byId.has(snapshot.id)) continue;
      byId.set(snapshot.id, snapshot);
    }
  }
  return [...byId.values()];
}

export async function stageRoomAttachments(apiUrl, roomIssueId, attachments, workingDirectory, network) {
  const workspaceRoot = path.resolve(String(workingDirectory || "").trim());
  const cacheRoot = roomAttachmentWorkspaceRoot(workspaceRoot);
  excludeWorkspaceRoomAttachments(workspaceRoot);
  cleanupRoomAttachmentCache(cacheRoot);
  const roomDirectory = path.join(cacheRoot, safeAttachmentPathSegment(roomIssueId));
  const staged = [];
  for (const attachment of attachments) {
    const attachmentId = textParam(attachment, "id");
    if (!attachmentId) throw new Error("An attached file did not have a SPS attachment id.");
    const directory = path.join(roomDirectory, safeAttachmentPathSegment(attachmentId));
    const localPath = path.join(directory, safeAttachmentFilename(roomAttachmentName(attachment)));
    const partialPath = `${localPath}.partial`;
    const response = await network.fetchImpl(roomAttachmentContentUrl(apiUrl, attachment, network.loopbackSPSApiUrl), { headers: network.spsDesktopAccessHeaders() });
    if (!response.ok) throw new Error(`Could not read attached file ${roomAttachmentName(attachment)} (HTTP ${response.status}).`);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(partialPath, Buffer.from(await response.arrayBuffer()));
    fs.rmSync(localPath, { force: true });
    fs.renameSync(partialPath, localPath);
    fs.utimesSync(directory, new Date(), new Date());
    staged.push({ ...attachment, localPath, isImage: isCodexImageAttachment(attachment) });
  }
  return staged;
}

export function roomAttachmentCommentBlock(attachments) {
  if (!attachments.length) return "";
  const rows = attachments.map((attachment) => {
    const label = roomAttachmentName(attachment).replace(/([\[\]])/g, "\\$1");
    return `- [${label}](${attachmentContentPath(attachment)})`;
  });
  return `\n\n**Attached files**\n${rows.join("\n")}\n<!-- paperclip-room-attachments:${attachments.map((attachment) => attachment.id).join(",")} -->`;
}

export function roomUserCommentBody(message, attachments, mode = "agent", retryOfCommentId = "") {
  const text = enforceUtf8Text(message, "Room message").trim() || "Please inspect the attached files.";
  const retryMarker = retryOfCommentId ? `\n<!-- paperclip-room-retry-of:${retryOfCommentId} -->` : "";
  return `**User**\n${text}${retryMarker}${roomAttachmentCommentBlock(attachments)}`;
}

export function roomTurnText(message, stagedAttachments, retryOfCommentId = "") {
  const text = enforceUtf8Text(message, "Room message").trim() || "Please inspect the attached files and respond to the user.";
  const retryPreamble = retryOfCommentId
    ? `USER MESSAGE REVISION: This message replaces the earlier user message ${retryOfCommentId}. Treat this revision as the current request. Do not continue or answer the superseded version.\n\n`
    : "";
  if (!stagedAttachments.length) return `${retryPreamble}${text}\n\n${ROOM_RESPONSE_CONTRACT}`;
  const fileContext = stagedAttachments.map((attachment) => {
    const delivery = attachment.isImage ? "also supplied as an image input" : "available as a local file";
    return `- ${roomAttachmentName(attachment)} (${attachment.contentType}, ${attachment.byteSize} bytes): ${attachment.localPath} (${delivery})`;
  });
  return `${retryPreamble}${text}\n\nAttached Room files are durable SPS attachments. Inspect only the files relevant to the request and do not execute untrusted binaries.\n${fileContext.join("\n")}\n\n${ROOM_RESPONSE_CONTRACT}`;
}

export function isRoomUserComment(comment) {
  return /^\*\*User\*\*/i.test(String(comment?.body || "").trim());
}

export async function validateRoomRetrySource(ctx, companyId, issueId, retryOfCommentId) {
  const sourceCommentId = String(retryOfCommentId || "").trim();
  if (!sourceCommentId) return "";
  if (!ctx.issues.listComments) throw new Error("Room message retry is unavailable because Room comments could not be read.");
  const comments = await ctx.issues.listComments(issueId, companyId);
  const sourceComment = comments.find((comment) => comment.id === sourceCommentId);
  if (!sourceComment || !isRoomUserComment(sourceComment)) {
    throw new Error("The selected message is not a user message in this Room.");
  }
  return sourceCommentId;
}
