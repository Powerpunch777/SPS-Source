# Operating Model Audit Refresh Log (CMP-47)

## Objective
Verify changed Markdown links, files, and operating model claims against local scripts, logs, and git status, and document the refresh of the operating-model audit following the direct Unreal Code and QA workflow implementations.

## Verification of Claims & Files

1. **Unreal Code Worker (CMP-43)**:
   - Script exists: `scripts/Invoke-DirectAgyUnrealTaskRoom.ps1` (verified path and presence).
   - Test suite exists: `scripts/Test-DirectAgyUnrealWorkflow.ps1` (verified test execution results).

2. **Hardened Workspace Boundary (CMP-44)**:
   - Verified that path normalization and boundary validation checks are centralized in `scripts/Resolve-UnrealWorkspace.ps1`.
   - Verified that prefix collision bypasses and traversal out of workspace directories are explicitly blocked and covered by test cases 6 and 7 in `scripts/Test-DirectAgyUnrealWorkflow.ps1`.

3. **Unreal QA Worker Helper (CMP-45)**:
   - Script exists: `scripts/Invoke-DirectAgyUnrealQATaskRoom.ps1` (verified path and presence).
   - Verified that it correctly sets `-QA` and `-Unreal` switches and implements prompt constraints for the read-only inspection boundary.
   - Test suite exists: `scripts/Test-DirectAgyUnrealQAWorkflow.ps1` (verified test execution results).

4. **QA Baseline Run (CMP-46)**:
   - Verified the creation of the Task Room run log at `C:\Users\young\Documents\Unreal Projects\강해린\.direct-agy-runs\CMP-46-20260710-155830.output.md`.
   - Verified the proposed candidate `cand_3ba965de01eed2cc` exists in `memory-sidecar/data/memory-candidates.jsonl` with status `candidate`.
   - Confirmed the candidate is not approved or promoted to `LEARNINGS.md`.

5. **Quota Blocker & Configurations**:
   - Confirmed SPS-managed CTO remains quota-blocked with no live runs active.
   - Confirmed post-run extraction remains disabled by default via config (inactive).

6. **Git Status & Staging**:
   - Confirmed via `git status` that no git commit has been created or staged. The repository contains only untracked changes, with no files staged.

7. **Documentation Updates**:
   - Verified updates in `04-structure-fit-checklist.md` documenting Milestones 20 and 21.
   - Verified updates in `29-operating-model-fit-audit.md` incorporating the new direct Unreal workflows, distinguishing aligned components from remaining gaps.
   - Verified updates in `README.md` adding new log files, QA scripts, and Next Steps.

## Durable Lessons
- Regularly auditing the operating model and checklist against the repository's git and local state prevents documentation from diverging from the actual technical implementation.
- Keeping core operating model contracts locked (e.g. `02-final-operating-model-ko.md`) ensures that changes in helper scripts and direct workflows do not silently compromise established architectural boundaries.
