# SPS Current Product Documents

## Start here

| Need | Document |
| --- | --- |
| Confirmed Core completion scope; no public Marketplace, Builder handoff pending, untrusted OS containment deferred | [CORE-COMPLETION-POLICY-ko.md](CORE-COMPLETION-POLICY-ko.md) |
| Light UI direction, typography, shared surfaces, and Builder layout | [SPS-LIGHT-UI-PLAN-ko.md](SPS-LIGHT-UI-PLAN-ko.md) |
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
  current Builder delivery scope, verified source flows and remaining manual
  project handoff; not a Stable acceptance report.
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
