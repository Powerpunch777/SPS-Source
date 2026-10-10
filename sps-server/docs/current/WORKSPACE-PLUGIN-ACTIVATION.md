# Workspace Plugin Activation

## Status

Implemented in the SPS Core candidate pinned by
`sps-server/release/support-matrix.json`.

## The Boundary

An SPS Host installs a plugin package once and starts at most one worker
runtime for that installed package. Installation, package verification,
updates, and worker health are Host concerns.

Each Workspace independently decides whether it can use each installed plugin.
(The compatibility schema still names this record `Company`.) Workspace
activation does not install a package, create another worker, restart the
Host, or erase Workspace settings.

## Manifest Contract

Plugins may declare this optional policy:

```ts
companyActivation: {
  defaultEnabled: false,
}
```

`defaultEnabled` applies only when a Workspace has no explicit setting for the
plugin. If the declaration is omitted, SPS treats it as `true` for backward
compatibility with existing extensions.

## First Workspace Defaults

| Extension | Installed on Host | Default for a new Workspace |
| --- | --- | --- |
| Plugin Discovery & Builder | Yes | Enabled |
| SPS Default Memory | Available when bundled | Disabled |
| SPS Team Workplane | Available when bundled | Disabled |

This keeps the first Workspace neutral: it has an Assistant and the ability to
discover or draft extensions, but it does not silently receive a workplane or
memory strategy.

## Enforced Surfaces

When a plugin is disabled for a Workspace, SPS excludes it from that Workspace's:

- plugin UI slots and launchers;
- Agent tool list and tool execution;
- plugin bridge calls and scoped plugin API requests;
- memory-provider selection and lifecycle delivery.

`Settings > Plugins` shows both the Host package state and the selected
Workspace's activation state. Changing the Workspace switch stores only that
Workspace's override.

## Deliberate Limitation

Manifest-declared scheduled jobs are still Host-global. They do not infer a
Workspace target from activation state. Workspace-targeted recurring automation
needs an explicit target in a future job contract, or must run from a
Workspace-scoped event or user action today.
