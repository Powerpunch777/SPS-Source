# Native Windows CI runner verification - 2026-10-25

Status: source-tested CI repair; not new Native enrollment or release acceptance.
Parent Source is `425000cb1c44bf583d9d655632057440c06f90f7`.
Core remains `c30687dcf734cb61805978e1f6f60529fa9259d2`; public SDK remains
`d4d69208480fc618b2055378b85d183aea422d50`. Desktop stays unreleased 0.4.137.

## Existing exact-HEAD evidence

[Observed CI runs](../current/NATIVE-CI-OBSERVATION-2026-10-25.md) qualify the
actual Host v2 and Member pending-key file adapters at Source `425000cb`, using
Windows `safeStorage`, Electron 43.8.3 and Node 24.22.0, across separate processes.
Those runs also pass Core Settings, all nine Linux Core test shards and the full
Linux typecheck/build. Overall they fail, not pass: the production policy rejects
held Zod High `1243066`, and PostgreSQL rejects the elevated Windows runner token
before the No-AI Workspace opens. Downstream packaged E2Es are skipped.

## Implemented CI-only repair

- The Windows verification workflow uses a fixed-mode launcher for the No-AI
  source check and the three existing packaged Host-dependent E2Es.
- The launcher derives a restricted version of its own primary token, makes
  Administrators and Power Users deny-only, and uses `DISABLE_MAX_PRIVILEGE`.
  The child checks both groups are disabled and only the permitted traversal
  privilege remains. Parent checks the token still belongs to the same user.
- The child is created suspended, assigned to a private non-breakaway job with
  kill-on-close, then resumed. It inherits only explicit stdin/stdout/stderr
  handles. Job setup failure does not fall back to an elevated child.
- The child receives an explicit Unicode environment containing Windows/Node
  discovery paths and the three workflow fixture settings only. Unrelated CI
  tokens, provider/SPS settings and execution hooks are not inherited. Probe
  tests inject fake token/sentinel values and verify they are absent in Node.
- A bounded 18-minute wait preserves the child's exit code, or fails with 124
  after timeout. On normal exit, failure or timeout the job is terminated and
  queried until no owned processes remain. Cleanup failure is an error.
- Fixed modes invoke the original sync scripts and original E2E scripts, with
  no `continue-on-error`, test skip, runtime replacement, PostgreSQL security
  bypass, `SANDBOX_INERT`, account creation, credentials or service installation.
- PowerShell builds the helper only inside an owned non-linked temporary folder,
  checks its identity and exact entries, and deletes only those helper files.
  Actual Desktop launch modes require the Windows CI context; local probe modes
  do not open Desktop or touch user data.

This is same-user privilege reduction for trusted test code, **not** a Plugin
sandbox, other-user boundary, TPM/device proof, or product privilege broker.
Installed SPS behavior is unchanged; this does not make an elevated product
Host a supported PostgreSQL configuration.

## Local verification

Commands from `sps-server/desktop`:

```text
node --test test/windows-ci-e2e-runner.test.mjs
npm test
node scripts/current-candidate-doc.mjs --check
node scripts/dependency-security-doc.mjs --check
```

- Wrapper: 7/7 pass on a non-administrative Windows caller. Includes actual
  restricted child token inspection, child exit 7 propagation, timeout exit 124,
  a still-live descendant confirmed in the owned job and then terminated,
  exact quoted/trailing-backslash/Unicode Node arguments, UTF-8 stdout and
  nonempty stderr relay,
  non-CI Desktop denial, and workflow wiring. The Node probe caught missing
  inherited stdout in the initial launcher; explicit asynchronous output/error
  relay fixes it without changing exit-code propagation.
- Desktop: 714 total, 713 pass, 0 fail, 1 explicit local 8.3-alias skip.
- Candidate/security document checks, PowerShell parsing and `git diff --check`
  pass. Helper compilation occurs in the real Windows probe tests.

The repaired elevated GitHub runner and its full No-AI/packaged E2Es still require
their own new exact-HEAD results. Local non-admin probes do not prove that result.
Token integrity level is unchanged; disabled groups/removed privileges are not
an integrity-level reduction or protection against the same user's files.
The installed local Electron remains 43.7.7 and is not the patched-runtime proof;
the 43.8.3 evidence above belongs only to the completed `425000cb` CI.

## Remaining critical path

Core must persist invitation-bound public issuance records and call a narrow
Desktop-owned signer without transferring CA keys. First issuance must not
consume the invitation; completion requires a fresh, non-resumed mTLS peer and
the same current authenticated user before atomic pending-device registration
and invitation consumption. The present Core HTTP listener cannot supply that
TLS proof. No such channel, enrollment caller, issued-credential transition,
Native ingress or LAN switch is introduced by this CI repair.

No real keys/customer data, paid calls, OS trust changes, firewall/LAN listener,
installed-app replacement, Zod-major migration, or Identity production rollout.
Tailscale remains the supported transport. Signing, independent review/Core main,
Identity rollout, remaining security gates, and the same final signed bytes on
two real Windows PCs remain required.

## API references

- [Microsoft restricted-token API](https://learn.microsoft.com/en-us/windows/win32/api/securitybaseapi/nf-securitybaseapi-createrestrictedtoken)
- [Microsoft process creation with a caller-derived restricted token](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-createprocessasuserw)
- [Microsoft job assignment and nested jobs](https://learn.microsoft.com/en-us/windows/win32/api/jobapi2/nf-jobapi2-assignprocesstojobobject)

Luna xhigh supplied independent CI observation, enrollment architecture review,
documentation updates and launcher review after usage-limit retry. The parent
implemented and tested the launcher. No forced Fast option is exposed by the
delegation tool.
