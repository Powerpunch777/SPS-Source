# Workspace Plugin Activation

Last updated: 2026-10-25

## Status

Workspace activation primitives are implemented in the current Core source.
This is partial infrastructure, not implementation of the 2026-10-25 target
architecture. See the [gap audit](../reviews/CORE_PLUGIN_ARCH_GAP_AUDIT.md)
and [migration plan](../reviews/CORE_PLUGIN_ARCH_MIGRATION_PLAN.md) for
verified current behavior and missing contracts.

## The Boundary

An SPS Host installs and verifies a plugin package once. The current Core uses
a Plugin-scoped shared Worker rather than a separate OS process per Workspace;
that Worker is not a Workspace isolation or termination boundary. Installation,
package verification, updates, and Worker health are Host concerns.

Each Workspace independently decides whether it can use each installed plugin.
(The compatibility schema still names this record `Company`.) Workspace
activation does not install a package, create another worker, restart the
Host, or erase Workspace settings. The target keeps installation Host-scoped
while activation, settings, data, and execution policy are Workspace-scoped.
Zero active Extensions is a valid target state; manifest defaults below remain
compatibility behavior, not the target's final defaulting policy.

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

## Current Candidate Defaults

These are current compatibility facts, not requirements that a Workspace
enable a plugin. Plugin Discovery & Builder being enabled by default does not
make an Agent, Primary, or Extension mandatory in the target.

| Extension | Installed on Host | Default for a new Workspace |
| --- | --- | --- |
| Plugin Discovery & Builder | Yes | Enabled |
| SPS Default Memory | Available when bundled | Disabled |
| SPS Team Workplane | Available when bundled | Disabled |

This is the current candidate behavior. The target also allows a Workspace
with no enabled plugins; future default changes must preserve existing explicit
activation state and must not silently disable installed extensions.

## Enforced Surfaces

When a plugin is disabled for a Workspace, SPS excludes it from that Workspace's:

- plugin UI slots and launchers;
- Agent tool list and tool execution;
- plugin bridge calls and scoped plugin API requests;
- memory-provider selection and lifecycle delivery.

`Settings > Plugins` shows both the Host package state and the selected
Workspace's activation state. Changing the Workspace switch stores only that
Workspace's override.

## Workspace Jobs and Execution Boundary

Workspace-scoped Job code already exists in Core: Jobs carry Workspace scope
and can be managed/cancelled through that contract. They are not Host-only.
However, Workspace-scoped Job records or cancellation state do not guarantee a
dedicated Workspace process, OS-level termination, an admission fence across
all execution lanes, or resume-without-replay. The shared Worker and external
Node/CLI processes require separate lifecycle evidence. Do not treat Job scope
as completed Workspace execution isolation or pause/stop/resume semantics.

The 2026-10-25 target permits zero Primary, zero Agents, and zero active
Extensions, with no mandatory common Shell, Dashboard, or Inbox. Independent
Native management/recovery outside Plugin UI is a prerequisite to removing
existing common UI and is not claimed implemented here.
