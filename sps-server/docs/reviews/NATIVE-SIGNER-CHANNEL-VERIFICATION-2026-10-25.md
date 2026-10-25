# Native Main-to-Core signer channel verification - 2026-10-25

Status: **implemented/source-tested internal foundation**. Native LAN remains
unsupported/OFF. This is not real Google enrollment, two-PC acceptance,
installed-runtime qualification or signed-release evidence.

Parent checkpoints: Source `1e6152a820571dc0d8a2adefce63a7892f2f29eb`, Core
`0955e8f6355915df15228e77ee74276daf65130c`. The changes recorded here are the
follow-up commits, not tests of those parent bytes. Public SDK remains unchanged
at `d4d69208480fc618b2055378b85d183aea422d50`; Desktop remains unreleased 0.4.137.
Use the containing Git revision and generated support matrix for the exact new
Source/Core tuple. Core follow-up is `ac6875bf20096a69b10b4ebf84fa6d700ffd47e6`.
No installer was generated or replaced.

## Implemented boundary

- Desktop Main opens a dedicated Node IPC descriptor only when it spawns its
  directly owned Core child. It does not attach to a pre-existing Host. Native
  channel failure leaves ordinary Host service intact, without an alternate
  route to signing authority.
- Main owns the Host identity store and current Owner session check. The signer
  binds its first inspection to Owner subject, userData/Vault context, a
  process-local generation and exact Host/server/issuer public identity. It
  reauthenticates and rereads storage before and after asynchronous signing.
  The standard PKCS#10 primitive verifies CSR signature/profile/key binding.
- IPC carries only exact public Host/issuer pins/certificate or a device UUID,
  canonical public CSR, explicit dates and a public issuance result. No private
  key, account token, path, arbitrary data-signing operation or caller-selected
  store is exposed. Failure messages are static, without raw causes.
- The channel accepts at most 256 unique request IDs per owned-child lifetime,
  two occupied operations, and a default 10-second operation timeout (configured
  within 1-30 seconds). Replayed IDs, malformed Native operations or budget
  exhaustion close the channel. A new Host lifetime is required to recreate it.
  Cancel/timeout suppress late results; an ignored-abort operation retains its
  Main slot until the real work settles. This is not proof of termination.
- Core's explicit parent-enrollment factory inspects once, captures the exact
  public pins and composes the existing invitation-bound service. It never
  automatically registers a route or starts a listener. Client abort, timeout,
  disconnect, exit and disposal are bounded and fail closed. Node `send(false)`
  is handled as queued backpressure, not as proof that the message was rejected.
- Account/server mutation and restore invalidate the Main channel before the
  mutation action, including failed actions. Closing the dedicated descriptor
  makes channel loss observable to Core. Core checks availability before new
  issuance/replay/completion and at the final transactional projection after
  the consumed audit write. A guard failure rolls back pending device,
  invitation consumption, device audit and pairing audit together.
- Cross-process disconnect observation is not an atomic distributed revocation
  fence and does not reverse already committed work. Future ingress must still
  revalidate the actual Member session and current device/Workspace authority;
  this internal channel is not sufficient authentication.
- Owner Host concurrent starts share one in-flight operation. Stop invalidates
  an awaiting start before spawn; a late old-child exit cannot dispose the
  replacement child's channel. Native-only invalidation does not kill Core or
  silently reattach signing to an already running child.

This is a trusted Core-child boundary, not same-user OS isolation or TPM
attestation. Renderer/preload/Plugin SDK APIs are unchanged. Native credentials
are not Node/CLI/Agent/Source grants. User-ID database verification alone remains
insufficient to call issuance/completion as an authenticated endpoint.

## Local verification

From `sps-server/desktop`:

```text
npm test
npm run test:e2e:core-settings
node --test test/windows-ci-e2e-runner.test.mjs
```

- Desktop: **739 total, 738 pass, 0 fail, 1 explicit skip**. The skip is the
  pre-existing Windows short-path alias case; ancestor guards remain active.
- Real separate Node child tests exercise both a fixture protocol caller and
  the actual Core TypeScript IPC client against Main. The child generates its
  own fixture key and validates the issued public certificate against it.
  This is real IPC with fixture identity/storage, not real Owner login/DPAPI.
- Core Settings source Electron E2E: **7/7 modes** pass, including corrupt
  recovery/desktop state, unwritable state, malformed routing, unverified legacy
  adoption and deferred Owner. Existing local Electron is 43.7.7; the lockfile
  targets 43.8.3. This suite is not patched-runtime crypto qualification.
- Windows CI wrapper: **8/8 local probes** pass. The bounded default-DACL repair
  touches only the newly restricted child token and preserves existing ACEs;
  Admin/Power Users remain disabled. Existing OS-object ACLs, accounts, services,
  certificates and firewall are unchanged. Hosted elevated-runner success must
  be established by a fresh exact-HEAD CI run, not inferred from this result.

From `external/sps-core`:

```text
pnpm exec vitest run server/src/__tests__/sps-native-parent-signer.test.ts server/src/__tests__/sps-native-parent-enrollment.test.ts server/src/__tests__/sps-native-enrollments.test.ts server/src/__tests__/sps-native-pairings.test.ts packages/db/src/sps-native-enrollments-schema.test.ts packages/db/src/post-restore-sanitizer.test.ts
pnpm typecheck
pnpm build
pnpm --filter @paperclipai/server typecheck
```

- Six focused files: **55/55**, no skips. They include 14 IPC/composition cases,
  13 enrollment DB/live-loopback TLS cases, 12 pairing cases, 7 schema cases
  and 9 restore cases. Factory transaction behavior uses a mock delegate;
  the separate enrollment DB case actually blocks after the consumed-event
  insert and proves rollback when its lifecycle guard becomes inactive.
- Whole Core typecheck/build and final server typecheck pass. Existing CSS,
  annotation and large-chunk build warnings remain; this is not UI cleanup.
- Core full regression is not rerun locally. The previous Core0955 PR CI passed
  15/15 jobs, but it does not qualify this changed revision. New CI is required.

The initial command using root cwd plus `--config server/vitest.config.ts`
failed during setup-path resolution before running any tests. It is not a
product failure or counted pass; the root project-aware command above passed.

## Remaining acceptance

Fresh `npm run audit:release` is **blocked**, with held Zod High `1243066`
(no exception) plus two Low findings (`1119438`, `1241206`). No dependency
migration, suppression or user-held approval was changed.

Actual authenticated session-to-invitation binding, issued Member credential
file transition, enrollment/approval/revoke/recovery UI, Native TLS ingress and
HTTP/WS coverage, certificate renewal/rotation and two separate Windows PCs are
still pending. No external listener, production Identity change, firewall/OS
trust change, customer key/data, paid call, installed runtime replacement or
release publication occurred. The existing Tailscale supported path is retained.

Historical CI failures and the narrow Windows runner hypothesis are recorded in
[the CI checkpoint](NATIVE-CI-CHANNEL-CHECKPOINT-2026-10-25.md). Exact new CI
handles/results belong in PR readback and subsequent observations, not copied
from those older commits.
