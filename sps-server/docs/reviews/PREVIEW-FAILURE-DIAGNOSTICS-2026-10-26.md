# Preview Failure Diagnostics

Date: 2026-10-26 KST. Status: **test-only source acceptance; packaged root cause unproven**.
Desktop remains unreleased 0.4.137. Core `7d4698267` / SDK `d4d692084` and the
current Tailscale support matrix are unchanged by this follow-up.

## Evidence And Scope

Source `41462df` push workflow `40220887751`, Windows job `121252010166`,
failed packaged Preview after Assistant registration. Source `e6e890f` PR
workflow `40245828439`, Windows job `121327057425`, subsequently reproduced
the same digest after registration; its push workflow `40245823506` also
failed packaged Preview. The PR job completed on 2026-10-26 UTC. The reported failure
digest `270c17488461a064f562b4c4dc9cbbd4107461d05818817a5d2fb1c560fa2862`
is exactly SHA-256 of the literal string `Uncaught`. The CDP evaluator previously
retained only `exceptionDetails.text`, losing the underlying exception class
and description. This identifies an opaque CDP evaluation failure, **not its
underlying JavaScript cause**. The older Owner-startup failure remains separate.

The old Builder readiness predicate also accepted navigation text before the
actual Builder control existed. A DOM-snapshot regression demonstrates that
counterexample. The harness now waits for a mounted, visible, enabled panel
toggle, then actual details-element evidence before opening it. Existing
60-second page waits, Host timeout, single clicks and all functional/cleanup
gates remain unchanged. This closes that code-level readiness hazard but does
not establish that it caused the hosted failure.

## Finite Diagnostic Projection

- A fixed failure-phase enum identifies Owner startup, registration, tool
  listing/project creation, Builder surface, registry, authoring, Preview,
  packaging and diagnostics. Phase capture precedes each relevant operation;
  the failure snapshot is recorded before cleanup changes the current phase.
- Own API failures retain only allowlisted method/path-template operation and
  a validated numeric HTTP status. UUIDs, URLs, query values, API bodies and
  arbitrary method labels never enter the projection.
- CDP descriptions are classified only into fixed exception/category hints.
  Original Error objects/messages and their existing digests are preserved;
  no description, stack, account, path or token is printed. Categories are
  diagnostic heuristics, not authenticated authority or root-cause proof.
- Accessor/Proxy metadata, malformed values, unknown codes and frozen Errors
  cannot introduce arbitrary fields or replace the original test failure.

The Host-log collector still reads only the owned temporary fixture's log,
now deriving its unchanged location from `ownerHostVaultLayout`. Existing
canonical-directory, link/hardlink, file-identity, 8-MiB file / 64-KiB tail,
strict UTF-8 and read-race checks remain. Unavailable results now distinguish
seven fixed reasons: invalid/missing path, unsafe path, oversized file,
changed-during-read, invalid UTF-8, unusable bounded tail, or generic I/O.
It does not search other logs, expand limits or expose raw filesystem errors.

No product UI, permission, retry, process-control or authentication path was
changed. Failure remains failure; forced Job cleanup is never accepted as natural
cleanup. No new API/SDK/dependency, listener, key, installed app or release exists.

## Verification

From `sps-server/desktop`:

```text
node --test test/preview-e2e-failure-diagnostics.test.mjs test/preview-e2e-host-diagnostics.test.mjs test/plugin-preview-desktop-e2e.test.mjs
node --check scripts/preview-e2e-failure-diagnostics.mjs
node --check scripts/preview-e2e-host-diagnostics.mjs
node --check scripts/smoke-plugin-preview-desktop.mjs
npm test
npm run docs:candidate:check
npm run docs:security:check
npm run audit:release
npm run test:e2e:plugin-preview
```

Focused tests pass **17/17**; full Desktop passes **847 total / 846 pass /
0 fail / 1 existing skip**. The final source Preview app exits 0 after functional
cases, orderly zero Main exit, PostgreSQL cleanup and temporary-data removal.
The successful source run does not exercise an actual failing packaged renderer;
negative projection and readiness cases are covered separately by unit tests.
Independent Luna read-only review found no actionable residual in this bounded
change; it is not independent GitHub approval.

Candidate/security-document checks pass. The actual production audit still
fails Zod High1243066 with no approved exception and reports two Low advisories.
No major migration or exception was applied.

Core `7d4698267` PR workflow `40245581524` is now **15/15 successful**. That is
exact Core regression evidence, not Source packaged acceptance, main inclusion
or a signed-release gate. Source `e6e890f` PR workflow `40245828439` and push
workflow `40245823506` completed with 16/18 successful jobs: packaged Preview
and the held Zod security policy failed. All Source Linux Core shards and its
typecheck/build passed. The PR Preview confirmed orderly Main exit, but the
owned Job required forced cleanup, correctly preserving failure rather than
accepting cleanup as natural. This follow-up needs fresh exact-head hosted
evidence and must not reuse any earlier partial pass as full qualification.

Native session exchange, app invitation/enrollment, external LAN, two distinct
Windows PCs, production Identity and final signed-installer evidence remain
incomplete. The Marketplace policy attachment is still reviewed only.
