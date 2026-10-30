# SPS Source

This is the private product source repository for SPS. The public product
overview, downloads, and feedback routes live at
[Powerpunch777/SPS](https://github.com/Powerpunch777/SPS).

SPS is a Desktop-first platform for building customizable workstations from
plugins. AI is optional; customer-specific programs may use model APIs, CLI
tools, external Agent runtimes, or no AI at all.

SPS runs solutions built, reviewed and approved through its own delivery
business. It does not operate a public Plugin marketplace. Internal Registry,
package verification and lifecycle, SDK and Runner extensibility remain supported.
See the [confirmed Core completion policy](sps-server/docs/current/CORE-COMPLETION-POLICY-ko.md).

SPS Core manages the Desktop Host, optional Agent execution, Nodes, execution
records, plugin runtime and lifecycle. Core enforces technical access boundaries
without prescribing a company hierarchy, Room/Task model, business role
hierarchy, memory strategy or development domain.

## First Workspace

1. Sign in to SPS Desktop and create or join a server.
2. A new server creates a neutral Workspace. No Agent is required.
3. Use `Settings > Plugins` to inspect and explicitly manage plugins.
4. Review approved internal packages in Core management. No Builder or AI is
   required to install and operate Plugins through the existing contracts.
5. Existing Builder code remains compatible; new development waits for a separate
   handoff after Core completion. A Workspace without a usable Shell has an
   independent empty entry.

Internal Registry lookup and package review support explicit Host installation and
updates. Public search and recommendations are retired. Packages are installed on
the Host; Workspace activation, settings and owned execution remain separate.

## Repository Layout

```text
external/sps-core/       Private SPS product Core (exact revision pinned by the support matrix)
external/sps-plugin-sdk/ Public plugin authoring SDK and CLI (pinned submodule)
sps-server/              SPS Desktop, Host, Node, plugin runtime, and first-party extensions
```

The signed Official Extensions registry and the Redon Games website are
separate sibling repositories; they are not product-source directories in this
private repository.

## Product Documents

Current product decisions live in [sps-server/docs/current](sps-server/docs/current/README.md).

- [Product model](sps-server/docs/current/PRODUCT-MODEL-ko.md)
- [Windows-first native LAN plan](sps-server/docs/current/WINDOWS-NATIVE-CONNECTIVITY-PLAN-ko.md)
- [Native development deferred: status and restart notes](sps-server/docs/current/NATIVE-DEVELOPMENT-DEFERRED-ko.md)
- [Multi-backend workstation plan](sps-server/docs/current/MULTI-BACKEND-WORKSTATION-PLAN-ko.md)
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

The retired internal `sps-server/plugin-platform` copy has been removed. Plugin
authoring, conformance, packaging, Registry publishing, and templates all come
from the pinned public SDK under `external/sps-plugin-sdk`.
