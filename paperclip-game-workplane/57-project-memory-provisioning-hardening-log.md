# Project Memory Provisioning Hardening Log

## Objective

Harden the project-memory provisioning path after the first game-specific Project Hub was created, while preserving the candidate-first memory model and disabled Direct Task execution boundary.

## Project Hub State

- Project Hub: `강해린`
- Paperclip project id: `1a3fe2e8-f7a2-4fe6-9df7-eab58914b999`
- The previous `Onboarding` Project Hub remains separate as setup history.
- The Unreal workspace is intentionally not bound yet. Its Git repository needs a user-approved baseline commit before write-capable workers are connected.

## Hardened Memory Provisioning

- Added `memory-sidecar/ProjectMemoryProvision.Core.ps1` with the reusable provisioning logic.
- `memory-sidecar/Provision-ProjectMemory.ps1` accepts only explicit company and project UUIDs, derives the journal path under the fixed Paperclip managed-project root, and has no caller-supplied journal path.
- The production config is parsed before a journal is created. Configuration updates use a same-directory temporary file and atomic replacement with UTF-8 without BOM.
- The helper creates only a minimal journal header. It does not add an approved decision, candidate, task, assignment, or bridge configuration.
- `memory-sidecar/Test-ProvisionProjectMemory.ps1` uses only a temporary workplane-local test root. It never backs up, modifies, moves, or deletes the live Sidecar config or Paperclip instance files.

## Hardened Sidecar Launch

- `memory-sidecar/Start-MemorySidecarBackground.ps1` now launches an explicitly resolved `node.exe` with the Sidecar script and `--config` arguments through `Win32_Process.Create`.
- The launch path does not use a command interpreter, dynamic shell command, redirection, broad Node stop, or environment-variable injection.
- Explicit `-Restart` can stop only the listener currently bound to the configured loopback host and port.
- The Sidecar was restarted once through the hardened path and is healthy on `127.0.0.1:3188`.

## Verification

- Project-memory provisioning tests passed: malformed IDs, malformed config before journal creation, dry-run no writes, isolated provisioning, candidate boundary, and idempotency.
- Sidecar launcher static safety test passed.
- The target project has exactly one Sidecar journal entry and its `LEARNINGS.md` contains only the non-substantive approved-memory header.
- Paperclip + Sidecar bootstrap reports both services ready without restarting either healthy process.
- Direct Task deployment preflight remains ready with the bridge unconfigured and activation blocked.

## Deliberate Remaining Gates

1. Create and review the Unreal repository's initial Git commit.
2. Bind the `강해린` Paperclip Project Hub to the Unreal workspace.
3. Add a loopback Direct Task Bridge workspace allowlist and secret reference.
4. Explicitly enable Direct Task launch and run one harmless smoke task.
