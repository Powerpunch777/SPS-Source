# SPS Current Product Documents

## Start here

| Need | Document |
| --- | --- |
| Confirmed Core completion scope; separate Builder repository, no public Marketplace, untrusted OS containment deferred | [CORE-COMPLETION-POLICY-ko.md](CORE-COMPLETION-POLICY-ko.md) |
| New Builder v15 design, source, UI and parallel implementation plan (not Core work) | [SPS-MY-PluginBuilder](https://github.com/Powerpunch777/SPS-MY-PluginBuilder) |
| Core light UI, typography and historical bundled-plugin layout; new Builder follows its separate v15/v9 contract | [SPS-LIGHT-UI-PLAN-ko.md](SPS-LIGHT-UI-PLAN-ko.md) |
| Product boundary, neutral Workspace, and Core versus Plugin responsibilities | [PRODUCT-ARCHITECTURE-ko.md](PRODUCT-ARCHITECTURE-ko.md) |
| Native development deferred by user request; current evidence and restart checklist | [NATIVE-DEVELOPMENT-DEFERRED-ko.md](NATIVE-DEVELOPMENT-DEFERRED-ko.md) |
| Windows-first native LAN design and remaining scope; execution currently deferred | [WINDOWS-NATIVE-CONNECTIVITY-PLAN-ko.md](WINDOWS-NATIVE-CONNECTIVITY-PLAN-ko.md) |
| Draft trusted transport/pairing and minimal SDK contract, not current exports | [WINDOWS-NATIVE-CONNECTIVITY-RFC-ko.md](WINDOWS-NATIVE-CONNECTIVITY-RFC-ko.md) |
| Windows LAN, private beta and signed first-release scope/estimate assumptions | [SPS-DELIVERY-ESTIMATE-ko.md](SPS-DELIVERY-ESTIMATE-ko.md) |
| AI-optional workstation direction, backend reuse, OCE boundary and first implementation scope | [MULTI-BACKEND-WORKSTATION-PLAN-ko.md](MULTI-BACKEND-WORKSTATION-PLAN-ko.md) |
| Exact Desktop, Core, SDK, and bundled-extension candidate | [CURRENT-CANDIDATE.md](CURRENT-CANDIDATE.md) |
| Production dependency audit gate and expiring exceptions | [DEPENDENCY-SECURITY.md](DEPENDENCY-SECURITY.md) |
| Workspace Shell Provider, generic Dashboard, and generic Inbox contract | [WORKSPACE-SHELL-DASHBOARD-INBOX-ko.md](WORKSPACE-SHELL-DASHBOARD-INBOX-ko.md) |
| Install SPS Desktop, sign in, create or join a Host, and choose a workflow | [GETTING-STARTED-ko.md](GETTING-STARTED-ko.md) |
| Stable releases, installation-test previews, automatic updates, and uninstall behavior | [RELEASE-AND-PREVIEW-POLICY-ko.md](RELEASE-AND-PREVIEW-POLICY-ko.md) |
| Export scope, retained data, recovery limits, and Host transfer preparation | [DATA-AND-RECOVERY-ko.md](DATA-AND-RECOVERY-ko.md) |
| A concise product introduction for demos and feedback meetings | [MEETING-BRIEF-ko.md](MEETING-BRIEF-ko.md) |

## Maintainers and plugin authors

- [Repository development instructions](../../../AGENTS.md):
  the coordinating agent owns planning, integration, and final review. Delegate
  bounded independent work to `gpt-6-luna` with `high` reasoning, research official
  online references first, and parallelize only non-overlapping work. Preserve
  unfinished work on quota exhaustion and resume it when available without quota
  bypass or unapproved account/model changes. Use clear Korean progress reports.
  These are development rules, not product permissions or an automatic guarantee
  that a requested model is available.
- New Builder design and implementation follow the separate
  [SPS-MY-PluginBuilder](https://github.com/Powerpunch777/SPS-MY-PluginBuilder)
  repository's integrated design v15, UI v9, and latest UI implementation contract.
  Its black and neutral-gray styling applies only inside the Builder plugin,
  not to the Core global theme. Never copy private Core source, credentials, or
  user data into the public repository. Builder progress does not establish
  Core completion or successful real AI execution; record implementation,
  automated checks, actual app checks, and physical-device checks separately.
- [PLUGIN-COMPATIBILITY-AND-UPDATES.md](PLUGIN-COMPATIBILITY-AND-UPDATES.md):
  Desktop, Plugin API, and Extension Profile compatibility rules.
- [CORE-PLUGIN-RUNTIME-CONTRACT.md](CORE-PLUGIN-RUNTIME-CONTRACT.md):
  workflow-neutral Core primitives.
- [WORKSPACE-SHELL-DASHBOARD-INBOX-ko.md](WORKSPACE-SHELL-DASHBOARD-INBOX-ko.md):
  shared Core work surfaces and plugin contribution boundaries.
- [PLUGIN-DEVELOPER-PLATFORM-ko.md](PLUGIN-DEVELOPER-PLATFORM-ko.md):
  authoring-platform design. The public hands-on toolkit lives in
  [`sps-plugin-sdk`](https://github.com/Powerpunch777/sps-plugin-sdk).
- [PLUGIN-BUILDER-DELIVERY-PLAN.md](PLUGIN-BUILDER-DELIVERY-PLAN.md):
  historical bundled Builder delivery/compatibility evidence, not the new
  `SPS-MY-PluginBuilder` design or implementation plan and not Stable acceptance.
- [PLUGIN-PLATFORM-IMPLEMENTATION-PLAN-ko.md](PLUGIN-PLATFORM-IMPLEMENTATION-PLAN-ko.md):
  staged Core completion plan for the public Runtime SDK, Developer Mode,
  Preview, Diagnostics, Core Marketplace Assistant, Plugin Builder, and
  reference-plugin E2E.
- [WORKSPACE-PLUGIN-ACTIVATION.md](WORKSPACE-PLUGIN-ACTIVATION.md):
  Host installation versus Workspace activation.
- [AGENT-RUNTIME-PACKS.md](AGENT-RUNTIME-PACKS.md): optional runtime-pack
  delivery and verification.
- [PAPERCLIP-COMPATIBILITY-MIGRATION.md](PAPERCLIP-COMPATIBILITY-MIGRATION.md):
  quarantine and phased removal of internal compatibility names without
  breaking existing Vaults or plugins.

## Engineering evidence

- [2026-11-02 paused native goal state](../reviews/CODEX-PAUSED-GOAL-STATE-2026-11-02.md):
  204 adapter checks and actual isolated CLI 0.144.1 goal persistence across two
  processes, same paused thread resume and clear. Active continuation, native
  Worker execution and Builder integration remain incomplete; no new Gate policy adopted.

- [2026-11-02 native Codex observation](../reviews/CODEX-NATIVE-OBSERVER-2026-11-02.md):
  internal read-only transport and child metadata validation, 182 adapter checks,
  isolated CLI 0.144.1 handshake/filter pass with zero model turns. Native Worker
  creation, actual goal continuation and Builder integration remain incomplete.

- [2026-11-02 CTO Task Packets](../reviews/CTO-TASK-PACKETS-2026-11-02.md):
  autonomous CTO requirement clarified; scoped versioned instructions and pinned dependencies,
  449 checks and no-AI source-app regression. Native Workers and automatic continuation remain incomplete.

- [2026-11-02 planning-tool approval](../reviews/PLANNING-TOOL-APPROVAL-2026-11-02.md):
  user-approved per-tool CLI behavior, unchanged Core run allowlists, 55 checks;
  actual Workstream trial stopped at first Lead provider quota, not an AI/CTO pass.

- [2026-11-02 internal Lead answers to CTO](../reviews/CTO-QUESTION-REPLY-2026-11-02.md):
  durable answers, exact Core-bound CTO read/ack, preserved historical policies;
  423 checks and no-AI source-app regression. Actual AI and user-answer propagation remain unproven.

- [2026-11-02 CTO question intake](../reviews/CTO-QUESTION-INTAKE-2026-11-02.md):
  CTO-only proposals, internal Lead review and filtered user decisions; 383 checks initially,
  404 with durable admission. See the later reply record for the next implementation step.

- [2026-11-02 private CTO memory](../reviews/CTO-PRIVATE-MEMORY-2026-11-02.md):
  project/CTO-scoped immutable notes, exact active delivery/run guards, historical
  policy preservation and357 automated checks. No actual CTO provider-memory proof.

- [2026-11-02 CTO Workstream delivery](../reviews/CTO-WORKSTREAM-DELIVERY-2026-11-02.md):
  stable planning intent and Core receipt reconciliation; Builder330 checks passed,
  but actual trial stopped at cancelled Lead MCP reads before any CTO execution.
  No new automatic approval policy, installed release or full v15 acceptance.

- [2026-11-02 per-run session tool restrictions](../reviews/SESSION-EXECUTION-POLICY-2026-11-02.md):
  source-only Core/SDK contract, policy-bound durable receipt recovery, local
  Codex configuration guards and Builder integration. Not OS certification,
  actual Lead/CTO execution, a new installed release or whole-Core completion.

- [2026-11-02 session identity recovery](../reviews/WORKSPACE-SESSION-ENSURE-2026-11-02.md):
  explicit scoped ensure and known-ID recovery; not durable message submission.
- [Session and durable submission plan](AGENT-SESSION-REQUEST-RECOVERY-PLAN-2026-11-02.md):
  implemented identity contract versus unfinished request receipts and dispatch integration.
- [2026-11-02 Workspace Agent Session increment](../reviews/WORKSPACE-AGENT-SESSIONS-2026-11-02.md):
  invocation-bound session methods and bounded persisted answer output. Durable
  send recovery and actual Builder AI remain unfinished.
- [2026-11-02 previous-tuple CI verification](../reviews/CI-SOURCE-MUTATION-2026-11-02.md):
  exact Source8a/457 Windows installation/data preservation, recovery and Linux
  success, with explicit unqualified scenarios. Not evidence for newer changes.

- [2026-10-25 Windows native connectivity audit](../reviews/WINDOWS-NATIVE-CONNECTIVITY-AUDIT-2026-10-25.md):
  current Host/Member/Node sequences, eleven dependency areas, Source/SMB and
  HTTP/WS/SDK trust gaps. Source inspection, not native LAN or two-PC acceptance.

- [2026-10-25 No-AI Workspace acceptance](../reviews/NO-AI-WORKSPACE-ACCEPTANCE-2026-10-25.md):
  real source Desktop UI/state/events/Jobs, Workspace and capability denials,
  restart/Native recovery, and SDK synchronization and Job-scope fixes.

- [2026-10-25 multi-backend reuse audit](../reviews/MULTI-BACKEND-REUSE-AUDIT-2026-10-25.md):
  canonical public SDK/Core/Desktop inventory, implemented contracts versus
  planned model/OCE connectors, and remaining security/real-integration limits.

- [2026-10-24 UI flow audit](../reviews/UI-FLOW-AUDIT-2026-10-24.md): current
  navigation, cross-Workspace state, Builder drafts and Desktop recovery fixes;
  includes tested versus unverified user flows and source-only limits.

`CORE-COMPLETION-AUDIT.md`, `CORE-DESKTOP-E2E-AUDIT.md`, the baseline plan,
the UI refresh plan, and the acceptance runbook are historical engineering
evidence or test procedures. They are not the current candidate or product
contract. When one conflicts with the current architecture,
`PRODUCT-ARCHITECTURE-ko.md`, `CURRENT-CANDIDATE.md`, and
`release/support-matrix.json` take precedence.

## Documentation policy

- Update related documents in the same change when a product rule changes.
- Mark unfinished work as `planned` or `not implemented`.
- `release/support-matrix.json` is the machine-readable source of truth for
  the current development candidate. `CURRENT-CANDIDATE.md` is generated from
  it and is checked by automated tests.
- A README inside a plugin directory documents that plugin only; it does not
  define an SPS-wide default workflow.
- Use Git history or `docs/reviews` for historical evidence rather than
  duplicating old contracts in current product documents.
