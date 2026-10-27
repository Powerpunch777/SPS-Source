# Windows AppContainer Node / public SDK probe

This is a development-only compatibility probe. It does not integrate a protected
launcher into Core and always reports `productIsolationImplemented:false`.
The full probe currently fails; it must not be used as release or product
isolation acceptance.

## Inputs and execution

Source baseline: `ab849a26d83c2c81232e0346a9d2651bb4c9182b`.
Core: `df7436dc87484370e9c9b81b91882a2626452f3c`.
Public SDK: `607b48a4edaed1db7132a01719431ffce5852964` (unreleased `0.11.0`).
The observed runtime is Node `24.16.0`, libuv `1.52.1`, Windows x64.

From the Source root:

```powershell
node sps-server/desktop/scripts/security-poc/run-appcontainer-node-worker-canary.mjs
node sps-server/desktop/scripts/security-poc/run-appcontainer-node-worker-canary.mjs --preserve-module-paths
```

Each invocation copies the invoking Node executable and the unchanged public SDK
worker import closure into a fresh fake-data fixture. It creates a fresh
AppContainer SID, grants package read/execute and workspace modify rights only
inside that fixture, verifies the suspended process token/SID, assigns its Job,
and resumes it. JSON-RPC uses inherited, explicitly listed stdio handles. The
worker must initialize, complete the data probe, shut down, leave an empty Job,
and preserve the fake Vault before the helper can report success.
During the data probe, the public SDK issues one `state.get` request for the
exact fake workspace marker. The helper accepts only that fixed request and
returns a fixed non-secret value. No real Core service or credential broker is
connected by this fixture.

`--preserve-module-paths` adds the two documented Node flags
`--preserve-symlinks --preserve-symlinks-main`; it does not expand ACLs or change
the SDK. The copied package and its ancestors are checked for reparse points.
These flags are a compatibility experiment for this link-free fixture, not a
general filesystem sandbox or a promise of compatibility with arbitrary CLIs.

## Observations

| Case | Observed result | Acceptance |
| --- | --- | --- |
| Baseline Node loader | Expected AppContainer token verified; Node exits `1` before initialization. Safe classification: `fs-lstat-denied`; pipe error `109`. | Failed |
| Preserve module paths | SDK initialization and advertised `getData` validation complete. | Initialization only passed |
| Preserve paths, SDK host request | The fixture continues beyond the exact fake `state.get` response check, then reaches descendant creation. | Fixed fixture channel exercised; full returned data contract unproven |
| Preserve paths, full data probe | Data handler reaches direct descendant creation; safe failure is `canary-descendant-spawn-denied`. | Full probe failed |

The classified runs above confirmed child termination, empty Job and profile
cleanup. Their parent-owned fixture/helper removal completed. This does not
retroactively establish cleanup for an earlier malformed-report run.

Local evidence logs are `appcontainer-node-worker-canary-stderr-2026-10-28.log`,
`appcontainer-node-worker-canary-preserve-2026-10-28.log`, and
`appcontainer-node-worker-canary-probe-phase-2026-10-28.log`. The added host-call
case is recorded in `appcontainer-node-worker-canary-host-rpc-2026-10-28.log` in the task's outer
work directory. They contain fixed categories and booleans, not raw worker
stderr, environment values or credential material.

## Runtime constraint and next product work

Node's upstream issue documents AppContainer child-process pipe incompatibility
in libuv `1.52.1` and the fix in `1.53.0`. This is consistent with the observed
spawn denial; a fixed-runtime A/B execution has not proven causation here.
Official sources checked for Node `24.22.1` and `26.12.1` still identify libuv
`1.52.1`. No alternative binary was downloaded, installed or selected for the
product. Do not suppress the descendant probe or broaden OS permissions to
turn this result green.

Core's current worker still uses ordinary same-user execution and a Plugin-ID
registry. The required product changes include scoped execution identities,
versioned OS resource grants, secret/broker boundaries, a supported Windows
launcher, cancellation across independent Workspaces, and explicit unsupported
execution without a legacy fallback. See
[the integration sequence](WINDOWS-PROTECTED-PLUGIN-INTEGRATION-2026-10-28.md).
CLI pipe support remains an unmet compatibility requirement.

## Diagnostics and cleanup limits

Failure JSON is serialized, not assembled by string concatenation. Stderr is
drained with at most 16 KiB retained privately for fixed-category classification;
raw text is never returned. Reports include nullable original exit/Win32 codes.
`--check-report` on a compiled helper exercises the actual serializer without
creating a profile or worker. The parent accepts success only when the complete
schema, requested mode, all required checks and cleanup flags match.

Before launch, the parent creates and flushes an exclusive immutable
`run-identity.json` containing the fixture/profile IDs, canonical roots and
directory identities. A separate journal tracks the helper PID and redacted
report; later journal-write failures cannot truncate the identity record.
Unconfirmed process/profile cleanup or journal failures preserve artifacts.

Temporary tree deletion validates ancestors, directory identity and a plain
tree, then removes by path. It does **not** establish protection against a
malicious same-user process replacing paths concurrently, and is not a
handle-bound product cleanup mechanism. Process termination uses exact handles
created by this invocation, not PIDs discovered by enumeration.

An earlier run emitted malformed JSON and retained a helper and fake fixture.
It predates immutable identity records, so its association and cleanup state
cannot be established from its helper alone. Those artifacts remain untouched;
new runs do not adopt them or terminate discovered processes.

## Primary references

- [Node module loader flags](https://nodejs.org/download/release/v24.16.0/docs/api/cli.html#--preserve-symlinks-main)
- [Node 24.16 ESM resolver](https://github.com/nodejs/node/blob/v24.16.0/lib/internal/modules/esm/resolve.js#L212-L273)
- [Node AppContainer pipe issue](https://github.com/nodejs/node/issues/66374)
- [libuv AppContainer namespace fix](https://github.com/libuv/libuv/pull/5181)
- [Node 24.22.1 libuv version](https://github.com/nodejs/node/blob/v24.22.1/deps/uv/include/uv/version.h)
- [Node 26.12.1 libuv version](https://github.com/nodejs/node/blob/v26.12.1/deps/uv/include/uv/version.h)
