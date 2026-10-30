# Native CI Channel Checkpoint - 2026-10-25

Observation of the four supplied CI handles; all were terminal when recorded.
No workflow was dispatched or rerun and no PR was changed. A separate bounded
local helper/test follow-up is recorded below.

## Source Commit

Both Source runs use commit `1e6152a820571dc0d8a2adefce63a7892f2f29eb`,
attempt 1, and finished with failure. Each had 18 jobs: 16 success and 2
failure.

| Run | Event | Result | Failed jobs |
| --- | --- | --- | --- |
| `40185474383` | push | failure | Core compatibility `121145232918`; Desktop and Node `121145232972` |
| `40185477664` | pull request | failure | Core compatibility `121145243196`; Desktop and Node `121145243232` |

In both runs, all nine Core Linux test shards passed, as did Core full Linux
typecheck and build. The two failures are independent gates:

- Production dependency policy failed with three advisories: two low findings
  (`@tootallnate/once` `1119438`, KaTeX `1241206`) and high Zod `1243066`.
  The high finding has no approved exception.
- Desktop and Node failed its test step: 715 tests, 709 passed, 5 failed, and
  1 explicit skip.

### Windows Wrapper Probes

The eight wrapper probes are tests `696`-`703`. Results matched in both Source
runs: three passed and five failed.

| Test | Result | Evidence |
| --- | --- | --- |
| `696` | fail | `child_exit`, mode `probe`: child exit `3221225794` (`0xC0000142`); helper diagnostic exit `-1073741502` (same NTSTATUS). TAP did not include captured stdout JSON. |
| `697` | fail | Exit assertion expected `7`; observed `3221225794` (`0xC0000142`). |
| `698` | pass | Deliberate NTSTATUS-shaped child exit was preserved; cleanup JSON and empty-job assertions passed. |
| `699` | fail | Timeout assertion expected `124`; observed `3221225794` (`0xC0000142`), before the timeout result. |
| `700` | fail | `child_exit`, mode `probe-descendant`, code `0xC0000142`; then `child_cleanup` reported `InvalidOperationException`, and helper exit `125`. The exception message was not logged. |
| `701` | fail | `child_exit`, mode `probe-node`: child exit `3221225794`; helper diagnostic exit `-1073741502` (both `0xC0000142`). Node output/argument assertions were not reached. |
| `702` | pass | Desktop execution modes were rejected outside Windows CI. |
| `703` | pass | Owner-Host-dependent Windows E2Es were wired through the wrapper. |

The helper's control flow at the exact Source SHA creates/restores its desktop
context and writes the parent JSON containing `privateWindowStation` before
creating the child. In probe `696`, the helper then reached `child_exit`, which
rules out station-creation failure as the reported phase. The child returned
`0xC0000142`; Microsoft's NTSTATUS reference identifies this as
`STATUS_DLL_INIT_FAILED`, but does not identify which DLL failed.

The boolean is **unknown**, not `true` or `false`: the helper writes the parent
JSON before child creation, but `run("probe")` rejects when the helper exits
nonzero. The test does not pass the rejected error's captured stdout to its JSON
parser, and the TAP error shows stderr rather than stdout. Thus the log's lack
of JSON is an output-reporting gap, not evidence that the helper failed before
emitting it. Child JSON is emitted only after managed child startup and was not
reached.
Probe `698` independently confirms cleanup summary/job-empty assertions for its
deliberate native-exit case; it does not reveal that run's station boolean or
prove cleanup for failed probe `700`.

### Likely Cause, Not Proven

The hypothesis is that the restricted token inherited a default DACL that
allowed `BUILTIN\Administrators` and `SYSTEM` but omitted the same user's SID.
This fits the child-only `STATUS_DLL_INIT_FAILED` signature and PostgreSQL's
pattern of adding the user to a restricted token DACL before process creation.
Microsoft documents that a token default DACL is applied to objects created by
the token, `SetTokenInformation(TokenDefaultDacl)` replaces that value, and
`TOKEN_ADJUST_DEFAULT` is required. `CreateRestrictedToken` returns a handle
with the same access rights as its source handle. These facts support the
bounded repair, but this old CI log contains no token-DACL inspection; the
specific DLL and causal link remain unproven until a future exact-head CI run.

The current local helper change calls `SetTokenInformation` only on the new
restricted token. The source-token handle requests `TOKEN_ADJUST_DEFAULT` so
`CreateRestrictedToken` can return a handle with that access; the source token
itself is not modified. The helper copies existing ACEs, appends the current
user SID full-access ACE, reads back and checks ACE preservation plus user
access, and verifies that Administrators is not enabled (deny-only if present).
It does not add or enable privileges. The safe child DTO asserts
`administratorDenied:true` and `userDefaultDacl:true`. The local eight-test
Windows wrapper suite passes 8/8; this is local evidence only, not a CI rerun
or proof of the old runner's cause.

Primary references: [Microsoft `STATUS_DLL_INIT_FAILED`](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-erref/596a1078-e883-4972-9bbc-49e60bebca55), [Microsoft `TOKEN_DEFAULT_DACL`](https://learn.microsoft.com/en-us/windows/win32/api/winnt/ns-winnt-token_default_dacl), [Microsoft `SetTokenInformation`](https://learn.microsoft.com/en-us/windows/win32/api/securitybaseapi/nf-securitybaseapi-settokeninformation), [Microsoft `CreateRestrictedToken`](https://learn.microsoft.com/en-us/windows/win32/api/securitybaseapi/nf-securitybaseapi-createrestrictedtoken), [PostgreSQL restricted-token implementation](https://github.com/postgres/postgres/blob/master/src/common/restricted_token.c).

In both Windows jobs, the failure at step 8 caused later stages to be skipped:
Native identity storage (step 10), Native Core Settings (step 11), and No-AI
Workspace (step 15). Therefore these handles provide no result for those three
stages, nor for subsequent packaged E2Es.

## Core Commit And Review

Both Core handles use commit `0955e8f6355915df15228e77ee74276daf65130c`,
attempt 1.

| Run | Event | Result |
| --- | --- | --- |
| `40185340099` | pull request | success; all 15 jobs passed, including tests, E2E, typecheck, and build |
| `40185338350` | pull request target review | failure at job `121144830176`, step 3 (`Dependency Review`) |

The review log says Dependency Review is unsupported because the repository's
Dependency Graph is not enabled. This is a repository configuration failure;
the review workflow did not reach its later gates.

## Main-To-Core Signer Path

The green Core PR run is Core-side CI, not proof of the Parent Main-to-Core
signer channel. The Source Windows failure skipped Native, Settings, and No-AI
execution, so none of the four handles verifies that cross-process path or a
complete Native enrollment.

These results are scoped strictly to the recorded Source and Core commits. Any
uncommitted Parent Main signer-channel work in the local checkout is outside
those SHAs and receives no CI qualification here. The remaining acceptance
path still requires a narrow Main-owned signer boundary without transferring CA
keys, authenticated issuance/completion, a fresh non-resumed mTLS peer bound to
the same current user and invitation, and atomic pending-device registration
with invitation consumption. No real key material or customer data was used
for this observation.
