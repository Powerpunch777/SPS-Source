# Direct Task Bridge Result Contract (CMP-54)

## Correction

The original Bridge core captured PowerShell stdout after invoking `Invoke-AgyDirectTask.ps1 -NoPost`. That stdout is a formatted PowerShell object and is not a reliable representation of the worker's raw `## Close Summary`.

## Implemented Contract

- `Invoke-AgyDirectTask.ps1` accepts an optional bridge-owned `-ResultPath`.
- It atomically writes UTF-8 JSON with contract version, issue ID/identifier, worker exit code, status, a bounded raw Close Summary, and a bounded error code.
- The result never includes prompts, Recall Brief content, tokens, environment variables, output paths, or memory candidate payloads.
- With `-NoPost` and without `-ProposeCandidates`, the runner does not write Paperclip comments/status or memory candidates.
- A missing Close Summary is an explicit failed result even if the worker exit code is zero.

## Bridge Validation

- DTB creates each result path inside its ignored `job-results/` directory and passes it through a fixed PowerShell argument array.
- On process completion, DTB validates contract version, issue identity, status/exit-code consistency, and Close Summary shape before updating its local job state.
- Missing, malformed, mismatched, or invalid result contracts fail the job. Status responses use only the validated bounded Close Summary, not captured console output.

## Verification

- `powershell -File scripts/Test-AgyDirectTaskResultContract.ps1`
- `node direct-task-bridge/test.mjs`
- `powershell -File scripts/Test-AgyRecallLifecycle.ps1`
- `powershell -File scripts/Test-DirectAgyUnrealWorkflow.ps1`
- `powershell -File scripts/Test-DirectAgyUnrealQAWorkflow.ps1`

All passed using mocks or dry runs; no Direct Task Bridge daemon, enabled bridge config, Paperclip plugin execution path, or real Agy job was started.

## Remaining Boundary

Project Hub remains Preview-only. The authenticated plugin finalizer and explicit live Bridge configuration are still unimplemented and disabled.
