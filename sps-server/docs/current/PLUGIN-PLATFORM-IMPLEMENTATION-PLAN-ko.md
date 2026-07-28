# SPS Plugin Platform Implementation Plan

Last updated: 2026-07-29

## Purpose

SPS Core must let a plugin author build a custom work environment without
forcing a specific organization chart, task model, memory strategy, or
development discipline. Core provides stable primitives and safety boundaries;
plugins define the work model.

This plan turns the existing plugin runtime into a documented and testable
platform. It does not add Room, Task, Lead, Worker, approval, or memory
semantics to Core.

## Product Decisions

- A Company can activate a different set of installed plugins from every other
  Company.
- Plugin installation, activation, update, disable, removal, and rollback are
  explicit Host actions. An AI recommendation never performs a lifecycle
  action by itself.
- Core owns the technical safety boundary. A plugin owns the meaning of roles,
  approvals, and workflow rules.
- Host Owner is the only Core-level server owner. Plugin-defined access-control
  plugins may define Viewer, Operator, Admin, or any other work role.
- Windows Desktop is the first supported product surface. Host and Member use
  one installer; the chosen connection flow determines the runtime role.

## Risk-Based Change Policy

Not every plugin update requires an interruption. SPS applies safeguards only
when an action is difficult to reverse or can affect data, security, cost, or
external systems.

| Change class | Examples | Required behavior |
| --- | --- | --- |
| Low risk | UI copy, styling, worker bug fix, new read-only view | Update can proceed normally. |
| Review required | New plugin capability, new persistent-data migration, new secret binding, new external connector | Stop activation, show a review summary, and require an explicit Host approval. |
| Strong confirmation | Data removal, export outside SPS, mass execution, paid external API action, plugin hard removal | Require an explicit confirmation, audit record, and the applicable backup or recovery reference. |

SPS does not permit destructive SQL plugin migrations in the first platform
release. New database migrations may create, alter, insert, or backfill only
inside the plugin namespace. Existing migration checksums can never change.

## Current Platform Baseline

The current Core already has the following primitives:

- signed package staging, package inspection, install, update, rollback, and
  Company-scoped activation;
- Plugin API, Extension Profile, and Desktop version compatibility checks;
- manifest declarations, worker lifecycle, UI slots, typed Agent tools,
  events, durable jobs, streams, and plugin logs;
- scoped state, entities, artifacts, database namespaces, restricted SQL
  migrations, and configuration records;
- Agent, backend, node, local CLI, connector, and MCP integration paths;
- encrypted Host-owned backup facilities and Desktop update/rollback support.

The gap is not raw capability. The missing work is to make the contracts
predictable for third-party authors, make high-risk changes reviewable, and
prove the whole path with repeatable tests.

## Target Platform Contracts

### 1. Extension Profile

Extension Profile v1.1 will publish the stable manifest, capability, data
scope, lifecycle, compatibility, and deprecation rules. It will describe the
public SPS contract only; legacy Paperclip bridge fields remain compatibility
details and are not recommended for new plugins.

### 2. Plugin Data and Migrations

Every plugin gets isolated state and, when declared, an isolated database
namespace. The platform will add a read-only migration plan that reports:

- pending migration file names and checksums;
- whether the plugin already has persisted data;
- the allowed SQL operation categories;
- the old and new plugin versions; and
- whether explicit Host approval and a fresh backup are required.

A first installation may apply its initial namespace migration automatically:
there is no prior plugin data to alter. An upgrade with pending migrations must
remain `upgrade_pending` until the Host approves the reviewed plan. Approval
must be bound to the exact target version and migration checksums so that it
cannot be reused for another package.

### 3. Runs, Jobs, and External Tools

Core will standardize one execution record for Agent, CLI, local AI, API, and
MCP calls: request, node, tool, progress, artifacts, cost metadata, outcome,
cancellation, and retry history. Workflow plugins may group these records into
their own Task or Room models, but Core will not assign workflow meaning.

### 4. Secrets and Connectors

Plugins declare required connections. Core resolves encrypted secret references
and returns a scoped connection handle, never a reusable raw secret. Connector
health, expiry, user consent, and audit records are common platform behavior.

### 5. UI and Developer Experience

The SDK will provide SPS UI primitives for tabs, side panels, settings forms,
empty/loading/error states, run status, and destructive-action confirmation.
The Test Kit will provide mock Company, Agent, Node, filesystem, event, and
lifecycle environments. The CLI will validate a package before it can be
staged or published.

## Delivery Sequence

### Phase A: Safe Update Foundation

1. Add a read-only pending-migration inspection API to Core.
2. Classify upgrade risk from new capabilities, pending migrations, secrets,
   and connector changes.
3. Keep an upgraded plugin in `upgrade_pending` when review is required.
4. Require a checksum-bound data-migration approval before activating a
   reviewed update.
5. Require Desktop to create and record a fresh Host backup before granting
   data-migration approval.
6. Add audit events and rollback guidance for every decision.

Acceptance: a plugin with a new migration cannot start until the Host has
reviewed the exact migration plan and a backup reference. A UI-only update
continues without this interruption.

### Phase B: Stable Authoring Contract

1. Publish Extension Profile v1.1 and SDK types.
2. Freeze capability names, data scopes, lifecycle states, and compatibility
   behavior.
3. Add deprecation and Core/Desktop upgrade policy.
4. Add a public conformance suite and one reference plugin.

Acceptance: an external author can run `init`, `validate`, `test`, `pack`,
and local publish with no SPS source checkout.

### Phase C: Execution, Secrets, and Observability

1. Complete the neutral Run contract across Agent, CLI, API, and MCP calls.
2. Finish scoped connector and Vault-handle lifecycle support.
3. Add a common diagnostics surface for plugin health, jobs, runs, logs,
   compatibility, and pending reviews.

Acceptance: a plugin can explain why a run, connector, job, or activation is
blocked without exposing secrets or relying on product-specific UI.

### Phase D: UI Kit and Official Examples

1. Release reusable SPS UI primitives.
2. Build the Plugin Discovery & Builder reference plugin on the public SDK.
3. Build an Access Control reference plugin and a minimal Team Workplane
   reference plugin.
4. Provide Game, Web, App, and Plugin-development starter packs as optional
   plugins or templates, never Core defaults.

Acceptance: an author can copy an example, change its workflow model, and
ship a package without modifying SPS Core.

### Phase E: Product-Level Verification

1. Run Core, SDK, Desktop, and packaged Owner Host tests.
2. Test a real Host and Member Desktop pair: sign-in, invite, approval, node
   registration, project-source mapping, Agent execution, revocation, and
   restart recovery.
3. Test plugin install, Company activation, safe update, rejected review,
   approved migration, rollback, and backup restoration in the Desktop UI.
4. Publish a support matrix, migration guide, and release checklist.

## Explicit Non-Goals for This Plan

- A public paid marketplace, payment, refunds, ratings, and community
  publishing are not first-release features.
- Core does not choose which Agent, plugin, or workflow a user should use.
- Core does not silently install, activate, update, or remove a plugin.
- Core does not make plugin roles or work approvals universal product rules.

## Implementation Order Now

Work starts with Phase A. The first code change is migration-plan inspection
and upgrade gating. It is the narrowest change that protects persistent plugin
data while preserving normal low-risk updates.
