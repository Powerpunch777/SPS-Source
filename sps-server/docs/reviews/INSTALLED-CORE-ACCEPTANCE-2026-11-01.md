# Installed Core Acceptance: 2026-11-01

Status: exact development-candidate installed acceptance passed. Core completion,
signed release, physical two-PC acceptance and normal-profile acceptance are not
established by this record.

## Exact Candidate

- Source: `38fb3849e2b7b409e087f0b3926b858bf6e04a76`.
- Core: `491794820c23f956912d69eba271c1ef07ba36a1`.
- Public SDK: `61a929f6c783f78e5af603682de1543c7e24abc0`.
- Desktop: `0.4.137`, clean unsigned development candidate.
- Installer SHA-256: `1f4866b03d42be2c0f3d3ecac7529f7b77f88256233aa7447bfe1d467483b1b0`.
- Installed EXE: `7341392b99ac4cd0878f850c19b69746f413c388b347e4f23f2cc25ab91b47fb`.
- Installed ASAR: `b074c511d3cf417689c4831b65c1d96725704de90eda2f7fa457e7bc0482bec5`.
- Runtime archive: `1c94573f3a058d213846455a44d56089407df0dcbdfdba366b009d771672d51e`.

The authoritative [Windows job](https://github.com/Powerpunch777/SPS-Source/actions/runs/41277553485/job/124762686223)
is terminal `success`. Its installer receipt at `2026-11-01T06:20:15Z` and the
following native owner records report natural whole-Job emptiness and closed
owned Desktop/WindowStation. The pending-external-observation receipt alone is
not the acceptance; it must be read with those owner records and the job result.

## Scope Actually Executed

The real installed candidate Main used a fresh isolated profile whose account
and signing key were first encrypted by actual Main/Windows DPAPI. The closed
profile was then populated with the pinned historical Core schema and v11
Desktop state, without applying current migrations or taking a restore shortcut.

The installed candidate migrated that same profile from 157 to 176 migrations and
Desktop v11 to v13 without sign-in or restore. Both historical Workspace projects,
data, account and signing key survived actual Workspace display and restart.
Progress reached initial data verification at 82713ms, restarted data verification
at 94967ms and owned temporary cleanup at 107282ms, within the original 300-second
historical child bound. These are fixture elapsed times, not a general launch SLA.

The surrounding actual installer flow passed fresh install, current-package
replacement, in-place reinstall, uninstall preserving data and reinstall of
retained data: 9 retained records, 5 installed-artifact byte-parity checks and 3
isolated installed first frames. The workflow also passed packaged Workspace,
Plugin Preview and Host Plugin lifecycle E2Es, source Main export/empty-Host
restore/reapproval/crash recovery, historical backup restore and Node contracts.
All nine Linux partitions, full Core Linux typecheck/build, three Identity Node
versions, SDK/Registry, compatibility and bundled-plugin jobs completed successfully
on this Source SHA.

The mandatory legacy-installer recovery job of this same run was still active
when this record was written. The previous b361 legacy success remains valid only
for its older bytes; see [the separate acceptance](LEGACY-RECOVERY-ACCEPTANCE-2026-11-01.md).
Do not infer overall workflow completion from the successful Windows job.

## SSH Operator Trial Did Not Qualify

The approved private two-PC preliminary trial used the older b361 development
candidate in separate owned Temp roots, not this installed candidate. It reached
the remote controller-ready frame but received no initialize response within 390s.
No candidate app, Host, sharing route, Runner registration or execution started.
It therefore supplies no physical Runner acceptance.

A late-request/receipt-before-EOF regression was added to the real local Windows
restricted launcher. The controller and launcher selection passed 8/8 locally,
including natural external Job closure. Separate bounded primitive console,
native-process and readline probes also worked over the pinned SSH connection.
However, the actual restricted control channel did not return the late close
receipt over SSH. An anonymous-pipe parent-relay experiment and CRLF variation
did not resolve it; the unproven C# change was removed and the copied private
operator restored to the original source hash. Do not report a fixed root cause.

The nonresponsive, app-free test controllers were stopped only after validating
their exact owned fixture, process ancestry/creation identity, absence of app
descendants and empty private Serve state. Those terminations invalidate the
trial; natural closure of the remaining Job after that stop is not a test pass.
Installed app/login/project data, firewall and Production were untouched. Private
paths, accounts, addresses and raw controller frames stay out of this record.

After removing the unproven relay experiment, all four cross-device guard/session/
controller/launcher suites passed 23/23. Full local `npm run test:ci` passed:
2/2 serial tests plus 1913 remaining tests, 1910 pass and 3 existing unavailable
Windows 8.3-alias skips. Aggregate: 1915 total, 1912 pass, 3 skip, 0 fail.
Fresh `npm run audit:release` reported 0 Critical/High, 2 Low and 1 reviewed
Moderate advisory (review expires 2026-11-07); this is not zero vulnerabilities.

Microsoft's [handle inheritance](https://learn.microsoft.com/en-us/windows/win32/procthread/inheritance)
and [redirected child I/O example](https://learn.microsoft.com/en-us/windows/win32/procthread/creating-a-child-process-with-redirected-input-and-output),
and Node's [child stdin](https://nodejs.org/api/child_process.html#subprocessstdin)
and [readline](https://nodejs.org/api/readline.html#rlsymbolasynciterator)
contracts informed the isolated experiments. No upstream source was copied.

## Still Required

Host-reviewed artifact cleanup reference/fence/removal/Settings composition;
real packaged Main-loss/per-Worker descendant closure and Plugin SQL crash
windows; final UI/security gates; and actual two-PC Runner execution, failure,
cancellation, lease/disconnect/reconnect and cleanup on the final candidate.
Later Source changes need their own exact-HEAD checks. Signing/Identity operational
rollout and other separate Stable release conditions remain independent.
