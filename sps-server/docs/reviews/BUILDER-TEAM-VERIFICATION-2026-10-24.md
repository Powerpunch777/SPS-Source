# Builder Team Verification: 2026-10-24

Status: partial isolated source-development verification; the final suite failed
at generated plugin UI rendering. Not complete Builder, installer, production
Identity, remote Member or Stable release acceptance.

## Scope and Tuple

This increment follows the UI audit and tests real local Lead-to-Worker plugin
authoring rather than interpreting registered tool names or a mocked reply as
proof of delegation. Core owns neutral authorized execution/tool transport;
Plugin Builder still owns Lead, Worker, conversation and authoring semantics.

- Desktop: `0.4.137`, source development candidate.
- Source implementation: `78c6547d38ec7b8f9f43d73c31a435f64a4f3615`.
- Core: `0574df95db75bff132ef2b7f9704f7bbd73608c6`.
- Public SDK: `cfa64ec4f589ea9765661834e1685ef1f2e14453`, `0.11.0`.
- CLI: installed compatible `codex-cli 0.163.0-alpha.11.2`.
- Documentation-only follow-ups do not change this implementation tuple.

The CLI fixture requests `gpt-6-luna`, xhigh reasoning and Fast configuration;
both Agent invocation records are inspected. This does not certify provider
billing-tier enforcement. The older global CLI did not support the MXC sandbox
configuration, so the harness requires an explicit compatible executable instead
of silently dropping the sandbox. No login credentials are copied or changed.

## Corrections and Their Ownership

| Area | Correction | Boundary |
| --- | --- | --- |
| Static UI | Bounded ENOENT/EBUSY index read retry; 503/no-store on exhaustion; no stale HTML cache | Core. Reproduced the missing-index error path, not the original historical 500's definitive cause. |
| Local CLI tools | Own-plugin session MCP list/execute transport with scoped environment, loopback URL and bounded nonretrying requests | Core. No automatic lifecycle or role policy. |
| Projectless tool calls | Require exact Agent JWT/run, running noncancelled context and active owned session; retain tenant, activation, capability and provider checks | Core. Not a general project-grant bypass. |
| Tool discovery | Select by canonical namespaced key; descriptor pluginId is a database UUID | Core. Do not conflate database IDs with public plugin keys. |
| Windows batch argv | Attributed escaping with literal round-trip coverage for global and .bin shims | Core adapter utility. No parent environment mutation or permission bypass. |
| Feedback observation | Inspect the scoped work panel instead of the first 5,000 characters of a long conversation; wait for enabled actions and current title | Desktop test harness only. No product UI weakening. |
| Installation observation | Leave project-scoped development review and explicitly reopen normal Host Registry before using visible installation controls | Desktop test harness only. Hidden forms are not user acceptance. |

The disposable Agent explicitly preauthorizes its own plugin RPC to exercise the
known test workflow under approval_policy=never. Production Agent policies are
not changed, generic mutating RPC does not claim destructiveHint=false, and
out-of-box real Agent approval UX remains a separate check.

## Verification Record

- Desktop unit/contract tests: `480/480`.
- Builder `npm run check`: `45/45`, UI build and manifest verification.
- Core focused suites before the final discovery-filter correction: `178`
  passed, `6` skipped. After that correction, MCP tests `17/17` and build passed.
- Core all-workspace typecheck and full build passed after compatible dependency
  updates. No full Core/Linux test pass is claimed.
- Candidate and security-policy generated-document checks passed. These only
  check document/policy consistency, not absence of vulnerabilities.
- Final real-team Electron run (`builder-team-live-v7.log`) exited 1 after
  cleanup completed. Real Lead tool delegation, distinct Worker authoring,
  explicit validation-feedback submission and a new Worker repair passed.
  The repaired package loaded into an isolated Preview, but its page displayed
  `Builder Preview Fixture: failed to render` instead of the counter. The
  interactive Preview and subsequent manual-install assertions did not pass on
  this attempt. This is not a full-flow pass.

Private development logs under ignored `desktop/dist`:

