# Workspace E2E Cleanup Qualification

Date: 2026-10-26 KST. Status: local source No-AI / prepared-Host cleanup and
seven standalone Settings Quit variants verified;
not complete packaged acceptance, Native LAN or signed-release qualification.
Desktop remains unreleased 0.4.137; Core `b0611dbd5` / SDK `d4d692084` unchanged.
The user subsequently approved a local Core Settings Quit button. That narrow
product control is part of this increment; no account auth, listener, Host or
execution grant, installer or updater is changed.

## Follow-Up: Canonical Fixture And Plugin Shutdown

The statements below supersede the earlier checkpoint only for this new source
increment. Current Core is `028396f937a56a6ba271d89a6c183eb984521058`;
Desktop remains unreleased 0.4.137 and SDK remains `d4d692084`.

Exact Source `b25b32b` push `40256564360` and PR `40256568343` each finished
15/18 jobs successful. Both Windows No-AI runs passed their functional cases,
with three orderly Mains, six natural EOFs, and a final graceful exit without
force. Both then failed `temporary_data,qualification`; their owning Job could
not become empty naturally and correctly rejected forced cleanup. Neither is a
passed E2E. Full Linux build failed before Native interop because root `tsx` was
not declared; the revised DB-package launcher is recorded in the issuer review.
The separate production Zod policy gate remained blocked, not bypassed.

The old fixture compared raw `os.tmpdir()` spelling to filesystem real paths.
That is an unsafe acceptance assumption on Windows 8.3 TEMP aliases. The exact
CI filesystem exception was not captured, so this is a demonstrated code hazard,
not a claim that the complete CI failure's root cause is proven. The new fixture
captures the canonical plain temp root and an exclusively created child, plus
bigint filesystem identities for both. Each removal attempt rechecks the same
identities and plain ancestors before touching only that owned child. Replaced
roots, symlinks and junctions fail closed; sibling files are preserved. Internal
recursive-delete retries are disabled so retries do not skip identity checks.
No rejected old temporary directory is retried or removed by this change.
Failure output includes only a bounded fixture-stage label, never a raw path.

Separately, Core's normal shutdown previously disposed Host services without
awaiting plugin worker termination. It now closes scheduling/discovery and
worker admission, joins in-flight startup, and waits for actual worker process
exit before Host services and embedded PostgreSQL teardown. Previously returned
managed handles cannot restart after terminal shutdown. Concurrent stop callers
share a promise; a surviving child makes shutdown fail instead of becoming a
fake `stopped` state. The reusable `stopAll` contract is preserved. This is a
real lifecycle fix, not proof that those workers caused the earlier CI residue.

Verification so far:

```text
# From sps-server/desktop
node --test test/workspace-e2e-fixture.test.mjs test/workspace-surfaces-desktop-e2e.test.mjs
npm test

# From external/sps-core
npx --offline pnpm@11.9.0 exec vitest run server/src/__tests__/plugin-worker-shutdown.test.ts server/src/__tests__/plugin-worker-manager.test.ts server/src/__tests__/plugin-recovery-startup-contract.test.ts --reporter=dot
npx --offline pnpm@11.9.0 -r typecheck
npx --offline pnpm@11.9.0 -r build
```

- Desktop: **925 total / 923 pass / 0 fail / 2 skips** (one existing skip;
  this filesystem cannot supply a distinct real 8.3 alias for the owned fixture,
  so that platform-specific check is not claimed as executed).
- Worker/startup lifecycle: initially **21/21**, then **23/23** after the
  independent-review race fixes, including real Node child exit after RPC
  response, delayed initialize, rejected retained-handle restart and reusable
  `stopAll`; Host-service disposal waits for failure or success.
- Core full workspace typecheck and build: passed. Existing CSS annotation and
  chunk warnings remain; this is not full Linux regression or signed evidence.
- Fresh development-runtime Electron **runtime-discovery and prepared Native
  management both exited 0** against Core `f9e2f9f2f`, with three orderly Mains,
  six natural EOFs, Identity close and owned temporary-data removal in each.
  Final Main quit was graceful without force (189 ms and 0 ms respectively).
  This development runtime's baseline explicitly records Source `b25b32b` with
  `sourceDirty:true`, Core `f9e2f9f2f` and SDK `d4d692084` clean; it is not a
  signed installer or exact final Source-release tuple. Desktop reported local
  Electron 43.7.7 / Node 24.21.0; the prepared Core runtime uses Node 26.4.0.
