# SPS Core Plugin Runtime Contract

Status: implemented in the current Core baseline. This document is the
workflow-neutral contract used by Extension Profile 2.0 plugins.

## Boundary

Core owns technical safety and lifecycle. A plugin owns its workflow meaning.
Core therefore does not interpret a `subjectKey` as an Agent, Task, Room,
role, approval, memory record, or project phase.

| Core owns | Plugin owns |
| --- | --- |
| Host Workspace Source registration and protected Node routes | What a Source means in the workflow |
| Node health, local Runner discovery, runtime credentials remaining local | Which subject may use which approved target |
| Execution grant integrity, queued run lifecycle, streamed logs | Task, Room, worker, automation, review, and approval semantics |
| Artifact record storage and plugin isolation | Artifact classification and presentation |
| Capability enforcement and plugin lifecycle | Human roles and business policy |

## SDK Surface

The worker SDK exposes the following methods through `ctx.sps`.

### Registered Host API Snapshot

The optional initialization `spsHost` snapshot reports `contractVersion: "1.0"`
and registered public Runtime/Agent-session RPC names. It is distinct from the
Worker callback `supportedMethods`. The public Runtime helper
`readSpsHostSupport(initializeParams)` validates and copies this snapshot without
calling the Host. An older Host or unknown contract gives `state: "unknown"`;
missing APIs in a reported snapshot are not registered in that snapshot.
Unknown future method names are not treated as recognized support.

This is **registration only**, not the calling plugin's granted capabilities,
Workspace/Agent/Node access, configured resources, live health or readiness.
The real Host gates remain authoritative on every call. There is no automatic
retry, backend substitution, capability grant or execution. A Worker without
`sps.runtimes.read` may see a registered method name but cannot call it. The list
contains no secrets, paths, endpoint or tenant identifiers and is regenerated
on Worker restart. Direct model API/OCE/secret APIs are not advertised; actual
backend-specific negotiation remains a later contract.

### Safe Agent Execution Descriptor

`platform.agents.describeExecution(agentId, companyId)` uses the registered
`agents.describeExecution` RPC and existing `agents.read` capability. The public
Worker requires the authenticated invocation Workspace to match; Core still
enforces its capability and tenant checks. Old Hosts do not advertise this API;
consumers must not substitute legacy `agents.list` as an equivalent safe result.

The descriptor contains only Agent ID/adapter identifier, configured/disabled/
unknown state, registered/unavailable adapter status, routing owner, cached Node
observation, `authorization: "recheck_on_dispatch"`, and `readiness: "unknown"`.
Registration is not login, health or execution approval. An `adapter` owner is
delegated routing, not a claim of local Host execution. Existing Node bindings
are authoritative; a foreign/missing bound Node is unknown without its ID.
Revoking a Node may remove the binding, so later reads describe the resulting
adapter route without starting any work or providing an automatic fallback.

No adapter config, cwd, environment, keys, prompt, workflow role or raw status
error is returned. The compatibility Agent list/get behavior stays unchanged;
this is not a blanket claim that legacy read APIs have the same safe projection.
Inspection never creates a session, grant, run or provider probe. Actual backend
capability negotiation and per-run environment/Source readiness remain separate.

| API | Capability | Safe result |
| --- | --- | --- |
| `workspaceSources.list(companyId)` | `sps.workspaceSources.read` | Source id, display name, status, route availability. Never a Host path or credential. |
| `runtimes.list(companyId, options)` | `sps.runtimes.read` | Node and Runner metadata. Provider credentials remain on the Node. |
| `executionGrants.list/upsert/revoke` | `sps.executionGrants.read` or `sps.executionGrants.write` | A plugin-owned technical allowance keyed by `subjectKey`. |
| `runs.dispatch` | `sps.runs.dispatch` | Queues the selected Runner through an active grant. The plugin cannot choose a raw command or working directory. |
| `runs.get/list/listEvents` | `sps.runs.read` | Own-Plugin Run status, bounded list and ordered stdout/stderr events. |
| `runs.cancel` | `sps.runs.cancel` | Cancellation request; claimed work remains pending until the signed Node confirms completion. |
| `executions.list/get/summarize` | `sps.executions.read` | Own-Plugin safe cross-lane technical history/usage, not a bill or workflow acceptance. |
| `artifacts.publish` | `sps.artifacts.write` | A title, summary, structured data, and optional `https` reference. |
| `artifacts.list` | `sps.artifacts.read` | Only artifacts published by the calling plugin in that company. |

