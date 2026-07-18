# Bounded Direct Agy Recall Brief Lifecycle (CMP-33)

This log records the implementation of the memory-recall and memory-candidate lifecycle steps for the *direct local agy worker* path.

## Objective
Enable `Invoke-AgyDirectTask.ps1` to inject a bounded, read-only Recall Brief from the local Memory Sidecar before executing `agy.exe`, and propagate complete metadata when submitting memory candidates.

## Scope
This implementation covers the **direct local worker (`agy.exe`) path only**.
Automatic lifecycle injection for SPS-managed agents remains a separate future milestone.

## Implementation Details

### 1. Direct Runner Updates (`scripts/Invoke-AgyDirectTask.ps1`)
- **Recall Query Derivation**: Automatically builds a search query combining the issue title and description, bounded by a fixed character limit of `500` characters.
- **Recall Output Bounds**: Limits the injected recall to three items per scope, 500 characters per rendered item, and 3,600 characters for the entire brief. Every truncation is labeled in the prompt.
- **Scope-Ordered Recall**: Queries approved memory from the Memory Sidecar via `/memory/search`. Retrieves items in the strict scope order of:
  1. `company` (using issue's authoritative `companyId`)
  2. `project` (using issue's authoritative `projectId` if present)
  3. `agent` (using assignee agent's ID if present on the issue)
- **Non-blocking Graceful Fallback**: If the Memory Sidecar is unavailable, offline, or returns an error, the execution proceeds normally. A message indicating that no recall was available is injected into the prompt, satisfying the safety guardrail.
- **Prompt Injection**: Injects the formatted Recall Brief (complete with source file paths and line numbers) into the worker prompt directly preceding the `Operating rules` block.
- **Memory Candidate Metadata**: Propagates authoritative `companyId`, `projectId`, `agentId` (only when present), and `issueId` in the JSON payload submitted to `/memory/candidates` when candidate proposals are enabled (`-ProposeCandidates`).

### 2. Testability & Mock Support
- Extended the parameter list of `Invoke-AgyDirectTask.ps1` to accept mock inputs (`-MockIssue`, `-MockComments`, `-MockRecallData`, `-MockRecallFail`, `-MockAgyOutput`).
- Under mock mode, network requests to SPS APIs, the Memory Sidecar, and the local `agy.exe` invocation are bypassed.
- Returns internal states (`recallQueryText`, `memoryCandidatePayload`, `promptContent`) in the output object to allow clean assert checks.

### 3. Automated Verification (`scripts/Test-AgyRecallLifecycle.ps1`)
Created a dedicated test suite verifying:
- **Test Case 1: Recall Success (Full Scope)**: Confirms correct query construction, prompt placement of company, project, and agent recall items, and candidate metadata serialization.
- **Test Case 2: Recall Unavailable**: Asserts that Sidecar outages are handled gracefully and output a fallback text without blocking execution.
- **Test Case 3: Query Cap and Format**: Validates that query strings are trimmed to the 500-character limit.
- **Test Case 4: Candidate Metadata Optional Fields**: Ensures optional fields like `projectId` and `agentId` are omitted when absent on the issue rather than using invented values.
- **Test Case 5: Recall Result Bounds**: Confirms that long results are visibly truncated, limited to three items per scope, and capped to the configured brief size.
- **Test Case 6: Candidate Section Boundary**: Confirms a same-line `Follow-up Tasks:` label is excluded from the proposed candidate body.

## Verification Results
- Run `powershell -File scripts/Test-AgyRecallLifecycle.ps1` successfully passed all 5 test cases.
- Run `node memory-sidecar/verify-filters.mjs` passed successfully.
