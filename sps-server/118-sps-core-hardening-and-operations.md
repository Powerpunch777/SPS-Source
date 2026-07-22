# SPS Core Hardening And Operations

## Completed Core Controls

- Company memory provider selection is owned by Core. Provider content,
  retention, and recall remain provider-owned.
- Lifecycle deliveries are idempotently audited by provider and event id.
- Core emits Task completion, block, reopen, and artifact publication events
  from native work-item activity. Workplanes publish Room checkpoints through
  the capability-gated `memory.lifecycle.publish` contract; background Room
  completions are reconciled by a declared job after their action scope ends.
- Memory lifecycle candidates created by SPS Default Memory remain reviewable;
  lifecycle events do not silently approve or overwrite remembered facts.
- Plugins can require explicit Agent grants for every registered tool. Core
  enforces the grant both when listing tools for an Agent and immediately
  before execution.
- Tool audit records contain status and scope metadata only, never parameters
  or returned content.
- Ready Workplane plugins are discovered through a neutral Agent Platform
  extension contract, rather than hard-coded SPS workflow identifiers.
- Windows embedded Postgres failures expose actionable permission, executable,
  and port-collision hints while preserving recent local database logs.

## Operator Runbook

1. Select one memory provider per company in that provider's Plugin Settings.
   Disable memory explicitly when the company should not receive lifecycle
   delivery.
   An unavailable explicitly selected provider stays unavailable; Core never
   silently switches the company to a different provider.
2. For a plugin marked `Explicit grant`, enable only the Agents allowed to call
   it. Review the metadata-only audit after changing access.
3. Configure project workspaces on every Desktop Node before assigning an
   Agent to a project. A project-bound run never falls back to another folder.
4. Use remote HTTPS MCP through `sps.mcp-connector` for hosted tools. Treat
   local stdio MCP as a Desktop Node feature, not a Hub shell feature.
5. Review the selected memory provider's recent delivery audit after a plugin
   upgrade, a provider outage, or a Room reconciliation. A failed delivery is
   visible to the operator and never causes Core to select a different
   provider silently.
6. When embedded Postgres fails on Windows, check the displayed recent logs,
   Controlled Folder Access/antivirus history, the SPS data directory, and
   local Postgres port conflicts before deleting any data.

## Validation And Security Posture

- The Core, SDK, UI API, Room plugin, and default-memory lifecycle contracts
  are covered by type checks and focused regression tests. A Windows audit
  startup currently reaches embedded PostgreSQL initialization but the bundled
  database process exits during its post-bootstrap phase. Treat this as a host
  runtime prerequisite to resolve before using a fresh local instance for an
  end-to-end browser test; the failure preserves recent database logs and does
  not alter an existing company database.
- Production dependency audit findings are dominated by the optional
  `sqlite3`/`node-gyp` tree pulled in by Drizzle and by an MCP SDK transitive
  Hono dependency. SPS uses PostgreSQL in production, but the packages remain
  installed in the monorepo. Do not force a major `tar` or Hono override: that
  can break the native build chain or an upstream SDK. Update the owning
  dependency as a tested compatibility change, then rerun `pnpm audit --prod`.
- Keep remote MCP grants explicit and keep local MCP server configuration on
  the Desktop Node. This prevents a plugin configuration or Hub request from
  becoming an arbitrary command execution channel.

## Deliberately Deferred Until The Secure Protocol Exists

- Arbitrary command execution from the Hub.
- Hub storage of local MCP command paths, arguments, environment values, or
  credentials.
- Automatic approval of memory candidates from lifecycle events.
- Direct provider writes from a Workplane or reuse of an expired action scope
  for a background Room completion.

These omissions are safety boundaries, not missing convenience features.
