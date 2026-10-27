# Windows owned command Job Object supervision

Windows Desktop Node commands now use a bundled, locally built C# supervisor
instead of relying on a PID tree lookup for normal command ownership. This is
process-tree containment. AppContainer, Vault, filesystem and network isolation,
and Core Plugin Worker integration remain separate required work.

## Ownership and private channel

The helper creates a random first-instance overlapped named pipe with a protected
current-user/SYSTEM DACL. It verifies the client's process ID against its expected
Node parent; the parent verifies the per-launch nonce before sending any command
manifest. The manifest is bounded and closed. It contains an absolute executable,
arguments, working directory and the existing runner's filtered environment. No
Hub field selects the helper or its private channel, and command secrets are not
written to diagnostic output.

The pipe also explicitly rejects remote clients using PIPE_REJECT_REMOTE_CLIENTS
as defined by [CreateNamedPipeW](https://learn.microsoft.com/en-us/windows/win32/api/namedpipeapi/nf-namedpipeapi-createnamedpipew).
Same-account network access is not a substitute for local parent ownership.

The helper creates the command suspended, explicitly inherits only its duplicated
stdin/stdout/stderr handles, assigns the command to an unnamed retained Job Object
with KILL_ON_JOB_CLOSE, then resumes it. The child does not receive the Job Object
or control pipe handle. The runner retains existing signed command, Source grant,
lease, runtime allowlist and per-connection ownership checks.

Natural CLI exit terminates remaining descendants in that job. Cancellation uses
the retained job handle. Both paths require a successful active-process count of
zero before a terminal frame. Natural completion and cancellation choose one
terminal winner under the same lock. The accounting structure includes the
native TotalPageFaultCount field; omitting it incorrectly reads cumulative process
count as the active count.

The Node wrapper checks exact fields and hello/ready/terminal order, joins the
terminal frame with the actual helper exit code, and handles valid terminal-pipe
close and pipe/helper delivery ordering. A natural exit racing a cancel releases
the cancel waiter with the actual exit result. It does not relabel it cancelled.
Startup, cancellation acknowledgement and post-ack helper close are bounded.
Failure closes the channel and can stop only the exact owned helper ChildProcess;
this invokes job-handle crash cleanup but never substitutes for a zero-active ack.
Lost confirmation remains unconfirmed after helper exit and cannot trigger a PID
retry or Source unmapping/completion. Parent loss is observed through pipe EOF.

## Runner and build composition

`desktop-node/src/command-runner.mjs` uses this path by default on Windows. A
missing helper rejects command preflight; there is no taskkill fallback for a
supervised command. Its command execution budget starts when the child has joined
the job and resumed; helper startup has its own bounded deadline. POSIX command
groups keep their existing path. Local test injection at spawn/termination
boundaries is never selected by remote command JSON.

The build script compiles the versioned source using the Windows .NET Framework
compiler. Desktop source dependency synchronization builds before copying the
local Node package, and Node package pretest prepares the helper on Windows.
Installed runtime does not invoke a compiler. Electron packaging places the
helper outside app.asar in resources/sps-windows-job-supervisor. The packaged
runtime verifier executes the packaged helper with the bundled Node executable
and requires matching stdout and a successful empty-job acknowledgement.

The binary is ignored in Git. Signing and installed product validation remain
release requirements; build/config checks are not installed-release proof.

## Focused verification

- Native helper input/platform, natural CLI descendant cleanup and cancellation:
  3/3 passed in one focused run.
- Actual Node stdin/stdout/stderr with Unicode plus an unreferenced descendant,
  and running Node parent/descendant cancellation: 2/2 passed separately.
- Final rebuilt helper after explicit remote-client rejection passed the entire
  focused native canary file: 5/5, with no skipped cases.
- Wrapper fake-helper cases: 7/7, including stalled startup, protocol order/shape,
  lost cancel ack, natural/cancel race, signed/DWORD exit codes, pipe/helper close
  ordering and missing helper close.
- Owned process termination: 8/8. Terminal helper PID is never probed/signalled
  again, and missing ownership confirmation remains a failure.
- Executable/npm resolver: selected 4/4.
- Runner timeout, duplicate/concurrent IDs and Source lifecycle: corrected
  focused command passed 13/13. The earlier four-file run passed 15/19; its four
  failures were fixed by separating helper startup from execution timeout,
  allowing fixture marker observation across supervisor startup and converting
  the old taskkill failure fixture to a retained-handle confirmation failure.
  The earlier usage/retry and Native connection cancellation cases passed 6/6
  within that initial run; no clean combined 19-case rerun is claimed.
- Packaging/release config and local dependency sync configuration: 16/16.
- Selected syntax and diff checks passed. No full local suite/build or manual
  full CI rerun was started for this increment.

The first pipe implementation used an unsupported Framework constructor option;
the final implementation uses CreateNamedPipeW with the required flags and wraps
the owned SafePipeHandle. Early canary attempts failed or timed out. A fixture
that held a referenced descendant prevented its own natural exit; it now unrefs
that descendant and has an explicit bounded wait that reaches owned cleanup.
One interrupted canary's marker-only temporary fixture remains preserved because
automatic command review rejected even the scoped cleanup before dispatch. No
remaining helper process was reported by the native canary owner.

## Evidence limits and next work

Actual packaged helper execution has not yet been run locally after this change;
the verifier and packaging configuration are connected for the next Windows build.
This does not certify physical LAN/SMB, supported external CLI or AI providers,
production Identity, signed install/update, restore, or general Plugin sandboxing.
Core Plugin Worker still needs suitable IPC-preserving OS containment. Existing
Workspace execution state and pending acknowledgements remain authoritative.

The Owner Host/Core child also still uses its existing raw-spawn IPC/stop-pipe
composition. Its direct Core and PostgreSQL exit observations do not establish
that all DB descendants ended. A separately observed PostgreSQL io_worker with a
missing parent was left untouched because its exact launch ownership could not
be proved. Do not retroactively attach or kill a discovered PID. Follow-up Host
job containment must preserve Node IPC, Native signing and the private graceful
stop channel, and prove zero owned descendants before releasing the Host runtime.
