# SPS Source

SPS is Redon's local-first Desktop workspace for projects that use AI and other tools. This repository contains the implementation of the Windows Desktop app, its local Host and connected Node software, and first-party components.

For the product introduction, private feedback information, and approved downloads, see [SPS](https://github.com/Powerpunch777/SPS) and [redongames.com/sps](https://redongames.com/sps/).

## What this repository contains

- `sps-server/desktop/` — the Windows app, sign-in and first-run setup, local Host controls, updates, backup, and recovery.
- `sps-server/desktop-node/` — software that connects a computer to SPS, reports available local tools, and runs work the Host has approved for it.
- `sps-server/sps-identity/` — account and team identity services.
- `sps-server/` — Host services, first-party component source, product documents, and release support information.
- `external/sps-core/` — the Core revision used by the current SPS Source candidate.
- `external/sps-plugin-sdk/` — the public toolkit used by plugin developers.

## What SPS currently does

SPS creates or joins a Host, the main computer that manages a Workspace. The Host chooses project folders, connects approved computers, and decides which tools and add-on packages can be used. A connected computer keeps its own AI sign-ins, API keys, and local models.

The product provides Workspace and computer access, Agent and tool setup, approved work execution and records, result references, plugin package checks and management, Host backup and recovery, updates, and diagnostics. AI is optional. The Host installs or updates an approved plugin, then chooses which Workspace may use it.

SPS uses an internal package Registry and Host review. It does not provide an open public marketplace for community uploads or public plugin recommendations. The current product policy also defers new Plugin Builder work. Existing Builder code is retained for compatibility but is not started for a new Host. The current source branch does not start Team Workplane or Default Memory by default either.

## Current candidate and limits

The support matrix in this branch identifies Desktop `0.4.137` as a development candidate. It targets Windows 10/11 x64 and uses Tailscale `1.52.0` or later for remote Host and Member connections. A development candidate is not a stable installer. Use the [official releases](https://github.com/Powerpunch777/SPS-Desktop-Releases/releases) for the published stable build and the [separate Preview channel](https://github.com/Powerpunch777/SPS-Desktop-Preview/releases) only for installation checks.

The candidate support matrix lists Plugin Builder, Team Workplane, and SPS Default Memory packages. In this branch, those packages are not all enabled in a new Host. Check the support matrix and current product policy before treating a listed package as a usable feature. Native LAN and browser-based Workspace access are not supported. Approved plugins run under the current operating-system user; SPS does not claim that every plugin is isolated from files or services available to that user.

## Product and developer documents

- [Current candidate and supported component versions](sps-server/docs/current/CURRENT-CANDIDATE.md)
- [Confirmed product and Core completion policy](sps-server/docs/current/CORE-COMPLETION-POLICY-ko.md)
- [Product architecture and current boundaries](sps-server/docs/current/PRODUCT-ARCHITECTURE-ko.md)
- [Data export and recovery](sps-server/docs/current/DATA-AND-RECOVERY-ko.md)
- [Release and Preview policy](sps-server/docs/current/RELEASE-AND-PREVIEW-POLICY-ko.md)
- [Plugin compatibility and updates](sps-server/docs/current/PLUGIN-COMPATIBILITY-AND-UPDATES.md)
- [SPS Plugin SDK](https://github.com/Powerpunch777/sps-plugin-sdk)

The SPS Core Compat repository is a separate Paperclip compatibility mirror. It is not the Core runtime used by this product.
