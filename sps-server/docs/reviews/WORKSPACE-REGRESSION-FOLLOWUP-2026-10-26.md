# Workspace regression follow-up

The local Desktop suite completed with 1,126 tests: 1,110 passed, four failed
and 12 skipped. Two signing-process fixtures exceeded their 10-second whole
process deadline during parallel startup. Their cold-start budget is now 45
seconds on Windows and 15 seconds elsewhere; IPC/signing deadlines are unchanged.
They require process close and natural zero exit; timeout termination fails the
test explicitly. Both focused tests passed after the change. This fixture budget
does not qualify product startup or change its authorization limits.

The cleanup diagnostic extraction left a stale static E2E contract assertion.
The assertion now checks the extracted classifier and retained removal deadline
and failure disposition. The signing and E2E contract follow-up passed 6/6.
The local Windows Job diagnostic `readOK` failure remains under investigation;
owned-Job emptiness was confirmed, and unreadable entries are not accepted as
successful diagnostics. The older full suite is still a failed run.

Source ea8a921 CI also failed startup-feedback test collection because a static
Native Workspace import evaluated a schema-dependent service even with the
feature disabled. Core 456ecae5 loads that runtime only inside the explicit,
prepared Workspace opt-in. Startup and channel suites passed 19/19 after this
fix. This preserves optional Native startup without expanding schema mocks.
The separate Zod High dependency gate is unchanged and unresolved.

New CI at this candidate is required. Narrow follow-up results do not replace
the full Windows/packaging, security or physical same-candidate acceptance.
