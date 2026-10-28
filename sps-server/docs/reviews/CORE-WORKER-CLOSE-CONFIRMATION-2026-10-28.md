# Core Worker close confirmation

Status: scoped implementation with focused verification. This change addresses the
lifetime of the exact child process owned by Core. It does not provide Windows
Job containment, descendant termination, Workspace process isolation or an OS
filesystem/Vault boundary.

Candidate Core: `2071d2f090c7740f4180a2612434185400ddfcf0`. Desktop remains
`0.4.137` development-candidate and SDK remains
`607b48a4edaed1db7132a01719431ffce5852964` (`0.11.0`, unreleased). The support
matrix, generated current-candidate document and Core submodule agree. Candidate
document generation/check and its four tests passed. Native remains opt-in and
Tailscale remains the supported release transport.

## Problem

The previous worker manager cleared its child reference, finalized a stop and could
schedule a replacement on `ChildProcess.exit`. Node permits stdout/stderr to
remain open after that event. A replacement can therefore overlap the previous
generation's resources, and rejecting every pending RPC at `exit` can discard
a final response already written but still buffered on stdout.

## Required behavior

- Record process death at `exit`, block new dispatch, and retain the exact
  ChildProcess reference and PID until its matching `close` event.
- Drain responses for existing RPCs between exit and close. Reject new
  worker-to-host requests/notifications after process death so buffered input
  cannot admit new Host side effects.
- Complete unresolved-call terminal accounting, synthetic stream closure and
  crash/restart cleanup once close is confirmed. A valid drained response must
  retain its `response` acknowledgement rather than become `worker_exit`.
- Wait within bounded existing shutdown confirmation budgets. If close is not
  confirmed, fail the stop and retain the handle; do not claim stopped or allow
  replacement. Do not send signals to a process already observed exited.
- Associate exit/close/error callbacks with their exact child generation. Late
  events from a previous generation cannot clear or crash its replacement.
- Bind asynchronous worker-to-host requests and stream notifications to their
  original child. A handler or authority check finishing after restart cannot
  send a response to, or register a stream for, the replacement child.
- Handle spawn error followed by close without requiring an exit event. Keep
  the public exit notification tied to actual observed process termination.

The manager's legacy plugin-ID API, invocation authority and public SDK contracts
remain unchanged. Separately, rejection of a call while the worker is unavailable
must notify the supplied terminal observer with `not_dispatched` even when that
observer was passed separately from an authority object.

## Verification boundary

New deterministic child-process lifecycle tests cover exit-before-close,
missing close, spawn error, delayed callbacks from old generations, buffered
final response, and rejection of a new Host request after exit. Existing actual
worker shutdown tests continue to pass. Only terminal scoped results are recorded
below; no full local suite is implied.

Node's documented distinction between the two events is the basis for this
lifetime boundary: [Child process events](https://nodejs.org/api/child_process.html#event-close).

## Scoped verification

- Initial deterministic lifecycle file passed 3/3. After adding same-handle
  restart cases, its final focused run passed 5/5. The new cases hold old Host
  callback success and failure until the replacement runs, verify a new request
  succeeds, and require no old response/error on the replacement's stdin. A held
  stream authorization continuation likewise cannot open or close a channel in
  the replacement generation.
- Actual shutdown, stream-scope and Native-connectivity worker tests: 3 files,
  9/9 passed, session40359 exit0. Log:
  `core-worker-close-related-2026-10-28.log` in the task's outer work directory.
- Read-only lifecycle review found no additional material issue. The final
  SIGKILL stage has one 2-second close budget, rather than successive exit and
  close budgets. Missing close retains ownership and fails stop.
- Existing real-worker manager tests: 22/22 passed, session5834 exit0. Log:
  `core-worker-close-manager-2026-10-28.log` in the outer work directory.
- Server `tsc --noEmit -p server/tsconfig.json` passed, session38288 exit0,
  with no diagnostics (`core-worker-close-typecheck-2026-10-28.log`).
- Native SDK smoke harness syntax and targeted whitespace checks passed. No
  actual PostgreSQL, Electron, whole local suite or manual CI rerun was added.

## Windows CI database gate

Source7aff Windows jobs122556362445/122556336233 completed with failure in the
Native public SDK step. The earlier oversized-ingress stage passed, but the
Native SDK harness failed its embedded-Postgres support assertion before SDK or
Electron execution. The support probe's safe failure reason was discarded by
that assertion. The harness now surfaces only an exact allowlisted startup
stage/category; any other value becomes a fixed generic message. Syntax and
targeted whitespace checks passed. This diagnostic change adds no retry, skip,
timeout or permission change. The remote database startup cause remains
unproven; neither a new CI result nor new actual PostgreSQL/Electron acceptance
is claimed by this patch.
