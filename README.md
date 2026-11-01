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
5. Existing bundled Builder code remains compatible. New Builder development
   follows its own design in the separate `SPS-MY-PluginBuilder` repository,
   not this Core completion work. A Workspace without a usable Shell has an
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

### Separate Builder Repository

[Powerpunch777/SPS-MY-PluginBuilder](https://github.com/Powerpunch777/SPS-MY-PluginBuilder)
owns the new Builder plugin, its v15 design, UI and implementation plan. Builder
development may proceed independently alongside Core stabilization. This
`SPS-Source` repository and its private `SPS-Core` submodule own platform work,
not the new Builder workflow. The older bundled `sps-plugin-discovery` code is
a compatibility surface, not the new Builder's authoritative design or source.

Before making Builder feature, role, session, memory, Runner or UI decisions,
follow that repository's current design entry at `docs/design/README.md` and its
linked integrated specification (currently
`docs/design/01_Design/SPS_Plugin_Builder_Codex_Final_Design_v15.md`). Use its
linked technology research and UI reference with their stated limits. Older
Builder descriptions here or in chat must not replace that design. Core/SDK
contracts and security constraints still apply as the specification requires.

Builder uses the pinned public SDK and approved Core contracts. Do not copy
private Core source, credentials or user data into its public repository, and
do not treat Builder UI/test progress as proof of Core completion.

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

Development coordination and agent delegation follow [AGENTS.md](AGENTS.md).

The current tree contains an SPS migration layer over the existing Paperclip-compatible runtime. Do not treat compatibility package names as the permanent SPS public API. Run the focused package checks before changing a package.

The product runtime lives in the private `SPS-Core` repository. The public
`SPS-Core-Compat` repository is a Paperclip compatibility mirror only; it is
not a product runtime, release channel, or support surface.

Use a tested Node runtime for development. Windows owned-Core shutdown failed
on Node26.4.0 and passed on Node24.22.1/26.13.0; a Node major number alone is not
qualification. CI keeps Node22 packaging and separately checks Node26.13 shutdown.
See the [runtime comparison and remaining limits](sps-server/docs/reviews/OWNED-CORE-NODE-RUNTIME-2026-11-01.md).

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
