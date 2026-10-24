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

## Stage 4: Conversation-to-Project Handoff

Implemented in source; this increment's final test evidence is recorded below.

- Builder work panel provides **Project connection** and opens the existing Host
  Developer Registry in a focused development view, not the install marketplace.
  A new conversation can be created for this action without sending an AI
  message; an unsent draft and text attachments are retained.
- Host explicitly selects a connected project with **Link to this context**.
  A reference is keyed by Workspace UUID, plugin ID and plugin-owned context
  UUID. Builder uses its conversation UUID; Core has no conversation contract.
- The Host-local bounded `developer-mode/context-links.json` stores IDs and
  timestamps only. It has no prompts, paths, file snapshots, Source grants or
  execution policy. Unknown schemas/fields and linked/nonregular paths fail
  closed. Writes are serialized within the Desktop process and atomically
  renamed; this is not a multi-process database or a hardware trust boundary.
- Workspace bridge exposes get/open only, not mutation, filesystem access or
  gate execution. Registry mutation requires the current Host, review window,
  exact existing project and per-open context token. Opening another context
  invalidates the prior window token. The context is navigation metadata, not
  proof that the renderer is the claimed plugin or that a UUID is a real
  conversation. Actual conversation existence belongs to Builder.
- Project labels and last-known-good existence return to Builder without
  absolute paths. The latter is not proof that current source edits are
  verified. Focus or explicit refresh updates the selected conversation only.
- Unlink removes only the reference. Disconnecting the external project makes
  its reference unavailable until relink/unlink; it does not delete source files.
  Folder connection, build/validate/test, Preview, package reveal and production
  installation remain separate Host actions. Member/browser surfaces cannot
  use this local Host bridge.

Validation for this increment: Builder check 31/31 and Desktop 411/411 passed.
A separate Luna review found no actionable scope/path authority bypass; its
dangling-link display finding was fixed. A source Preview pass covered basic
linking before the final draft-preservation and dangling-UI assertions were
added. The exact implementation commit is
`e3d9b7ef1120147df8f60fcaa9d554ccf4682a7d`; final E2E evidence follows below.

- Final source Preview E2E at `e3d9b7ef`: exit 0 including cleanup. Fresh
  conversation creation sent no message and retained its unsent draft and text
  attachment. Host selected the reference in the real review UI. Another
  conversation/Workspace had no link, extra input fields and old window tokens
  were rejected, explicit unlink/relink persisted, and Builder displayed the
  selected project without its path. Mandatory gates, interactive generated
  Preview, verified archive reveal, lifecycle isolation and crash diagnostics
  passed. Disconnecting the project produced the distinct dangling-link UI;
  unlink cleared only that reference and the external package file still existed.
- Final source Workspace E2E at the same commit: exit 0 including cleanup.
  Exact Lead Send/Stop and process exit, usage/history and responsive layouts
  remained working. No paid provider or physical remote Member was exercised.
- Parent visually inspected the final linked-project screenshot and opened
  the existing DEV conversation's panel and correctly scoped review window.
  The no-provider fixture intentionally reports an Agent execution error; this
  is not evidence of successful AI authoring. No paid-provider request or user
  folder connection was made during the native DEV check.
- Logs: `desktop/dist/builder-context-{plugin-final,desktop-final,workspace}.log`,
  `builder-context-preview.log` (earlier passing basic flow),
  `builder-context-preview-final.log` (parallel port collision/CDP timeout),
  and `builder-context-preview-verified.log` (sequential pass). Screenshots are
  in `builder-context-observation/`. These ignored private records are not
  release attestations. Core/SDK remain unchanged and clean; no new installer,
  whole-Core/Linux test result or dependency audit is claimed.

The parallel final Preview/Workspace E2E attempt exposed the existing port-probe
race: both can select the same free PostgreSQL port before either binds it.
The Workspace suite passed, while Preview PostgreSQL startup failed. These
suites must be run sequentially for this candidate. Free-port probing is not a
cross-process startup lease; this residual concurrency limitation is not fixed
or hidden by the project-reference increment. Future startup resilience work
should handle a lost port reservation without touching existing Vaults.

Next, validate real-provider authoring on an explicitly approved Source through
the same Desktop gates. Do not treat this navigation link as runtime working
directory configuration, and do not install a plugin implicitly when chosen or
previewed.

## Stage 5: Opt-in Live CLI Authoring Harness

`desktop` now provides `npm run test:e2e:plugin-preview:live`. The default
Preview E2E remains deterministic and does not call an AI provider. Live mode
uses the actual Builder composer and session bridge with a dedicated temporary
Agent and public SDK starter. It does not modify an existing user's Agent,
project, login, Workspace or production plugin installation.

