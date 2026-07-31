# SPS Current Product Documents

## Start here

| Need | Document |
| --- | --- |
| Product boundary, neutral Workspace, and Core versus Plugin responsibilities | [PRODUCT-ARCHITECTURE-ko.md](PRODUCT-ARCHITECTURE-ko.md) |
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
- [PLUGIN-PLATFORM-IMPLEMENTATION-PLAN-ko.md](PLUGIN-PLATFORM-IMPLEMENTATION-PLAN-ko.md):
  staged Core completion plan for the public Runtime SDK, Developer Mode,
  Preview, Diagnostics, Core Marketplace Assistant, Plugin Builder, and
  reference-plugin E2E.
- [WORKSPACE-PLUGIN-ACTIVATION.md](WORKSPACE-PLUGIN-ACTIVATION.md):
  Host installation versus Workspace activation.
- [AGENT-RUNTIME-PACKS.md](AGENT-RUNTIME-PACKS.md): optional runtime-pack
  delivery and verification.

## Engineering evidence

`CORE-COMPLETION-AUDIT.md`, `CORE-DESKTOP-E2E-AUDIT.md`, the baseline plan,
and the acceptance runbook are engineering evidence and test procedures. They
are not the product contract. When a planning or audit document conflicts with
the current architecture, `PRODUCT-ARCHITECTURE-ko.md` and
`release/support-matrix.json` take precedence.

## Documentation policy

- Update related documents in the same change when a product rule changes.
- Mark unfinished work as `planned` or `not implemented`.
- `release/support-matrix.json` is the machine-readable source of truth for
  the current development candidate.
- A README inside a plugin directory documents that plugin only; it does not
  define an SPS-wide default workflow.
- Use Git history or `docs/reviews` for historical evidence rather than
  duplicating old contracts in current product documents.