### Cached Node Connection Metadata

`runtimes.list` retains its existing RPC and capability. Its optional
`connection` field contains only `executionOwner: "node"`,
`authorization: "execution_grant_required"`, `state`, and `observedAt`.
There is no new endpoint, database table, or permission grant.

- `recently_seen`: active, key-verified Node with a valid, non-future heartbeat
  within two minutes.
- `inactive`: Node is not active, including pending or revoked Nodes.
- `unverified`: active Node has no valid key-verification timestamp.
- `offline`: the valid last heartbeat is older than two minutes.
- `unknown`: missing, invalid, or future heartbeat; an older Host may also omit
  the whole field, which consumers must treat as unknown.

This is a cached Host observation, not a live socket/provider probe, CLI login,
Runner readiness check, or execution authorization. `observedAt` records the
valid historical heartbeat even for an inactive Node; invalid/future evidence
is omitted as `null`. The legacy `online` boolean retains heartbeat-only liveness
regardless of approval: it may remain true after revocation until the heartbeat
expires. Missing, invalid and future heartbeats are false. Existing credential
and availability fields stay separate.
Execution still requires an active grant and current dispatch checks. Listing
does not create grants or runs and cannot expose another Workspace through an
inconsistent Node/Runner association. This Node-only addition is not a generic
model/Agent/OCE backend registry.

The retained `ctx.secrets.resolve()` signature returns a string and requires
`secrets.read-ref`, but the current Host handler deliberately refuses resolution
until explicit company-scoped config/runtime bindings exist. The Profile's
`secrets.use` declaration is not a working handle-only credential broker or a
guarantee that arbitrary plugins cannot read a same-user Vault. Do not enable
this legacy interface as a Direct API/OCE shortcut. The current multi-backend
target and its unimplemented broker are described in the
[workstation plan](MULTI-BACKEND-WORKSTATION-PLAN-ko.md).

## Execution Lifecycle

1. A plugin lists safe Sources and Runtimes.
2. The plugin creates an execution grant for its own `subjectKey`, a specific
   approved Node Runner, and optionally one Host Source.
3. The plugin dispatches arguments through that grant. Core derives the local
   CLI command from the Runner kind; it does not accept a plugin supplied
   executable or a raw local path.
4. The target Desktop Node claims the separate `plugin-runs` queue using a
   signed request. It checks the grant again before it starts, while it runs,
   and before completion is accepted.
5. If a grant, Node, Runner, or Source is revoked, queued and running work is
   failed or stopped. The plugin can publish an artifact record for any
   outcome and apply its own review policy.

## Source and Artifact Safety

- A Host local folder is stored only in the Host Desktop mapping.
- A Member Node receives a route only when the Host enabled sharing and its
  encrypted Node grant is active.
- A plugin never receives a Source path, a share credential, or a provider
  credential.
- Artifact references accept only absolute `https` URLs. Use `summary` and
  `data` for portable work-product metadata. Host-local file attachment and
  rendering policies are deliberately left to workflow plugins.

## Extension Profile 2.0

Declaring a primitive is not a permission grant. The Profile validator checks
that the matching capability is present:

| Primitive | Required capability |
| --- | --- |
| `workspace.sources.metadata` | `sps.workspaceSources.read` |
| `workspace.sources.route` | `sps.workspaceSources.read` |
| `runtimes.list` | `sps.runtimes.read` |
| `runtimes.dispatch` | `sps.runs.dispatch` |
| `runs.observe` | `sps.runs.read` |
| `runs.cancel` | `sps.runs.cancel` |
| `executions.observe` | `sps.executions.read` |
| `artifacts.write` | `sps.artifacts.write` |
| `secrets.use` | `secrets.read-ref` |

