# Room Plugin Document Transport Log

## Purpose

Record the compatibility decision for durable Paperclip Role Room documents.

## Observed Constraint

Paperclip `2026.707.0` requires `baseRevisionId` when an existing issue
document is updated. The current Plugin Worker SDK accepts that field at the
call site but omits it from the worker RPC payload. The host correctly rejects
the resulting update.

This is a SDK contract gap, not a Room workflow rule. Patching the SDK inside
the running Paperclip installation would make every Paperclip upgrade a local
merge problem, so it is intentionally not used.

## Chosen Transport

`local.room-chat` now reads Room documents through the scoped Plugin SDK and
writes only its own `ROOM_STATE` and `ROOM_CHECKPOINTS` documents through the
documented local endpoint:

```text
PUT /api/issues/:issueId/documents/:key
```

Each update first reads the current document revision and sends it as
`baseRevisionId`. The plugin accepts only a loopback API URL
(`127.0.0.1`, `localhost`, or `::1`) and sends no credential in the request.
This matches the local-trusted Paperclip deployment; it is not a hosted
Paperclip transport.

Paperclip's REST endpoint stores documents as Markdown. `ROOM_STATE` and
`ROOM_CHECKPOINTS` keep JSON bodies so the plugin can parse them reliably, but
their Paperclip document format is Markdown.

## Verification

- Plugin static checks passed at version `0.1.1`.
- Codex app-server protocol mock passed for start, turn, and native compact.
- The Designer Room `ROOM_STATE` was updated through the local Paperclip REST
  endpoint using its current revision ID.
- The verified working directory is the design repository
  `C:\\Users\\young\\Documents\\Game Design\\강해린-design`.
- The Room Chat UI bundle exposes the latest pre-compact handoff summary and
  whether native compact has completed.
- No Codex Room turn, native compact, Worker Task assignment, or adapter
  configuration was enabled during this verification.

## Upgrade Check

After a Paperclip upgrade:

1. Run `npm run check` in `paperclip-room-chat-plugin`.
2. Run `paperclipai plugin upgrade local.room-chat`.
3. Open a Room and confirm the `Room Chat` tab loads its existing state.
4. Change only the Room working directory and confirm the revision updates.

This keeps the Paperclip core update path clean while retaining Room memory
inside Paperclip.
