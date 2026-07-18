# Room Attachment Workspace Staging

## Problem

Room attachments were downloaded to `~/.sps/room-attachments`. Codex
Rooms run with the selected Project Workspace as their file boundary, so a
Designer or CTO could see the attachment path but could not read that
out-of-workspace cache.

## Fix

Local Room Chat 0.3.6 stages a durable SPS attachment in:

`<Project Workspace>/.sps/room-attachments/<room-id>/<attachment-id>/`

The original remains a SPS attachment. The Workspace copy is a local
execution cache, kept for 30 days and excluded through `.git/info/exclude` so
it is not added to the design or implementation repository.

Every new Room turn also prepares the Room's existing durable attachments,
not only files attached to that specific message. This allows a user to refer
to an earlier uploaded plan without uploading it again.

If listing durable attachments is temporarily unavailable, the turn still
continues with the files attached to the current message.

## Verification

- Plugin 0.3.6 is ready in SPS.
- Full Room plugin checks pass.
- The attached `3607 손영하-융프 계획서.hwpx` was staged inside the School
  Arcade Design Workspace at 22,294 bytes.