- Independent follow-up review then found two older reusable-stop races:
  initialize could publish `running` after stop, and bulk stop could erase a
  concurrently started worker from the map. The follow-up fixes temporarily fence
  bulk-stop admission, preserve failed handles, delete only matching stopped
  handles and reject later starts through a removed handle. A fixture releases
  successful initialization only after stop begins, before actual child exit;
  this tests the reported race rather than an early process failure. These
  deterministic real-child regressions are a subsequent Core increment. The
  E2Es above do not qualify that newer revision. Core `f9e2f9f2f` PR workflow
  `40258642248` passed **15/15** jobs, but that also predates the follow-up race
  fixes. Exact-head hosted whole-Job acceptance is still
  required. No gate timeout, Job qualification or force-cleanup rule was weakened.
- Runtime preparation rebuilt tracked Discovery/Room worker bundles against the
  current pinned public SDK and Core shared code. Generated output is refreshed;
  no manifest capability, package activation or implicit execution grant changed.

## Observations And Implementation

- The preceding No-AI flow reached its functional assertions but retained two
  referenced output pipes after the last Main exited. Diagnostic inspection
  identified harness `captureOutput` listeners, not the remaining writer
  processes. Intervention terminated that run with code 1, never acceptance.
- The old harness overwrote `child` on restart, observing Main exit but losing
  earlier generations and their pipe references. The new tracker records every
  real ChildProcess and actual exit / output end/error/close from spawn.
  Main exit is not output EOF; closing a pipe is not descendant termination.
- Before reusing the temporary Host, every earlier Main must exit zero and all
  its output must end without error. Local final EOF waits are bounded; disposal
  closes only recorded pipes after their Main has exited, not any process.
- Final Main shutdown uses the existing Preview helper. Zero/no-signal exit is
  required; force-stop never becomes graceful. Identity close and temporary-data
  removal are mandatory. All stages are attempted after earlier failure. An
  AggregateError retains the projected acceptance failure and fixed cleanup
  stage codes, never raw filesystem failures. Native errors remain redacted.
- CI's exact runtime-discovery/native-management/workspace-surfaces branches now
  use the existing private code-76 protocol. Only the owning launcher can turn
  pending into success after independently observing natural Job emptiness.
  Forced cleanup, timeout, zero without protocol, and unrelated code 76 fail.
  Host-plugin-lifecycle retains older best-effort cleanup; it is not qualified
  by this stricter gate. No privilege/breakaway/environment bypass was added.
- This path does not use WMI in CI. The old local packaged-runtime search is now
  bounded and read-only: a matching process fails, not a forced-cleanup pass.
  Local success claims Main/output/data cleanup only, not every detached Source
  descendant. Whole-Job proof requires the owning runner.

## Restart And Shutdown Diagnostics

Source `cd293d3` PR workflow `40250926513`, Windows job `121342415755`, failed
No-AI with opaque CDP text `Uncaught`; its document was `about:blank` after
restart. Relative DOM navigation could run before the intended HTTP document
committed. The harness now constructs an absolute URL from its owned HTTP target
and uses Page.navigate, then requires the exact reference URL and persisted Job
UI. The original exception description was lost: this closes a demonstrable
code-level hazard, not a proven root-cause reconstruction. Existing waits,
API/data/capability/recovery assertions remain.

Workspace CDP errors now retain finite exception hints and fixed phase labels,
not exception descriptions or stacks. Final shutdown reports only fixed result
fields, force-stop/ack-failure booleans and elapsed time. Browser.close now uses
the checked loopback browser-level CDP endpoint for that exact launch generation,
not the isolated renderer partition. The old renderer request timed out after
20 seconds and was force-stopped in one measured No-AI run. A browser-level
request reproduced the same failure, and a fresh Core Settings-only probe also
did not terminate naturally. These are test-command observations, not proof of a
product shutdown stall; no grace deadline was increased. The small probe was
stopped and rejected, and its temporary directory remains private after cleanup
was denied by the tool policy; no bypass or further deletion was attempted.

## Approved Core Settings Quit

The user explicitly approved adding Quit SPS Desktop to Core Settings on
2026-10-26 KST. It requests the same normal `app.quit()`/before-quit runtime drain
as the tray, not `app.exit`, force-stop, Host restart or sign-out. A shared Main
callback marks quitting and schedules the request once, allowing local IPC to
acknowledge before closing its frame. It does not promise process termination.

Only the exact trusted local Settings main frame can invoke the fixed zero-
argument channel. Quit does not need account login, Host ownership, Agent or
Plugin execution, nor a working status request. Ordinary Member/Workspace and
Plugin renderers receive no quit API. Existing mutation serialization prevents
an overlapping Settings mutation. The renderer suppresses duplicate requests,
shows pending rather than fake completion, and renders a safe retryable error.
An acknowledged request stays pending until the window exits; only a rejected
request re-enables retry. Initial or late-failing status reads cannot block Quit
or replace its pending notice. Sender identity is checked again inside the
serialized action, before the callback as well as after its result.

