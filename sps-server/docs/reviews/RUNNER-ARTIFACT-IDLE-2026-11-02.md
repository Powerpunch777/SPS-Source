# Runner Artifact Idle Admission

2026-11-02 KST. Private Core/Desktop safety increment, not cleanup readiness.

## Implemented Boundary

The existing command runner already retains an active entry before asynchronous
preflight and until confirmed process closure and Source mapping cleanup. The
new process-local maintenance scope requires that map to be empty; it never
cancels, drains or times out existing work to make cleanup appear safe. While
held, new execution rejects before preflight. Cancellation-generation changes
invalidate the scope. Its lifetime includes the actual callback settlement and
post-check; escaped guards fail after release.

The encrypted legacy claim journal adds a separate held idle scope. Queued and
in-flight operations are counted synchronously before their first microtask.
An executing owner or any retained record from any connection blocks entry,
including expired intent, received, entered and aborted records. Empty/absent
stores are accepted without writing. Held observation rejects new journal
operations, checks unchanged ciphertext and zero records, and rejects malformed
or unreadable state without clearing it. This changes no durable schema or
claim-replay policy.

Main's private artifact observation first holds Desktop activity and owned-Core
observation, then command idle and claim-journal idle. Its combined guard checks
all scopes before and after the caller. The result remains
`desktop-known-inputs-and-owned-cores`, `cleanupReady:false`.

Both the existing legacy poll and existing Native poll now join Desktop activity
before any network claim. In-flight access/claim preparation therefore blocks
maintenance even before a command exists in the runner map. Refusal before
admission consumes no work and does not fail/cancel the Node; ordinary polling
can resume later. Admitted work keeps its existing execution/error handling.
The Native hook is optional for existing callers; actual Main supplies the same
Desktop gate. This is a safety fix, not new Native protocol development.

## Verification

Bundled Node24.22.1 focused Desktop selection passed92/92 without skips:

```powershell
node --test test/node-claim-journal.test.mjs test/node-claim-artifact-idle.test.mjs test/desktop-artifact-context.test.mjs test/node-command-poller-main.test.mjs test/native-node-controller.test.mjs
```

Desktop Node `npm test` passed127/127 without skips, including six new
maintenance tests. They cover an actual owned test child, held preflight, new
execution refusal, callback error/release, cancellation invalidation, failed
Source cleanup and simulated unconfirmed termination. Synthetic transport and
storage tests do not use user credentials or claim real Host work.

Desktop `npm run test:ci` exited0: serialized4/4, remaining2167/2170 with three
unavailable Windows8.3-alias skips. Aggregate2174 total,2171 passed,3 skipped,
0 failed. The real two-owned-Core reference test remains included. Ignored
local logs are `desktop/dist/node-artifact-idle-node24-20261102.log` and
`desktop/dist/runner-artifact-idle-node24-20261102.log`. Independent Luna review
of callback lifetime, retained records, preclaim admission and rescheduling found
no actionable issue; it did not perform additional app or physical tests.

References consulted, not copied code:
- [Node child-process lifecycle](https://nodejs.org/api/child_process.html)
- [Windows Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects)
- Existing SPS command runner, Source cleanup, claim journal, activity gate and
  Native/legacy lifecycle controllers.

## Still Incomplete

### Runner Fixture Wiring Follow-Up

Further source inspection found that the separate real Electron Runner recovery
fixture extracts Main's poll routine but did not inject its newly required
Desktop artifact gate. Unit Main harnesses had been updated; this fixture had
not. The gate is now supplied there too. Admission refusals have a specific
technical code: only that pre-callback refusal may defer a poll. Unexpected
wiring errors are no longer silently treated as busy maintenance, and Native
unexpected admission errors become unavailable rather than endlessly reschedule.

The actual Runner recovery fixture now checks refusal before a claim, admission
held at actual signed claim dispatch and actual fixture execution, and release
only after the poll settles. Parent acceptance requires those observations in
every phase. This is still a component integration using Main's actual routine,
not full Member Main startup or physical-computer qualification.

The focused follow-up selection passed52/52. Node24.22.1 Desktop `test:ci`
exited0 again: serialized4/4 plus2169/2172, aggregate2176 total,2173 passed,
3 unavailable Windows8.3 skips. Local ignored log:
`desktop/dist/runner-admission-wiring-node24-20261102.log`. Actual Runner recovery
and Builder source-Host acceptance must be run on the resulting code revision
before this follow-up is treated as app-integration evidence.

The command map is process-local. It does not prove the absence of standalone
CLIs or processes left by a previous Desktop. The legacy durable journal is not
an authoritative journal for the separate Native transport. Native restart and
ambiguous-claim/process reconciliation therefore remain a gap, not an empty safe
reference list. Source route/share reconciliation is also still incomplete.

No executable/argument/Codex file-discovery completeness is claimed, no retained
record is auto-cleared, and no unknown process is stopped. Ownership/inventory
eligibility, fresh Host-bound selection approval, actual selective removal and
Settings UI remain pending. There is no new renderer/HTTP cleanup endpoint,
public SDK permission or DB migration. User apps/profiles, original checkout,
AppData/Vaults, external projects and Production were preserved. Core main,
exact final candidate Linux/Windows/Electron, abnormal-loss/SQL-crash, installed
and historical recovery, and physical two-PC qualification remain separate.
