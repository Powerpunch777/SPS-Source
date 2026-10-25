# Windows Preview Owned-Job Cleanup

Date: 2026-10-26 KST. Status: **development test infrastructure; hosted acceptance pending**.
Desktop remains unreleased 0.4.137. Core/SDK pins are unchanged by this follow-up.

## Observed Failure

Source `d062d1c11c9ea13043cad976850debaca83d84af`, PR workflow `40215021041`,
Windows job `121234177049` is terminal failure. Its actual log shows:

- Prepared Native Host source app and packaged Workspace steps passed.
- Preview functional assertions passed, including registration/folders, Builder
  handoff/feedback, isolated Preview/package and renderer-crash diagnostics.
- Main exit was observed and graceful.
- The global PowerShell `Get-CimInstance Win32_Process` cleanup call exceeded
  its existing 15-second bound. Temporary data removal subsequently succeeded.
- Strict cleanup correctly rejected the step; later Host/Node steps were skipped.

Neither functional success nor the old `ownedJobEmpty:true` record qualifies
this failed run. The old runner terminated its owned Job before printing that
record; it did not distinguish natural exit from forced process cleanup.

## Qualification Contract

The restricted Windows launcher already creates and owns a no-breakaway Job
Object for the test child and its descendants. Its reduced same-user token,
default-DACL checks, private desktop/window station, inherited-handle list and
environment allowlist remain unchanged. No new account, privilege, shell command,
external process enumeration or foreign-process kill is introduced.

Only its fixed `plugin-preview` branch adds `--owned-job-cleanup-pending` to the
test script arguments. It is not an environment variable inherited by Desktop.
In that mode the script delegates the global PostgreSQL census to the launcher,
but still requires all functional assertions, observed graceful Main exit and
temporary-data removal. It prints pending, not a standalone accepted pass, and
exits with reserved nonzero code **76**. A forged direct argument cannot make
standalone execution succeed. Other failures are not converted into pending.

The parent launcher may normalize that code only after independently observing
its actual Job's `ActiveProcesses == 0`, naturally, before any termination call.
The existing bounded cleanup window is retained. A query failure or remaining
descendant requires best-effort owned-Job termination and **failed acceptance**,
even if the Job is empty afterward. Other failing child codes remain failures.
Unexpected zero without the pending protocol is not accepted in this mode.
Owned desktop/window-station cleanup must also succeed.

This checks every remaining process in the owned Job, not a PostgreSQL name/path
heuristic. It is an application-test OS ownership boundary, not physical-device,
provider, TPM, or signed-release attestation. It relies on the existing Job
assignment/no-breakaway contract; setup/query errors fail closed.

Local standalone source acceptance retains its PostgreSQL cleanup command and
data-removal gates. Its final success message is now emitted only after cleanup.
The existing `probe-descendant` intentionally verifies forced cleanup and keeps
its prior contract; new Preview-specific probes distinguish natural acceptance
from forced cleanup failure rather than reinterpreting that old probe.

## Verification Scope

From `sps-server/desktop`:

```text
node --test test/preview-e2e-cleanup-contract.test.mjs test/plugin-preview-desktop-e2e.test.mjs test/preview-e2e-shutdown.test.mjs
node --test test/windows-ci-e2e-runner.test.mjs
npm test
$env:SPS_DESKTOP_E2E_SOURCE = '1'
npm run test:e2e:plugin-preview
```

The standalone source Preview run passes its functional assertions and final
cleanup with the unchanged WMI path. The small disposition tests cover failed/
malformed evidence and a real standalone Node process which returns 76, not 0,
when it uses the delegated argument. Real Windows launcher probes must also
verify natural/pending acceptance, forced descendant failure, unexpected zero
and an unrelated 76 remaining nonzero. Fresh exact-head packaged Windows CI is
still required; local tests and old failed workflows cannot replace it.

Parent reruns pass: combined cleanup/runner contracts **17/17**, including
**13 real Windows runner cases**; full Desktop **832 total / 831 pass / 0 fail /
1 existing skip**. The source Preview app passes its existing functional cases
and final cleanup. Kernel-query failure branches are fail-closed in source but
were not exhaustively fault-injected. No real packaged hosted pass is claimed
until the changed launcher runs on its exact Source revision.

Native enrollment, external LAN activation, Host invitation policy, installed
app/runtime, user keys/data, current Tailscale/SMB support and SDK are unaffected.
Core `0d306bd46` workflow `40216576298` separately passed 15/15; it is not this
Windows test change's acceptance. Zod High1243066 and the remaining release gates
are not waived by this cleanup protocol.
