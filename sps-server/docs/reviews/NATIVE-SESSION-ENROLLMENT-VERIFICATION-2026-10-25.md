# Native session enrollment verification - 2026-10-25

Status: **implemented/source-tested internal foundation**. No product ingress,
Native LAN support, Google production test, two-PC acceptance or release claim.

Parent checkpoints are Source `4a378c60275fd481806c64e43c7e7a01e8b4ec48` and
Core `ac6875bf20096a69b10b4ebf84fa6d700ffd47e6`. Changes described below are the
follow-up, not tests of those parent bytes. Public SDK remains unchanged at
`d4d69208480fc618b2055378b85d183aea422d50`, Desktop unreleased 0.4.137.
The containing commit and generated support matrix identify the final tuple.
Session-binding Core checkpoint: `0c3bebd9fb146fa91f759db43d41a99e529c0a72`.
Final Windows-mode follow-up Core: `ed45c51c3070fa9688a5cdbbe45a78b74dc48dbc`.

## Scope

The configured Core SPS Identity instance gains a private Native resolver. It
accepts only the existing bounded SPS Identity session cookie, not Agent/API
tokens, a body-selected user, a Desktop launch proof or a legacy implicit actor.
The legacy session resolver/routes remain unchanged. No new central Identity
endpoint, token format or Google flow is introduced.

The resolver returns only an immutable user ID and a transaction authorizer.
Session ID, token digest and captured expiry stay in its closure. It rechecks
the exact ID/digest/user/expiry and verified user in the supplied transaction,
uses shared row locks, and rejects a different expected user or a replaced
session even when the token digest is reused. Duplicate/malformed/overlong
cookies and unknown/unverified/expired/revoked local sessions fail closed with
static errors. Workspace membership is not required for this first request.

The private session-enrollment facade requires an actual fresh TLS 1.3 HTTP
IncomingMessage, POST and JSON content type. It rejects Origin/Referer/browser
site metadata and Authorization headers, accepts exactly one raw Cookie header,
and forwards only that cookie to the configured Identity resolver. Its body
has an exact bounded public field set, excluding user ID. The resolved user and
the same transaction authorizer are passed together to issuance/completion.
Header absence does **not** prove an arbitrary caller is Main: authentication
still comes from the real session, invitation and, for completion, exact fresh
authorized mTLS peer. Client-side Host certificate/SPKI pinning remains required.

The existing enrollment service has an additive optional trusted per-call
transaction guard. The explicit parent factory forwards it without dropping it.
Pairing invokes the guard before wrong-secret accounting and after failed-secret
event writes; invalid sessions cannot spend invitation attempts. Successful
service operations recheck before reservation/publication/replay and after the
last completion write. The final async session check precedes synchronous
Host-active, certificate, peer and invitation validation; no extra async
authorizer is appended after those final peer checks.

Local Core logout deletes the session row and serializes against a transaction
holding its shared lock. This gives an order between local logout and the
enrollment transaction, not an atomic distributed Google logout guarantee.
Validity means valid at the final in-transaction check, not a promise that wall
clock time cannot pass before COMMIT. Signing runs outside the DB transaction;
logout while signing prevents publication and leaves no consumed invitation.
Pending-device creation still grants no Host approval, Workspace membership,
Plugin, Node, CLI, Agent or Source access.

No route/listener/startup is mounted. The future dedicated ingress must reuse
the existing Identity session exchange, enforce body bytes/read deadlines/
concurrency/routing/CSRF policy and cover ordinary APIs, files and WebSockets.
It must not copy the test fixture's optional-client-cert TLS server in front of
the unrestricted Core app. The fixture exposes only issuance/completion, and
the real completion primitive checks authorized clientAuth and exact issuance.

## Final verification

From `external/sps-core`, after all implementation files were frozen:

```text
pnpm exec vitest run server/src/__tests__/sps-native-parent-signer.test.ts server/src/__tests__/sps-native-parent-enrollment.test.ts server/src/__tests__/sps-native-enrollments.test.ts server/src/__tests__/sps-native-pairings.test.ts server/src/__tests__/sps-native-session-enrollment.test.ts server/src/__tests__/sps-identity.test.ts packages/db/src/sps-native-enrollments-schema.test.ts packages/db/src/post-restore-sanitizer.test.ts
pnpm typecheck
pnpm build
```

- Eight focused files: **74/74**, no skips (9 parent client, 5 parent factory,
  16 enrollment DB, 14 pairing DB, 4 session/HTTPS integration, 10 Identity,
  7 schema, 9 restore cases).
