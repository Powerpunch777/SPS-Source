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

## Actual Source Desktop Follow-Up

On committed Source `9727cd79971445a2e35e25ebc3c72ba9923ddf2a`, private Core
`f8ef641e3c6f71699ea0c95d38e979f6c76b28df` and SDK
`61a929f6c783f78e5af603682de1543c7e24abc0`, the separate Builder Host acceptance
exited0 under Node24.22.1. Builder docs HEAD was
`4cef8b8dd74651406ded8a3f100e96ca599b3a0c`; runtime code was unchanged from
`0a935e38ece5aa7e5f1a7c28d4af6439ab0e8134`.

The actual Electron Host exercised the black-neutral UI, explicit installation
and activation, real Workspace bridge, scoped consultation save/idempotency,
A/B separation, Lead Agent selection without modifying its adapter config,
restart preservation and independent Settings recovery. It launched through the
updated source-only harness, which supplies the actual Node hint to Main.
The loaded Builder UI index SHA-256 remained
`c099f8b77d49656c5117bd5395fd0f44c2752f2759bee30a47a77d9a6bba4ba0`.

All four Main generations exited0, eight output streams ended without failure,
and the exact isolated temporary-data root was removed. The generated local log
is Builder `artifacts/core-host-development-node-20261101.log`, not a public
artifact. No screenshots were generated by this run. This does not attest the
OS image of every descendant, an actual Main-launched Preview, AI execution,
physical two-PC operation or signed installation.

Source972 CI runs `41317934173` and `41317938354` were submitted; completion is
not yet established. Earlier Source238 diagnostic run `41315640030` completed
with two failures: the original long-path0.4.86 uninstaller exited2 without
removing its tree; ordinary recovery then removed registration but left46 files
whose paths exceeded259 characters, so its postcondition correctly failed.
Both retained natural owned-Job closure. The command classification and compact
path control passed, not the entire diagnostic workflow. These historical
installer failures remain separate from this source launch-path increment.
