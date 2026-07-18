# CMP-66: Harden SPS bootstrap launch contract

## Context

`scripts/Start-SPS.ps1` was added as an idempotent recovery helper. Its SPS launch path currently uses a bare `npx.cmd paperclipai run` when port 3100 is absent.

The verified local SPS server was started with explicit noninteractive arguments:

```powershell
npx.cmd --yes --registry https://registry.npmjs.org paperclipai run
```

A bare hidden `npx.cmd` invocation may prompt for an install or resolve a different package state after a reboot. That is unsuitable for a noninteractive bootstrap helper.

## Objective

Harden only the SPS launch contract in the new bootstrap helper so its missing-SPS path uses the same explicit noninteractive command shape already verified in the local runtime.

## Requirements

1. Modify only the bootstrap helper, its focused test, and its focused documentation if needed. Do not touch SPS core, plugin manifests, bridge settings, Unreal workspace files, or `02-final-operating-model-ko.md`.
2. Use `npx.cmd` with the exact argument-array semantics equivalent to:
   `--yes --registry https://registry.npmjs.org paperclipai run`
   Do not use a shell string, `cmd /c`, `Invoke-Expression`, or a broad process stop.
3. Preserve the existing rule: never start anything if a healthy SPS listener already exists; never stop/restart healthy existing processes.
4. Preserve the existing hidden-window and bounded-health-check behavior.
5. Extend the focused test/static check to assert the explicit noninteractive `npx.cmd` contract is present and reject a bare `paperclipai run` argument list.
6. Run the focused tests and one live healthy idempotent invocation. The live invocation must not stop/restart SPS or the Memory Sidecar.
7. Do not invoke Direct Task UI/bridge/Agy, alter plugin config, create issues beyond this direct Worker Task Room, or modify any game project files.

## Acceptance

The source makes the missing-SPS recovery path deterministic and noninteractive, while the current healthy runtime remains untouched and all focused tests pass.