- Whole Core typecheck/build pass. Existing CSS/annotation/large-chunk warnings
  remain, not waived or described as a UI improvement.
- Agent-specific Identity tests additionally passed 10/10; these overlap the
  74-case command and are not extra independent cases.
- An initial integration assertion used `userId` instead of the existing
  `ownerUserId` device DTO field; the test was corrected without changing the
  public DTO. A subsequent intermediate run mixed files while the expected-user
  guard was being edited and failed one new assertion. Neither run qualifies
  final source; the frozen 74/74 result above supersedes them.
- Full changed-HEAD Linux CI remains required after commit/push. Previous
  Core/Source CI results do not qualify the new session-adapter bytes.

After the Windows dependency patch, the parent repeated the same test set plus
`packages/db/src/embedded-postgres-windows-mode.test.ts` using
`npx --offline pnpm@11.9.0 exec vitest run ...`: **9 files, 79/79**, no skips.
`npx --offline pnpm@11.9.0 typecheck` and `npx --offline pnpm@11.9.0 build`
also passed on the final files. This includes real temporary PostgreSQL startup
with the newly patched installed library on this Windows account, but is not
the hosted reduced-token No-AI app test. The five new dependency cases overlap
the standalone 5/5 agent result and are not counted twice.

From `sps-server/desktop`, final `npm test` passes **739 total / 738 pass /
0 fail / 1 pre-existing explicit skip**. Package-build contract tests pass 10/10
and are included in that total. An intermediate baseline check correctly failed
while the support matrix had the new Core SHA but the tracked gitlink was still
old; staging the actual new gitlink restored agreement before the final full
test. No gate was bypassed or expectation weakened.

Fresh production dependency audit is still **blocked**, with held Zod High
`1243066` (no exception) and Low findings `1119438`/`1241206`. Generated security
documentation checks pass. No major migration, new suppression or dependency
version upgrade was performed.

The loopback integration fixture uses the real configured Core Identity RSA
JWT verification/session exchange and real session DB, then HTTPS issuance and
fresh mTLS completion. Its signing keys/JWKS and issuer are fixture-owned; it
does not contact Google or production Identity, use customer data, or invoke a
paid service. It tests no-membership pending success, body/header/user injection,
browser metadata, a different valid session, missing client certificate and
actual local logout while signing. No released app is replaced.

## Unchanged gates

### Windows PostgreSQL follow-up

The preceding Source4a CI's No-AI failure is separate from Native session
authorization. Source E2E launches the development Core, whose ASCII package
path needs no Unicode short-path/subst override. The existing helper is a path
adapter, **not** a native-binary copy/cache. The installed library then tried to
set POSIX executable bits on its original package `postgres.exe`, causing
`EPERM` under the reduced token. The log cannot distinguish which unawaited
initialise/start helper invocation produced the error.

The next narrow existing-version dependency patch skips POSIX `stat/chmod`
entirely on Windows, without granting write/execute access or swallowing errors.
On POSIX the existing behavior remains and the three callers now await the
checks before spawning. Windows ACLs still determine whether a process can
execute; no workspace/pnpm cache/user-profile ACL is broadened. This follows
[Node's Windows file-mode contract](https://nodejs.org/api/fs.html#file-modes).

The dependency stays `embedded-postgres@18.1.0-beta.16` with existing MIT notice.
Only its reviewed patch hash changes to
`c0e3c29f95071a5acc66594982bcb6df3f424f696fa5d101ef6e4669c1062ff9`.
Agent setup used pnpm11.25.0; the parent additionally verified the final lockfile
with **pinned pnpm11.9.0**, offline/ignore-scripts/frozen install, zero downloads
and no lock churn. Desktop/Electron/native executables were not replaced.

The dependency regression extracts the actual installed guard, tests Windows
no-FS-change and retained POSIX behavior/errors, and checks awaited spawn order.
The Desktop package verifier now refuses an archive missing this Windows guard
or awaited checks. Its static contract tests do not substitute for actually
packaging and exercising that archive on a reduced Windows runner.

Native LAN remains OFF/unsupported; Tailscale stays the current supported path.
Issued credential persistence, trusted UI/approval/revoke/recovery, Host invite
management binding, Native TLS ingress, renewal/rotation, two physical Windows
PCs and exact final signed-byte qualification remain required. Held Zod High
`1243066` is not waived. Full changed-HEAD CI, main/independent review, production
Identity rollout and signing requirements are not replaced by fixture tests.
