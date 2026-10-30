# Runtime preparation restart and selected CI regressions — 2026-10-29

A Host interrupted while preparing its runtime could leave a fresh lock owned
by an exited process. Preparation only checked owner liveness after15minutes,
so immediate restart waited approximately120seconds and then failed. The lock
now checks the existing bounded owner record immediately. Only confirmed ESRCH
plus the unchanged file identity permits recovery; live, self, reused, unknown
or malformed ownership remains protected. The waiting deadline is unchanged.

Runtime package tests passed15/15, including an actually spawned/exited owner,
fresh-lock recovery, a changed lock identity, live/malformed owners, concurrent
materialization and existing promotion/rollback safeguards. No OS isolation,
Native transport or new plugin/Builder functionality is added.

## CI fixture corrections

Source0e1e5d3 push CI40855993740 passed18/18, but separate PR40856003627 failed
two Linux jobs. The exact failures were two first-case agent-instructions route
timeouts and an environment save/navigation assertion. Neither failed check was
disabled or automatically retried.

Core `e195eaba4e44c74732bd03f916a69f6229e77e9c` changes only two test files.
Actual route modules are evaluated once as fixture initialization; every case
still creates a fresh app/router/actor, resets its mock behavior, performs actual
loopback HTTP and confirms server closure. Existing assertions and per-test
deadlines remain. The selected API file passed9/9.

The environment fixture now checks its existing save/cancel navigation results
with its existing bounded assertion helper. Save payload, exactly-once update,
discard confirmation and form-preservation assertions remain. An initial selected
run exposed two further immediate cancel assertions; those were corrected and
the final UI-only selection passed20/20. No product UI, helper or timeout changed.
Existing React act warnings remain visible. No whole local suite was run.

## Packaging evidence and remaining qualification

The previous clean0e1e5d3/Core43396d2e/SDK61a929f runtime preparation completed
successfully. Its archive is172404158bytes, SHA256
`4485f312b07136753165ac267d85c096d65ce40366ad8060b34c66bd6c1e3c20`.
Actual deployed Zod checks and seven compiled recovery/schema/migration file
comparisons passed. That archive is preserved separately as evidence.

The Core difference is test-only and the Desktop correction is outside the Core
runtime payload. Reusing verified Core build output requires checking the exact
Git input differences, unchanged SDK/dependencies, actual clean new tuple and
regenerating baseline/archive metadata and hashes. Any changed production input
requires its normal rebuild. Reuse is not clean-build or installed-app evidence;
required current-candidate CI still performs its own builds and checks.

Current local unpacked/default materialization, original10second renderer failure,
exact Desktop-loss/process cleanup, signed data-preserving installer/update/
rollback/restore and physical Host/Member/Runner Tailscale/SSH remain unqualified.
Unreferenced staging/old-artifact retirement is still outstanding. Core's separate
commitperclip review also needs its missing repository key; it is not disabled.
Core completion is not established. Stop before new plugin/Builder development.
