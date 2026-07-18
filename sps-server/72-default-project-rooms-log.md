# Default Project Role Rooms

## Behavior

The deployed `local.room-chat` version `0.1.6` subscribes to SPS's
`project.created` event. For every new Project it creates these unassigned
root Role Rooms:

- Manager
- CTO
- Designer
- Code Worker
- Art Worker
- Voice Worker
- QA Worker

Each Room is a `todo` issue titled `[Agent Room] <role>`. It remains
unassigned, so this does not start a SPS-managed Worker. No Codex thread,
Worker run, or document is created at project-provisioning time. The first
actual Room interaction initializes that Room's state and, when enabled, its
persisted Codex thread.

Older default Rooms created as `backlog` are migrated to `todo` when they are
an unassigned root Room with one of the seven default role names. Normal
user-created backlog issues remain unchanged.

## Idempotency

The plugin lists the Project's existing unassigned root Role Rooms before
creating anything. It also serializes provisioning per project. Replayed
events, worker restarts, and manual plugin upgrades therefore preserve
existing Rooms and do not create duplicates.

## Verification

The Room plugin test suite provisions a Project with an existing Designer
Room, creates the remaining six Rooms, then repeats the provision call and
verifies that the count stays at seven.

## Deployment Status

The operator approved the `events.subscribe` capability. SPS's current
upgrade path could not accept that capability escalation directly, so the Room
plugin was soft-uninstalled and reinstalled from the same local source. The
existing plugin configuration and SPS Room documents were verified after
installation. The running plugin is now `0.1.6`, `ready`, and subscribed to
project creation events.
