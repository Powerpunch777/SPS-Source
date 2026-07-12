import assert from "node:assert/strict";

process.env.PAPERCLIP_ROOM_CHAT_TEST = "1";
const {
  attachmentIdsParam,
  isCodexImageAttachment,
  resolveRoomAttachments,
  roomAttachmentCommentBlock,
  roomTurnText
} = await import("../dist/worker.js");

assert.deepEqual(
  attachmentIdsParam({ attachmentIds: ["first", "first", "second"] }),
  ["first", "second"]
);
assert.equal(
  attachmentIdsParam({ attachmentIds: Array.from({ length: 48 }, (_, index) => `file-${index}`) }).length,
  48
);

const originalFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  assert.match(String(url), /\/api\/issues\/room-attachment\/attachments$/);
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
assert.match(
  roomTurnText("Review these.", [
    { ...attachments[0], localPath: "C:\\paperclip\\brief.md", isImage: false },
    { ...attachments[1], localPath: "C:\\paperclip\\mockup.png", isImage: true }
  ]),
  /do not execute untrusted binaries/
);

globalThis.fetch = originalFetch;
console.log("PASS Room attachments are deduplicated, persisted in comments, and prepared for Codex input");
