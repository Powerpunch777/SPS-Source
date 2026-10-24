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

The source verification below covers this bounded increment, not full Builder
completion or release acceptance.

## Stage 3: Minimal Desktop Package Inspection

A small generic Desktop resolver checks the persisted last-known-good build,
exact Vault-relative archive name, regular-file/link boundaries, size and SHA-256
before revealing the archive in Explorer. The renderer supplies only a project
ID, never an arbitrary path. This action does not install, activate, publish or
infer user intent. No Core schema, route, API or SDK changes were needed.

## Verification: 2026-10-24

Implementation commits are `6aa2cd43` (Builder recovery and verified-package
handoff) and `ba73f0095f143620704c7d51fd35c05b06f74f32` (port selection).
Core remains `98ce2de643a51271323d2d0b26321ec4de7cf16f`; SDK remains
`abfbd3692a59c126ae74f487e01d415eed38665e`. This is Desktop 0.4.136 source
development, not a newly packaged installer or SDK release.

- Builder `npm run check`: 26/26 tests, build and manifest verification passed.
- Desktop `npm test`: 391/391, including 10 archive-resolver and 11 Owner Host
  configuration tests; focused registry/preload/Preview contracts: 38/38.
- Source Preview E2E at `ba73f009`: exit 0 including cleanup. It verified tool
  registration, the five advisory authoring tools, real external SDK project
  gates, an actual generated page/counter, verified archive inspection and the
  **Show verified package** button, fixture reload, unchanged production plugin
  lifecycle, and redacted diagnostics after deliberately crashing Preview.
  The generated page screenshot was visually inspected. It is a functional test
  fixture, not a production design or real AI-authored plugin.
- Source Workspace E2E: exit 0 including cleanup. Builder Send/Stop targeted the
  exact Lead run and verified process exit; usage/history and 1024/1280/1440
  layouts also passed. This invocation began with the port-fallback source
  already present, before its commit was made. It used mock Identity and a
  no-provider process fixture, not a paid provider or remote physical Member.
- Persistent DEV was normally restarted with the existing login/data intact;
  Builder chat and its Lead/Worker work panel were opened and inspected.
- Candidate documentation check and `git diff --check` passed. Core and SDK
  were unchanged in this increment; no fresh full Core/Linux regression or
  dependency audit is claimed.

Preserved failures: the original Preview harness expected five tools instead of
seven; an intermediate Worker-cancellation regression exposed a queued-write
race, corrected before the passing rerun. The next source Preview run failed at
new Host creation because the preferred database ports were occupied and the
remaining range was reserved by Windows. Port selection now probes an
OS-assigned, distinct loopback pair after exhausting the preferred range,
rechecks availability, and leaves existing saved configurations unchanged. It
does not alter Windows reservations, stop existing servers, or claim to retain
the probe sockets until Host startup. The final Preview run passed afterward.

Private ignored development records are in `desktop/dist/`:
`builder-preview-baseline.log`, `builder-preview-flow.log`,
`builder-preview-final.log` (port failure), `builder-preview-verified.log`,
`builder-chat-final.log`, `builder-focused-desktop.log`, and
`builder-desktop-verified.log`. They are not public release attestations.

Reproduce from `sps-server/sps-plugin-discovery`: `npm run check`.
From `sps-server/desktop`: `npm test`; for source Preview, set
`SPS_DESKTOP_E2E_HOST_READY_TIMEOUT_MS=120000` and run
`node scripts/smoke-plugin-preview-desktop.mjs`. For Workspace surfaces, also set
`SPS_DESKTOP_E2E_SOURCE=1` and run
`node scripts/smoke-workspace-surfaces-desktop.mjs`.

## Next Delivery Slice

Make the existing manual external-project handoff understandable from a Builder
conversation, without letting a Plugin choose arbitrary Host paths or mint
verified build evidence. Then validate real-provider file authoring on an
explicitly approved Source and connect that result through the same mandatory
Desktop gates. Do not add installation as an implicit consequence of choosing
or previewing a plugin.

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
