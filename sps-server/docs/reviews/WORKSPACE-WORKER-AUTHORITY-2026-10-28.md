# Workspace worker authority and stream lifecycle

Status: scoped product corrections with focused test evidence. These changes do not
create per-Workspace worker processes or an OS sandbox. The global worker,
loader/config and notification lifecycle still require the integration described
in `WINDOWS-PROTECTED-PLUGIN-INTEGRATION-2026-10-28.md`.

## Product corrections

Native data/action authority now carries the Workspace selected by the Host as
`boundWorkspaceId`. The manager independently compares that trusted value with
the invocation's Workspace before authorization and again after the async
authority check. A direct `companyId` cannot conceal a contradictory action,
tool, job or event envelope. The captured authority and registered scope are
immutable; changing the caller's original authority or parameters cannot retarget
an admitted call. Denial uses the existing `INVOCATION_SCOPE_DENIED` and reports
`not_dispatched`. The binding remains Host-only, never a public SDK parameter.
Existing callers without a binding retain their current behavior.

The worker's open-stream bookkeeping previously used only the channel name.
Opening the same channel in Workspaces A/B, then closing A, erased B's record;
when the process exited, B's client missed its terminal close. The manager now
keys records by the full Workspace/channel tuple. Stream payloads and existing
invocation authorization checks are unchanged.

## Scoped evidence

- The stream regression failed before the bookkeeping fix; after it, two cases
  passed, including crash closure of B and rejection of a cross-Workspace stream
  notification.
- Two real-worker authority cases passed: equal Workspace dispatch, absent or
  malformed binding, mismatched target, conflicting actor scope, Host-job bypass,
  mutation of the original authority, and parameter mutation during admission.
- The Native connectivity worker test passed with the trusted binding supplied.
- Server package typecheck passed. A later related-file run passed 23/25 tests;
  two existing timeout tests failed on short real-time waits. The test fixtures
  now hold the actual worker response behind a host callback and use controlled
  clocks; both failed cases passed on the focused rerun. The tests preserve
  timeout override and terminal-acknowledgement requirements. The initial 23/25
  result and the later selected 2/2 are separate runs, not one green full run.
  After those corrections, the final related-file run passed all 25 tests in
  three files (`core-workspace-worker-final-focused-2026-10-28.log`, exit 0).
  Final server and DB package typechecks also exited 0.
- Native runtime DB-backed authority assertions were updated for both data and
  action; that DB test was not run locally in this change. Previous joined
  Native SDK session93475 belongs to Core `df7436dc`, not this new Core tuple.

Only related Worker tests and package typechecks are used here. No whole local
suite, new PostgreSQL/Electron run, CI rerun, security waiver or installed product
change is implied.

## CI transport and database observations

Source52d Windows job122543049580 failed an oversized Native Node ingress test
when the client received `ECONNRESET` instead of `413`. The test now separately
requires `413` using an authenticated oversized declared length with a tiny body,
accepts only `413` or reset for the real large upload, verifies no dispatch, and
requires a subsequent valid request to succeed. The named case passed. Product
TLS, request caps and authorization remain unchanged.

Duplicate job122543074668 passed that earlier stage but failed the new SDK gate
while starting its temporary PostgreSQL database, before SDK/Electron work.
The installed database package can reject `start()` without an error value
when its process closes before readiness. The support probe previously tested
the truthiness of that value and could mistakenly report support. The helper
now tracks failure independently and emits only fixed startup stage/category
diagnostics. Nineteen fixture-free helper tests passed; no PostgreSQL process
was started for those checks. The remote startup cause remains unproven until those diagnostics
run; a local SDK pass does not resolve the remote gate.
