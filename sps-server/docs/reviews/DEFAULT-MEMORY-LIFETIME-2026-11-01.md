# Default Memory Process Lifetime Review

Date: 2026-11-01

This is dated engineering evidence for the current working changes, not a new
product contract or a Core-completion declaration. The current scope and
completion boundary remain in
[`CORE-COMPLETION-POLICY-ko.md`](../current/CORE-COMPLETION-POLICY-ko.md).
The default Memory sidecar is optional; its lifecycle evidence does not replace
the required Plugin lifecycle, abnormal-exit, or cleanup acceptance evidence.

## Observed Behavior

- Concurrent starts share one in-flight start and one owned child. Stop advances
  a generation fence, waits for in-flight entry and Node-command preparation,
  and prevents a late continuation from spawning after stop.
- For a child started by this manager, the exact child owner and its private
  launch-reference snapshot are retained until the child's `close` event. An
  observed `exit` alone is not treated as proof that closure is complete; a
  terminal leader is not signaled again, avoiding a signal to a potentially
  reused PID. This matches Node's documented distinction: stdio may remain open
  at `exit`, while `close` follows process end and stdio closure
  ([Node.js `child_process`](https://nodejs.org/api/child_process.html#event-close)).
- Stop requests graceful termination first unless explicitly forced, then may
  escalate through the configured tree-termination helper. A helper's return or
  signal request is not itself closure evidence. If closure is not confirmed
  within the bounded wait, stop rejects, the manager remains sticky `stopping`,
  and the same owner and references remain available for an explicit retry.
  Concurrent ordinary stops coalesce; an explicit force request can escalate.
- A healthy listener not owned by this manager is reported as existing, never
  adopted or terminated. Once such a foreign listener has been observed,
  runtime artifact references remain unavailable even if its health later
  disappears; health loss is not proof of process ownership or closure.
- The private reference snapshot contains only the executable, sidecar entry,
  entry directory, and config path. It excludes tokens, Memory contents, model
  data, and AI data. It is not a complete inventory of config-derived data
  references and does not provide OS Job Object or descendant-process
  containment. Do not interpret this introspection as an OS isolation guarantee.

## Verification Evidence

The focused final selection reported 27/27 passing across configuration,
lifecycle (including an actual local sidecar and a late termination-helper
failure), runtime-drain, Preview harness, build prerequisites, and bundle
dependencies. The late helper failure case passes because independently
confirmed child closure remains authoritative; a helper error alone is not
reported as successful termination.

An optional source-Electron Preview run with
`SPS_DESKTOP_E2E_VERIFY_MEMORY=1` passed: mock sign-in, owned Memory running
state and `startedAt`, real Preview/account sign-out with data retained, graceful
Main exit code 0, and refusal of the actual Memory URL after exit while config
remained present before exact temporary-directory cleanup. This used the old
bundled compatibility Builder, not the new v15 AI Builder.

The latest focused result is not a current full-Desktop-suite result. Before the
latest optional Preview-harness contract test, the Memory-code full Desktop run
reported serial 2/2 and 2,073 total / 2,070 passed / 3 unavailable Windows8.3
alias skips. Later Preview contracts reported 62/62 before that new
harness contract test was added. These are earlier results, not a claim that a
full suite passed on the final working changes. The initial new workflow
contract test failed because it used the wrong relative path; after correcting
the path, the focused 27-test selection passed.

A separate attempt to accept the new Builder v15 Host against its configured
endpoint failed because that endpoint was occupied while two isolated test
apps overlapped. Main exited 0, output ended, and temporary cleanup succeeded;
this is a failed acceptance attempt, not Builder passage or new Builder proof.
No installed, Production, or profile changes were made for this evidence.

The final local `npm run test:ci` subsequently passed: serial2/2 plus remaining
2,074total/2,071passed/three unavailable Windows8.3-alias skips, for aggregate
2,076total/2,073passed/3skips/0fail. This includes the optional packaged-Memory
workflow contract, not execution of a new packaged artifact.

Exact prior Sourcebd4505a CI41308329567 completed FAILURE in packaged Host
Plugin lifecycle UI: `Workspace re-enable could not be clicked: not found`.
All Linux shards/typecheck/build and earlier source/packaged gates succeeded;
the missing installer-input artifact caused downstream legacy failure. This
does not qualify the current working head or turn that lifecycle failure into
success. Prior olderdc14 CI41303522644 has independently completed SUCCESS;
that is historical evidence only.

## Remaining Boundary

The mandatory Core Settings full-cleanup acceptance, two-PC acceptance,
abnormal-Main-loss and SQL-crash recovery, and final exact-CI verification remain
incomplete. The Builder endpoint conflict also leaves actual new-Builder Host
acceptance unproven. Do not use this review or its focused checks to mark those
items complete.
