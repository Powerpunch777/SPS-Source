# Development Node Launch References

2026-11-01. This is a source-development increment, not completion of manual
Plugin artifact cleanup or qualification of an installed release.

## Change

The official `dev-desktop.mjs` launcher passes its own `process.execPath` as
`SPS_DESKTOP_DEVELOPMENT_NODE`, after inherited environment values. Main captures
that absolute regular-file path once before creating the development profile,
resolves ordinary filesystem aliases, and supplies the result to both Owner
Host and Preview runtime resolution. The source Workspace acceptance harness
supplies its actual Node executable through the same input.

Electron's `process.execPath` identifies Electron, not the Node process running
the development launcher. A bare `node` also does not identify the actual binary
for artifact reference capture. This change uses the launcher's known executable
instead of implementing another PATH search or spawning an unowned probe.

References:
- [Node process.execPath](https://nodejs.org/api/process.html#processexecpath)
- [Node child-process lookup and environment rules](https://nodejs.org/api/child_process.html#child_processspawncommand-args-options)
- [libuv Windows process lookup](https://github.com/libuv/libuv/blob/v1.x/src/win/process.c)

No upstream implementation was copied and no dependency was added.

## Limits And Preserved Behavior

- Packaged Desktop ignores this development hint. Its stable/bundled Node and
  older Electron-as-Node fallback are unchanged.
- A source launch without the hint keeps the existing `node` startup behavior.
  Its unresolved executable still makes private cleanup coverage unavailable;
  it does not become an empty safe reference list.
- An explicitly malformed, relative, missing or directory hint fails startup
  before creating a development profile. It does not silently select another
  runtime. A regular file path is not executable authenticity or code signing.
- The existing runtime reference capture still freezes launch arguments and
  environment before asynchronous Job preparation, and retains references until
  the exact owned runtime closes. This change adds no deletion permission.
- Main's full configuration/data reference discovery, current Host authority,
  cleanup eligibility, fresh confirmation, removal and Settings UI remain open.
- No existing app, profile, Vault, project, installed Node or Production service
  was changed or restarted for this increment.

## Verification

With Node24.22.1, the following selection passed60/60 with no skips:

```powershell
node --test test/development-node-command.test.mjs test/development-mode.test.mjs test/owner-host-activation-contract.test.mjs test/owner-host-runtime-references.test.mjs test/owner-host.test.mjs
```

This covers the actual launcher executable path, alias resolution, invalid hints,
packaged/absent hints, source-only harness wiring, Main/Preview propagation,
frozen reference capture and existing owned shutdown contracts. The Main wiring
checks are source/VM contract tests, not an actual Electron launch.

The updated Windows owned-Core scope test passed1/1 on Node24.22.1 (28.3s):

```powershell
node --test test/owner-host-artifact-channel.windows.test.mjs
```

It used the same resolver for two real, separately owned Core launches, retained
their private references and scoped mutation exclusion, invalidated the held
scope on stop, and required natural owned-Job closure and exact temporary-root
cleanup. This is two local Core processes, not two physical PCs or an Electron
Main launch.

`npm run test:ci` on Node24.22.1 exited0: the serialized stage passed4/4;
the remaining stage passed2082/2085 with three unavailable Windows short-alias
cases skipped. Aggregate:2089 total,2086 passed,3 skipped,0 failed. Its generated
local log is `desktop/dist/development-node-final-node24-20261101.log` and is not
a published release attestation.

Isolated source Desktop acceptance is pending at the time of this entry.
Historical CI and earlier Builder screenshots are not evidence for this changed
source tree.
