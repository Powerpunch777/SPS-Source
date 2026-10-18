# Plugin Builder Chat

Status: source development implementation, 2026-10-18. This is not a new
installer or a Stable release. Existing installation and user data are unchanged.

## Ownership

Builder owns one Lead, optional Workers, conversations, attachments and reports.
Core provides authenticated Workspace scope and generic Agent session transport.
The public SDK exposes capability-checked actions and Agent sessions, without
private Core imports or arbitrary RPC. The SDK additions are pinned by commit in
support-matrix.json; they are not part of the published v0.11.0 tag.

## Implemented

- Conversation list, new conversation, persisted transcript and execution logs.
- Bottom composer, UTF-8 text attachments and configured Agent model display.
- Collapsible, resizable Worker/results panel and existing authoring records.
- Lead-only delegation to selected Workers, asynchronous reports and result tool.
- Workspace-scoped state, duplicate-send exclusion, bounded content and restart
  reconciliation. Interrupted runs are not automatically repeated.
- Generic plugin prompts do not inherit the legacy issue-work default or resume
  delta. Normal issue execution retains its existing behavior.

## Verification

- Builder check: 14 tests.
- Public SDK: 149 tests.
- Core session context/runtime: 13 tests, including embedded Postgres context.
- Desktop source Workspace E2E passed, including panel bounds at 1024x720 and
  1440x900 and responsive Workspace checks through 1440x900.
- Development app: actual Codex Lead answered the initial connection check and
  recalled its previous response on the next turn. No file edits were requested.

These are source-development results, not signed-package or two-device evidence.

## Remaining

- Real-account Worker delegation/report end-to-end verification.
- Execution cancellation and per-message model overrides; no fake stop control.
- One-click result Preview connection. Current navigation opens plugin review;
  it does not pretend to start a separate Preview.
- Image/binary attachments and file diff presentation.
- A fresh installer, SDK release and complete release gates before distribution.

The development app uses its persistent isolated profile and supports UI hot
reload. Backend/main/preload changes require restarting development, not packaging.
