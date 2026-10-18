import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

const ROOM_ATTACHMENT_CACHE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_ROOM_ATTACHMENT_MAX_FILE_BYTES = 100 * 1024 * 1024;
const DEFAULT_ROOM_ATTACHMENT_MAX_REQUEST_BYTES = 512 * 1024 * 1024;
const SAFE_ATTACHMENT_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,159}$/;
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
  let cleaned = basename.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").trim().slice(0, 120);
  cleaned = cleaned.replace(/[. ]+$/g, "");
  if (!cleaned || cleaned === "." || cleaned === "..") return "attachment";
  if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(cleaned)) cleaned = `_${cleaned}`;
  return cleaned;
}

export function safeAttachmentPathSegment(value, label = "Attachment id") {
  const segment = String(value || "").trim();
  if (!SAFE_ATTACHMENT_ID.test(segment)) {
    throw new Error(`${label} must contain only letters, numbers, underscores, or hyphens.`);
  }
  return segment;
}

export function attachmentContentPath(attachment) {
  const contentPath = textParam(attachment, "contentPath");
  return contentPath || `/api/attachments/${encodeURIComponent(textParam(attachment, "id"))}/content`;
}

function roomAttachmentContentUrl(apiUrl, attachment, loopbackSPSApiUrl) {
  const base = new URL(`${loopbackSPSApiUrl(apiUrl)}/`);
  const contentUrl = new URL(attachmentContentPath(attachment), base);
  if (contentUrl.origin !== base.origin || !contentUrl.pathname.startsWith("/api/attachments/")) {
    throw new Error("The SPS attachment content URL must stay on the local SPS attachment API.");
  }
  return contentUrl.toString();
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

function positiveByteLimit(name, fallback) {
  const raw = String(process.env[name] || "").trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer byte count.`);
  }
  return value;
}

function roomAttachmentByteLimits() {
  return {
    maxFileBytes: positiveByteLimit("SPS_ROOM_ATTACHMENT_MAX_FILE_BYTES", DEFAULT_ROOM_ATTACHMENT_MAX_FILE_BYTES),
    maxRequestBytes: positiveByteLimit("SPS_ROOM_ATTACHMENT_MAX_REQUEST_BYTES", DEFAULT_ROOM_ATTACHMENT_MAX_REQUEST_BYTES),
  };
}

function pathIsContained(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function realpath(target) {
  return fs.realpathSync.native ? fs.realpathSync.native(target) : fs.realpathSync(target);
}

function ensureDirectoryTreeWithoutLinks(workspaceRoot, targetDirectory) {
  const resolvedRoot = path.resolve(workspaceRoot);
  const resolvedTarget = path.resolve(targetDirectory);
  if (!pathIsContained(resolvedRoot, resolvedTarget)) {
    throw new Error("The Room attachment staging directory escaped the selected Project Workspace.");
  }
  const rootStats = fs.lstatSync(resolvedRoot);
  if (!rootStats.isDirectory()) throw new Error("The selected Project Workspace is not a directory.");
  const realRoot = realpath(resolvedRoot);
  let cursor = resolvedRoot;
  const relative = path.relative(resolvedRoot, resolvedTarget);
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment);
    if (fs.existsSync(cursor)) {
      const stats = fs.lstatSync(cursor);
      if (stats.isSymbolicLink()) throw new Error("Room attachment staging cannot use a symlink or junction.");
      if (!stats.isDirectory()) throw new Error("A Room attachment staging path component is not a directory.");
    } else {
      fs.mkdirSync(cursor);
    }
    if (!pathIsContained(realRoot, realpath(cursor))) {
      throw new Error("The Room attachment staging directory escaped through a filesystem link.");
    }
  }
  return { realRoot, realDirectory: realpath(resolvedTarget) };
}

function rejectLinkOrNonFile(target, label) {
  if (!fs.existsSync(target)) return;
  const stats = fs.lstatSync(target);
  if (stats.isSymbolicLink()) throw new Error(`${label} cannot be a symlink or junction.`);
  if (!stats.isFile()) throw new Error(`${label} must be a regular file.`);
}

async function streamAttachmentResponse(response, target, { declaredBytes, maxFileBytes, remainingRequestBytes }) {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxFileBytes) {
    await response.body?.cancel().catch(() => {});
    throw new Error(`The attached file exceeds the ${maxFileBytes} byte file limit.`);
  }
  if (Number.isFinite(contentLength) && contentLength > remainingRequestBytes) {
    await response.body?.cancel().catch(() => {});
    throw new Error("The attached files exceed the Room request byte limit.");
  }
  let receivedBytes = 0;
  const limiter = new Transform({
    transform(chunk, _encoding, callback) {
      receivedBytes += chunk.length;
      if (receivedBytes > maxFileBytes) return callback(new Error(`The attached file exceeds the ${maxFileBytes} byte file limit.`));
      if (receivedBytes > remainingRequestBytes) return callback(new Error("The attached files exceed the Room request byte limit."));
      callback(null, chunk);
    },
  });
  const source = response.body ? Readable.fromWeb(response.body) : Readable.from([]);
  await pipeline(source, limiter, fs.createWriteStream(target, { flags: "wx" }));
  if (declaredBytes > 0 && receivedBytes !== declaredBytes) {
    throw new Error(`The attached file size did not match SPS metadata (${receivedBytes} received, ${declaredBytes} declared).`);
  }
  return receivedBytes;
}

export function workspaceGitExcludePath(workingDirectory) {
  try {
    const resolvedRoot = path.resolve(workingDirectory);
    if (!fs.existsSync(resolvedRoot)) return null;
    const rootStats = fs.lstatSync(resolvedRoot);
    if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) return null;
    const realRoot = realpath(resolvedRoot);
    const dotGitPath = path.join(resolvedRoot, ".git");
    if (!fs.existsSync(dotGitPath)) return null;
    const dotGitStats = fs.lstatSync(dotGitPath);
    // A .git file may point at arbitrary external metadata. SPS deliberately
    // skips automatic excludes for linked worktrees instead of writing outside
    // the selected Project Workspace.
    if (!dotGitStats.isDirectory() || dotGitStats.isSymbolicLink()) return null;
    if (!pathIsContained(realRoot, realpath(dotGitPath))) return null;

    const infoPath = path.join(dotGitPath, "info");
    if (fs.existsSync(infoPath)) {
      const infoStats = fs.lstatSync(infoPath);
      if (!infoStats.isDirectory() || infoStats.isSymbolicLink()) return null;
      if (!pathIsContained(realRoot, realpath(infoPath))) return null;
    }
    const excludePath = path.join(infoPath, "exclude");
    if (fs.existsSync(excludePath)) {
      const excludeStats = fs.lstatSync(excludePath);
      if (!excludeStats.isFile() || excludeStats.isSymbolicLink()) return null;
      if (!pathIsContained(realRoot, realpath(excludePath))) return null;
    }
    return excludePath;
  } catch {
    return null;
  }
}

function writeRoomAttachmentGitIgnore(workingDirectory) {
  const resolvedRoot = path.resolve(workingDirectory);
  const attachmentRoot = roomAttachmentWorkspaceRoot(resolvedRoot);
  ensureDirectoryTreeWithoutLinks(resolvedRoot, attachmentRoot);
  const ignorePath = path.join(attachmentRoot, ".gitignore");
  rejectLinkOrNonFile(ignorePath, "Room attachment .gitignore");
  fs.writeFileSync(ignorePath, "*\n!.gitignore\n", {
    encoding: "utf8",
    flag: fs.existsSync(ignorePath) ? "w" : "wx",
  });
  return ignorePath;
}

export function excludeWorkspaceRoomAttachments(workingDirectory) {
  const excludePath = workspaceGitExcludePath(workingDirectory);
  if (!excludePath) return writeRoomAttachmentGitIgnore(workingDirectory);
  const rule = ".sps/room-attachments/";
  fs.mkdirSync(path.dirname(excludePath), { recursive: true });
  const verifiedPath = workspaceGitExcludePath(workingDirectory);
  if (!verifiedPath || path.resolve(verifiedPath) !== path.resolve(excludePath)) return null;
  const existing = fs.existsSync(verifiedPath) ? fs.readFileSync(verifiedPath, "utf8") : "";
  if (existing.split(/\r?\n/).some((line) => line.trim().replace(/\\/g, "/") === rule)) return verifiedPath;
  fs.appendFileSync(verifiedPath, `${existing && !existing.endsWith("\n") ? "\n" : ""}${rule}\n`, "utf8");
  return verifiedPath;
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
  if (!Array.isArray(attachments) || attachments.length === 0) return [];
  const workspaceRoot = path.resolve(String(workingDirectory || "").trim());
  const cacheRoot = roomAttachmentWorkspaceRoot(workspaceRoot);
  const { maxFileBytes, maxRequestBytes } = roomAttachmentByteLimits();
  ensureDirectoryTreeWithoutLinks(workspaceRoot, cacheRoot);
  excludeWorkspaceRoomAttachments(workspaceRoot);
  cleanupRoomAttachmentCache(cacheRoot);
  const roomDirectory = path.join(cacheRoot, safeAttachmentPathSegment(roomIssueId, "Room id"));
  ensureDirectoryTreeWithoutLinks(workspaceRoot, roomDirectory);
  const staged = [];
  let requestBytes = 0;
  for (const attachment of attachments) {
    const attachmentId = textParam(attachment, "id");
    if (!attachmentId) throw new Error("An attached file did not have a SPS attachment id.");
    const declaredBytes = Number(attachment?.byteSize) || 0;
    if (declaredBytes < 0 || !Number.isSafeInteger(declaredBytes)) throw new Error("SPS attachment size metadata is invalid.");
    if (declaredBytes > maxFileBytes) throw new Error(`The attached file exceeds the ${maxFileBytes} byte file limit.`);
    if (requestBytes + declaredBytes > maxRequestBytes) throw new Error("The attached files exceed the Room request byte limit.");
    const directory = path.join(roomDirectory, safeAttachmentPathSegment(attachmentId));
    const { realRoot, realDirectory } = ensureDirectoryTreeWithoutLinks(workspaceRoot, directory);
    // Compare and write in the same canonical namespace, including Windows 8.3 aliases.
    const localPath = path.join(realDirectory, safeAttachmentFilename(roomAttachmentName(attachment)));
    if (!pathIsContained(realDirectory, path.resolve(localPath))) throw new Error("The Room attachment filename escaped its staging directory.");
    rejectLinkOrNonFile(localPath, "The staged Room attachment");
    const partialPath = `${localPath}.${randomUUID()}.partial`;
    const response = await network.fetchImpl(roomAttachmentContentUrl(apiUrl, attachment, network.loopbackSPSApiUrl), { headers: network.spsDesktopAccessHeaders() });
    if (!response.ok) throw new Error(`Could not read attached file ${roomAttachmentName(attachment)} (HTTP ${response.status}).`);
    let receivedBytes;
    try {
      receivedBytes = await streamAttachmentResponse(response, partialPath, {
        declaredBytes,
        maxFileBytes,
        remainingRequestBytes: maxRequestBytes - requestBytes,
      });
      rejectLinkOrNonFile(localPath, "The staged Room attachment");
      fs.rmSync(localPath, { force: true });
      fs.renameSync(partialPath, localPath);
      const finalStats = fs.lstatSync(localPath);
      if (finalStats.isSymbolicLink() || !finalStats.isFile() || !pathIsContained(realRoot, realpath(localPath))) {
        fs.rmSync(localPath, { force: true });
        throw new Error("The staged Room attachment escaped its filesystem boundary.");
      }
    } finally {
      fs.rmSync(partialPath, { force: true });
    }
    requestBytes += receivedBytes;
    fs.utimesSync(directory, new Date(), new Date());
    staged.push({ ...attachment, byteSize: receivedBytes, localPath, isImage: isCodexImageAttachment(attachment) });
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
