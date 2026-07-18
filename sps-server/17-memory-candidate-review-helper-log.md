# Memory Candidate Review Helper Log

Date: 2026-07-10

## Goal

Make the Memory Sidecar candidate inbox easy to inspect without approving, promoting, or mutating long-term memory.

## Implemented

Added:

- `memory-sidecar/memory-candidates.ps1`

The helper:

- reads `GET /memory/candidates`;
- supports `-Limit`, `-Offset`, and optional `-Scope`;
- prints a compact Markdown review list;
- exits with a readable fallback if the sidecar is unavailable.

## Architecture Fit

- Read-only.
- Does not edit approved `LEARNINGS.md`.
- Does not promote or reject candidates.
- Does not call SPS task APIs.
- Keeps Memory Sidecar as a review inbox, not a controller.

## Verification

Run:

```powershell
.\memory-sidecar\memory-candidates.ps1 -Limit 5
```

Result:

- PowerShell parser checks passed.
- `memory-sidecar/memory-candidates.ps1 -Limit 5` returned 3 candidates.
- The `CMP-19` direct worker candidate was visible as `cand_7d08a1fe1b9bf060`.
- Sidecar health reported `candidateCount = 3` and `warningCount = 0`.

## Current Status

The candidate inbox is now inspectable from the local workspace without approving or mutating memory.
