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

## Cross-Architecture Result And Owned Command Classification

Exact Source `300ccdc40b85a0466a992741fdb3906575afe6d9`, diagnostic run
`41088750908`, passed all six hosted probes with empty output/error and natural
Job cleanup: x86 startup 5778 ms, legacy 52669 ms, current 44258 ms; x64 startup
227 ms, legacy 31027 ms, current 30737 ms. This also disproves an always-broken
x86 query hypothesis, not the specific old-uninstaller failure.

The next bounded diagnostic reads native command-line metadata only for the
already-owned Job's Windows PowerShell processes and emits fixed invocation
categories, architecture and argument-marker booleans. It never logs command
text, path, account, PID or token. It rechecks process Job membership and exact
System32/SysWOW64 image path. Two native metadata queries accept at most 64 KiB,
validate the returned Unicode buffer boundaries and NUL handling, and fail to
`unavailable` for unsupported APIs, access failures or malformed results. There
is no process-memory read, write, process injection, WMI fallback or elevated
product privilege. Metadata is best effort, not authority or a proof of the
instruction currently executing.

The undocumented information class is used only in the acceptance helper,
following an independently written bounded native-query approach; see the
[Microsoft API caveat](https://learn.microsoft.com/en-us/windows/win32/api/winternl/nf-winternl-ntqueryinformationprocess)
and [Chromium's primary implementation discussion](https://chromium.googlesource.com/chromium/src/+/0ed6d7ba52656400c3f3604e9fd62cbf2c1623f9/chrome/chrome_cleaner/engines/broker/scanner_sandbox_interface.cc).
It does not become a runtime requirement for SPS or an installer success gate.

A harmless local PowerShell sleeping fixture with deliberately private command
text was classified successfully in about five seconds. The test required the
original timeout exit124, forced owned-Job cleanup with `accepted:false`, exact
five-field public metadata, no private text, and correct owned-desktop/station
closure. Luna's bounded test and the parent's direct rerun both passed. No actual
installer or installed profile was used. Actual old-uninstaller command metadata
still requires the next hosted installer attempt.

## Standalone Historical Handoff Diagnosis

The separate hosted-only diagnostic now also downloads and installs the exact
pinned withdrawn 0.4.86 input into its own temporary installation, then copies
that installation's uninstaller out and invokes the same silent per-user
`/KEEP_APP_DATA --updated` handoff with unquoted final `_?=`. It does not require
a Core build, candidate package or product Main startup, so a new observation
does not wait for unrelated app scenarios. The complete candidate replacement
gate remains unchanged and mandatory; a standalone result cannot qualify it.

The fixed helper mode requires GitHub-hosted Windows in both wrapper and native
child before any installation, and the script repeats the existing hosted
guard before reading manifest/profile/registry/fixtures. It refuses any SPS
registration, SPS process, pre-existing APPDATA alias or linked directory,
validates its canonical temporary fixture identity, verifies the pinned download,
exact installed registration and regular owned files, and never launches the
withdrawn application. It preserves the existing `sps-installer-data-*` staging
namespace rather than expanding the historical-download guard. The separate
diagnostic uses a shorter eight-minute owning-Job bound; full installation
qualification stays at eighteen minutes. A timeout/failure is not a pass, and
the fixture is left only for the disposable VM's lifecycle, never recursively
removed from a profile.

Parent review corrected an invalid direct fs/promises constant import, checked
APPDATA parent chains and installation directories, and added a real non-hosted
Node invocation that must fail at the first guard without output. The existing
native-helper no-general-shell contract caught the first harmless C# fixture
placement; it was preserved unchanged by moving the fixed sleeping fixture to
its dedicated Node probe. Targeted guard/diagnostic tests passed five checks,
including an actual native classification/timeout/privacy/cleanup observation.
Hosted standalone execution at Source `d3d0515ea82159876023ead3c4258a5d6e1a9b22`
is now terminal: run `41091696529`, job `124186938254`, failed rather than
timed out. The pinned old installation exited 0 after 224182 ms; the actual
updated-uninstaller handoff then exited 2 after 56074 ms (16:44:17 UTC), with
no signal and natural owning-Job emptiness. This narrows the issue to an actual
uninstaller failure in that attempt, but does not identify its failing operation
or qualify replacement by the current installer.

The next diagnostic adds a bounded read-only census immediately before that
same handoff and, when still present, after failure. It reports only fixed
aggregate file/directory/link counts, maximum path lengths and paths over 259
characters, never names or file contents. It refuses links and bounds traversal
by entries, depth and elapsed time; incomplete observation remains explicit.
The installed fixture path and full installer deadline are not shortened or
extended. Long paths remain a hypothesis to measure, not an asserted cause.

Final local full Desktop validation after integration: 1655 total, 1653 passed,
two unavailable-8.3-alias skips, zero failures (`node --test
--test-reporter=spec test/*.test.mjs`, exit0). Diagnostic workflow YAML parsed
successfully. These results do not qualify the pending hosted old-uninstaller
or candidate replacement.

## Census Follow-Up

Exact Source04f1cda diagnostic41151544506/job124388976259 is terminal failure:
old installation returned0 after293223ms; updated uninstaller returned2 after
86260ms with no signal. Both complete censuses retained29314 files and3051
directories,46 paths longer than259 characters. There was no observed removal
of these counted entries. This is not proof that path length caused the error.

Five of six separate read-only architecture probes passed. x86 legacy
job124388976398 reached its60-second bound with SIGTERM and empty output/error;
x64 legacy and x86 current returned the clean expected1. The same x86 legacy
probe passed in the prior run, so an always-broken architecture claim remains
unsupported. No installer-success gate, path, timeout or cleanup requirement
has been relaxed. Source04f1cda Windows verification stopped earlier at a missing
public-SDK build prerequisite and did not reach candidate installer qualification.

## Passive Command Exit Observation

The owned helper now samples its existing Job process list during only installer
qualification, the short historical diagnosis and a fixed harmless probe. It
retains at most64 query/synchronize handles for exact Windows PowerShell images
that also pass the existing Job-membership and bounded command-metadata checks.
Metadata and exit observations use the same retained process handle. No PID,
path, account, command text, environment, output stream or memory content is
published. The observer does not launch, stop or alter an installer process.

Polling reports a fixed command category, architecture, profile/interactive
markers, sequence, observation time and exit status. An exit code is read only
after the handle is signaled; code259 is not treated as a liveness test. An
unsignaled handle at the deadline is explicitly pending, and a failed status
query is unavailable. Duration starts at first observation, not actual process
creation. Short-lived/unreadable processes can be missed; bounded enumeration
failure/truncation stays explicit. This is diagnostic evidence, never an
exhaustive trace, process-exit authority or a cleanup acceptance substitute.

The original8/18-minute owning deadlines, restricted token, private desktop,
pending-exit protocol, natural whole-Job closure and fatal forced cleanup remain
unchanged. Handles are released before the existing cleanup path. The new probe
only checks command availability, sleeps briefly and returns7; it never queries
CIM processes, executes an installer or touches a user Vault. Its Node owner
requires actual7/EOF before returning the existing pending76 protocol.

Parent real Windows probe and fixed-fixture checks passed2/2, including exact
public fields, absent private comment markers and natural Job/Desktop/station
closure. Existing ownership/cleanup selections passed33/33 and original
installer safety/command/CIM selections15/15. An initial full suite rejected a
format-only change to the existing45-second probe expression; that original
contract was restored without weakening the test. Final full Desktop passed:
1682 total,1680 passed,two unavailable-8.3-alias skips,zero failures, exit0
(`node --test --test-reporter=tap test/*.test.mjs`). Exact hosted observation
and successful complete candidate replacement remain required evidence.

Native contracts follow Microsoft's
[Job query](https://learn.microsoft.com/en-us/windows/win32/api/jobapi2/nf-jobapi2-queryinformationjobobject),
[zero-time wait](https://learn.microsoft.com/en-us/windows/win32/api/synchapi/nf-synchapi-waitforsingleobject)
and [exit-code](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-getexitcodeprocess)
references. The old26.15.3 upstream template can abort its pre-delete process
guard or roll back failed atomic renames. Its pinned historical artifact was
dirty, so source inspection cannot identify its actual branch. The next hosted
observation must distinguish those possibilities without bypassing either guard.

## Observed Exit Sequence And Separate Path Control

Exact Source7e462f2, run41153852056/job124396202101, failed naturally. The old
installer exited0 after344837ms. Its updated uninstaller's captured availability
and execution-policy commands both exited0; its process-query exited1 after an
observed32411ms. The uninstaller returned2 after103197ms, about4.9seconds later.
All six captured commands exited; none were pending/unavailable, and enumeration
was complete and untruncated. The pre/post censuses stayed29314files/3051dirs,
maxabsolute282/relative181,46paths over259. A captured query did not remain stuck
in that attempt. Exact subsequent initialization/file failure is still unknown;
short-lived commands can be missed. Five separate architecture probes passed;
x86-current timed out60092ms/SIGTERM. Whole Job/Desktop/station closed naturally.

A separate `historical-uninstaller-compact-control` mode now compares that exact
pinned installer with only shorter fixed temporary path components. The baseline
keeps `sps-installer-data-uninstaller-diagnostic-*` / `SPS Desktop` unchanged;
control uses `sps-installer-data-*` / `SPS`. Native dispatch alone sets its fixed
variant after the same hosted checks; it is not an arbitrary input path or local
force option. Control refuses to run the handoff unless its complete census has
zero paths beyond259characters. Both use the same silent/current-user/updated/
keep-data flags, regular copied uninstaller and original final unquoted `_?=`.

The original diagnostic's8-minute and full gate's18-minute bounds are unchanged;
control has its own8-minute bound and disposable hosted VM. Its outcome always
leaves candidate-upgrade, previous-Stable and long-path qualification false.
It cannot replace the unchanged full installer test. This is a causal comparison,
not a product path restriction, a successful long-path fix or a new support policy.
Microsoft's [path-limit contract](https://learn.microsoft.com/en-us/windows/win32/fileio/maximum-file-path-limitation)
is the hypothesis reference, not proof that this binary hit that limit.

Original hosted-first/read-only contracts remain unchanged. The first compact
selection exposed a moved fixed prefix assertion; parent restored the original
default literal call/guard ordering rather than weakening that existing test.
Final compact/original/safety/real harmless exit selection:13/13. Full local
Desktop1696total/1694pass/two environment skips/zero failures, exit0. Actual
installer execution remains forbidden locally. Hosted baseline/control results
at the new revision are still required.
