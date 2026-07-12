# CMP-64: Add idempotent local workplane runtime bootstrap

## Context

The deployed Paperclip plugin and Memory Sidecar are separate local processes. Restarting Paperclip left the Memory Sidecar offline, which made direct Agy Recall Briefs fall back even though the plugin deployment itself was healthy. The Sidecar has now been manually restored on `127.0.0.1:3188`.

This violates neither the architecture nor the memory boundary, but it is an operational reliability gap. The final operating model requires memory to remain a recall/candidate service, not a controller.

## Objective

Implement a safe, idempotent local bootstrap/readiness helper that brings up and verifies the Paperclip control plane plus Memory Sidecar together after a restart, without changing their authority boundaries.

## Requirements

1. Do not change `02-final-operating-model-ko.md`, Paperclip core source, Direct Task Bridge configuration, plugin configuration, or any approved `LEARNINGS.md`.
2. Prefer existing helpers and local patterns:
   - `memory-sidecar/Start-MemorySidecarBackground.ps1`
   - `scripts/Test-PaperclipWorkplaneReadiness.ps1`
   - current local `paperclipai run` invocation only when Paperclip is not already listening.
3. Add a focused PowerShell helper under `scripts/` with a clear name. It must:
   - first detect Paperclip on `127.0.0.1:3100` and Memory Sidecar on `127.0.0.1:3188`;
   - preserve healthy existing processes without stopping/restarting them;
   - start only an unavailable component using the established local launch path;
   - wait with bounded timeouts for health responses;
   - return structured status showing whether each component was already running or started by this invocation;
   - fail clearly if either component cannot become ready;
   - never enable direct task launch, configure a bridge, resolve secrets, invoke Agy, create/assign issues, wake agents, or promote memory.
4. Keep launch windows hidden. Do not kill broad `node` processes or assume only one Node process exists.
5. Add a focused test or dry-run/test mode proving normal already-healthy behavior has no stop/restart side effects and failure paths are bounded. Ensure the helper's tests avoid mutating the live runtime.
6. Document the new post-reboot operating command in a focused log and/or `README.md` without overstating automatic OS startup.
7. Run relevant tests and a live idempotent invocation now that both services are healthy. Do not create a bridge config or any Task Room through the newly deployed UI.

## Acceptance

When both services are already healthy, the helper reports Paperclip and Memory Sidecar as ready and preserves both existing processes. Its tests pass. The documented command gives the operator a single safe recovery step after a reboot.

## Final Output

Return only a `## Close Summary` with changed files, exact verification, and any remaining limitation (for example, that OS-login auto-start is not configured unless separately implemented).
