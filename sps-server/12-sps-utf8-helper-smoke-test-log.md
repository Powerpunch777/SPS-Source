# SPS UTF-8 Helper Smoke Test Log

Date: 2026-07-09

## Goal

Verify that the UTF-8-safe helper scripts can create, comment on, and close SPS issues with Korean text and literal backticks without assigning or waking agents.

This test was intentionally run through direct local commands and direct `agy.exe`, not as a SPS agent run.

## Scope

- No SPS assignee.
- No CTO/Code Worker wake.
- No source-code edits during the smoke test.
- Direct SPS API helper scripts only.

## Results

### CMP-12

- Issue ID: `32aaf8be-2023-4957-bbcb-db393da6f3c7`
- Result: done.
- Assignee: none.
- Verified: Korean description and Korean comment with literal backticks were preserved.
- Note: direct `agy.exe` used an English title, so Korean title preservation was not covered by this issue.

### CMP-13

- Issue ID: `12589998-a65c-43c2-a926-a06d170e6dcb`
- Title: `UTF-8 헬퍼 스모크 테스트`
- Result: done.
- Assignee: none.
- Verified:
  - Korean title preserved.
  - Korean description preserved.
  - Korean comment preserved.
  - Literal backticks preserved.
  - Issue live-runs endpoint returned `Count: 0`.

## Architecture Fit

- SPS remained the source of truth.
- Task Rooms remained SPS issues.
- No hidden controller was introduced.
- No agent was assigned or woken.
- Memory behavior was not changed.
- The test supports direct CTO/Manager API use through safer helper scripts.

## Remaining Risk

The direct unassigned helper path is verified. The remaining runtime risk is assigned-agent wake cleanup: completed assigned issues may still trigger or leave heartbeat/live run records. Test that separately and keep repetitive execution on `agy` to avoid Codex usage drain.
