# SPS

SPS is a Desktop-first platform for building AI work environments from plugins.

SPS Core manages the Desktop Host, Agents, Nodes, execution records, plugin runtime, and plugin lifecycle. It does not prescribe a company hierarchy, a Room/Task model, a human permission model, a memory strategy, or a development domain.

## First Company

1. Sign in to SPS Desktop and create or join a server.
2. A new server creates an empty Company.
3. Connect and verify one Agent. This is required.
4. `Plugin Discovery & Builder` is enabled for that Company.
5. Talk to the Agent to discover, design, or build the plugins and Packs you need.
6. Use `Settings > Plugins` to inspect Catalog results and manage installed plugins.

The Catalog is not a separate application. It is the discovery area inside `Settings > Plugins`. A selected recommendation has no automatic lifecycle side effect; Agents decide how to respond to user requests using the available tools.

## Repository Layout

```text
external/sps-core/       Core compatibility source during the SPS migration
sps-server/              SPS Desktop, Host, Node, plugin runtime, and first-party extensions
sps-plugin-sdk/          Public plugin authoring SDK and CLI
sps-official-extensions/ Signed first-party extension distribution source
redon-games-website/     Redon Games public website
```

## Product Documents

Current product decisions live in [sps-server/docs/current](sps-server/docs/current/README.md).

- [Product model](sps-server/docs/current/PRODUCT-MODEL-ko.md)
- [Plugin developer platform](sps-server/docs/current/PLUGIN-DEVELOPER-PLATFORM-ko.md)
- [Roadmap](sps-server/docs/current/ROADMAP.md)

## Development

The current tree contains an SPS migration layer over the existing Paperclip-compatible runtime. Do not treat compatibility package names as the permanent SPS public API. Run the focused package checks before changing a package.

```powershell
Set-Location .\sps-server\plugin-platform
npm test

Set-Location ..\sps-room-chat
npm run check
```
