# CMP-54: Add a structured Direct Task Bridge result contract

## Objective

Correct the last critical integration gap before any Project Hub submit path: the Direct Task Bridge must obtain the **actual Agy Close Summary** from a structured result contract, not infer it from PowerShell's formatted object/stdout output.

## Review finding

`direct-task-bridge.mjs` currently invokes `Invoke-AgyDirectTask.ps1 -NoPost` and captures console stdout. That PowerShell script returns a formatted object and does not guarantee that stdout is the raw Agy Close Summary. The DTB's status endpoint therefore cannot yet reliably deliver the actual worker report to a future SPS plugin finalizer.

## Required design

1. Extend `scripts/Invoke-AgyDirectTask.ps1` with an optional, **trusted local bridge-only** structured result output parameter (for example `-ResultPath`).
2. When specified, it must write UTF-8 JSON atomically with only non-sensitive fields sufficient for finalization:
   - contract version;
   - issue ID/identifier;
   - exit code and status;
   - a bounded actual Close Summary extracted from the Agy raw output (or a clear missing-summary/result failure field);
   - any bounded diagnostic message needed for bridge handling;
   - no prompt, Recall Brief, token, environment, absolute workspace/output paths, or memory candidate payload.
3. The result JSON must be written after each run even when Agy exits nonzero. It must not create SPS writes or memory writes when called with `-NoPost` and without `-ProposeCandidates`.
4. Add a focused PowerShell test using mock inputs and temporary result paths. Prove: valid JSON, correct Close Summary, output bound/truncation marker, no SPS post/mark done/candidate submission, and a failed Agy mock result.
5. Update DTB to create a result path **it owns** inside a fixed bridge-local ignored `job-results/` directory, pass it in the fixed PowerShell argument array, then read/validate the JSON after child completion.
6. DTB must reject/make the job failed if result JSON is missing, malformed, mismatched to the job issue, or has an inconsistent exit code. Status must use the validated result's Close Summary instead of parsing captured stdout. Keep console capture only as bounded diagnostics.
7. Extend DTB tests with mock structured result success/failure/missing/malformed/mismatch cases. Tests must not start a real daemon, invoke Agy, create SPS issues, or touch the actual Unreal project.

## Boundaries

- Preserve `-NoPost` behaviour and do not add any SPS/memory write in Bridge paths.
- Do not modify plugin code/manifest, Sidecar, runtime config, actual Unreal project, or `02-final-operating-model-ko.md`.
- Do not create an enabled DTB config, token, or live service process.

## Documentation and verification

- Create `46-direct-task-bridge-result-contract-log.md`; add correction pointers to CMP-52/53 logs rather than rewriting history.
- Run the new PowerShell contract test, DTB Node tests, `Test-AgyRecallLifecycle.ps1`, and existing Unreal/QA workflow tests.

## Completion format

Return `## Close Summary` with files changed, structured-result safety properties, all test results, and remaining gap: Project Hub stays Preview-only, with no authenticated plugin finalizer or live Bridge configuration. `Memory Candidates:` must be empty.
