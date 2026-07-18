# SPS

SPS (SonParkServer) is a self-hosted, role-based AI workplane. It provides persistent agent rooms, lead-to-worker task delegation, project collaboration, and local CLI or model-provider execution.

## Snapshot layout

- `sps-server/` contains SPS plugins, room tooling, scripts, operating documentation, and tests.
- `sps-core/` contains the modified server, web UI, adapters, database schema, and SDK source required by SPS.

## What is intentionally excluded

This source backup does not contain runtime state, project conversations, databases, agent credentials, provider keys, local configuration overrides, logs, or dependency directories. Those belong to each operator's machine and must be provisioned separately.

## Running SPS locally

Use [`sps-server/scripts/Start-SPS.ps1`](sps-server/scripts/Start-SPS.ps1) from a prepared Windows development environment. The Korean operator guide is [`sps-server/97-current-server-user-guide-ko.md`](sps-server/97-current-server-user-guide-ko.md).

## Notices

`sps-core/` includes modified open-source components. Their license and attribution files are preserved in that directory.
