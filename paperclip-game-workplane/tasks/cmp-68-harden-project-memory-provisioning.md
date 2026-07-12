# CMP-68: Harden Project Memory provisioning and Sidecar launch

## Context

CMP-67 successfully provisioned the target Project Hub memory journal and its Sidecar config entry. CTO review found two implementation concerns that must be corrected before treating the helper as production-ready:

1. `Test-ProvisionProjectMemory.ps1` currently backs up, mutates, and restores the real `memory-sidecar/config.local.json` and a path inside the live Paperclip instance. Even with cleanup, a failed/interrupted test could leave the live memory runtime changed.
2. `Start-MemorySidecarBackground.ps1` was changed to use `Win32_Process.Create` but constructs a `powershell.exe -Command` string with inline environment setup and shell redirection. This is unnecessary shell interpretation in a process launcher and is not acceptable for the control-plane runtime path.

The target memory configuration must remain provisioned:

- Company ID: `181e1bf7-3390-4b8d-8507-b736a03e444b`
- Project ID: `1a3fe2e8-f7a2-4fe6-9df7-eab58914b999`
- Journal path: `C:\Users\young\.paperclip\instances\default\projects\181e1bf7-3390-4b8d-8507-b736a03e444b\1a3fe2e8-f7a2-4fe6-9df7-eab58914b999\_default\LEARNINGS.md`

## Objective

Preserve the successful project-memory provisioning result while hardening its test isolation, configuration update behavior, and background Sidecar launch boundary.

## Requirements

### A. Hermetic provisioning tests

1. Refactor the focused provisioning test so it never reads, writes, backs up, moves, or deletes the real `config.local.json` or any path under `C:\Users\young\.paperclip\instances\default`.
2. Test malformed IDs, containment, dry run, real provisioning, and idempotency against a dedicated temporary test root/config created and removed entirely inside the workplane test area.
3. Keep the public provisioning command restricted to deriving only the standard managed Paperclip project journal path. Any test-only injection must be impossible in normal production invocation and clearly isolated from it.

### B. Safe, consistent provisioning writes

4. Parse and validate the production config before creating a live journal. A config parse/error must not create a partial live journal.
5. When a config update is needed, write it atomically through a same-directory temporary file and replacement/move. Preserve all unrelated journal/security fields exactly, including an optional configured token, and retain UTF-8 without BOM.
6. Maintain current idempotency and candidate/approval boundaries. The target journal must remain a minimal header only; no substantive memory, candidate, or decision may be inserted automatically.

### C. Shell-free Sidecar launch

7. Retain the need for a background Sidecar that can outlive a direct Worker runner, but remove `powershell.exe -Command`, `cmd.exe`, shell redirection, `Invoke-Expression`, and all dynamically interpreted shell command construction from `Start-MemorySidecarBackground.ps1`.
8. Use a direct, explicitly resolved `node.exe` process invocation via the existing WMI/CIM path only if required for detachment. Pass the Sidecar script and `--config` as correctly quoted direct arguments; do not rely on environment-variable injection or a shell.
9. Restrict `ConfigPath` to a resolved `.json` file within the Sidecar script directory. Fail closed for any path outside that directory. Keep `-Restart` as the only way to stop a specific listener; never stop broad Node processes.
10. Update/extend focused tests to assert the absence of shell launch constructs and to validate the new direct launch contract without starting or stopping live processes.

### D. Verification and scope

11. Run all focused provisioning and Sidecar launcher tests, then use the explicit `-Restart` only once to load the corrected launcher path. Verify health and an empty scoped recall for the target Project Hub.
12. Verify exactly one target journal entry remains and its journal contains only the approved-memory header.
13. Do not alter `02-final-operating-model-ko.md`, Paperclip core/plugin configuration, Direct Task Bridge configuration, secrets, Unreal workspace, Git state, managed agents, or task routing.

## Acceptance

The target Project Hub remains isolated and memory-ready, but the helper is now production-safe: hermetic tests, atomic config updates, and no shell-interpreted Sidecar launch path. Direct Task execution remains disabled.