`workspace.sources.route` is intentionally indirect: a plugin declares that
it supports routed Sources, while Core releases the route only to the chosen
Desktop Node during a grant-backed run.

## Compatibility

Desktop currently accepts Extension Profile 1.0 and 2.0. Profile 1.0 is a
temporary compatibility bridge for older Paperclip-derived packages. New
workflow-neutral plugins should use Profile 2.0 and this contract.

## Core Marketplace and Plugin Builder

SPS starts a new Workspace without a mandatory workflow plugin. Core owns the
Marketplace search, plugin detail, and Marketplace Assistant surfaces under
Settings > Plugins.

Ordinary catalog search does not require AI. For conversational comparison and
recommendation, Core dispatches the turn through an AI adapter the current user
is authorized to use. The Assistant session is scoped to the user and Workspace.
Core exposes only `search_marketplace_plugins` and `get_marketplace_plugin` to
that Assistant. Results contain normalized catalog metadata and an internal
detail id, never a raw package path, credential, signing key, or download URL.

The Marketplace Assistant has no install, activation, update, disable, remove,
Registry stage, or lifecycle-proposal tool. Only the physical Host can change
plugin lifecycle state through Settings > Plugins and the existing Host proof.

`Plugin Builder` is a separate bundled plugin. It may create an external plugin
project, run SDK validation and tests, open an isolated Preview, and produce a
package or Local Registry release. It does not perform lifecycle actions. The
catalog snapshot capability remains available to other opting-in plugins only
as read-only verified metadata and grants no package, Source, secret, database,
or environment authority.

## Technical Team Access

Core provides a Host-owned technical invite flow so another person can sign in,
join a Workspace, and connect an SPS Desktop Node. The invite carries the full
Desktop join address as well as its one-time credential, so a new computer does
not need to know the Host address first.

This is not a universal product role system. The compatibility backend stores a
minimal membership value while the public Core surface calls the person a
Member and does not expose Viewer, Operator, Admin, or Owner choices. An
enabled plugin may define and enforce its own human roles, approvals, and
permissions independently.

When SPS Core Baseline mode is active, the legacy membership-role and
grant-management API routes are unavailable as well. The same boundary closes
the legacy built-in-agent routes, even if a migrated instance still has its
old experimental flag enabled. This is a boundary, not only a UI
simplification: a plugin must keep its workflow policy in its own state
instead of repurposing Core's technical Member record or Paperclip built-ins.

Host-only means the physical Owner Host Desktop, not a remote account that
happens to have a legacy instance-admin flag. The local Workspace attaches a
second, launch-scoped Host proof only to these narrow technical Core routes;
remote Member Workspaces and ordinary browsers never receive that proof.
The Desktop main process uses the same two-proof contract when it creates,
lists, or revokes a technical Member invitation, stages or enables a Registry
package, reads Registry stages, or creates an Owner Vault backup. The visible
Team access screen and native Host utilities therefore have one authority rule.

Host-only technical operations are intentionally narrow:

- create or revoke an unused Member invitation;
- approve or revoke a connecting SPS Node; and
- list or remove a connected technical Member; and
- register the named local Workspace Sources that a plugin may reference.

Members may operate only through an active Core route and plugin-owned policy;
they never select or replace a Host-local folder from their own computer. An
enabled plugin can add its own workflow roles without gaining or redefining the
Core Host proof.

Removing a technical Member archives the Core membership record for audit,
then revokes every Node owned by that person. Node revocation also closes active
Runner, Agent, Host-share, and Workspace Source grants, stops eligible queued
or running Core execution, and removes active bindings. The operation does not
interpret or delete plugin workflow records: a plugin retains responsibility for
its own task, room, review, and history policy.

When a removed person's SPS Desktop next contacts its Node route, Core returns
the `sps_technical_member_removed` signal. Desktop stops local execution,
clears that remote team connection, and returns to setup. This differs from a
Node-only revocation, which may create a new pending Node for the same still
connected Member.
