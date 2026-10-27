# Native Workspace execution status read

Native Member Workspace now has a read-only view of its Host Core execution
state and pending work counts. The status is informational; execution changes
remain in Host Core settings.

## Read and authority path

The private Core operation in
`external/sps-core/server/src/services/sps-native-workspace-surfaces.ts`
accepts only the fixed
`GET /api/companies/{workspaceId}/execution-control` target. It uses the
existing approved Native device, current Member session and Workspace
membership checks. The execution control row and pending counts are read in
the same transaction as those checks.

The returned closed DTO contains `state`, canonical numeric-string `epoch`,
safe nonnegative `revision`, `updatedAt`, five safe pending counts, and the
literal `canControl: false`. No Host execution mutation is exposed through the
Native Member bridge. Exact route matching rejects query strings and extra
route components.

Desktop Main routes this surface through its fixed workspace target and
existing saved-credential TLS client. The response validator rejects unknown
root or pending keys, invalid state/epoch/revision/count values, and any value
other than `canControl: false`.

`external/sps-core/ui/src/pages/SpsNativeWorkspaceEntry.tsx` reads this DTO and
shows the state and per-lane counts without controls. An older Host or an
unavailable surface produces an explicit “Workspace execution status is
unavailable” message; it does not imply that the Workspace is stopped.

## Verification evidence

- Desktop parent-channel, enrollment client/response, and preload/window
  focused tests passed: **80/80**. The DTO response case was then extended with
  invalid state, unsafe revision, negative pending count, and extra-field
  cases; that focused test passed **1/1**.
- Selected PostgreSQL-backed Core surface test passed: **1/1** (8 other tests
  skipped by the filter). It performed a real stop transition, then verified
  the Native Member private HTTP reader returns the stopped state and actual
  pending counts with `canControl: false`; Native POST resume, revoked active
  Workspace membership, and a revoked Member device were all denied. The test
  fixture's `afterAll` completed, including DB client close and owned embedded
  database cleanup. This is a local embedded-PostgreSQL test, not a physical
  LAN or installed-client verification.
- Native Workspace Entry UI tests passed **12/12** with one threads worker.
  After adding the invalid-state parser case, the focused UI status test passed
  **1/1** (11 other tests skipped by the filter).
- Root reported the scoped Core UI Vite build completed with exit code 0.
- Selected Desktop JavaScript syntax checks and `git diff --check` passed;
  Core `git diff --check` passed with line-ending warnings only.

## Not verified by this change

Only the selected PostgreSQL-backed Core surface case was run; the remaining
cases in that file and the broader Core database suite were not run. The
execution-status bridge was not exercised by an installed desktop build,
physical Host/Member pair, or LAN session. Earlier Native window fixture
evidence covers the window composition, not this new status endpoint or its
database authorization path.

The current evidence proves the response contract and UI behavior at focused
test/build level, and verifies current device/session/membership enforcement
against an actual local Core database. It does not establish physical LAN
authorization or installed release behavior.
