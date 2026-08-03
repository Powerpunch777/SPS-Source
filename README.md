# SPS Source

This is the private product source repository for SPS. The public product
overview, downloads, and feedback routes live at
[Powerpunch777/SPS](https://github.com/Powerpunch777/SPS).

SPS is a Desktop-first platform for building AI work environments from plugins.

SPS Core manages the Desktop Host, Agents, Nodes, execution records, plugin runtime, and plugin lifecycle. It does not prescribe a company hierarchy, a Room/Task model, a human permission model, a memory strategy, or a development domain.

## First Company

1. Sign in to SPS Desktop and create or join a server.
2. A new server creates an empty Company.
3. Connect and verify one Agent. This is required.
4. SPS Desktop starts the bundled `Plugin Discovery & Builder` tool provider.
5. Talk to the Agent to discover, design, or build the plugins and Packs you need.
6. Use `Settings > Plugins` to inspect Catalog results and manage installed plugins.

The Catalog is not a separate application. It is the discovery area inside `Settings > Plugins`. A selected recommendation has no automatic lifecycle side effect; Agents decide how to respond to user requests using the available tools. Plugin packages and workers are installed once on the Owner Host, while each Company independently enables or disables the installed extensions it uses.

## Repository Layout

```text
external/sps-core/       Private SPS product Core (tracked from its stable main branch)
external/sps-plugin-sdk/ Public plugin authoring SDK and CLI (pinned submodule)
sps-server/              SPS Desktop, Host, Node, plugin runtime, and first-party extensions
```

The signed Official Extensions registry and the Redon Games website are
separate sibling repositories; they are not product-source directories in this
private repository.

## Product Documents

Current product decisions live in [sps-server/docs/current](sps-server/docs/current/README.md).

- [Product model](sps-server/docs/current/PRODUCT-MODEL-ko.md)
- [Plugin developer platform](sps-server/docs/current/PLUGIN-DEVELOPER-PLATFORM-ko.md)
- [Roadmap](sps-server/docs/current/ROADMAP.md)
- [Workspace plugin activation](sps-server/docs/current/WORKSPACE-PLUGIN-ACTIVATION.md)
- [Plugin compatibility and updates](sps-server/docs/current/PLUGIN-COMPATIBILITY-AND-UPDATES.md)

## Development

The current tree contains an SPS migration layer over the existing Paperclip-compatible runtime. Do not treat compatibility package names as the permanent SPS public API. Run the focused package checks before changing a package.

The product runtime lives in the private `SPS-Core` repository. The public
`SPS-Core-Compat` repository is a Paperclip compatibility mirror only; it is
not a product runtime, release channel, or support surface.

```powershell
Set-Location .\external\sps-plugin-sdk
npm test

Set-Location ..\..\sps-server\desktop
npm test

Set-Location ..\sps-room-chat
npm run check

Set-Location ..\sps-identity
npm test
```

`sps-server/plugin-platform` is a retired internal contract-fixture suite. It
is not a product dependency or a plugin authoring entry point. New plugin work
must use the pinned public SDK under `external/sps-plugin-sdk`.
