# Windows E2E exited-parent diagnostic race

Full local Desktop regression completed with 1,103 tests: 1,090 passed, one
failed and 12 skipped. The descendant cleanup probe had confirmed owned-Job
emptiness, but its diagnostic `readOK` assertion failed. Repeated probes showed
three listed members with one unavailable process, compared with a successful
two-member snapshot. The exact wrapper process can remain in the Job PID list
after its retained handle has signaled exit; opening that exited PID for an
image query is not a reliable live-process operation.

The helper now reports an `exitedParent` category only for its exact launched
child PID after the owned handle wait and exit-code read succeed. That handle
remains open through diagnostic collection, retaining process identity. Other
unreadable members still make `readOK` false. Bounds and category totals include
the exited parent; the helper does not pretend that every listed PID has a
readable image. Actual Job emptiness, timeout, forced-cleanup failure and pending
exit acceptance rules are unchanged. No process-query permission is broadened.

The complete focused Windows runner suite passed 17/17 after the change,
including descendant cleanup, failure/NTSTATUS propagation, timeout and forced
cleanup rejection. An independent code review checked the exact retained
handle/PID proof and unchanged cleanup acceptance. The full Desktop suite was
not rerun after this narrow helper change; the prior suite failure is retained
as evidence rather than relabeled as a passing full run. Updated hosted
Windows acceptance is still required.