- Requested configuration: `gpt-6-luna`, `xhigh`, Fast, CLI engine, explicit
  `workspace-write`, `approval_policy="never"`, no sandbox bypass, no command
  network access, and native Windows MXC sandbox. MXC must be supported and
  permitted; there is no unrestricted or weaker sandbox fallback. This test
  configuration is not a new default for user Agents.
- `SPS_DESKTOP_E2E_CODEX_COMMAND` can identify an already installed CLI binary.
  The local npm CLI `0.144.1` rejected the requested model. The bundled CLI
  `0.163.0-alpha.11.2` accepted it but, without a Windows sandbox implementation,
  completed without creating the fixture and reported read-only execution.
  Both attempts were failures, not successful authoring evidence. The managed
  MXC compatibility probe subsequently returned `MXC_OK`. The full MXC live
  harness then passed with exit 0 including process and temporary data cleanup.
- The test checks the actual invocation working directory, sandbox arguments,
  Fast argument, run success, and exactly four changed project files. Bounded
  regular-file snapshots exclude root `.git` and `node_modules`, reject other
  links, and cap file/directory count, depth and bytes. These hashes detect
  changes after execution, not filesystem authorization or credential isolation.
- Build, validation, tests, interactive Preview counter and archive verification
  must still succeed. Only after the entire harness passes is the verified
  development package copied to a new ignored `desktop/dist/builder-live-verified-*`
  directory with a hash-only development summary. This is neither installation,
  a published plugin nor signed Stable evidence. Temporary source/Vault data is
  cleaned by the existing harness; the retained archive is not an editable source
  project.
- Run live and deterministic Desktop E2Es sequentially because the previously
  documented cross-process startup port reservation limitation remains.

Live testing does not implement automatic Agent cwd binding from conversation
references, a new Source authorization contract, Worker delegation authoring,
or Member computer execution. Those require their own explicit design and tests.

Initial working-tree validation (2026-10-24): Desktop 422/422 and Builder 31/31;
live source E2E completed with four allowed files authored by Luna, run/invocation
cwd/sandbox/Fast checks, all Desktop gates, interactive Preview `Count: 0 -> 1`,
verified package reveal, production lifecycle isolation, fixture switching,
Preview-only crash diagnostics and dangling-link handling. Parent inspected the
actual generated Preview screenshot. Identity was mocked; the CLI/model call was
real and used the existing account. This is not a Google login, remote Member or
Stable acceptance test. Logs: `desktop/dist/builder-live-authoring*.log`;
screenshots: `builder-live-observation/`; retained package:
`builder-live-verified-xT93G9/`. Failed attempts remain recorded, not relabeled as
passing. Final committed-source rerun evidence will be recorded separately.

The first committed-source rerun at `bb1f4651` failed at Preview: the model
changed `sps.primitives` to object declarations. The static `validate` command
and Worker lifecycle test do not validate a dynamically imported runtime
manifest against Core's complete schema; Preview correctly rejected it and no
package was retained for that attempt. Do not describe those static checks as
full runtime compatibility certification or weaken Preview to accept it.
The fixture prompt now explicitly preserves its empty Core primitive declaration.
A separate SDK profile-inspector bug that silently filtered non-string primitives
was fixed at `cfa64ec4f589ea9765661834e1685ef1f2e14453`, with full SDK 157/157.
This does not add runtime code execution to static inspection. Production
authoring still needs an explicit user-visible failed-gate feedback/repair flow;
the live harness is not evidence of autonomous multi-attempt repair.

Final committed-source verification at
`3da819254fbbb07c0059ec808e0ef94003127499`, Core
`98ce2de643a51271323d2d0b26321ec4de7cf16f`, SDK
`cfa64ec4f589ea9765661834e1685ef1f2e14453`: live source E2E exit 0 including
cleanup; Desktop 422/422, SDK 157/157, Builder 31/31. Source was clean during
the final run. The actual invocation also asserted requested Luna/xhigh/Fast,
workspace-write/MXC and absence of unrestricted bypass. Mandatory Desktop gates,
interactive counter, archive verification/reveal, production lifecycle isolation,
fixture switching, Preview crash diagnostics and dangling references passed.

- Private final log: `desktop/dist/builder-live-authoring-fixed.log`.
- Final screenshots: `desktop/dist/builder-live-fixed-observation/`.
- Retained archive: `desktop/dist/builder-live-verified-e0vFhi/builder-preview-fixture.spsplugin`.
- Independently rechecked archive SHA-256:
  `c959da9330ab7368ce235d190c3cbb9aac69de1fa52c53956ca1bb614615aaa0`.
