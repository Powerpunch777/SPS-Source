# Windows Owner Host job supervision — 2026-10-27

Desktop 0.4.137 remains a development candidate. This Source increment adds
Windows process-tree ownership to Owner Host/Core while preserving physical
Main→Core Node IPC and the independent stop-only pipe. Core stays pinned to
26a2d106e3d9f90553608f73c8b57ed344ce3d49 and public SDK to
607b48a4edaed1db7132a01719431ffce5852964. Native stays off by default; the supported
release transport remains Tailscale.

## Ownership and admission

The trusted Main prepares a retained KILL_ON_JOB_CLOSE Job through the bundled
C# helper, then raw-spawns the real Core child with its existing IPC fd3 and stop
fd4. A trusted --import gate blocks Core entry until admission. The private
local-only first-instance named pipes require the current Windows user/SYSTEM
ACL, expected Main pipe-client PID and nonce. A second gate pipe verifies the
actual Core pipe-client PID, attached PID and canonical FILETIME creation time
against a retained, live process handle before AssignProcessToJobObject.

The gate removes only its private environment and own preload arguments.
File-based Worker threads may inherit Node's cached preload arguments, so they
skip re-admission in the already-owned process and clear those arguments. The
native canary requires a real file Worker's response, rather than treating
Worker construction as evidence it ran. Trusted tsx require hooks precede ESM
imports; the admission promise covers Core entry, not all trusted bootstrap JS.

Natural Core exit and requested cancellation require actual activeProcesses=0,
a matching helper close and the actual ChildProcess.close. Confirmation loss
stays unconfirmed. Main retains the owned child/job while stopping and prevents
replacement. No discovered PID/taskkill fallback is used for supervised children.
Startup and stop join outstanding preparation. Failed initial pipe connection
uses the same bounded helper-close path; unconfirmed cleanup returns an internal
ownedHostJob handle for retention/retry.

## IPC revocation and close accounting

The first real Host run failed because a file Worker re-executed the preload with
already-cleared configuration. Later runs reached Workspace control but failed
normal Desktop shutdown. Closing fd4 on actual Core exit and draining stdout/
stderr was insufficient: all those streams could close while ChildProcess.close
remained absent.

Inspection of Node v24.16.0's bundled internal/child_process source identified
the missing accounting: parent-side child.disconnect closes IPC without reaching
the EOF branch that accounts for the IPC close slot. Signer disposal had called
disconnect before Core exited.

A trusted disconnectOnDispose option defaults to true. The job-owned Host opts
out of physical disconnect, including account invalidation, while still marking
the signer closed, removing listeners, aborting pending operations and disposing
the signer. No new request or late result can regain authority. Core EOF then
closes the actual transport. Main likewise avoids parent disconnect on supervised
Core exit. The independent stop pipe is retained until Core exit.

Shutdown drain now emits fixed, allowlisted stage and manager outcome events in
the existing E2E-only trace. Raw errors, names, paths and credentials are excluded;
diagnostic exceptions cannot interrupt cleanup.

## Integration and packaging

Owner Host uses the helper by default for actual Windows spawning. Trusted fake
spawn injection and non-Windows paths preserve their existing contracts. Main
projects stopping as pending confirmation. The helper and gate are packaged
outside app.asar; build-time preparation compiles the helper, never installed
runtime startup. Packaged verification is wired to bundled Node, IPC, Worker,
stop pipe and descendant completion, but has not been run on a new packaged app.

Native Node TLS test failures also now identify a safe request phase. A local
selected pass does not establish the cause or resolution of CI ECONNRESET.

## Evidence and limits

No full local suite/build or manual full CI rerun was started.

- Host client fake tests: 8/8 after connection-failure retention correction.
- Signer channel: 7/7, including pending abort, no future request, no late output
  and transport preservation.
- Owner Host selected management/compatibility cases: 9/9, including retained
  termination, signer revocation with IPC preserved and independent fd4 shutdown.
- Packaging/configuration/drain/Core Settings/preload contracts: 50/50.
  Drain alone also passed its selected 5/5.
- Final native Host file: 4/4 PASS, zero skipped, after startup cleanup correction.
  These cases proved natural IPC/stop/file-Worker/descendant
  completion, cancellation, control loss remaining unconfirmed and creation-time
  mismatch denial. The mismatch test is not a real PID-reuse race.
- Actual source Electron/Core execution-control session48374 EXIT0:
  zero Agents; actual windows_job ownership reported; pause/stop; stale revision
  denial; separate Workspace independence; stopped epoch/revision survived Main/
  Core restart; resume accepted new work without replay. Both Main processes
  exited0; four output streams ended; final shutdown graceful=true,
  forceStopRequested=false. Fixture Main/output/data cleanup was confirmed.
  Log: task-local host-job-ipc-eof-desktop-2026-10-27.log. Screenshot:
  host-job-ipc-eof-desktop-2026-10-27.png was visually checked.
- Final local Desktop Node synchronization succeeded after the startup-failure
  cleanup change. That change has independent fake coverage; the successful
  Desktop run used the preceding normal-admission-equivalent client copy.

Earlier actual failures remain in host-job-desktop*, host-job-desktop-worker-fixed*,
host-job-desktop-diagnostics* and host-job-desktop-parent-pipe* logs. They are not
counted as passing, nor is a forced Main exit treated as graceful.

Committed parent71d177f CI40507243358 passed Core full Linux types/build and all9
Core Linux shards. It failed Windows Native Node TLS ECONNRESET and unwaived
Zod High1243066. This is not CI qualification of this new increment. Existing
UI token79/36/1 debt and the Zod major hold remain.

## Remaining product work

A Job Object is process-tree containment, not filesystem/Vault/network isolation
or per-Workspace Worker isolation. Optional Memory sidecar uses its separate
manager. Existing orphan processes with unproven ownership are not adopted.
Actual new packaged/lifecycle/Native Member UI acceptance, physical Windows
Host/Member/Node LAN+SMB, trust-loss/CA/PC replacement, actual AI providers and
production Identity, signed install/update/restore and same-tuple release gates
remain. No OS trust/firewall/installed app/customer data change, security waiver,
merge, release or npm publication occurred. Marketplace policy and Builder
structure are outside this increment.

Coordinated by OpenAI Codex with GPT-6 Luna high agents, including retries after
usage limits, as requested.
