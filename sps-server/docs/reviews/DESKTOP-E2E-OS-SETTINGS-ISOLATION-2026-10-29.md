# Preserve Windows settings during isolated Desktop E2E — 2026-10-29

E2E already used a dedicated temporary userData directory and opted out of the
production single-instance lock. However, E2E is deliberately separate from
development mode: startup still registered the person's `sps` protocol handler.
A packaged E2E app also initialized its real automatic updater, including update
checks/downloads, and its launch-at-login IPC could change Windows startup.

Main now captures the existing E2E flag once and supplies it to private platform
settings and update controllers after dedicated userData validation. An isolated
session skips protocol registration and login-setting reads, rejects login-setting
writes before the Electron API, and disables updates before importing the updater.
These actions do not modify or restore any person's existing OS settings.

Default normal execution keeps the existing `sps` registration, login-setting
boolean/hidden-start arguments, error propagation and update approval/shutdown
behavior. No Core, SDK, Native, plugin, public Marketplace or Builder contract is
changed. This is a test-session guard, not an OS sandbox or a security grant.

## Actual checks

- New platform settings tests passed3/3 using mocked Electron APIs, including
  zero isolated OS calls and preserved normal options/results/error propagation.
- Update controller tests passed5/5, including a packaged app in E2E that never
  imports/invokes the updater or changes shutdown state. Existing normal update
  approval, close ordering, uncertain-close and retry tests remain.
- Existing isolated E2E tests passed5/5 without skips: production single-instance,
  dedicated temporary data, missing-directory rejection and junction escape.
- Main syntax and changed-file whitespace checks passed. No full local suite,
  real app, OS-setting write or live update download was used for these checks.

The prior478eebe/e195eaba/SDK61a929f Core runtime archive completed, with SHA256
`4221489e45ad7c0400e609905d53df1c28d1550299ef40f89b2cc3cbcd768733`.
These changes affect Desktop Main modules outside that Core runtime payload.
Any reuse still requires verified unchanged inputs, a real clean new Source
baseline and regenerated archive hashes before current packaged verification.

## Remaining evidence boundary

Isolated E2E cannot qualify normal protocol registration, Windows startup or the
real updater/installer by disabling their OS side effects. Those deployment
checks remain required separately, along with signed data-preserving installation,
update/rollback/restore and physical Host/Member/Runner validation. Current local
packaged first-renderer/process-cleanup validation and the original10second
source-renderer failure remain unresolved. Core completion is not established.
Stop before new solution-plugin or Plugin Builder development.
