# Private Owned-Core Plugin Artifact IPC

Status: implemented private observation transport only. This is not a cleanup
API, eligibility decision, confirmation flow, removal implementation, or UI.

## Boundary

Desktop Main and its exact directly owned Core child use Node's child-process
IPC channel. Main enables the channel only for the owned Host path and creates
the client only when the child exposes the owned-job termination methods and
the connected IPC `send` channel. Core installs its private channel only when
both `SPS_DESKTOP_ARTIFACT_CHANNEL=1` and
`SPS_DESKTOP_OWNED_SHUTDOWN_PIPE=1` are present and its process is connected to
its direct parent. This transport is not exposed through HTTP, the public API,
or the SDK, and it grants no deletion authority.

The snapshot has `coverage: "core-only"`, a 64-character lowercase hex
fingerprint, and references with exactly `source`, `ownerId`, `state`, `path`,
`kind`, and `canonicalPath`. Sources are `plugin`, `pending-previous`,
`pending-candidate`, `pending-backup`, `review-previous`, `review-candidate`,
`review-backup`, `worker`, `preparation`, and `registry-stage`. `kind` is
`file` or `directory`; paths are bounded absolute canonical paths. The snapshot
is limited to 8 MiB and 60,000 references by the parent client. It is private
process data, not a public response shape.

## Wire Protocol

Core announces readiness with `{ v: 1, kind: "sps.plugin-artifacts.ready",
channelId }`, where `channelId` is a UUID. Main then sends requests with the
exact fields `{ v: 1, kind: "sps.plugin-artifacts.request", channelId, id,
transactionId, operation }`. `id` and `transactionId` are UUIDs; `operation`
is `begin`, `check`, or `end`. Core replies with
`{ v: 1, kind: "sps.plugin-artifacts.response", channelId, id,
transactionId, operation, ok, ... }`. A successful `begin` carries `snapshot`;
a rejected response carries only `errorCode:
"plugin_artifact_channel_unavailable"` in addition to the common fields.

Main accepts only exact plain-object frames, matching channel, request ID,
transaction ID and operation. It rejects malformed or oversized snapshots,
unexpected/duplicate responses and stale ownership. Core also rejects malformed
or replayed request IDs, reused transactions and concurrent `begin` requests.
The Core reference reader opens one snapshot scope at `begin`; that scope holds
Core maintenance across the Main callback. The caller must separately hold
Desktop's private maintenance callback around its work; the channel itself does
not compose Desktop admission or references. Before Main enters the callback
it validates the scope with `check`. A scope's `assertCurrent()` sends another
`check`, and Main validates again after the callback settles. Main sends `end`
only after that callback settles, including when it throws. After a snapshot
has been exposed, Core releases its scope only for the matching `end`, after
queued checks and Core's final snapshot validation; the end reply reports
whether that validation succeeded. A `begin` rejected before exposing the
snapshot (including the Core 8 MiB bound) closes its unexposed scope as a normal
rejection. A callback error is returned to its caller after a successful end,
while protocol or validation failures fail closed.

There is no timeout-based unlock. A send error, disconnect, exit, timeout,
malformed frame, lost response, stale child, or failed check poisons the active
observation. A failure during an active scope retains sticky uncertainty in
Main and denies later activity and maintenance admission. Core does not release
an open maintenance scope merely because its IPC listener is disposed or
disconnected. On the production owned Windows path, Main clears that
uncertainty only after
`waitForOwnedJobTermination()` confirms the exact old Core Job is empty; a Core
leader exit, elapsed timeout, health probe, or replacement process is not
enough. This relies on the real owned Windows Job, not just the child leader's
exit event.

The regular Host and isolated Preview opt into this transport. Generic manager
compositions remain opt-in so a plain process handle cannot pretend to provide
an owned-Job recovery boundary. The channel does not stop ordinary running
Workers to obtain a snapshot. Completed transaction IDs and request IDs cannot
be reused, and each set is bounded to 10,000 for the child lifetime; exhausting
that bound denies further observations rather than evicting replay protection.