- Desktop/SDK logs: `builder-live-desktop-final-fixed.log` and
  `builder-live-sdk-tests.log`. Initial pin-update test correctly blocked the
  not-yet-staged SDK gitlink; the final committed tuple passed. The earlier
  `builder-live-authoring-final.log` is a failed Preview attempt, not final success.

Reproduce from Desktop in PowerShell, using a supported installed CLI and MXC:

```powershell
$env:SPS_DESKTOP_E2E_CODEX_COMMAND = (Get-Command codex.exe).Source
$env:SPS_DESKTOP_E2E_HOST_READY_TIMEOUT_MS = '120000'
npm run test:e2e:plugin-preview:live
```

There is no new installer, production Agent configuration change, Core/DB/API
change, SDK publication, fresh dependency audit or two-device/Stable claim.

## Stage 6: Explicit Validation Feedback Handoff

Implemented and verified in source development; this is not installer or Stable
acceptance.

- Desktop records separate starts and outcomes for build/static-validation/Worker
  gates and isolated Preview activation. Existing bounded diagnostics storage is
  reused; no Core schema, permission model or SDK execution API is added.
- The existing Host-only context read resolves the linked project again and
  returns a minimal latest-attempt summary: attempt ID, kind, technical status,
  timestamp and at most six redacted diagnostic codes/messages. It does not
  return local paths, raw command logs or secrets. Unlinked/dangling contexts do
  not gain access to another project's feedback.
- Builder displays historical validation results separately from Lead run status
  and last-known-good availability. Static gates passing is not full runtime
  compatibility or business-quality approval. A fresh attempt excludes earlier
  errors. An unfinished attempt is not silently treated as successful.
- A Host explicitly requests **add failure to composer**. Builder refetches that
  context and appends a bounded repair draft, retaining existing text/attachments.
  Diagnostic contents are treated as untrusted evidence, not commands or grants.
  There is no automatic send, retry, file edit, build, Preview or installation.
- Duplicate attempts, full drafts, stale conversation/Workspace responses and
  unavailable/invalid feedback must not overwrite input or silently send work.
- Completed attempts stop at their terminal event. Later Preview reload errors
  cannot retroactively rewrite the completed validation outcome. If a terminal
  feedback write fails after a candidate was saved, the successful saved result
  is not falsely reported as a failed build; feedback may remain unavailable or
  unfinished, and a safe warning is logged. This ledger is not an atomic run DB.
- Folder/CLI execution setup remains a separate decision. A navigation reference
  is still not Source authorization or an Agent cwd mutation. Reusing an existing
  Lead's cwd versus creating a dedicated authoring Agent was deferred in this
  increment. The later Stage 7 decision below resolves the product direction.

Pre-commit checks: Desktop 434/434 and Builder 36/36, build and manifest checks
passed. The first source E2E reached failed-Preview feedback, preserved the draft
and attachment, sent no AI message, then reached the restored interactive Preview.
Its final diagnostic assertion failed because the older test rejected the word
`secret` even inside the valid `secrets.use` capability vocabulary. The assertion
now targets credential field names/token values; redaction unit cases remain.
The failed log is retained at `desktop/dist/builder-feedback-preview.log` and is
not a complete pass. The terminal-attempt fix and final UI changes require the
fresh committed-source E2E recorded below.

Final acceptance on 2026-10-24 used clean Source implementation
`2f832e052a81614633c6caf20b8cbe40cf2cc506`, unchanged Core
`98ce2de643a51271323d2d0b26321ec4de7cf16f` and SDK
`cfa64ec4f589ea9765661834e1685ef1f2e14453`:

- Desktop 434/434 and Builder 36/36, UI build and manifest verification passed.
- Source Preview E2E exited 0 including cleanup. An invalid runtime manifest
  passed static gates but was correctly rejected by Core Preview. The actual
  Builder button appended that scoped failure while preserving the existing
  draft and attachment, exposing no project path and sending no AI message.
  Duplicate insertion was disabled. Restoring the valid fixture produced a new
  passed attempt and an interactive counter from 0 to 1; package/reveal,
  production isolation, fixtures, Preview-only crash and dangling links passed.
- Source Workspace E2E exited 0 including cleanup: exact Lead cancellation and
  process exit, usage unknown-coverage/range selection, scoped history/detail,
  refresh and responsive layouts passed. No provider was called.
- Persistent DEV was restarted normally with the existing login/profile intact.
  Native app inspection confirmed Builder and its work panel open. No production
  Agent cwd, Source grant or user project configuration was changed.

