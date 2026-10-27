# Desktop shutdown and update handoff — 2026-10-27

Desktop must not install an update or report a completed drain when owned work
has not stopped. This increment fixes error propagation, retained cleanup handles
and competing ordinary-quit/update requests. It also repairs the current Linux
recovery-startup test fixture; it does not complete Native Node/Source or qualify
an installed release.

## Runtime cleanup and ordinary quit

Main now drains Native ingress, Node scheduling/commands, update scheduling and
every Workspace/Plugin/Memory/Owner Host/preview manager. An earlier failure does
not skip later cleanup. Independent managers are joined and all rejected stages
produce safe errors. A failed preview handle is retained rather than discarded.
Concurrent callers share a drain; a later explicit retry checks the then-current
handles instead of reusing a previously successful result.

Normal quit marks shutdown complete and calls the final app quit only after a
successful drain. A failure keeps the app open and offers Retry closing/Keep open.
The attempt remains singleflight through that dialog, and Retry only schedules
an explicit new quit request. Already stopped work does not restart automatically.
The failure branch no longer emits `drain_complete` or bypasses cleanup on a
later quit. Raw manager details are not displayed.

## Update ownership

An update-owned drain must finish before `quitAndInstall`. Shutdown rejection or
updater handoff failure restores the downloaded update to a retryable ready state,
reverses the update-owned quit flags, and does not reopen its prompt automatically.
The update remains a manual action; ordinary exit does not install it.

Main rejects an update attempt while ordinary quit owns shutdown. Ordinary quit
requests received during an update-owned drain are consumed without starting a
competing app-quit continuation. The consumed quit latch is cleared so a failed
update does not permanently block a later ordinary quit. Only the path that owns
the drain resets its quit flags.

## Retained process and listener handles

Owner Host stop preserves the existing Native revocation and 12-second graceful
window before owned-process escalation. After escalation it waits for a bounded
exit confirmation (default five seconds, configurable within 1..30000 ms). Both
exitCode and signalCode establish terminal state; a termination request alone
does not. An unconfirmed stop rejects with `owner_host_stop_unconfirmed` and
retains the exact child for retry. A late old stop/exit cannot clear a replacement,
and an existing Host not owned by this manager is never terminated. Forced exit
confirmation is not natural/graceful exit qualification.

Native Host stop revokes authority immediately but retains a failed ingress until
its stop succeeds. Concurrent stop calls share one attempt; failed cleanup blocks
a new listener and remains active for lifecycle gating. Public inspection remains
off after authority is fenced. Retrying does not reacquire authority.

## Portable recovery startup fixtures

The Linux CI failure in four `plugin-recovery-startup-contract.test.ts` cases was
caused by Windows-only `C:/...` fixture strings reaching the new absolute-path
validation. Those test-only paths now use native `path.resolve`; the async Vitest
mock imports node:path inside its factory to remain hoist-safe. Production asset
validation is unchanged. Local focused verification is Windows evidence, not a
claim that the subsequent remote Linux workflow has passed.

## Evidence and limits

Only affected checks ran; no full local suite, Core workspace build, UI rebuild
or manual full CI rerun.

- Recovery startup: one file/four cases passed, exit 0, terminal93666. Cold import
  dominated its 274-second duration; the test assertions took about two seconds.
- Owner Host manager: 27 cases passed, including unconfirmed termination and
  retry, signal exit, late old-child behavior, and no termination of unowned Host.
- Native Host controller: 14 cases passed, including failed ingress retention,
  concurrent stop and rejection of start until cleanup succeeds.
- Update service/controller initial focused run: 11 cases passed. The controller
  was then extended with admission/ownership and its four cases passed separately.
- New runtime drain: three cases passed. New quit coordinator: five cases passed.
  These test injected failure/control flow; they are not real installer execution.
- Main and smoke script syntax checks passed. Diff checks passed apart from Git's
  existing LF/CRLF conversion warnings.
- Actual source Electron Core Settings `--deferred-owner` initially failed before
  the settings target appeared. Emergency cleanup could not confirm its child
  event; a later exact-fixture OS process query found no matching live process.
  The initial run remains failed and its cause unconfirmed.
- A diagnostic retry passed, followed by a final run after the coordinator/Main
  wiring and diagnostic bounds were finalized: terminal45714 exit 0. The settings
  Quit button led through the actual Main drain/coordinator to natural Electron
  exit and isolated fixture cleanup. No Core DB/session or live AI was involved.
  Logs remain outside the repo as `g/work/desktop-drain-core-settings-e2e.log`
  (initial failure), `desktop-drain-core-settings-diagnostic.log`, and
  `desktop-drain-core-settings-final.log`.

The smoke now records bounded redacted Main diagnostics, spawn state and fixed
shutdown traces on failure. Its emergency path waits boundedly and can query
only the unique fixture command-line scope, failing closed if that query fails.
Fixture canonical identity/containment checks remain. Emergency termination can
never turn the scenario into a passing natural-Quit result.

Remaining qualification includes real running Core/worker failure injection,
signed installed update/restore and physical Host/Member/Node LAN. Current full
CI/security is not claimed green; Zod High remains unwaived. Native remains off
by default, Tailscale remains the release transport, and no installed application,
customer data/credentials, firewall or OS trust was changed. No merge/release.
