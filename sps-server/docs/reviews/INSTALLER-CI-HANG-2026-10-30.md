# Installed Package Acceptance Timeout

Date: 2026-10-30. This records a failed acceptance, not a qualified installation.

## Observed Failure

Source `377b4f00c0916cd9d73c4d6e412d9903c2a4f194`:

- PR run `41039640931`: installer step started 10:45:20 UTC; native launcher
  timed out at 11:03:20 UTC with `restricted_e2e_timeout:phase=child_wait`.
- Push run `41039634125`: installer step started 10:47:59 UTC; the same timeout
  occurred at 11:05:59 UTC.
- Both recorded `ownedJobEmpty: true`, `ownedJobCleanup: forced`,
  `accepted: false` and helper exit 124. Forced cleanup correctly failed the
  acceptance; it is not proof of a successful install or natural shutdown.
- All 17 non-Windows jobs and the earlier source/packaged Desktop steps passed.
  The installer/data-preservation step is the remaining failed Windows stage.

The only earlier installer-step output was launcher/token/dependency validation.
The old harness printed its installer result only at the end. It therefore does
not establish whether the process stalled during registry inspection, WMI,
historical download, NSIS, or the nested installed first-frame check. A nested
child timeout with inherited output handles is also a hypothesis, not a finding.
Neither the EXE nor a specific NSIS phase is blamed without that evidence.

## Diagnostic Correction

The harness now emits fixed phase/stage records around registry and process
queries, historical download verification, NSIS start/close, installed-package
checks, first-frame checks and retained-data verification. NSIS close records
exit code, signal and elapsed milliseconds. No account, directory, executable
path, registry contents or credential is logged by these stage records.

The hosted/owned-Job guard still executes before the first trace or any profile
read. Existing preconditions, pinned installer hashes, exit assertions, data
checks, native cleanup rules, the 18-minute native wait and 20-minute workflow
step limit are unchanged. A missing end record will identify the last entered
boundary on the next run; it does not turn a timeout into a pass.

Local diagnostic/installer contracts passed 9/9:

```powershell
node --test test/historical-installer-flow.test.mjs test/installer-ci-safety.test.mjs test/historical-installer-baseline.test.mjs
```

The subsequent full Desktop run passed 1563 of 1565 tests, with two
environment-dependent skips and zero failures. Those unit/contract results do
not qualify the timed-out installer scenario.

No installer was launched locally. The existing local SPS app and data were not
used. Exact Source `3ebc90c` runs `41043933502` and `41043942032` predate these
diagnostics and must be observed separately; they were still live at the time
of this record. Do not restart them solely because an observation times out.

## Read-Only Process Preflight

The fixed `probe-installer-processes` mode exercises the same WMI process-name
filter through the existing reduced-token native launcher, without installing,
modifying registry/data, requiring zero matching processes, or stopping any
unowned process. Output contains only a count and elapsed milliseconds. The
PowerShell call retains a 30-second timeout; only this diagnostic has a
45-second native parent deadline. Ordinary acceptance remains at 18 minutes.

The parent reran the probe locally and observed `count: 0`, `elapsedMs: 140`,
the reduced same-user token, natural owned-Job emptiness and closed owned
desktop handles. This host did **not** create a private window station
(`privateWindowStation: false`, station cleanup `not_owned`). The result proves
the local query is responsive, not equivalence to the CI private-station
environment and not the cause of the historical installer hang.

The new Windows test requires a successful query and natural cleanup. Genuine
nonzero results and timeouts fail instead of being swallowed. In hosted CI it
also requires the private window station actually to be present. It is part of
the ordinary Desktop test glob, so a reproducible CIM prerequisite problem can
fail before packaging rather than first surfacing in the 18-minute installer
acceptance. Existing full installer checks are unchanged.

Targeted Windows launcher/probe tests passed 21/21 after parent review:

```powershell
node --test test/installer-process-probe.test.mjs test/windows-ci-e2e-runner.test.mjs
.\scripts\run-windows-ci-e2e.ps1 -Mode probe-installer-processes
```

After integrating that probe, the full Desktop test command passed 1565 of
1567 tests, with two environment-dependent skips and zero failures. This adds
an earlier prerequisite diagnostic, not successful installation evidence.

## Subsequent CI Attribution And Native Correction

Later terminal logs narrowed a specific failure to the process precondition:

- Source `3ebc90c` push run `41043933502`, Windows job `124023222704`,
  failed in the installer/data-preservation step at 11:28:43 UTC. The
  `Get-CimInstance Win32_Process` subprocess reported `SIGTERM` and the child
  returned 1; the external Job emptied naturally. This was before installer
  mutation, not proof that NSIS itself failed.
- Source `cb3e773` push run `41047846792`, Windows job `124036237249`,
  reproduced an unavailable CIM query in the early isolated process test:
  `not ok 379`, signal `SIGTERM`, empty stdout/stderr, helper child exit 1.
  The test correctly failed rather than substituting a zero process count.
  The matching PR run `41047854244` also failed that Desktop test stage.