Private evidence (ignored development artifacts, not public release evidence):

- `desktop/dist/builder-feedback-desktop-committed.log`
- `desktop/dist/builder-feedback-plugin-final.log`
- `desktop/dist/builder-feedback-preview-final.log`
- `desktop/dist/builder-feedback-final-observation/builder-validation-feedback.png`
- `desktop/dist/builder-feedback-workspace.log`
- `desktop/dist/builder-feedback-workspace.png`

Reproduce sequentially from `sps-server/desktop` in PowerShell:

```powershell
npm test
$env:SPS_DESKTOP_E2E_HOST_READY_TIMEOUT_MS = '120000'
npm run test:e2e:plugin-preview
$env:SPS_DESKTOP_E2E_SOURCE = '1'
npm run test:e2e:workspace-surfaces
```

Run `npm run check` in `sps-server/sps-plugin-discovery` as well. This acceptance
uses deterministic fixtures and mock Identity; it does not repeat Stage 5's real
Luna authoring or send an AI repair request. There is no new installer, SDK
publication, Core migration/API, fresh dependency audit or physical-device
certification. Documentation commits after this section do not change the exact
tested implementation above.

## Stage 7: Independent Agents and Default Working Folders

User decision (2026-10-24): multiple Agents may reuse the same CLI account, with
independent default working folders. Register a separate Agent explicitly instead
of silently changing an existing Lead. Agent registration/settings remain Core;
Lead/Worker selection remains Plugin Builder. A shared login shares provider
limits, not additional quota. This work does not copy credentials between Agents.

Implemented in source development:

- Reuse Core Assistant registration and configuration APIs. Workspace lists every
  nonterminated Assistant and always offers Add Assistant. The existing setup
  redirect still applies only to a settled empty roster.
- Core create/edit exposes the saved adapter cwd as a default folder, including
  previously unconfigured Agents. Host-only native folder selection returns the
  user's selection without saving or running anything; manual entry remains.
- Neutral Assistant creation and adapter switching default permission/sandbox
  bypass off. Existing saved Agent settings are not changed automatically.
- Builder explicitly checks the selected Lead's saved Codex-local path against
  its Host-linked development project. The minimized result contains IDs/status
  only; no local paths, environment, command or credentials. Host/Workspace and
  current binding are rechecked. Stale responses are discarded in the UI.
- This is a lexical configuration snapshot, not an execution gate or proof of
  actual cwd, sandbox, Source rights, file existence, login or CLI availability.
  Other adapters and remote execution are not certified by the comparison.
- No automatic Agent creation/selection, message sending, cwd mutation, grants,
  installation, Core schema migration or SDK method is introduced.

Final implementation tuple: Source
`51bc7ab9a3f47e1a05d42e083d2ab54cfe0b78c4`, Core
`f0e9f9c99a11ecff21904010f1a6b0cc827f3d83`, SDK unchanged at
`cfa64ec4f589ea9765661834e1685ef1f2e14453`. Checks on 2026-10-24:

- Desktop 459/459, Builder 40/40 plus UI build/manifest verification.
- Core UI focused tests 28/28, UI typecheck and production build passed. Core
  authorization suite 41/41 and server typecheck passed.
- Source Preview E2E exited 0 including cleanup on that tuple. The actual Core
  form registered two distinct Codex-local Assistants with different folders and
  sandbox bypass off, leaving the original Agent unchanged. No CLI was run by
  registration. The folder check covered matching, different and missing paths,
  preserved settings/draft/attachments, denied invalid/unlinked/foreign contexts,
  and sent no message. Static gates, intentional runtime rejection, feedback,
  restored interactive Preview, archive/reveal, isolation and crash checks passed.
- Source Workspace E2E also exited 0 including cleanup: exact Lead cancellation
  with process termination, scoped history/detail, unknown usage and range
  controls, refresh and 1024/1280/1440 responsive layouts passed, with no provider.
- Native persistent DEV was restarted normally with existing login/data intact.
  The Assistant roster and registration form were inspected, and the Windows
  directory picker was opened and cancelled with no Agent created or saved.
  Successful native selection payloads and stale/cancel/error cases are covered
  by controller/component tests; a native successful folder selection was not
  completed in this manual check.
- The global token gate still reports repository-wide pre-existing findings;
  none of this increment's changed UI paths appear in its findings. This is not
  an all-gates-green claim. Full Core/Linux regression, dependency audit, actual
  Google OAuth, remote Member, paid CLI authoring, signing and installer tests
  were not rerun in this increment.

