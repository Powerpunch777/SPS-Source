# Native Node integration — 2026-10-27

Development integration on Source `db8738b` / Core `5d36f347` / public SDK
`607b48a4`. These identify the starting commits; the final changed tuple belongs
to the containing Source commit and support matrix. Native remains opt-in and
disabled by default. Tailscale remains the supported release transport.

Core implementation is committed at `74de85829057a11783fd640d9ddefc37909cfa91`.

## Product behavior and ownership

Core Settings now offers a Native Node connection for an approved Member's
selected Host and Workspace. Main confirms the action, keeps separate protected
Ed25519/RSA Node keys, and uses the retained Member target and mTLS credentials.
It persists the encrypted identity before registration so an interrupted reply
can be reconciled with the same key. A new Node is still pending until Host
approval. Neither Member enrollment nor heartbeat grants Agent, Plugin, runner
or Source execution authority.

Core exposes only the fixed Native Node POST through its private owned channel.
Every request binds actual TLS/session/device/Workspace evidence and the exact
body. The shared Node service retains the existing signed operations, approval,
current grants, lease and output sequence checks. Native bindings are immutable;
device deletion cannot discard a binding while retaining the approved Node.
Native re-registration does not create additional runner grants or change the
runtime kind of an already registered runner key. Source transport keys cannot
be silently replaced. Restore removes Native bindings before device/Node trust.

The controller claims existing commands and Plugin runs through this closed
transport and uses the existing local command runner. It never accepts a
renderer-selected command, executable, backend, filesystem path or signed body.
Source work keeps the Host-issued Source route/grant and encrypted credential
boundary. Work requiring general Agent/MCP API transport fails closed because
that API is not supplied by the Node channel. No local Source fallback is added.

## Lifecycle and failure behavior

Long execution keeps a separate heartbeat while the command runner awaits its
process. Heartbeat authority loss stops that exact owned command. Disconnect,
account change, restore and shutdown fence admissions and join owned cleanup.
Unconfirmed process cleanup retains its handle, displays unavailable and blocks
a replacement. A disconnect during confirmation/recovery also fences the pending
connection before an identity exists. Another account cannot see the previous
account's Node status. Recovery-only Core Settings startup does not automatically
resume saved Nodes; an explicit connect action remains available.

On Windows a process that already exited while Host completion is pending no
longer owns its numeric PID. Cancellation does not send taskkill to that terminal
PID. This avoids treating a failed kill of an exited process as failed cleanup
or targeting a reused PID; arbitrary descendant isolation is still unqualified.
Exact command IDs are additionally bound to a Main-only ownership token. Two
Hosts may use the same UUID: rejecting B's duplicate execution must never let
B's error cleanup cancel A's already running command. Global Desktop shutdown
retains its deliberate stop-all behavior.

Saved enabled Nodes can reconcile registration once per account generation on
normal startup. Ambiguous claims/actions are never automatically retried. Native
does not use the legacy ten-minute claimed-command requeue. Local disconnect
stops local work and disables automatic resume while retaining keys; it is not
a claim of Host revocation, distributed cancellation or undone external effects.

Ordinary Desktop quit and updater handoff continue to share the existing drain.
The two old CI contract checks now verify that composition instead of requiring
the previous inline shutdown code. Their existing coordinator/drain tests still
verify failure handling, ownership and cleanup behavior.

## Focused evidence and failed attempts

No full local suite, full Core build or manual full CI rerun was started.

- Protocol/client/ingress/private-parent/proof selections: 90 passed after an
  initial Node body validation assertion was repaired. Other surface budgets
  were not widened.
- Core fixed Node proof/HTTP cases: two named cases passed, 23 unrelated skipped.
  `work/native-node-private-boundaries.log`.
- Node state/controller and state migration checks passed in earlier affected
  selections; old settings migrate to version13 and corrupt Node state is
  preserved rather than silently replaced. Windows link fixtures have explicit
  unsupported skips.
- Account/restore drain gate: 9 passed, `work/native-node-account-drain.log`.
- Real owned-process scope: cancel A while B stays alive, then clean B, one
  passed, `work/native-node-command-cancellation.log`. No unowned process killed.
- Quit/drain contract follow-up and existing behavior cases: 11 passed,
  `work/desktop-quit-drain-contract-focused.log`.
- Long heartbeat/controller initial run: 6 passed / 1 failed because the new
  long-running fixture omitted its cancellation dependency during disposal.
  Preserved in `work/native-node-heartbeat-controller.log`. Corrected fixture
  then passed7. After the pending-connect disconnect fence, all8 passed at
  terminal65369, `work/native-node-controller-selection-final.log`.
- After the ownership-token and terminal-PID fixes, controller8 plus actual
  process3 cases passed together11/11, terminal17994,
  `work/native-node-command-ownership-final.log`. This includes duplicate IDs
  across different owners, completed-process pending delivery, and scoped A/B
  cancellation. A subsequent static Luna review found no additional blocker in
  that wiring; it is not a general security certification.
