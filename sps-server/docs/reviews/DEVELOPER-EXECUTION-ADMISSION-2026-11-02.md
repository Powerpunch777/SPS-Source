# Development Execution Admission

Date: 2026-11-02. Source runtime `9c3230116dd80e8fdda401f8cfb5353406f2c375`.
Core `3abf1f50b9cf69e23397e9b2cc1a0d1a01a2365d`, SDK source pin
`0111d291a99c032760a391693aa879bb099b5034` unchanged. The tested runtime worktree
was committed unchanged; subsequent documentation is not a new runtime test.

## Finding and Change

The existing development Preview starts a Node Host and imports Plugin code with
the Windows user's authority. Its separate Vault/database, loopback transport,
Electron renderer sandbox and owned process Job do not establish OS file/Vault/
child-process containment. The previous "isolated Preview" wording alone was
too broad. This increment does not build an OS sandbox or resume Native LAN.

`desktop-registry-controller.mjs` now checks the exact Registry window and Host
owner and then requires a bounded exact `{projectId, executionMode}` record at
five code-execution entries: gates, candidate apply, last-good rollback, UI reload
and Worker restart. `developer-execution-policy.mjs` rejects omitted, unknown or
`protected` mode before calling the operation. There is no protected-to-legacy
fallback and no user-provided assertion that makes containment supported.

The existing legacy development path remains available only through explicit
`executionMode: "trusted-local"`. This is a trust selection, not a new capability,
permission grant, signed OS attestation or security boundary against a compromised
trusted Registry renderer/OS user. Host/window checks are still mandatory. The
Registry UI asks on every affected action and describes access to Windows-user
files/credentials and the lack of OS sandbox protection. Decline sends no action;
no persistent or package-supplied trust mode is reused. Old callers lacking the
explicit selection now fail closed intentionally. Public Plugin SDK/API is unchanged.

The warning/button/notices distinguish separate Preview data from OS protection.
The historical `isolated` result field and lifecycle diagnostics still describe
data/process separation, not OS containment. Existing trusted package installation
and local Plugin operation remain separate contracts; this check does not turn
all Host-installed code into protected execution.

## Verification

Windows parent/nested helper PATH fixed to Node 24.22.1. No dependency installation,
user DEV restart, actual user login, certificate, firewall or LAN change.

```powershell
node --test test/developer-execution-policy.test.mjs test/desktop-registry-controller.test.mjs test/registry-renderer.test.mjs test/legacy-driver-diagnostic.test.mjs test/legacy-driver-private-desktop.test.mjs test/plugin-preview-main-contract.test.mjs test/plugin-preview-desktop-e2e.test.mjs
node --test test/*.test.mjs
node scripts/smoke-plugin-preview-desktop.mjs
```

- Focused 33/33, including actual restricted private-desktop component probe.
- Full Desktop 2,244 total / 2,241 pass / 3 unavailable Windows8.3 skips / 0 fail.
- Source Electron E2E exit0: all five methods rejected both omitted and protected
  mode before Preview startup; the actual Main projection stayed `{active:false}`.
  Only the fixed, trusted SDK operator fixture then selected `trusted-local`.
- The trusted fixture passed build/test, intentionally bad manifest rejection,
  Preview/real-fixture Workspace data separation, Member/mobile/error fixture
  update, renderer crash, redacted diagnostics and account-sign-out closure.
  "Account" here is the isolated mock Identity test account, not the user's
  Google/CLI login. No live AI or untrusted generated customer code was executed.
- Main shutdown was graceful and confirmed; CDP, temporary PostgreSQL and mock
  Identity closed, exact temporary fixture cleanup completed. This is not all
  descendant/OS/signed/physical qualification. No fresh screenshots were requested;
  actual IPC/DOM checks and unit UI confirmation checks are distinct evidence.

The UI confirmation cancellation/acceptance is covered by the renderer harness;
the real app's trusted fixture calls the restricted IPC explicitly. Do not claim
the app test physically clicked every new confirmation dialog.

## Separate CI Diagnostic

Source db9dd6e push run41380873481 failed a private-desktop recovery confirmation
component assertion. The previous outer error discarded the probe's safe modal
step and interactive flag, obscuring which original check failed. Commit4252247
retains whitelisted details through a pure formatter and drops unknown/raw output,
paths and credential-like fields. No timeout, retries, skip, cleanup or success
criterion is changed. Parent Node24 focused4/4 passed including the actual Windows
probe; an agent's earlier Node26.4 run is not counted as Node24 evidence. The cause
of the hosted intermittent confirmation failure is not established by this fix.
The separate same-HEAD PR run41380878666 proceeded beyond those tests; its final
status must be read independently, not combined with the failed push into one pass.

## Remaining Boundary

Protected code execution is unavailable. These five Desktop Developer Mode entries
are now explicitly denied in protected mode. Other generated-code/CLI/Plugin paths
and the actual OS containment boundary still require their own audit or denial;
this increment is not G-wide or Core-wide completion. Builder's new Preview button
remains unavailable and no execution permission is inferred from its Lead chat.

Native LAN remains deferred; further management UI expansion remains on hold.
The current DEV process/data, existing installation and private Core/public SDK
boundary are preserved. No SDK publication, merge/tag/release or Stable qualification.

Reference: [Electron Security](https://www.electronjs.org/docs/latest/tutorial/security).
Its renderer advice does not prove Node Plugin process containment.
