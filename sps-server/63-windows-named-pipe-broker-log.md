# Windows Named Pipe Direct Task Broker

## Status

Implemented and verified as a disabled-by-default local execution transport.
The matching SPS plugin client and Project Hub Agent Room selector are
now deployed, while production broker and plugin launch configuration remain
absent.

## Purpose

The installed SPS runtime intentionally rejects plugin secret references
until company-scoped configuration and bindings are available. The broker
preserves the SPS-first operating model without changing SPS core
or placing a bridge token in plugin configuration.

## Boundary

1. A SPS plugin worker will eventually submit a bounded request through a
   local Windows named pipe.
2. The broker creates that pipe with an ACL granting only the current Windows
   user read/write access and uses `FILE_FLAG_FIRST_PIPE_INSTANCE` to reject a
   pre-created pipe of the same name.
3. The broker validates the Task Room, its Agent Room parent, Company, Project
   Hub, optional Goal, role, workspace mapping, and `.uproject` selection
   before forwarding a request.
4. The broker starts the existing loopback Direct Task Bridge as a child and
   gives it a random in-memory token through child-process environment only.
5. The broker injects that token into its own loopback request. The Bridge
   removes the token, runtime config path, and runtime state path before
   spawning the external `agy.exe` PowerShell worker.
6. The existing Bridge retains its tested job records, structured close-result
   contract, audit log, idempotency, and SPS finalizer behavior. It now
   invokes the worker with `-ProposeCandidates`, preserving candidate-only
   memory handoff.

The local configuration stores only enabled state, pipe name, loopback
SPS URL, Node executable, bridge port, timeout, and explicit
Company/Project/Goal/workspace mappings. It rejects any persisted
`bridgeSecret` field. The child runtime JSON also contains no secret field.

## Trust Model

The ACL protects the pipe from other Windows users and the first-instance flag
reduces pipe-name pre-creation risk. This remains a same-Windows-user local
trust boundary; it is not a defense against malicious processes already running
as the same user. The loopback Bridge is not a public endpoint and its token is
not persisted in SPS, plugin config, local broker config, or job files.

## Verification

- `node direct-task-bridge/test.mjs` passed after adding runtime environment
  configuration, state-directory isolation, worker environment scrubbing, and
  candidate-only memory proposals.
- `direct-task-pipe-broker/Test-DirectTaskPipeBroker.ps1` passed. It verifies
  first-instance pipe creation, broker child startup, a `health` request, a
  fail-closed unsupported operation, bounded shutdown, and absence of a
  persisted bridge-secret field.

## Remaining Gate

The transport, plugin client, and Agent Room UI are complete and source/live
verified. The next gate is explicit no-secret broker configuration for the
bound Unreal workspace and one deliberate read-only end-to-end Task Room.
