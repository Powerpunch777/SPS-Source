# Windows Protected Plugin Integration Plan

Status: proposed product integration sequence; this document does not change the
current Plugin contract or claim that protected execution is implemented.

## Current boundary

Core currently starts an ordinary same-user Node child process. Its reduced
environment limits inherited secrets but does not restrict filesystem access.
The worker manager is keyed by Plugin ID, so invocations from different
Workspaces can share a process and its memory/lifecycle.

The existing AppContainer Node/SDK canary is development evidence only. It uses
temporary profiles and fake files, exercises a fixed worker fixture, and reports
`productIsolationImplemented:false`. It does not initialize or route a real
product Plugin through the Core worker manager, and does not establish a product
file, Vault, UI/IPC, or CLI boundary. Keep it as launcher-mechanism evidence;
do not use it as product isolation acceptance.
The latest probe reaches SDK initialization and a fixed fake host call with
explicit Node module-path flags, but direct child-process pipe creation fails.
The complete result and runtime constraint are recorded in
[the Node/SDK probe evidence](APPCONTAINER-NODE-SDK-CANARY-2026-10-28.md).

## Staged integration

1. **Establish the vertical SDK baseline.** First complete the separate Windows
   Node + public SDK probe through initialization and one permitted host call.
   Record the supported Node/SDK and Windows versions. Do not begin launcher
   integration until that probe is reliable; it isolates SDK/runtime startup
   compatibility from policy and filesystem enforcement.

2. **Define the public request and consent contract.** Add a versioned,
   typed execution profile to the public Plugin manifest/SDK contract for
   requested OS resources (such as workspace file roots, child processes, and
   network access). Resolve it to an operator-approved grant with exact scope;
   existing Plugin `capabilities` continue to mean host API permissions and
   must not stand in for OS permissions. Define compatibility negotiation:
   older Hosts must reject an unknown required protected profile, not ignore it.
   Candidate contract touchpoints are
   `external/sps-core/packages/shared/src/types/plugin.ts`, the shared plugin
   types/constants, `external/sps-core/doc/plugins/PLUGIN_SPEC.md`, and the
   public SDK types/docs.

3. **Persist immutable, scoped policy.** Bind each resolved grant to the
   installed Plugin, Host, Workspace, execution profile, and immutable policy
   generation. The generation identifies the exact roots and rights used by an
   execution; changing consent or policy creates a new generation and revokes
   the old one. Recheck the generation at admission, launch, and any brokered
   operation. Keep grants separate across Workspaces even when installation is
   global. Candidate Core touchpoints are the plugin registry/loader and a
   dedicated execution-policy service/store; do not place this state in a
   workflow-owned plugin database.

4. **Replace ambient secret delivery with a broker.** Audit the privileged
   provider-key, memory-token, and loopback-token paths in
   `external/sps-core/server/src/services/plugin-loader.ts`. Protected workers
   should receive narrow, audience-bound broker handles rather than raw Host
   secrets or broad environment access. Bind each handle to Plugin, Workspace,
   run, policy generation, operation, and expiry/revocation. Keep the legacy
   secret path available only inside the explicitly selected legacy lane while
   migration requires it.

5. **Launch under the approved Windows identity.** Add a product launcher
   boundary used by `external/sps-core/server/src/services/plugin-worker-manager.ts`.
   It must create the worker under the approved AppContainer or restricted
   identity, apply only the exact approved filesystem grants, verify the
   resulting token before resuming the process, and place descendants in a Job
   Object for tree lifecycle control. Job assignment is not filesystem
   protection; ACL/token enforcement, breakaway behavior, external daemons, and
   supported CLI behavior need separate evidence. If the requested profile or
   OS operation is unsupported, return an explicit error and do not retry the
   same-user launcher.

6. **Make worker identity and cancellation Workspace-scoped.** Replace the
   Plugin-ID-only runtime identity with at least
   `(pluginId, workspaceId, policyGeneration)` for protected executions, and
   carry that identity through start, RPC routing, restart, stop, and revoke.
   Validate the caller's Workspace and generation on each route. A stop or
   revoked grant for A must drain/terminate only A's execution; it must not
   stop a B execution. Shared global installation/package state can remain
   global, while protected execution state and process lifecycle are scoped.
   Candidate touchpoints include `plugin-worker-manager.ts`, `plugin-loader.ts`,
   lifecycle routing, and the SDK host-client/protocol/RPC context.

7. **Keep migration, install, and recovery explicit.** Existing trusted
   same-user execution is a temporary lane selected explicitly for a Plugin and
   Workspace; it is never an automatic fallback from protected mode. A Plugin
   that cannot meet the selected protected profile is blocked with a stable,
   actionable unsupported-execution result. Installation/update must show the
   selected lane and requested resources before saving consent. Recovery,
   restart, or policy-store loss must preserve the selected lane and grant
   generation or fail closed; it must not silently adopt legacy execution or
   broaden roots. Revocation fences new launches immediately and drains only
   executions using the revoked generation. Keep existing recovery and legacy
   adoption behavior separate from execution-policy migration.

## Focused product acceptance

After the launcher and worker identity are integrated, run one Windows product
test with a public SDK Plugin and two isolated fake Workspaces A/B:

- The launched product worker verifies the expected protected token before
  initialization; a child process retains the enforced identity.
- Access inside A's approved root succeeds. Access to a fake Vault, B's root,
  and a reparse-point escape fails, with denied files unchanged.
- Revoking/stopping A's policy generation prevents A's next operation and
  terminates only A's process tree; B remains running and can complete an
  operation. Restart does not revive a revoked generation.
- A required but unsupported protected profile returns the defined error with
  no same-user retry. An explicitly selected legacy profile takes the legacy
  route and is visibly identified as such.
- A narrow broker operation works only for its bound Plugin/Workspace/run and
  fails after expiry or revocation. No test uses real credentials or user Vault
  data.

This is a focused integration gate, not a claim of support for every CLI or a
release-completion statement. Expand the compatibility matrix only with tested
Node/CLI/UNC/network/child-process combinations.

## Relevant existing references

- `external/sps-core/server/src/services/plugin-worker-manager.ts` — worker
  start options, Plugin-ID registry, and `fork` launcher.
- `external/sps-core/server/src/services/plugin-loader.ts` — startup options
  and privileged secret delivery paths.
- `external/sps-core/packages/shared/src/types/plugin.ts` and
  `external/sps-core/doc/plugins/PLUGIN_SPEC.md` — public manifest contract.
- `sps-server/docs/current/CORE-PLUGIN-RUNTIME-CONTRACT.md` — current SDK host
  API capability and invocation-scope semantics.
- `sps-server/docs/reviews/CORE_PLUGIN_SECURITY_FEASIBILITY.md` — boundary
  analysis, broker requirements, Job Object limitations, and compatibility
  risks.
- `sps-server/docs/reviews/CORE_PLUGIN_ARCH_MIGRATION_PLAN.md` — approved
  explicit legacy-lane and no-silent-downgrade decisions.
- `sps-server/docs/reviews/CORE_PLUGIN_ARCH_IMPLEMENTATION_PROGRESS.md` and
  `sps-server/desktop/scripts/security-poc/` — canary scope and limitations.