This protocol uses Node's documented child-process message callback and
`disconnect` lifecycle: [Child process send and disconnect](https://nodejs.org/api/child_process.html#subprocesssendmessage-sendhandle-options-callback).

## Not Implemented

This is a Core-only reference snapshot, not the full Desktop/Core reference
composition. Desktop-side Registry, Preview, restore and other Desktop-owned
references are not yet composed with it. Inventory eligibility, exact-item
selection, fresh review and confirmation, removal, and the Host Settings UI
remain unimplemented. No cleanup success or safe-to-delete conclusion follows
from this IPC alone.

## Local Verification

Core commit `d4066219ec64b79c2a929d02066b65f00fcd34b5`:

- `pnpm exec vitest run server/src/__tests__/sps-plugin-artifact-parent-channel.test.ts server/src/__tests__/sps-workspace-plugin-host.test.ts server/src/__tests__/server-startup-feedback-export.test.ts`:
  25/25 in three files. This includes held checks/end, transaction reuse,
  malformed frames, oversize rejection and disposal without timeout unlock.
- `pnpm -r typecheck` and `pnpm build`: all30 workspace projects passed.
  Existing CSS highlight/large-chunk and module.register deprecation warnings
  are not treated as test or security proof.

Desktop local source observations:

- `node --test test/plugin-artifact-parent-client.test.mjs test/plugin-artifact-parent-process.test.mjs test/plugin-artifact-activity-gate.test.mjs test/owner-host.test.mjs`:
  63/63. Actual forked Node children load the Core implementation and lose real
  begin/check/end replies deliberately. The Windows loader initially rejected
  a raw drive path; the fixture now passes the loader's file URL, and that
  corrected real-process selection passed. Fake-channel unit tests remain
  distinct from the real IPC children and actual Windows Core/Job fixture.
- `node scripts/smoke-plugin-preview-desktop.mjs`: passed actual source Preview
  and production coexistence, stage/gates, renderer-only failure, real sign-out
  and previous-account Preview closure with its data retained. Main exited
  gracefully; CDP, temporary Postgres, mock Identity and exact temporary data
  cleanup completed. No real AI request or installed user profile was used.
- `npm run audit:development`: policy passed with five advisories, zero
  critical/high, three low reports and two reviewed moderate entries expiring
  2026-11-07. This is not a zero-vulnerability claim.

One transfer run failed because a concurrent test preflight attempted to
replace the development-only Desktop Node dependency while an isolated app
still used its Windows helper. The preflight returned EBUSY and a later test
Main could not import the partially synchronized package. That run is a
failure, not transfer qualification. Its owning harness confirmed process and
temporary fixture cleanup. After independently observing no remaining exact
fixture/checkout processes, dependency synchronization was repaired. No user
installation, production service or real Vault was changed. A subsequent
Desktop run also correctly rejected the not-yet-staged Core gitlink versus
matrix mismatch; it is not a pass for the updated tuple. These preparation
failures must not be concealed by later successful reruns.

Final local `node scripts/run-desktop-ci-tests.mjs` passed: serial2/2 plus
1999total/1996pass/three unavailable8.3-alias skips, aggregate2001total/1998pass,
zero failures. This includes the actual Windows owned Core fixture:
`node --test test/owner-host-artifact-channel.windows.test.mjs`. That fixture
opens a real Core/embedded DB in an owned Windows Job, holds Main-side work,
expires old scopes and then stops Core during an active callback. New work is
denied; uncertainty clears only after actual Job confirmation. Its exact
temporary root identity is rechecked before removal.

The repaired, sequential `node scripts/smoke-owner-vault-transfer-desktop.mjs`
passed actual Main export and empty-Host restore, code-free package transfer,
new-Host package and current-bundle review, two-Workspace data and attachment
retention, multiple restarts, real account ABA, and explicit navigation retry.
The harness confirmed owned Main/output and temporary-data cleanup; its
whole-descendant, installed-database, signed and physical-device qualification
fields remain false. `npm run audit:release` also passed with three advisories:
two low and one reviewed moderate, zero critical/high, not zero vulnerabilities.
Main syntax, candidate-doc consistency and diff whitespace checks passed.

Exact new hosted Linux/Windows/installed and mandatory legacy qualification
remain pending. Earlier Source609d453/Core21f2feb Verify41295817469 is completed
success, including mandatory legacy recovery; it does not qualify this new
IPC code. The inherited Core review automation at commit6187255 failed because
COMMITPERCLIP_KEY is absent, not because the Core test suite ran and failed.
Neither that automation nor older green runs replace current full regression.