The new E2E exposed an existing Board authorization dispatch bug: protected
configuration actions intentionally map to no single permission key, but their
grant handlers were placed after the unmapped-action denial. Core now reaches
the existing direct/suggest/consent checks before that fallback; no grant bypass
was added. Regression tests cover authorized reads/updates, denied no-grant and
foreign-Workspace users, and suggest changes requiring consent.

Private logs (not release evidence): `desktop/dist/agent-folder-preview-grants.log`,
`agent-folder-desktop-grants.log`, `agent-folder-builder-check.log`,
`agent-folder-core-tests.log`, `agent-folder-authorization-tests.log`,
`agent-folder-core-ui-typecheck.log`, `agent-folder-core-server-typecheck.log`,
`agent-folder-core-ui-build.log`, `agent-folder-token-gates.log`; screenshots in
`desktop/dist/agent-folder-grants-observation/`.
Workspace regression evidence: `desktop/dist/agent-folder-workspace.log` and
`desktop/dist/agent-folder-workspace.png`.

Earlier `agent-folder-preview.log` failed because the harness selected a button
before scoped loading finished; `agent-folder-preview-final.log` assumed an
already-failed process Agent would report unsupported instead of unavailable;
`agent-folder-preview-accepted.log` exposed the real Core PATCH 403. These remain
failed attempts, not acceptance evidence. A baseline unit run also correctly
rejected the unstaged updated Core pin; staged and committed checks passed.
The final passing log above supersedes them. Documentation commits do not change
the tested implementation tuple.

## Stage 8: Real Lead-to-Worker Verification and Security Hold

On 2026-10-24, the isolated source fixture exercised real local Lead tool
delegation and distinct Worker runs for authoring and manifest/hash repair.
Desktop `480/480` and Builder `45/45` passed, but the final Electron suite did
not: one earlier attempt passed interactive Preview then failed the test's
hidden Registry-view handoff; the final attempt instead encountered generated
UI rendering failure before the corrected manual-install handoff. These are
partial observations, not complete Builder or installed-app acceptance.

The exact tuple, commands, failed attempts and next diagnostic-capture work are
recorded in [the team verification review](../reviews/BUILDER-TEAM-VERIFICATION-2026-10-24.md).
The user explicitly deferred Zod migration and installed-app replacement pending
[the compatibility impact assessment](../reviews/ZOD-MIGRATION-IMPACT-2026-10-24.md).
Fresh production and full-graph security gates both fail; no waiver was added.
No new installer or public Stable release was created.

## Stage 9: Browser UI Contract and Complete Local Team Fixture

The follow-up reproduced an actual generated UI using `globalThis.React`, which
the host does not promise. Builder now supplies the existing external React
import contract to both Lead and Worker without changing Core, SDK, workflow
roles, Source grants, model settings or installation policy. Failed-fixture
capture preserves four bounded private files; it never labels failures verified.

Source `c235c481a159a860ffbd69e0e721b8573d48714c`, with the same Core/SDK tuple,
passed Desktop `487/487`, Builder `46/46` plus build/manifest and Core React
bridge/slot tests `17/17`. Real-team v9 exited 0 including cleanup: real Lead
delegation, distinct Worker authoring, deliberate validation failure, explicit
feedback and separate Worker repair, interactive isolated Preview, error/mobile/
Member fixtures, package/reveal and Preview-only crash all passed. The Host then
explicitly staged and confirmed installation of the exact same archive in the
temporary Host and interacted with its installed page. No AI installation or
user production-Host mutation occurred.

The [team verification review](../reviews/BUILDER-TEAM-VERIFICATION-2026-10-24.md)
retains the exact artifact hash, commands, failed attempts and acceptance limits.
This verifies the explicitly authorized local fixture, not default approval UX
on all user Agents or remote Node authoring. Zod migration, security remediation,
installed-app replacement and Stable acceptance remain on their existing holds.

## Deferred and Unverified

- Source-bound production authoring and remote Member authoring remain unverified.
- Conversation-to-project navigation references are Host-selected. Automatic
  Source grants and Agent working-directory binding are not implemented by this
  handoff. A dedicated local Agent's real authoring has now been verified, not
  automatic authoring against an arbitrary connected Source.
- An AI-callable authoring tool cannot substitute for Desktop's mandatory
  `build`/`validate`/`test` execution or mint verified gate evidence.
- Public publishing, publisher review, Official Registry signing and community
  distribution are not implemented.
- Broader Tailscale embedding, budgets/admission, advanced recovery and Stable
  release acceptance are outside this bounded delivery plan.
