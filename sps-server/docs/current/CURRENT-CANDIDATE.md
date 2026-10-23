# SPS Current Candidate

> This file is generated from [`release/support-matrix.json`](../../release/support-matrix.json). Do not edit it manually.

## Candidate

| Item | Value |
| --- | --- |
| Status | `development-candidate` |
| SPS Desktop | `0.4.136` |
| SPS Core | [`a2b2a3c66dba8c11bd0dcc1d788c9e212f1bf89b`](https://github.com/Powerpunch777/SPS-Core/commit/a2b2a3c66dba8c11bd0dcc1d788c9e212f1bf89b) |
| Plugin SDK | `@sonparkserver/plugin-sdk@0.11.0` ([`da430013ac763d7bb3e73931236c373b80b3fac2`](https://github.com/Powerpunch777/sps-plugin-sdk/commit/da430013ac763d7bb3e73931236c373b80b3fac2)) |
| Extension profiles | `1.0`, `2.0` |
| Plugin API | `1` |
| Operating systems | `windows-10-x64`, `windows-11-x64` |
| Remote transport | `tailscale` |
| Minimum remote transport version | `1.52.0` |
| Update channel | `latest` from `Powerpunch777/SPS-Desktop-Releases` |

## Bundled Extensions

| ID | Version | Profile | Plugin API |
| --- | --- | --- | --- |
| `sps.default-memory` | `0.1.0` | `1.0` | `1` |
| `sps.plugin-discovery` | `0.4.0` | `2.0` | `1` |
| `local.room-chat` | `0.3.92` | `1.0` | `1` |

## Evidence Boundary

This document identifies the supported Desktop, Core, SDK, and extension tuple. The final SPS Source revision is fixed only by the immutable release tag and its generated `sps-release-manifest.json`. Physical multi-computer evidence must name that same Source revision and tuple; evidence from an older candidate cannot be reused.
