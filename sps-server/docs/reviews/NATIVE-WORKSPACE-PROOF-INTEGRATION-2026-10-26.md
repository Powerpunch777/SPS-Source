# Native Workspace private-channel integration

This development increment pins Core `0f06665d786a8256df8e0beac4e9fff7fb94e6f2`
and supplies the Main-side request signer and an explicit cross-repository
protocol gate. It does not enable the new private Core listener in product
startup, forward Workspace routes through Main TLS, or open a Native Workspace
window. Complete Native LAN remains unqualified and disabled at launch.

The signer binds the Host, selected Workspace, method, exact target/body digest,
Identity cookie, content type, nonce, timestamp and actual client certificate DER
using the private per-child HMAC contract documented in Core. The signer owns a
copied 32-byte secret, rejects non-current or asynchronous authority guards,
zeros its copy on disposal and caps body/header sizes. It has no preload or
renderer bridge. A caller supplying DER is not itself evidence of an mTLS
handshake: the future Main listener must derive it from the actual authorized
fresh TLS 1.3 connection.

Core now has an explicitly constructed ephemeral loopback HTTP adapter and
authenticated reader for four exact Workspace surface-query families. The real
Identity session and approved device/current Workspace membership are checked
inside the same transaction as the reused Core services. Shared locks prevent
mid-transaction device/membership/Workspace changes. Shell reads preserve the
existing fallback-metadata maintenance behavior. No Owner proof or implicit
administrator actor is forwarded, and arbitrary Core APIs are not exposed.

Verification at this increment:

- Core proof, private HTTP and real DB/HTTP surface suites: 22/22 passed.
- Member device service and real transaction lock suites: 16/16 passed.
- Core server TypeScript: passed after fixing closed-record narrowing.
- Source signer and protocol contract tests: 10/10 passed.
- Actual Main signer to Core verifier with generated client/server certificates:
  passed, including tampering, wrong key/Host, replay, stale proofs, wrong-purpose
  or expired certificate and lifecycle invalidation. This gate needs no DB,
  Electron, AI or network listener and is now part of full Linux Core CI.

These are separate focused results, not a passing full release or updated full
Core build claim. Updated CI is required at this pin. The prior Source
`e9d6835` CI passed Windows Desktop/Node and all Linux jobs except the existing
Zod High dependency gate. Audit policy/exceptions are unchanged.

Next composition must exchange a fresh child secret/port privately, bind it to
the current Host and parent generation, close it on parent/account/Host loss,
and bound full Identity resolution/transaction lifetime. It must connect actual
Main Host TLS, protected Member credentials/session, a confined per-window
bridge, SPA assets/API/plugin UI and live events with revocation. Renewal,
Source/Node access, DPAPI and physical two-PC/install/update/restore tests remain
required. Rollback removes the new explicit composition; no data migration or
automatic listener is introduced by these factories.
