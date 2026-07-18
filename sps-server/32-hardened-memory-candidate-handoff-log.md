# Hardened Managed Post-Run Memory Candidate Handoff Log (CMP-36)

## 1. Objective
Harden the exploratory SPS-managed post-run candidate extraction from CMP-35 so it is safe to deploy later. The baseline local server evidence confirms that `agent.run.finished` is available, but no blocking pre-run prompt mutation hook exists. We must keep the direct `agy` Recall Brief as the only automatic prompt injection path, while securing the post-run extraction.

## 2. Corrections Implemented

### A. Event Subscription Hardening
- **Retained**: Only the official `agent.run.finished` listener.
- **Removed**: The `issue.updated` listener has been deleted in [worker.js](file:///C:/Users/young/Documents/AGENT%20%EA%B5%AC%EC%B6%95/sps-server/sps-memory/dist/worker.js) to avoid a secondary extraction path.

### B. Opt-in Configuration Gate
- **Config Schema Addition**: Added two new configuration properties to [manifest.js](file:///C:/Users/young/Documents/AGENT%20%EA%B5%AC%EC%B6%95/sps-server/sps-memory/dist/manifest.js):
  - `enableManagedCandidateExtraction` (boolean): Default is disabled.
  - `managedCandidateCompanyId` (string): Specific company ID required to match.
- **Worker Guards**: The `agent.run.finished` listener retrieves the plugin configuration and skips extraction unless `enableManagedCandidateExtraction` is `true` AND `managedCandidateCompanyId` matches the incoming event's `companyId`.

### C. Comment Extraction Isolation
- **Same-Run comments only**: The plugin reads comments via the SDK and filters them strictly to those authored by the exact run (`createdByRunId === runId`).
- **No old comment scans**: Only candidates from comments created during the finished run are parsed.
- **Regex Extraction**: Only parses the explicit `Memory Candidates:` section using regex.
- **No Document Scanning**: Removed all document listing and body reading code to prevent automatic document scanning in this milestone.

### D. Size and Count Bounds
- **Content Size Boundary**: Candidate text content is sliced to a maximum length of 4,000 characters.
- **Candidate Count Boundary**: A maximum of 5 proposed candidates can be submitted to the sidecar per run.
- **Empty Skips**: Any empty or "None" candidates are skipped automatically.

### E. Durable Idempotency
- **Deterministic Key**: The plugin calculates an `idempotencyKey` as the SHA-256 hash of `pluginId + runId + commentId`.
- **Sidecar Deduplication**: The Memory Sidecar POST `/memory/candidates` endpoint performs the `idempotencyKey` lookup inside its serialized append queue. If a candidate with that key already exists, it returns the existing candidate with `200 OK` instead of appending a duplicate, including concurrent retries.

### F. Minimal Manifest Capabilities
- **Reduced Capabilities**: Removed the `"issue.documents.read"` capability from the plugin manifest because document scanning has been disabled.

---

## 3. Verification Performed

### A. Plugin Test Suite (`npm run check`)
We rewrote [verify-lifecycle-probe.mjs](file:///C:/Users/young/Documents/AGENT%20%EA%B5%AC%EC%B6%95/sps-server/sps-memory/scripts/verify-lifecycle-probe.mjs) to test all new constraints. Running `npm run check` completed successfully:
- **No-op while disabled**: Verified no candidates are proposed when the feature flag is disabled.
- **No-op with wrong company ID**: Verified no candidates are proposed when the company ID config mismatch occurs.
- **Same-run comments filter**: Verified only comments with matching `createdByRunId === runId` are considered, while `run-other` comments are skipped.
- **Metadata Preservation**: Verified that `companyId`, `projectId`, `agentId`, `issueId`, `source.runId`, and `source.commentId` are successfully resolved and passed.
- **Idempotency Consistency**: Verified that the deterministic idempotency key is identical across repeated emissions of the same event.
- **Count Bound**: Verified that seeding 7 matching comments results in proposing exactly 5 candidates.
- **Size Bound**: Verified that candidate content exceeding 4,000 characters is successfully truncated.

### B. Sidecar Test Suite (`verify-filters.mjs`)
We added Test 5 (Sidecar POST Idempotency) to [verify-filters.mjs](file:///C:/Users/young/Documents/AGENT%20%EA%B5%AC%EC%B6%95/sps-server/memory-sidecar/verify-filters.mjs). Running `node verify-filters.mjs` completed successfully:
- **First POST**: Successfully creates the candidate with status `201 Created`.
- **Second POST**: Detects the matching `idempotencyKey` and returns the existing candidate with status `200 OK` without appending duplicates.
- **Correct Count**: Confirms the candidate count increases by only 1.
- **Concurrent Retry Check**: Confirms that two simultaneous posts with one key produce one `201`, one `200`, and one stored candidate.

---

## 4. Current Deployment Status
- **Status**: **NOT DEPLOYED**.
- The upgraded plugin code has been successfully hardened and verified in local test environments, but the plugin has **not** been reinstalled/installed in the active SPS instance, and no live agent run has been started. Production behavior remains completely unchanged, awaiting Codex review.
