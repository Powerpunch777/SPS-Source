# Workspace Plugin Activation

> **설계 정렬 2026-11-02:** [단일 기준](DESIGN-BASELINE-2026-11-02.md)과
> [사용자 원문](../design/CORE-PLUGIN-ARCHITECTURE-2026-10-25.md)이 제품 목표에 우선한다.
> Host1회 패키지 설치와 Workspace별 활성화·설정·데이터·실행을 구분한다. Primary0~1, Extension 다중 및 빈 Workspace를 허용한다. 전용 Worker 소유권은 OS 샌드박스 보장이 아니다.
> 이후의 과거 정책/계획/시험은 해당 날짜·리비전의 기록이며 충돌 시 목표를 축소하지 않는다.
> 문서 수정만 수행하며 구현·API 변경·장기목표 재개를 뜻하지 않는다.

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
