# Memory Candidate Explicit Review Log

Date: 2026-07-10

## Goal

Add an explicit candidate review and promotion procedure without turning memory into an automatic controller.

## Implemented

Added:

- `memory-sidecar/MemoryCandidateReview.ps1`
- `memory-sidecar/memory-record-candidate-review.ps1`
- `memory-sidecar/memory-promote-candidate.ps1`

Updated:

- `memory-sidecar/memory-candidates.ps1`

## Behavior

- `memory-candidates.ps1` now falls back to local JSONL if the Memory Sidecar server is down.
- `memory-record-candidate-review.ps1` records append-only review events for `reviewed`, `rejected`, or `deferred`.
- `memory-promote-candidate.ps1` previews by default and only appends to a configured `LEARNINGS.md` journal when `-Apply` is passed.
- Promotion records an append-only `promoted` event.

## Architecture Fit

- No Paperclip task mutation.
- No hidden routing or assignment logic.
- No automatic promotion.
- Approved journals change only through explicit `-Apply`.
- Review status is append-only evidence in `memory-candidate-events.jsonl`.

## Verification

Completed:

1. Parse-checked all PowerShell scripts.
2. Verified `memory-candidates.ps1` can read candidates from local JSONL when the Sidecar API is unavailable.
3. Previewed a review event for `cand_7d08a1fe1b9bf060`; no event file was written.
4. Previewed promotion for `cand_7d08a1fe1b9bf060`; no real `LEARNINGS.md` file was changed.
5. Verified the `-Apply` write path against a temporary config/journal fixture only.
6. Started the Memory Sidecar again and confirmed API health.
7. Applied a real append-only `reviewed` event for `cand_7d08a1fe1b9bf060`.
8. Confirmed the candidate inbox shows `Review Status: reviewed`.
9. Confirmed the real project `LEARNINGS.md` does not contain the promotion text.
10. Restarted Paperclip through the local scheduled task and confirmed the server responds on `127.0.0.1:3100`.
11. Created Paperclip completion record `CMP-20` without an assignee and marked it `done`.

Real review event:

- `event_6cc618ee70734413ad36bfe81d523f44`

Paperclip record:

- `CMP-20`: `Memory Candidate Explicit Review Helper Implementation`
- `assigneeAgentId = null`
- `liveRunCount = 0`

Sidecar status after verification:

- `approvedMemoryCount = 33`
- `candidateCount = 3`
- `warningCount = 0`

## Current Status

Candidate review is now explicit and inspectable. Promotion to approved memory is available but still requires an explicit `-Apply` command and should be used only after user/CTO approval.
