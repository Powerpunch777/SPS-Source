# Owner Vault Restart Window Observation

Date: 2026-10-31. Desktop `0.4.137`; Core `b17fb830`; public SDK `61a929f6`.
This is an unresolved acceptance failure and diagnostic follow-up, not a
product correction or Core-completion declaration.

## Exact Failure

Source `d8a6c699e735d5ca9217e986c9a42b6b9994b608`, push Verify `41176105464`,
Windows job `124463887020`, failed **Verify Owner Vault transfer through source
Desktop Main**. Source sign-in settled at06:31:54 UTC; Main export completed
at06:32:14; fresh target sign-in at06:32:17; restored Host/project/storage and
managed-plugin review assertions reached06:32:37. After the subsequent restart,
the script timed out in `workspace()` at its existing bound, called from the
ordinary restart branch (then line500). The failed step ended06:38:51.

The final restarted Main recorded operation1 through `workspace-load-start`,
but no operation1 `workspace-load-complete` or `window-ready-to-show` was in
the retained output. Later operations2/3 recorded `existing-window-reused`.
Those are separate invocations, not evidence that operation1 completed. The
script was waiting for an HTTP loopback Page in Playwright `app.windows()`.
It did not record native BrowserWindow state, so the existing output cannot
distinguish actual blank/stalled navigation from Playwright target tracking.
Do not attribute this to the computer, network, authentication or Playwright
without stronger evidence.

The child exited1; native wrapper independently reported natural owned-Job
emptiness and closed desktop/station. It was not a native timeout or forced
cleanup pass. Downstream legacy recovery failed missing input because this
job had not built an installer. PR Verify `41176116088` for the same branch
head passed this transfer step and proceeded to packaged tests, but a separate
passing run cannot waive the push failure. Its final result and actual PR merge
provenance must be reported separately.

## Diagnostic-Only Change

`owner-vault-window-observation.mjs` synchronously reads actual Main
`BrowserWindow.getAllWindows()` through the documented Electron evaluation
API. It reports only bounded counts, coarse URL kinds and window/loading/
main-frame/waiting-for-response/crash flags. Playwright's tracked Page inventory
is reported independently. Up to8 entries are sampled; larger inventories
are explicitly truncated and counts capped33. Closed/unavailable observations
stay distinct. URLs, titles, IDs, accounts, paths and raw exceptions are never
returned by the observer. A nonresponding Main read settles after5s; it does
not navigate, resume, recreate, destroy or select a window.

The transfer script logs one comparison just before the restart wait and a
comparison on failure. The original failure is rethrown by identity. Original
Workspace wait, Host readiness, permission checks, success assertions, native
Job bounds and cleanup remain unchanged. No retry or passing fallback was
added, and no production Main or Core code changed.

The pinned Playwright1.58.2 client maintains a Set of initialized Pages for
`app.windows()`. Its Chromium driver reports a new Page after initialization;
this is not the same source as native BrowserWindow enumeration. This code
distinction motivates the comparison but does not diagnose this failure.
References: [ElectronApplication evaluation and windows](https://playwright.dev/docs/api/class-electronapplication),
[Electron webContents loading APIs](https://www.electronjs.org/docs/latest/api/web-contents).

## Local Evidence And Remaining Work

The observation/cleanup selection passed11/11, including serialization of the
actual native callback, fixed-value privacy checks, closed/unavailable/large
inventories, a blocked read's5s limit, and the actual extracted transfer wait
preserving its original exception and unchanged deadline. Full `npm run test:ci`
exited0: serial2/2 plus1807total/1804pass/three unavailable-8.3-alias skips,
aggregate1809total/1806pass/three skips/zero failures.

Two actual local `npm run test:e2e:owner-vault-transfer` invocations exited0.
The final invocation, with the restart comparison, observed two native windows:
a visible HTTP loopback window, not loading/waiting/crashed, and a hidden file
setup window. Playwright tracked the same two coarse kinds. It preserved
managed Registry package bytes/IDs/A-B data, required new-Host review of the
official bundle, exercised explicit approval/decline and account fences, and
completed natural Main/output/owned-temporary-data cleanup. It did not reproduce
the hosted failure and is not a fix, installed-byte, Production or physical-PC
qualification.

The failing hosted path still needs the new native-versus-tracked observation
and a causal correction if it recurs. Exact final-HEAD hosted Windows and
historical installed recovery remain required. The installed local app/profile,
original dirty checkout, Core/SDK/API/schema and Production are unchanged.
