# Owned Core Node Runtime Comparison

Date: 2026-11-01. Development evidence; not Core completion or Stable approval.

## Reproduction

On unchanged Source `ddd07c8fe4d23493a6367b98095577c15fcdf264`, private Core
`f8ef641e3c6f71699ea0c95d38e979f6c76b28df`, SDK
`61a929f6c783f78e5af603682de1543c7e24abc0`, run from `sps-server/desktop`:

```powershell
node --test test/owner-host-artifact-channel.windows.test.mjs
```

- Node 26.4.0: FAIL, reproduced independently of the earlier full-suite run.
  Actual Core shutdown after embedded PostgreSQL stop reported Windows exit
  3221226505 and `UV_HANDLE_CLOSING` in `src/win/async.c`. The owning Job reported
  natural empty closure, but a crashing child is not accepted as a clean stop.
- Node 26.13.0: PASS, 1/1, exit 0. The same fixture starts two owned Core
  processes, holds and invalidates private reference scopes, confirms ordinary
  shutdown, observes the owning Windows Job empty, and checks temporary cleanup.
- Node 24.22.1: this fixture and the full Desktop suite passed. The new workflow
  contract selection passed 10/10. Final full Desktop `npm run test:ci` passed
  serial 2/2 plus 2,079 total / 2,076 passed / three unavailable Windows8.3-alias
  skips: aggregate **2,081 total / 2,078 passed / 3 skips / 0 fail**.

The comparison changes only the selected Node runtime. No Core shutdown source,
app installation, global Node installation or existing user profile was changed.
The result supports a runtime-version-related failure; it is not a native stack
trace proof that every cause matches the upstream issue below.

## Upstream And Binary Provenance

Node's [Windows libuv assertion issue](https://github.com/nodejs/node/issues/56645)
includes forced-exit reproductions and links the merged
[runtime fix](https://github.com/nodejs/node/pull/61999). This was checked before
considering a broad application shutdown rewrite.

The comparison used the official
[Node 26.13.0 Windows x64 binary](https://nodejs.org/en/blog/release/v26.13.0),
downloaded to a separate temporary folder, not installed. Its SHA-256 matched
the official `SHASUMS256.txt` entry:
`14319838b3f355e0398c13569a90270bce4fc68f25189f58c59b03dadae0e6d5`.
Windows Authenticode was Valid, signer OpenJS Foundation. The installed Node
remains 26.4.0. Removing this separate downloaded probe was blocked by tool
policy, so its temporary folder remains; do not claim its removal. It contains
the public runtime executable, not SPS credentials or test Workspace data.

## Ongoing Gate

The Windows Desktop job now selects exact Node 26.13.0 after the ordinary full
Desktop suite, runs the real owned-Core test with a three-minute limit, and
restores Node 22 **before** Desktop E2E and runtime packaging. The regression is
mandatory, not `continue-on-error`, and does not replace any existing tests.
The YAML contract test enforces order, exact version, command, timeout and
restoration. No latest Node26 binary is silently substituted into installers.

This is narrow Node26.13 shutdown qualification, not full Node26 coverage,
support for Node26.4, or permission to update a user's runtime. Source development
still resolves the configured/PATH Node; use a tested runtime for reproducible
development rather than assuming a major version alone guarantees compatibility.
The existing unresolved development executable/reference discovery and manual
artifact-cleanup work remain incomplete.

Exact new-head CI, abnormal-Main-loss/descendant qualification, SQL crash windows,
physical two-PC acceptance and installed/signed candidate evidence remain
separate requirements. Earlier CI results cannot qualify this workflow revision.