The app harness clicks this actual button when closing Core Settings; it does
not call a special E2E IPC, automatically accept a security confirmation or
pretend Browser.close is the user's tray Quit. Zero process exit, all prior
generation checks and the independent owned-Job gate still determine acceptance.

## Verification

From `sps-server/desktop`:

```text
node --test test/workspace-e2e-child-tracker.test.mjs test/workspace-e2e-cleanup-contract.test.mjs
node --test test/windows-ci-e2e-runner.test.mjs
node --test test/no-ai-checklist-package.test.mjs test/workspace-surfaces-desktop-e2e.test.mjs test/preview-e2e-failure-diagnostics.test.mjs
node --test test/*.test.mjs
npm run test:e2e:core-settings
$env:SPS_DESKTOP_E2E_SOURCE='1'
node scripts/smoke-workspace-surfaces-desktop.mjs --native-management
node scripts/smoke-workspace-surfaces-desktop.mjs --no-ai-checklist
```

- Tracker/contract: **11/11**. Actual Node processes demonstrate exit-before-EOF,
  three generations, nonzero exit, forced stream closure and listener ownership.
  A leaf is independently still alive after pipe disposal and then exits naturally.
- Windows runner: **17/17**, including actual natural/forced Job probes and
  original failed-exit preservation. No foreign process was killed.
- Final Desktop: **883 total / 882 pass / 0 fail / 1 existing skip**. This
  includes the actual Windows runner probes and the renderer's initial / late
  status-failure race, acknowledged-pending and duplicate-click coverage.
- Standalone Settings Electron: **7/7 scenarios**, each naturally exiting zero
  through the actual visible Quit button before successful fixture cleanup:
  fresh, corrupt recovery, corrupt desktop state, unwritable desktop state,
  malformed routing state, unverified legacy adoption and deferred Owner.
  Existing invalid-state preservation assertions remain. All seven captured
  1000/620 px layouts with the enabled button in view; the fresh pair was
  visually inspected with no clipping or overlap. A normal Settings quit needs
  neither a Core session nor a running Host. Its emergency fallback is bounded
  to the owned PID, confirms Main exit before recursive cleanup, and always
  fails acceptance; the successful runs did not use it.
- Source prepared Native management: **exit 0**, three orderly Mains, six EOFs,
  temporary-data removal, no intervention. This was before the final browser-
  endpoint adjustment and is not evidence for that subsequent code revision.
- Three early No-AI attempts reached their functional cases but final Main was
  not orderly; they correctly ended **exit 1**, never accepted. One diagnostic
  run confirmed force-stop after 20 seconds, not a demonstrated product crash.
  The subsequent browser-endpoint attempt also failed with force-stop requested
  after 20 seconds. None is relabeled as a pass. Approved real Quit-button
  results are recorded separately below.
- Fresh source No-AI run with the real Settings Quit button: **exit 0**. The
  final Main exited zero naturally in 156 ms, with no forced stop or close
  request error. All three Main generations exited zero and all six output
  streams ended without error; Identity close and owned temporary-data cleanup
  also qualified. This is local source Main/output/data evidence, not a
  whole-descendant, packaged, production-Identity or two-PC certificate.
- Fresh prepared Native management run with the real Settings Quit button:
  **exit 0**, three orderly Main generations, six natural EOFs, no output
  error, Identity closed and temporary data removed. Both prepared and
  separate-process-reload phases reached the real Main/Core device state with
  zero Agents, Plugin startup blocked, normal renderer management denied and
  LAN OFF. Settings closed the running temporary Host through its normal quit
  path during each restart. This local runtime reported Electron **43.7.7** /
  Node **24.21.0**; it is not the pinned packaged-CI runtime or a release tuple.
- Independent Luna audit of the Quit controller/preload/Main integration found
  no actionable issue; its focused tests passed **22/22**. This is not an
  independent GitHub approval or a hosted-CI result.

Exact Source `cd293d3` push `40250922189` and PR `40250926513` workflows both
finished with 16/18 successful jobs; the production Zod audit failed in both.
The push run passed No-AI, prepared Native and packaged Workspace stages, then
failed packaged Preview at `owner_workspace` timeout with unavailable Host log
reason `unsafe_path`; forced Job cleanup was correctly rejected. The PR failed
No-AI earlier and did not reach Preview. These are older-source observations,
not acceptance for the new strict Workspace cleanup or Quit button.

Fresh exact-head hosted Workspace/No-AI/Preview acceptance remains required.
Production Zod policy, Identity operations, Core main/independent approval and
physical two-PC/final signed-byte gates remain incomplete. Marketplace policy
remains reviewed only. This does not activate any Native LAN or invitation UI.
