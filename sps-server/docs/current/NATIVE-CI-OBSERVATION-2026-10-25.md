# Native CI Observation - 2026-10-25

Read-only observation of existing `Verify SPS` runs for PR #14. No workflow was
rerun. Source branch: `codex/sps-release-hardening`.

## Exact-Head Runs

Both runs are complete at Source HEAD
`425000cb1c44bf583d9d655632057440c06f90f7`:

| Run | Result | Jobs |
| --- | --- | --- |
| `40181306002` | failure | 18 total: 16 success, 2 failure |
| `40181309808` | failure | 18 total: 16 success, 2 failure |

The two failed jobs are the same stages in each run:

- Run `40181306002`: Core compatibility job `121132768247`, step 6, **Enforce
  SPS production dependency security policy**. Desktop and Node job
  `121132768402`, step 15, **Run No-AI Workspace source Desktop E2E**.
- Run `40181309808`: Core compatibility job `121132780301`, step 6, same
  production dependency policy. Desktop and Node job `121132780329`, step 15,
  same No-AI E2E.

Both policy failures report three production advisories: two low advisories were
reported, while high `core:zod` advisory `1243066` blocked the gate because no
exception was approved. The audit describes memory exhaustion while validating
oversized constrained collections.

## Native Store Evidence

In both exact-HEAD Windows jobs, step 10, **Verify isolated Native identity
secure storage across Electron processes**, completed successfully. Step 11,
**Run independent Native Core Settings source E2E**, also succeeded. The
Native step emitted this safe result summary in both runs:

```json
{"result":"passed","phases":["create","separate-process-reload"],"realWindowsSafeStorage":true,"customerDataUsed":false,"osCertificateStoreChanged":false,"listenerStarted":false,"sameKeyAfterRestart":true,"memberPendingKeyProtected":true,"sameMemberKeyAfterRestart":true,"electronRuntimeVersion":"43.8.3","nodeRuntimeVersion":"24.22.0"}
```

This is new file-store evidence, not an inherited capsule-only result. At this
exact HEAD, `sps-server/desktop/scripts/smoke-native-identity-storage.mjs`
imports and calls `createSpsNativeMemberPendingKeyStore`, creates and reloads
the pending key through the file store, and checks create-only refusal,
wrong-account non-adoption, changed-pin rejection, and an unchanged Vault. The
script at prior Source `d3ddbaaa5270d4288a9a177a093e55d185d1c5d5` instead used
`createSpsNativeMemberPendingCapsule` directly and wrote the encrypted file in
the smoke harness.

## No-AI Result

The No-AI E2E failed at step 15 in both exact-HEAD runs and did not emit its
success result. Owner Host startup failed because embedded PostgreSQL refused
to start under the privileged Windows runner account. The E2E then timed out
waiting for the authenticated Workspace BrowserWindow. This is an infrastructure
failure, not a passing No-AI result.

## Prior Comparison

Prior run `40180490974` is at Source `d3ddbaaa5270d4288a9a177a093e55d185d1c5d5`;
it completed with 18 jobs (16 success, 2 failure). Windows job `121130316230`
had Native secure-storage step 10 and Core Settings step 11 succeed, while
No-AI step 15 failed with the same embedded-PostgreSQL privileged-account
startup refusal and subsequent BrowserWindow timeout. Its Native result
qualifies the earlier capsule smoke only, not the pending-key file store at
`425000cb1c44bf583d9d655632057440c06f90f7`.

No source, PR, or runtime files were changed. This note contains no local
machine paths or runner/user identity details.
