# Paperclip Workplane Readiness Log

Date: 2026-07-10

## Goal

Add a read-only preflight check before running another real Paperclip CTO -> Worker smoke test.

## Why

The docs say the next verification is a small real CTO -> Code Worker Task Room. Current Paperclip state shows the Code Worker agent is in `error`, so starting that smoke test immediately would likely spend runtime on a known-bad setup.

## Implemented

Added:

- `scripts/Test-PaperclipWorkplaneReadiness.ps1`
- `memory-sidecar/Start-MemorySidecarBackground.ps1`

The script checks:

- Paperclip API availability.
- Memory Sidecar health.
- company live-run count.
- required agent status for CTO and Code Worker by default.

The sidecar starter launches `memory-sidecar.mjs` in the background and writes logs to `memory-sidecar/logs`.

## Architecture Fit

- Read-only.
- Does not create issues.
- Does not assign agents.
- Does not wake agents.
- Does not mutate memory.
- Helps keep Codex in CTO/reviewer mode and avoids unnecessary Paperclip wakeups.

## Next Verification

Run:

```powershell
.\scripts\Test-PaperclipWorkplaneReadiness.ps1 -AsMarkdown
```

If ready is false, fix blockers before the real CTO -> Worker smoke test.

## 2026-07-10 Verification Result

Initial readiness was false because Code Worker was in `error`:

- `Antigravity exited with code 1`

The error was cleared through Paperclip's official board API:

```powershell
POST /api/agents/bb309102-69c4-4566-9a4d-07e7882945d8/clear-error
```

Readiness then returned true:

- Paperclip: ok
- Memory Sidecar: ok
- Company live runs: 0
- CTO: idle
- Code Worker: idle

The readiness-gated smoke test created:

- Parent `CMP-21`
- Child `CMP-22`

Both completed successfully and the final readiness check returned true with 0 company live runs.

Important follow-up: helper-based local-board writes from inside assigned worker runtimes can re-wake assigned agents after completion. The UTF-8 helper scripts now guard assigned issue writes by default unless an API key or explicit manual-cleanup override is present.
