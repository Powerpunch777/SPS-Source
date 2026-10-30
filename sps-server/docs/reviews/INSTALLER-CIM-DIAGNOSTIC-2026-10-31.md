# Read-Only Installer Process-Check Diagnosis

## Confirmed Hosted Failure

Exact Source `1cbc497c94f668b8e7e2825114ebf30971cd4109`, Core
`258800f0d931932d855e275ed7cfab2c1bf0a080`, run `41078863800`, Windows job
`124142297278` failed at 2026-10-30 16:10:13 UTC. All 17 non-Windows jobs,
including nine Linux test shards and full Core typecheck/build, passed. Actual
source transfer/recovery and the four packaged execution/surfaces/preview/
plugin-lifecycle steps passed. This is not a complete Windows pass.

The NSIS setup assembled successfully. Fresh installation, five installed-file
hash comparisons, isolated first frame, ordinary uninstall with nine retained
records, and pinned withdrawn 0.4.86 installation passed. Historical replacement
then reached the unchanged 18-minute whole-test bound. Read-only Job inspection
showed the old uninstaller and its PowerShell child still alive. No hidden
old-uninstall-failure dialog was present in this run. Forced owned-Job cleanup
was correctly rejected, with exit 124. The run did not reach later repair,
ordinary uninstall and reinstall phases.

Run `41078109717` for preceding Source `78658df` failed the same way at
16:06:36 UTC. Older `8d67c08` run `41073127156` instead had a hidden uninstall-
failure dialog at timeout. The supported NSIS fail-closed hook addresses that
dialog after an old uninstaller returns; it cannot unblock a still-running
PowerShell child. Do not conflate these two observed states.

## Narrow Diagnosis

The separate `Diagnose SPS installer process checks` workflow runs only three
fixed read-only PowerShell variants under the existing reduced same-user token,
private desktop and owned process Job:

- Startup: `-C "exit 0"`.
- Legacy: the old template's `Get-CimInstance Win32_Process` path predicate.
- Current: the same query with `-NoProfile -NonInteractive`.

No installer, uninstaller, product Main, real profile, registry mutation, process
termination command or package lifecycle action is invoked. A fresh empty owned
temporary directory makes a clean process-query exit of 1 expected. The startup
variant expects 0. Any output/error, signal, timeout or unexpected exit fails
the probe. Public diagnostics contain variant, status, durations and byte counts,
never process details, command text, absolute paths or raw output. A 60-second
child bound and 90-second owning-Job bound preserve failure semantics.

This workflow is diagnostic only, not an installer/release qualification gate.
It avoids waiting for an entire package build to isolate PowerShell startup from
CIM querying. Sources consulted: the pinned electron-builder template,
[Microsoft restricted-token reference](https://learn.microsoft.com/en-us/windows/win32/api/securitybaseapi/nf-securitybaseapi-createrestrictedtoken)
and [WMI/UAC behavior](https://learn.microsoft.com/en-us/windows/win32/wmisdk/user-account-control-and-wmi).
WMI failure or environmental attribution is not established merely by a live
PowerShell image.

## Local Evidence And Limits

All three real read-only local probes exited 0 after the owner observed natural
Job emptiness: startup 169 ms, legacy query 588 ms, current query 418 ms. These
used an isolated desktop on the caller's existing window station
(`privateWindowStation: false`), whereas hosted failing runs use a newly owned
private station. This difference is recorded, not yet claimed as the cause.
The existing installed app and its data were never targets.

Luna supplied five pure contract tests; the parent reviewed them and tightened
clean-output requirements to reject nonterminating CIM errors that also return
the expected exit code. Full Desktop `node --test --test-reporter=spec
test/*.test.mjs`: 1649 total, 1647 passed, two unavailable-8.3-alias skips, zero
failures. Exact committed-HEAD hosted diagnostic results remain pending.

## First Hosted Diagnostic Result

Source `c23d86d4636750e23aa201ec45aab4e2c68429bc`, separate run `41087991576`,
completed all three x64 probes successfully in the hosted private window station.
Startup took 216 ms, legacy query 21070 ms, current query 30753 ms. Output/error
byte counts were zero; each owner observed natural Job emptiness. Thus a generic
claim that the restricted token or private station always prevents PowerShell/
CIM execution is disproved. This narrow result does not reproduce or qualify
the old uninstaller handoff.

The next diagnostic also selects the fixed SysWOW64 executable to compare x86
and x64 behavior: a 32-bit NSIS caller can have System32 redirected, unlike the
64-bit Node probe. The architecture is strictly x64/x86 and affects only this
read-only probe, not product launch or installer policy. See Microsoft's
[WOW64 redirector reference](https://learn.microsoft.com/en-us/windows/win32/winprog64/file-system-redirector).
The actual local x86 legacy query took 1425 ms and exited naturally with clean
expected status. Hosted cross-architecture comparison and actual old-uninstaller
causality remain pending. No timeout increase or successful installer claim is
derived from these diagnostics.