- `builder-security-hold-desktop-final.log`
- `builder-security-hold-plugin-check.log`
- `builder-team-core-final-targeted-v2.log`
- `builder-team-mcp-tests-v3.log`
- `builder-team-core-typecheck-v2.log`, `builder-team-core-build-v2.log`
- `builder-team-live-v7.log`; screenshots in `builder-team-observation/`

### Failed Attempts Are Not Acceptance

- Initial real execution exposed Windows batch argument splitting. Literal-argv
  regression tests cover the repaired path.
- The older global CLI rejected the MXC setting before a provider invocation.
- A later run exposed empty tool discovery (database ID/public-key mismatch)
  and the fixture's unapproved generic RPC; no Worker completion was claimed.
- `builder-team-live-v5.log`: real Lead delegation and distinct Worker four-file
  authoring passed, then long-page feedback observation timed out.
- `builder-team-live-v6.log`: real authoring, explicit feedback, separate Worker
  repair, interactive Preview, Member/mobile/error fixtures, package/reveal,
  Preview-only crash and surviving main Workspace passed. It then failed because
  the harness used the hidden installation form in project-scoped review.
  Cleanup exited successfully, but the suite exited 1. It is not complete
  installation acceptance.
- `builder-team-live-v7.log`: authoring and separate manifest/hash repair passed
  again; generated UI failed to render. The current record does not establish
  whether the generated code or the host loader is responsible. The candidate
  project was cleaned with the disposable profile, so a bounded generated-file
  capture plus renderer diagnostic collection is needed in the next isolated
  attempt before assigning a root cause. Do not increase a timeout or replace
  the generated UI with a harness-authored page to manufacture a pass.

The normal Host Registry reopening correction is present in the final harness,
but v7 did not reach it. Its end-to-end acceptance therefore remains pending.
Earlier v6 Preview success must not be combined with v7's unexecuted installation
step and presented as one uninterrupted successful flow.

### Next Builder Check

Retain a bounded, private copy of the four generated fixture files and sanitized
renderer error details on failure, with an explicit failed/development evidence
label. Compare the generated module against the public SDK/host React loading
contract, then submit the actual diagnostic through the existing explicit
feedback-and-send flow. Rerun interactive Preview and visible Host manual review
on the resulting exact archive. No production lifecycle change is needed to
perform that investigation.

## Reproduction

Build Core first and do not rebuild its shared static output while testing:

```powershell
# In external/sps-core
pnpm -r typecheck
pnpm build

# In sps-server/sps-plugin-discovery
npm run check

# In sps-server/desktop
npm test
$env:SPS_DESKTOP_E2E_CODEX_COMMAND = '<absolute installed compatible Codex CLI executable>'
$env:SPS_DESKTOP_E2E_HOST_READY_TIMEOUT_MS = '120000'
npm run test:e2e:plugin-preview:team
```

The real-team command calls the configured provider. It uses mock Identity, a
separate temporary Host/profile and project, real Core forms and real Agent
runs. Local Registry keys are throwaway fixture keys, not official publisher
credentials. Native folder selection for the fixture Registry is not manually
certified by the injected test path. UI staging and exact confirmation remain
explicit test actions, never AI installation.

## Security and Installation Hold

The user deferred Zod migration and replacement of the installed SPS app.
[The impact assessment](ZOD-MIGRATION-IMPACT-2026-10-24.md) records the affected
contracts and next approval boundary. No waiver, Zod major change or installer
replacement was made in this follow-up.

- Fresh production gate: FAIL, three advisories, one High (Zod) and two Low.
- Fresh full graph including build dependencies/shipped Electron: FAIL, 15
  advisories, six Critical/High, five unreviewed Moderate findings and one stale
  review. These are distinct scopes, not contradictory counts.
- Installed app remains the earlier `0.4.110`; source candidate verification
  does not mean a new installed build or code-signed release exists.
- No reset or mutation of the user's Vault, Agent settings, project Sources,
  plugin lifecycle or account was performed.

Still separate: full Core/Linux regression, global UI token findings, production
Google OAuth/Identity rollout, signed installer and same-byte physical Host and
Member install/upgrade acceptance, protected release/repository requirements and
independent review. Remote authoring and automatic Source/cwd grants are not
certified by this local fixture.
