# SPS Server

This directory contains the SPS Desktop Host, Desktop Node runtime, and first-party extension sources.

SPS is moving from a Paperclip-compatible implementation to a product model where Core provides plugin-development primitives and plugins provide user-facing workflows.

## Current Contract

Read [docs/current/README.md](docs/current/README.md) before changing product behavior.
The current product decision record is
[docs/current/PRODUCT-ARCHITECTURE-ko.md](docs/current/PRODUCT-ARCHITECTURE-ko.md).

The priority is independent SPS Core completion under the
[confirmed policy](docs/current/CORE-COMPLETION-POLICY-ko.md). Public Marketplace
operation is removed, new Builder work waits for its handoff, and full untrusted
OS containment is deferred with research retained. Tailscale private networking
and SSH management remain the direction; additional Native LAN work is deferred.

Core owns:

- Desktop and Host lifecycle
- Company containers, Agent registry, Node/Runner registry, execution records
- neutral Thread, Run, Artifact, Store, event, and Connector primitives
- plugin lifecycle, Catalog access, diagnostics, backup, and updates

Plugins own:

- Discovery and plugin authoring experience
- people and Agent access policy
- Room, Task, Lead/Worker, and review workflows
- memory strategies, external tools, and domain-specific development Packs

Provider-specific Agent runtimes are optional Desktop packs, not implicit Core
payloads. See [Agent Runtime Packs](docs/current/AGENT-RUNTIME-PACKS.md) for
the Host-selected Codex/Claude delivery and verification flow.

## Source Map

```text
desktop/             Electron SPS Desktop
desktop-node/        local Node identity, capability discovery, command runtime
../external/sps-plugin-sdk/
                     public authoring CLI, package, Registry, and conformance tooling
sps-room-chat/       existing Team Workplane compatibility extension
sps-default-memory/  first-party Memory Provider source
sps-memory/          existing sidecar integration extension
memory-sidecar/      legacy local memory helper
sps-identity/        central identity service
agent-instructions/  Team Workplane source templates, not a global SPS policy
deploy/              optional hosted deployment material
docs/current/        current product contracts
```

## Checks

```powershell
Set-Location ..\external\sps-plugin-sdk
npm test

Set-Location ..\sps-room-chat
npm run check
```

The numbered Workplane logs and old task specifications were removed from the working documentation set. Use Git history for historical implementation evidence.
