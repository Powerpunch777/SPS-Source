# Paperclip Live-Run Cleanup Check Log

Date: 2026-07-09

## Goal

Confirm whether previous completed Task Rooms still have live heartbeat runs, and separate real runtime risk from a PowerShell measurement artifact.

## Checked Issues

- `CMP-8`: parent CTO smoke-test Task Room.
- `CMP-9`: first Code Worker child, completed despite Korean handoff corruption.
- `CMP-10`: clean ASCII Code Worker child.
- `CMP-12`: direct UTF-8 helper smoke test through `agy.exe`, no assignee.
- `CMP-13`: direct UTF-8 helper correction test with Korean title, no assignee.

## Result

All checked issues were `done` and had no live runs:

- `CMP-8`: `liveRunCount = 0`
- `CMP-9`: `liveRunCount = 0`
- `CMP-10`: `liveRunCount = 0`
- `CMP-12`: `liveRunCount = 0`
- `CMP-13`: `liveRunCount = 0`

The raw company live-runs endpoint returned:

```json
[]
```

## Finding

The earlier apparent `liveRunCount = 1` was a PowerShell null-count artifact, not an actual live Paperclip run. The API returned an empty set, but `@($null).Count` can produce a misleading count.

## Implemented Guardrail

Added `scripts/Get-PaperclipLiveRunsUtf8.ps1` to normalize company/issue live-run responses and count only non-null rows.

## Remaining Risk

The current checked issues are clean. Still, for future assigned-agent tests, use the new helper after completion to confirm no live runs remain before waking more agents.