- Final authority changes passed the custom changed-service TypeScript config
  at terminal73557 (exit0, no diagnostics). Its earlier pnpm invocation66225 was
  interrupted and is not counted as a pass. This is not a full workspace
  typecheck claim. Restore sanitizer's affected non-DB file passed9/9.
- Core runtime DB unit run timed out during embedded PostgreSQL startup at
  180 seconds: zero assertions, three skipped. The existing Node route file
  also timed out at startup (20 seconds, then120 seconds): zero assertions,
  final28 skipped. These are failed runs, not passing runtime/compatibility
  evidence. No separate repeated DB unit run was started alongside the joined
  harness.
- Joined Node smoke initially failed under direct Node because Core TypeScript
  needs the existing TSX loader. A wrong working-directory attempt also failed
  before the DB harness. With the loader, the initial joined attempt reached
  `connect` but failed; its log is retained at
  `work/native-node-smoke-2026-10-27.log`. Subsequent diagnosis and acceptance
  results must be recorded below before claiming the vertical flow passed.
- Two diagnostic retries also failed at Node response parsing after session
  exchange. Inspection found a real producer/consumer contract mismatch: Main
  ingress supplied an extra `request` field to the closed parent-channel input,
  then wrapped Core's already-wrapped `{data}` response again. Ingress now sends
  only the six accepted private fields and forwards the single Core envelope.
  The affected ingress and parent tests passed2/2 after their mocks were aligned
  with the actual private contract, `work/native-node-ingress-parent-contract.log`.
  The original isolated tests had accepted the incorrect mock shape, so their
  earlier passing result did not establish joined interoperability.
- After that repair, joined run60002 exercised actual registration/heartbeat,
  pending-command denial, approval plus execution grants, a real owned Node
  canary process, persisted stdout/stderr and successful completion. Foreign
  Workspace registration was denied without creating a Node, and revoking the
  Node made the controller unavailable. The process exited1 at the old final
  assertion that the fixture had zero Nodes/Agents, which this new scenario
  intentionally retains. The assertion now checks the exact fixture rows and
  revoked status. This run is not counted as a clean passing acceptance.
- Final corrected joined run19444 passed the same scenario and exact retained
  fixture-row checks, then naturally closed the directly owned Core child and
  completed owned PostgreSQL/temporary-workspace cleanup. Log:
  `work/native-node-smoke-2026-10-27-final.log`. Its two invalid-response markers
  are the deliberately denied foreign-Workspace and revoked-Node requests.
  A post-run process query found no matching smoke/owned PostgreSQL process.
  The generic final console summary was subsequently corrected for Node mode
  (one fixture Agent/revoked Node, zero Plugins); that text-only change was syntax
  checked without repeating the acceptance.

The joined invocation was `pnpm exec tsx
../../../../sps-server/desktop/scripts/smoke-native-workspace-channel.mjs
--isolated-native-workspace-channel --with-native-node` from
`external/sps-core/packages/db`. This exercises real TLS, private proof, Core
authorization, migrations and signed execution records. Main-only module logic
runs under Node in this scenario; it is not an Electron Node-window scenario.
Identity exchange/Owner approval are fixtures, key storage is an in-memory
encrypted-capsule substitute, and the selected executable is an owned Node
canary in a canonical temporary workspace. No real AI/CLI credentials are used;
the runtime metadata uses `agy_cli` while executable resolution is deliberately
injected. This does not qualify actual agy/Agent backend or SMB execution.

The current committed baseline's hosted run40449786628 passed Core Linux types,
build and every Core test shard, including the repaired recovery-startup
fixtures. It failed the production Zod High gate and the two old Desktop quit
contract checks. That hosted result does not include this uncommitted Node
integration. Local repairs are not a claim of a subsequent green hosted run.

## Limits and rollback

The public SDK remains the separate minimal `connectivity.current()` surface;
Node management is Main/Core system functionality. Plugin connection management,
navigation/streams/full SDK compatibility remain incomplete. AI is optional and
no actual external AI provider has been qualified by this Node work.

Source canary execution, injected fixture workspace/invocation and substituted
Identity exchange cannot qualify a real Agent CLI, Windows SMB, DPAPI production
profile, installed runtime, physical Host/Member/Node LAN or signed update/restore.
Workspace-wide pause/stop/resume, OS Worker/CLI isolation, CA rotation/expired or
lost-key recovery, actual AI/backend usage, production Identity and release gates
remain separate work. Zod High is unwaived; the historical major-migration hold
is preserved. No security gate is weakened.

The new DB tables are additive. Keep them and version13 protected settings when
rolling back code; do not delete keys or infer that older binaries understand
the new state format. Use an explicitly compatible candidate or preserved backup
for rollback. The existing Tailscale path and user data are retained. This work
does not change Marketplace policy, Builder structure, installed applications,
customer credentials, firewall rules or OS trust. No merge or release.

Core details: `external/sps-core/doc/SPS-NATIVE-NODE.md`.
