# SPS Team Workplane Plugin v1

Updated: 2026-07-22

> Status: Official bundled workplane profile. The implementation is currently
> packaged in `sps-room-chat` for compatibility with existing SPS Desktop data.

## Product role

SPS Team Workplane is the official work style for a person or team that wants
long-lived conversations with their AI team and bounded execution rooms for
individual deliverables.

```text
Project
  -> Team Room for each enabled Agent
  -> Lead creates and assigns a Task
  -> bounded Task Room and execution Runs
  -> done or blocked report returns to the Lead's Team Room
  -> user reviews only the completed or blocked result
```

It is a workplane profile, not a Core object model. Core remains neutral about
company hierarchy, role names, repositories, task screens, and memory strategy.

## v1 contract

| Concern | SPS Team Workplane responsibility | Core responsibility |
| --- | --- | --- |
| Team conversation | Durable Agent Team Rooms | Thread/session persistence and authorization |
| Delivery | Lead-created bounded Task Rooms | Work item, Run, artifact and event primitives |
| Delegation | Lead can create, assign, review and close tasks; Worker executes assigned tasks | Permission and actor-scope enforcement |
| Reports | Task completion or blocker wakes the Room that created the Task | Event delivery and durable log |
| Memory | Requests scoped project and Room memory through a provider | Memory lifecycle, scope validation and audit |
| UI | Rooms, Tasks, task chat and Agent configuration surfaces | Plugin UI slots and navigation shell |

The `sps-lead-worker` profile is role-neutral. A template may call the roles
`CTO`, `Designer`, `QA`, `Reviewer`, `Operator`, or anything else. Only the
Lead/Worker permissions shape the default delegation boundary.

## Compatibility rule

The product identifier is `sps.team-workplane`, but v1 deliberately preserves
the installed plugin ID `local.room-chat`.

Existing Room origins, Task Room origins, plugin state, schedules and UI URLs
already contain `local.room-chat`. Registering a second plugin or changing the
manifest ID would provision duplicate Rooms, split state, and stop old links
from resolving. Therefore v1 changes the visible product identity while keeping
the runtime identity stable.

A future ID migration may happen only when an installer can atomically:

1. pause the old worker and scheduled jobs;
2. copy or remap every persisted state scope, origin and saved route;
3. prove each project has exactly one Room set and one Task owner-report path;
4. support rollback before the old state is deleted; and
5. complete an upgrade test against a real pre-migration Desktop vault.

Until then, `sps-room-chat` is an intentional compatibility package name, not a
second product.

## Included templates

- `lead-worker`: minimal custom Lead and Worker team.
- `web-app-starter`: lightweight web/app product team.
- `small-team-starter`: general small-team baseline.
- `game-studio-compatibility`: migration template for the older game-team setup.

Templates create role and policy defaults. They do not prescribe a repository
layout, model provider, engine, framework, or memory provider.

## Acceptance checks

1. Existing projects keep their Team Rooms, Task Rooms, comments and reports.
2. A Lead can create and assign a Task without a Worker creating or reassigning
   it.
3. A Worker can complete execution, but reports to the originating Team Room
   rather than silently approving its own delivery.
4. A memory-provider failure leaves Team Rooms and Task Runs durable.
5. Restarting SPS Desktop restores the same project Rooms and no duplicate
   provisioned Rooms.
6. SPS Desktop binds the installed Workplane to the Owner Host's selected
   loopback port after the Host becomes healthy; a transient plugin bootstrap
   failure must not keep the Desktop setup screen from opening.
7. The plugin suite and a Desktop browser smoke test pass before release.
