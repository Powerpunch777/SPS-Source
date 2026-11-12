# SPS Desktop, Host, and Node

This directory contains the Windows Desktop app, the local SPS Host services, connected-computer software, and first-party component source. It is part of [SPS Source](https://github.com/Powerpunch777/SPS-Source), not a separate installer or the public product overview.

## Main parts

- `desktop/` — account sign-in, Host setup, Workspace access, local settings, updates, backups, recovery, and the Windows app connection to SPS services.
- `desktop-node/` — computer registration, local tool discovery, and execution of work that the Host has approved for that computer.
- `sps-identity/` — account identity and team membership services.
- `sps-room-chat/` — optional Team Workplane source for Agent tasks, continuing project context, task conversations, and reports.
- `sps-default-memory/` — optional local memory component for finding approved notes and proposing new notes for review.
- `sps-plugin-discovery/` — existing Plugin Builder and discovery code. It is not started for a new Host in the current branch; new Builder work is deferred.
- `sps-memory/` and `memory-sidecar/` — separate memory integration and its helper process.
- `image-worker-asset-tool/` — a specialist asset-generation connector, not a default feature in the current support matrix.
- `../external/sps-core/` — the Core source used by the current SPS candidate.
- `../external/sps-plugin-sdk/` — the public plugin-authoring toolkit used by this checkout.

## Current product boundary

The current source policy keeps SPS workspaces neutral: AI, task boards, Rooms, team roles, and memory are not required. The Host chooses project folders, approves connected computers, and manages approved plugin packages. The same project folder remains on the Host; each connected computer keeps its own AI sign-ins, API keys, and local models.

Plugin packages come from internally reviewed sources. SPS keeps package inspection, version and compatibility checks, explicit Host installation, Workspace activation, updates, removal, and rollback. It does not offer an open public marketplace or public recommendations. Plugin Builder source remains for compatibility, but is not started in a new Host. Workplane and Default Memory are optional components and are not started by default.

The current remote team path uses Tailscale `1.52.0` or later. Native LAN and browser-based Workspace access are not supported in this branch. Approved plugin code runs as the current operating-system user; permission checks do not make it a full operating-system sandbox.

## Candidate versions

The support matrix identifies SPS Desktop `0.4.137` as a development candidate for Windows 10/11 x64. It pins the Core, Plugin SDK, and extension versions used together. A source candidate is not a published stable installer. Check [the support matrix](release/support-matrix.json), [candidate summary](docs/current/CURRENT-CANDIDATE.md), [confirmed product policy](docs/current/CORE-COMPLETION-POLICY-ko.md), and [product architecture](docs/current/PRODUCT-ARCHITECTURE-ko.md) before changing product behavior.

For user data boundaries, see the [data and recovery guide](docs/current/DATA-AND-RECOVERY-ko.md). For signed installers and installation checks, see the [release policy](docs/current/RELEASE-AND-PREVIEW-POLICY-ko.md).
