import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.PAPERCLIP_ROOM_CHAT_TEST = "1";
const {
  attachmentIdsParam,
  cleanupRoomAttachmentCache,
  isCodexImageAttachment,
  mergeRoomAttachments,
  resolveRoomAttachments,
  roomAttachmentName,
  roomAttachmentCommentBlock,
  roomAttachmentWorkspaceRoot,
  roomTurnText,
  stageRoomAttachments,
  workspaceGitExcludePath
} = await import("../dist/worker.js");

assert.deepEqual(
  attachmentIdsParam({ attachmentIds: ["first", "first", "second"] }),
  ["first", "second"]
);
assert.equal(
  attachmentIdsParam({ attachmentIds: Array.from({ length: 48 }, (_, index) => `file-${index}`) }).length,
  48
);
const koreanFilename = "3607 손영하-융프 계획서.hwpx";
assert.equal(roomAttachmentName({ originalFilename: Buffer.from(koreanFilename, "utf8").toString("latin1") }), koreanFilename);

const originalFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  const href = String(url);
  if (/\/api\/issues\/room-attachment\/attachments$/.test(href)) {
    return new Response(JSON.stringify([
      {
        id: "image-attachment",
        originalFilename: "mockup.png",
        contentType: "image/png",
        byteSize: 42,
        contentPath: "/api/attachments/image-attachment/content"
      },
      {
        id: "brief-attachment",
        originalFilename: "brief.md",
        contentType: "text/markdown",
        byteSize: 84,
        contentPath: "/api/attachments/brief-attachment/content"
      }
    ]), { status: 200 });
  }
  if (/\/api\/attachments\/brief-attachment\/content$/.test(href)) {
    return new Response("design brief", { status: 200 });
  }
  if (/\/api\/attachments\/image-attachment\/content$/.test(href)) {
    return new Response("image bytes", { status: 200 });
  }
  assert.fail(`Unexpected attachment request: ${href}`);
};

const attachments = await resolveRoomAttachments(
  "http://127.0.0.1:3100",
  "room-attachment",
  ["brief-attachment", "image-attachment"]
);
assert.equal(attachments.length, 2);
assert.equal(attachments[0].originalFilename, "brief.md");
assert.equal(isCodexImageAttachment(attachments[1]), true);
assert.match(roomAttachmentCommentBlock(attachments), /paperclip-room-attachments:brief-attachment,image-attachment/);
assert.match(roomAttachmentCommentBlock(attachments), /\[brief\.md\]\(\/api\/attachments\/brief-attachment\/content\)/);
assert.deepEqual(
  mergeRoomAttachments([attachments[0]], attachments, [attachments[1]]).map((attachment) => attachment.id),
  ["brief-attachment", "image-attachment"]
);
assert.match(
  roomTurnText("Review these.", [
    { ...attachments[0], localPath: "C:\\paperclip\\brief.md", isImage: false },
    { ...attachments[1], localPath: "C:\\paperclip\\mockup.png", isImage: true }
  ]),
  /do not execute untrusted binaries/
);
const imagePreviewTurn = roomTurnText("Show me the image.", []);
assert.match(imagePreviewTurn, /SYSTEM-PROVIDED ROOM RESPONSE CONTRACT/);
assert.match(imagePreviewTurn, /final response must embed at least one relevant image/);
assert.match(imagePreviewTurn, /!\[description\]\(<C:\/absolute\/path\/to\/image\.png>\)/);
assert.match(imagePreviewTurn, /Do not merely say that an image is shown/);
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "paperclip-room-workspace-"));
fs.mkdirSync(path.join(workspace, ".git", "info"), { recursive: true });
const staged = await stageRoomAttachments("http://127.0.0.1:3100", "room-attachment", attachments, workspace);
const expectedRoot = path.join(workspace, ".sps", "room-attachments");
assert.equal(roomAttachmentWorkspaceRoot(workspace), expectedRoot);
assert.equal(staged.length, 2);
assert.ok(staged.every((attachment) => !path.relative(workspace, attachment.localPath).startsWith("..")));
assert.equal(fs.readFileSync(staged[0].localPath, "utf8"), "design brief");
const gitExclude = workspaceGitExcludePath(workspace);
assert.ok(gitExclude);
assert.match(fs.readFileSync(gitExclude, "utf8"), /^\.sps\/room-attachments\/$/m);
fs.rmSync(workspace, { recursive: true, force: true });

const cacheRoot = fs.mkdtempSync(path.join(os.tmpdir(), "paperclip-room-cache-"));
const staleDirectory = path.join(cacheRoot, "room", "stale");
const freshDirectory = path.join(cacheRoot, "room", "fresh");
fs.mkdirSync(staleDirectory, { recursive: true });
fs.mkdirSync(freshDirectory, { recursive: true });
const nowMs = Date.now();
fs.utimesSync(staleDirectory, new Date(nowMs - 31 * 24 * 60 * 60 * 1000), new Date(nowMs - 31 * 24 * 60 * 60 * 1000));
assert.deepEqual(cleanupRoomAttachmentCache(cacheRoot, nowMs), [staleDirectory]);
assert.equal(fs.existsSync(staleDirectory), false);
assert.equal(fs.existsSync(freshDirectory), true);
fs.rmSync(cacheRoot, { recursive: true, force: true });

globalThis.fetch = originalFetch;
console.log("PASS Room attachments are deduplicated, persisted in comments, staged inside the Workspace for Codex, and cache-retained for 30 days");
