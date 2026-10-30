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

An additional Host API gate correction rejects `invalidInvocationScope` before
classifying Workspace selectors. Previously the no-selector early return let a
context already marked invalid reach `config.get`, `secrets.resolve` or dynamic
tool registration. It now denies that context before invoking those services,
including handlers with no Workspace selector. Genuine absent-context legacy
Host calls and valid Workspace calls retain their capability checks. The Native
manager's guarded-prefix rejection already remains in place; this closes the
general SDK Host-factory gate rather than replacing that manager guard.

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

## Additional focused Host API result

The changed Host factory, model Host client and connectivity files passed52/52
fixture-free cases (run52185,22.24s). The SDK package typecheck46849 exited0.
The new regression checks invalid config/secret/tool calls have no delegate
effects, then checks legitimate legacy and Workspace calls still succeed.
The public SDK repository has no duplicate Host-factory implementation and was
not changed by this correction. No actual DB or Electron run was added.

An additional selected manager/Host-adapter regression passed1/1, with5
unselected cases skipped (run37027). It uses a fake child NDJSON transport and
the actual emitted SDK package import, not an OS subprocess: an unknown legacy
invocation cannot read config/secrets or register tools, while a genuine Host
config read succeeds. The first adapter run98349 failed because it read the
older emitted SDK and received a result rather than an error. The SDK was then
rebuilt successfully (71396); the assertion also now uses the named protocol
constant rather than a duplicated numeric code. The final selected pass and
earlier52-case source pass are separate results, not a full manager suite.

## Remaining process ownership integration

Current workers and startup locks remain keyed only by Plugin ID. The loader
builds one Host-service set and reads one global config row per Plugin. Complete
Workspace execution isolation requires one ownership identity across process
creation, fresh Host handlers, config/secret resolution, call routing, notifications
and stop/disposal. Merely adding a Workspace key to the manager would leave
legacy loader/tool/lifecycle callers on the shared process or strand owned workers.

Do not copy arbitrary Host config/credentials into every Workspace worker or
reinterpret saved Workspace settings as a new configuration contract. Preserve
the explicit legacy Host lane while introducing the complete scoped factory.
Acceptance must prove separate worker globals, wrong-Workspace Host-call denial,
scoped configuration/secret policy and stop-A/B-survives with confirmed child
closure and no fallback to the Host worker. These remain unfinished; the Host
API gate correction does not claim process or OS isolation.

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
