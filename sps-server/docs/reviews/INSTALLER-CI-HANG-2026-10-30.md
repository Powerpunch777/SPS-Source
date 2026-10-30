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
