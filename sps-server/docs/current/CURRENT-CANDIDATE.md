# SPS Current Candidate

> This file is generated from [`release/support-matrix.json`](../../release/support-matrix.json). Do not edit it manually.

## Candidate

| Item | Value |
| --- | --- |
| Status | `development-candidate` |
| SPS Desktop | `0.4.137` |
| SPS Core | [`3c51d04e9917111c55f9d0cedebf410faa373743`](https://github.com/Powerpunch777/SPS-Core/commit/3c51d04e9917111c55f9d0cedebf410faa373743) |
| Plugin SDK | `@sonparkserver/plugin-sdk@0.11.0` ([`cfa64ec4f589ea9765661834e1685ef1f2e14453`](https://github.com/Powerpunch777/sps-plugin-sdk/commit/cfa64ec4f589ea9765661834e1685ef1f2e14453)) |
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
