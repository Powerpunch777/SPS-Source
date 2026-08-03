# SPS Current Candidate

> This file is generated from [`release/support-matrix.json`](../../release/support-matrix.json). Do not edit it manually.

## Candidate

| Item | Value |
| --- | --- |
| Status | `development-candidate` |
| SPS Desktop | `0.4.115` |
| SPS Core | [`3fee634ee5bc57f8dd9ff2a7b511d91439b35b02`](https://github.com/Powerpunch777/SPS-Core/commit/3fee634ee5bc57f8dd9ff2a7b511d91439b35b02) |
| Plugin SDK | `@sonparkserver/plugin-sdk@0.11.0` ([`4e23934dd0164132b9ba6d637d7687e97ad27f86`](https://github.com/Powerpunch777/sps-plugin-sdk/commit/4e23934dd0164132b9ba6d637d7687e97ad27f86)) |
| Extension profiles | `1.0`, `2.0` |
| Plugin API | `1` |
| Operating systems | `windows-10-x64`, `windows-11-x64` |
| Remote transport | `tailscale` |
| Update channel | `latest` from `Powerpunch777/SPS-Desktop-Releases` |

## Bundled Extensions

| ID | Version | Profile | Plugin API |
| --- | --- | --- | --- |
| `sps.default-memory` | `0.1.0` | `1.0` | `1` |
| `sps.plugin-discovery` | `0.4.0` | `2.0` | `1` |
| `local.room-chat` | `0.3.92` | `1.0` | `1` |

## Evidence Boundary

This document identifies the supported Desktop, Core, SDK, and extension tuple. The final SPS Source revision is fixed only by the immutable release tag and its generated `sps-release-manifest.json`. Physical multi-computer evidence must name that same Source revision and tuple; evidence from an older candidate cannot be reused.