- All 17 other jobs passed on the exact `cb3e773` push. The old `377b4f0`
  uninstrumented 18-minute timeouts remain separately unattributed; these later
  results do not retroactively establish their exact last phase.

Process inspection now uses the already compiled owned test helper's fixed
read-only `--read-installer-processes` subcommand. It calls Toolhelp process
snapshot enumeration and compares the exact executable name case-insensitively.
No WMI/PowerShell service, process handles for termination, registry mutation or
new production authority is involved. Only a count and elapsed milliseconds are
returned. Invalid snapshots, enumeration errors other than end-of-list, helper
replacement, malformed output and query failures abort acceptance. See the
[Microsoft Toolhelp example](https://learn.microsoft.com/en-us/windows/win32/toolhelp/taking-a-snapshot-and-viewing-processes).

Both the early probe and every install/uninstall process precondition use this
same reader. The installer still requires zero SPS processes before mutations;
the read-only local probe does not require zero and never kills any process.
Hosted-only installer permission, empty registry/data requirements, hash checks,
30-second query bound, 45-second probe parent, 18-minute acceptance parent and
natural whole-Job cleanup requirement are unchanged.

The parent ran the new native read-only probe locally: `count: 0`,
`elapsedMs: 5`, reduced same-user token, natural owned-Job emptiness and closed
owned desktop. This machine still reported `privateWindowStation: false`, so
that local pass is not the final CI-private-station proof or a successful
installer acceptance. No local installer was run and installed data was not
touched. Exact new-HEAD hosted CI remains required.

After parent review, the focused process/launcher/historical-flow tests passed
26/26. The first full run caught one stale diagnostics contract that required the
removed PowerShell call; it was corrected to require the native query and the
unchanged zero-process mutation assertion. The final spec-reporter full run
passed 1592 of 1594 tests, with two environment skips and zero failures
(`node --test --test-reporter=spec test/*.test.mjs`, exit 0). A separate dot
reporter run also exited 0. Neither run executes the local installer.

## Hosted Native Probe And Canonical Fixture Correction

Source `2c5ceefacdfd9d4eef5ab1333809948144d39852`, push run `41050065257`,
Windows job `124043625525`, passed the real restricted native process probe
(`ok 384`, 11:48:15 UTC). The test requires the actual private window station on
hosted CI and natural owned-Job cleanup. This supplies the CI-specific native
probe evidence missing from the local result; it still does not run NSIS.

The job then failed a separate mocked-helper unit test (`not ok 386`): its temp
fixture used `os.tmpdir()` without canonicalizing the path. The real helper
reader correctly rejected a noncanonical directory. Production helper checks
were not loosened. The fixture now resolves its temp parent before creating its
owned directory, matching the existing registry-query fixture pattern. The
corrected focused query/probe/registry tests passed 9/9 locally, and the full
Desktop run again passed 1592/1594 with two environment skips and zero failures.
Exact new-HEAD hosted CI and the full installer flow remain pending.

## Historical Replacement Now Reached In CI

Exact Source `ed83ab763429d5cb5cde1cdf8a528d9ff64c9b30`, push run
`41051299729`, Windows job `124047737982`, is terminal failure. Its phase
output establishes more than the older unattributed timeout:

- Native registry/process preconditions completed before mutation.
- Fresh candidate NSIS install exited 0 after 138,824 ms. Five installed
  artifact hashes matched the verified unpacked input, and its isolated first
  frame passed. Nine inert preservation sentinels were unchanged.
- Ordinary candidate uninstall exited 0 after 98,419 ms; registry was empty,
  installed ASAR absent and all sentinels unchanged.
- Pinned withdrawn 0.4.86 NSIS install exited 0 after 283,599 ms. Its separate
  historical registry/package assertions passed. Its application was not run.
- Current candidate replacement began at 12:42:19 UTC. No `nsis-close` arrived
  before the original whole-scenario 18-minute deadline at 12:51:28 UTC.
  The native owner force-closed its own Job and returned 124, acceptance false.

The failure is now localized to the historical-version replacement operation,
not CIM, download, fresh install or the candidate's ordinary uninstall. It
does not establish whether the copied old uninstaller, subsequent extraction
or another internal NSIS operation was waiting. The exact installed
electron-builder template calls copied old-uninstaller `ExecWait` before
installing new application files, but that source order alone is not proof
of which operation stalled in this run. No old installer is a trusted Stable
predecessor, and this run is not an overall installer pass.

The existing native owner now snapshots only its actual Job before timeout
termination in installer mode. It reuses bounded process counts and sanitized
image/parent names, without PID, command line, user path or termination of an
unowned process. A real harmless timeout probe exercises the same diagnostic
branch and still fails with 124 after confirmed owned cleanup. No installer
was run locally. The 18-minute bound, reduced token, private desktop, exact
artifact/data assertions and rejection of forced-cleanup acceptance remain.
