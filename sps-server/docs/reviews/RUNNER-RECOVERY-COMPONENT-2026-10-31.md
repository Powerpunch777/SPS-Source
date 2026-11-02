# Runner Recovery Component Acceptance

Date: 2026-10-31. Desktop `0.4.137`; Core
`b17fb830138b4acde96aa7b5c911f7e8cccfa698`; public SDK
`61a929f6c783f78e5af603682de1543c7e24abc0`.

## Gap And Scope

The existing Node poll, durable claim journal and completion outbox already
implement response-loss recovery. The earlier claim-response-loss limitation
in `RUNNER-COMPLETION-OUTBOX-2026-10-29.md` is superseded by
`NODE-CLAIM-RECOVERY-2026-10-29.md`, not a new missing product feature.
Previous evidence covered the actual native command runner, actual Core routes
and a VM-invoked Main poll separately. Runtime discovery used a simulated
heartbeat and did not join those components across real Electron restarts.

This acceptance adds that missing component integration without changing any
Core/SDK API, schema, production Main routine or automatic retry policy. A
disposable public-SDK Worker runs against the actual isolated Core. Separate
Electron processes use Windows `safeStorage`, actual Desktop state files,
claim journal/outbox, signed Node client, native Windows Job supervisor and
the poll function extracted verbatim from `main.mjs`. The report hashes that
exact routine and the newly compiled harmless fixture executable.

This is **not actual Main startup**, a remote Member UI, a real model/provider
CLI, two physical PCs, SMB qualification, or a hostile-code sandbox. The
surrounding No-AI acceptance separately starts/restarts actual Main and Core;
that does not turn this component process into Main startup evidence.

## Scenarios

1. Runner A registers its own Node keys, sends a real signed heartbeat and is
   approved through Core. A public-SDK execution grant dispatches one harmless
   command. Core commits a resumable claim, but the bridge truncates its reply.
   Electron exits with one encrypted claim intent and no process execution.
2. A second Electron process decrypts the same state and repeats the exact
   claim request ID. The original work is returned and executed once. After
   actual process closure, Core accepts its completion, but every completion
   response in this phase is truncated, including the executor's catch-path
   retry. The final report remains encrypted; the claim is cleared.
3. A third Electron process resends only that final report with a fresh signed
   request nonce. Core returns the same completion digest, the outbox clears,
   and no process or output is replayed.
4. Runner B registers different keys and receives a separate runtime profile
   and execution grant. A real fixture process exits 0. A foreign Workspace
   cannot retrieve Runner A's run through the public SDK.
5. Runner B executes the fixture's exit-7 mode. Core records failure with
   exit code 7 and `timedOut:false`, rather than inventing provider success.
6. Runner B executes a 30-second hold. After its real stdout-start event, the
   public SDK cancels the run. Actual lease/cancellation and native Job closure
   settle before completion. It is not a command timeout or the fixture's
   normal exit 9. Core remains cancelled and the outbox is acknowledged.

Each real run has exactly one nonce-bound stdout-start record. Successful and
exit-7 runs also have one finish record; the cancelled hold has none. All six
Electron processes must exit 0 with twelve output EOFs and no stream failure.
Timeout, forced cleanup, missing output or a bridge error cannot count as pass.

The C# fixture only validates three fixed arguments, writes bounded synthetic
stdout and optionally sleeps. It does not read/write files, use credentials,
open a network connection, create a child process or change registration.
Executable resolution is pinned to its owned temporary `ollama.exe`; it never
discovers or runs the user's real Ollama or other AI CLI.

## Execution And Corrections

Local command from `sps-server/desktop`:

```powershell
$env:SPS_DESKTOP_E2E_SOURCE='1'
node scripts/smoke-workspace-surfaces-desktop.mjs --runtime-discovery
```

The six-phase run exited 0. It reported four native fixture executions, two
independent Node identities, both response-loss recoveries, no duplicate
execution, exit-7 failure and native cancellation. Six component processes
exited normally with twelve EOFs; all three surrounding Main generations also
exited 0 with six EOFs and identity-checked temporary data cleanup. No installed
app/profile or real provider was used. Final-HEAD hosted evidence is separate.

Harness development failures were not Core failures or passes: unsupported
platform capability declarations prevented fixture initialization; a URL before
another Electron argument triggered a pre-entry Windows exit; the early
`--user-data-dir` switch changed the retained argv positions; the outbox stores
`receipts`, not claim `records`; and completion response loss must cover the
executor's immediate second final-report attempt too. These were corrected in
the fixture. No Electron security guard, production assertion, Core receipt
validation or observation deadline was relaxed.

Launch regression tests require the isolated Chromium directory before entry,
the URL as the last argument and exact argv shape. An actual generated SDK
Worker test verifies manifest initialization and all eight data/action routes.
The native fixture test compiles x64 and executes success/failure/invalid modes.
The combined focused Runner/NSIS selection passed7/7. Full `npm run test:ci`
then exited0: serial2/2 and remaining1801total/1798pass/three unavailable-8.3-
alias skips/zero failures, aggregate1803total/1800pass/three skips.

## Remaining Qualification

This closes a specific integration-evidence gap, not overall Core completion.
The final source must still complete the required hosted Windows job and
installed historical recovery gate. Signed-byte/physical-PC release, Production
Identity and actual external CLI credential qualification remain separate.
