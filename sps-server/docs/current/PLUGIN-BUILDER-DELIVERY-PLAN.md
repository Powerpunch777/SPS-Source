# Plugin Builder Delivery Plan

Status: source implementation with bounded delivery work in progress,
2026-10-24. This is not a claim that Plugin Builder is complete, a new SDK
release, an installer, or a Stable release.

## Ownership and Priority

Plugin Builder owns its conversation, Lead/Worker roles, authoring workflow and
project evidence. Core provides existing Agent sessions, scoped plugin state,
Host/Node execution and generic plugin capabilities. Desktop Developer Mode
owns external project connection, mandatory build gates, package staging and
isolated Preview. Do not add Core APIs or lifecycle policy to close a Builder UI
gap.

The current engineering priority is Plugin Builder delivery on the existing
Core baseline. Keep follow-up bounded to the existing Plugin and Desktop surfaces. Embedded
Tailscale work, usage budgets/admission, advanced execution recovery and Stable
release work are deferred.

## Stage 1: Existing Source Baseline

Implemented in source:

- Workspace-scoped Builder conversations, transcript and execution steps, text
  attachments, Agent roster/model display, one selected Lead and optional
  Workers (currently limited to 12).
- The Lead can delegate bounded assignments to selected Workers and read their
  reports. Stop targets the exact Lead run; it does not stop Workers. In-flight
  work discovered after restart remains unresolved until Core confirms its
  terminal state. Missing identities and lookup failures block duplicate
  dispatch; work is not silently repeated.
- Seven Builder tools: `create-sps-plugin-project`,
  `run-sps-authoring-step`, `inspect-sps-plugin-build`,
  `open-sps-plugin-preview`, `create-sps-plugin-package`,
  `builder-delegate-worker`, and `builder-worker-result`.
- An append-only, Workspace-scoped authoring ledger records project, authoring,
  build, Preview and package events with bounded evidence. Agent-authored status
  and evidence are advisory. They do not prove Desktop gates passed.
- The author uses the external SPS Plugin SDK scaffold and manually connects
  that external project in Desktop Developer Mode. Desktop independently runs
  `build`, `validate` and `test` against stable source/output fingerprints,
  stages a package archive in the Owner Vault, and runs it only in an isolated
  Preview. The verified build archive is retained for local rollback/reopen.
- Preview uses its own private local Workspace and data, with loopback-only
  access. Preview lifecycle changes do not activate the plugin in the
  production Workspace. Host lifecycle controls in Settings > Plugins remain
  unchanged and explicit.

The current Windows source E2E harness creates an isolated Host with mock
Identity and a no-provider Agent, checks registration of all seven tools and
the Builder authoring panel, scaffolds an external SDK project, connects it
manually, runs the Desktop gates, opens isolated Preview, inspects/packages the
archive, and checks production plugin lifecycle state stays unchanged. This
harness source is not itself a report that the latest run passed. It does not
verify paid-provider file execution or public publishing.

## Stage 2: Implemented Safety and Handoff

Implemented in source; final source E2E verification is recorded below:

- Add a **Show verified package** button for the exact verified package.
  It is a read-only handoff/view action, not installation, activation, or a
  bypass of Settings > Plugins. This authoring-tool boundary is not a global
  prohibition on an explicit Host lifecycle decision.
- Reject packaging from advisory build evidence if a later authoring event
  invalidated it. A new passed build is required, within the same session.
- Persist Lead/Worker run identities, reconcile them against Core after a
  restart, buffer callbacks until the returned run ID is saved, and retain
  unresolved state after a send-response failure or unconfirmed cancellation.
- Extend the Desktop E2E to check seven tool registrations, the authoring panel,
  a real generated plugin page/counter, the verified-package reveal action and
  unchanged production plugin lifecycle. Restart and race handling are unit
  regressions, not claims of a real-provider or physical-device E2E.

No test count, final E2E result or completion claim is recorded here until the
parent appends the actual verification.

## Stage 3: Minimal Desktop Package Inspection

A small generic Desktop resolver checks the persisted last-known-good build,
exact Vault-relative archive name, regular-file/link boundaries, size and SHA-256
before revealing the archive in Explorer. The renderer supplies only a project
ID, never an arbitrary path. This action does not install, activate, publish or
infer user intent. No Core schema, route, API or SDK changes were needed.

## Deferred and Unverified

- Paid-provider end-to-end file creation and editing have not been verified.
- There is no automatic binding from a Builder conversation to a Desktop
  Developer Mode project; external projects are connected manually.
- An AI-callable authoring tool cannot substitute for Desktop's mandatory
  `build`/`validate`/`test` execution or mint verified gate evidence.
- Public publishing, publisher review, Official Registry signing and community
  distribution are not implemented.
- Broader Tailscale embedding, budgets/admission, advanced recovery and Stable
  release acceptance are outside this bounded delivery plan.
