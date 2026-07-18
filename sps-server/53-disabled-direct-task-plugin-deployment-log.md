# Disabled Direct Task Plugin Deployment Log

## Objective

Deploy the verified Direct Task plugin integration to the local SPS runtime without enabling task execution, bridge access, secret resolution, or automated agent activity.

## Deployment Performed

- Date: 2026-07-10
- SPS plugin: `local.memory-sidecar`
- Plugin id: `1d4a0b7b-a52f-4068-9683-16ff6bb459c4`
- Package path: `C:\\Users\\young\\Documents\\sps-server\\sps-memory`
- Method: restarted only the verified local `paperclipai run` server after `npm run check` passed. The existing installed plugin already referenced this local package path, so no package upload, database replacement, or core SPS modification was required.

## Live Verification

- SPS returned to `ready` state on `127.0.0.1:3100`.
- The live manifest now contains all 16 requested capabilities, including issue create/update/comment, plugin state, scheduled jobs, API routes, secrets references, project reads, and UI actions.
- The live manifest declares `POST /direct-tasks/submit`, the `direct-task-finalizer` scheduled job, and the `Project Hub > Direct Task Preview` tab.
- The served UI bundle returns HTTP 200 and contains the explicit `Launch Task Room` control and the same-origin `direct-task-submit` action endpoint.
- The plugin's persisted instance configuration is `null`. Therefore `enableDirectTaskLaunch` uses its manifest default of `false`.
- There was no Direct Task Bridge configuration, no bridge process, no bridge secret, and no task launch during deployment. The issue count remained unchanged during verification.

## Effective Boundary

The SPS UI can now display and validate a Direct Task request. Its explicit launch action returns `direct_task_launch_disabled` before it can create an issue, resolve a secret, contact a bridge, write plugin state, or start Agy.

This preserves the operating-model boundary: SPS remains the Project Hub and Task Room system of record, while any future direct Agy execution must be explicitly enabled only after a real game workspace, loopback bridge configuration, and secret reference are configured and reviewed.

## Next Activation Gate

The deployed feature is intentionally not usable for execution yet. Before the first real task launch, configure and verify all of the following:

1. The actual Unity or Unreal project workspace for the selected SPS project.
2. A loopback-only Direct Task Bridge allowlist for that workspace.
3. A newly generated bridge secret stored in SPS's secret provider by reference only.
4. `directBridgeUrl`, `directBridgeSecretRef`, and `enableDirectTaskLaunch=true` in the plugin instance configuration.
5. One opt-in smoke task that proves an unassigned Task Room is created and finalized without waking a managed SPS agent.
