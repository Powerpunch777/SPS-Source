# SPS UTF-8 API Helper Log

Date: 2026-07-09

## Goal

Reduce Windows/PowerShell encoding failures when agents create SPS issues or comments with Korean text, Markdown, or literal backticks.

This supports the target architecture without changing control ownership:

- SPS remains the control plane.
- Task Rooms remain SPS issues.
- CTO/Manager still create child Task Rooms directly.
- Memory remains recall/candidate only.
- No hidden controller is introduced.

## Implemented

Added UTF-8-safe helper scripts:

- `scripts/SPSApiUtf8.ps1`
- `scripts/New-SPSIssueUtf8.ps1`
- `scripts/Add-SPSIssueCommentUtf8.ps1`
- `scripts/Update-SPSIssueUtf8.ps1`

Created an ASCII alias to avoid Korean path corruption in agent prompts:

- Alias: `C:\Users\young\Documents\sps-server`
- Target: `C:\Users\young\Documents\AGENT 구축\sps-server`

Updated active agent instructions:

- CTO
- Code Worker
- Manager agents `8a28c634-9cac-49a5-a914-5c30f9a4a99d` and `4522397f-ac53-48fd-bf52-4e4fe5990e00`

## Usage

For long Korean issue descriptions or comments, agents should write the text to a UTF-8 file and pass:

- `-DescriptionPath` for new issues
- `-BodyPath` for comments

This avoids inline PowerShell quoting problems such as unescaped backticks.

Examples:

```powershell
.\scripts\New-SPSIssueUtf8.ps1 `
  -CompanyId 181e1bf7-3390-4b8d-8507-b736a03e444b `
  -Title "Worker task" `
  -DescriptionPath .\handoff.md `
  -ProjectId 2e0a5142-c2d2-4f23-8079-a287e8c8e59f `
  -AssigneeAgentId bb309102-69c4-4566-9a4d-07e7882945d8

.\scripts\Add-SPSIssueCommentUtf8.ps1 `
  -IssueId CMP-8 `
  -BodyPath .\comment.md

.\scripts\Update-SPSIssueUtf8.ps1 `
  -IssueId CMP-8 `
  -Status done
```

## Verification

Performed dry-run checks only; no SPS issues/comments were created during verification.

Verified:

- PowerShell parser reports zero parse errors for all helper scripts.
- Comment dry-run produces UTF-8 JSON for Korean text.
- BodyPath dry-run handles Korean text and literal backtick as JSON string content.
- DescriptionPath dry-run handles Korean text and literal backtick as JSON string content.
- BodyPath/DescriptionPath reads use explicit .NET UTF-8 decoding instead of PowerShell 5.1 `Get-Content -Encoding UTF8`.
- Comment helper fails fast when neither `-Body` nor `-BodyPath` is provided, avoiding stdin hangs in background agent runs.

## Remaining Work

- The direct unassigned issue smoke test has been completed; see `12-sps-utf8-helper-smoke-test-log.md`.
- Verify completed assigned agent issues do not leave live runs or create repeated wakeups.
- Keep that smoke test on `agy` where possible to avoid draining Codex usage.
