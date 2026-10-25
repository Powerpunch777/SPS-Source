# SPS Current Candidate

> This file is generated from [`release/support-matrix.json`](../../release/support-matrix.json). Do not edit it manually.

## Candidate

| Item | Value |
| --- | --- |
| Status | `development-candidate` |
| SPS Desktop | `0.4.137` |
| SPS Core | [`02b3da6f42d5c53159a3eb2e14b6575326f8a946`](https://github.com/Powerpunch777/SPS-Core/commit/02b3da6f42d5c53159a3eb2e14b6575326f8a946) |
| Plugin SDK | `@sonparkserver/plugin-sdk@0.11.0` ([`3ee0a3acd9badd881c13e91b29eac13569c036b3`](https://github.com/Powerpunch777/sps-plugin-sdk/commit/3ee0a3acd9badd881c13e91b29eac13569c036b3)) |
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
