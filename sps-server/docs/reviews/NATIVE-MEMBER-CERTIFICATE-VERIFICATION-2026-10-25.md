# Native Member certificate issuance verification

Date: 2026-10-25 KST. Status: **inactive source issuance and real loopback mTLS tests**.
This is not product enrollment, a Native LAN listener, two-PC acceptance or a
signed-release result. The [Settings/restore review](NATIVE-SETTINGS-RESTORE-VERIFICATION-2026-10-25.md)
remains the preceding integration checkpoint.

## Revisions And Scope

- Parent Source: `928a5e5b680242d9a9ef61cd5ddabbd46c465417`.
- Core: `c30687dcf734cb61805978e1f6f60529fa9259d2`, unchanged.
- Public SDK: `d4d69208480fc618b2055378b85d183aea422d50`, unchanged.
- The enclosing commit and Source PR #14 identify this implementation.
- Unreleased Desktop source remains `0.4.137`; Tailscale is still the supported
  product remote transport. No installed app/runtime was replaced.

## Implemented

`native-member-certificates.mjs` provides private, inactive primitives:

1. Generate a separate exportable ECDSA P-256 Member key and SHA-256 signed PKCS#10
   request. The fixed subject binds a local device-key UUID and intended Host UUID.
   The key is not a Node/CLI signer, Host server key or issuer key.
2. Produce a public-only enrollment request after verifying the CSR and private-key
   correspondence. The public DTO does not contain a private key, email, login,
   Workspace, Node ID, approval or grant.
3. Validate a bounded request and issue a non-CA `digitalSignature` / `clientAuth`
   certificate using the Host's separate Member issuer. The caller must provide an
   explicit clock and validity, at most 90 days, contained in the issuer interval.
   The complete Host identity must be current at that clock. Nothing automatically
   truncates, renews, changes trust or grants approval.

Checks include exact data-only input fields; canonical bounded PEM; complete ASN.1
consumption; depth/node/content limits; definite/minimal lengths and exact outer
structure; PKCS#10 version zero; exact encoded RDNs; no attributes/extensions;
P-256 SPKI and ECDSA/SHA-256 signature; valid request signature; intended Host;
and no reuse of Host server/issuer keys. Trailing fields, indefinite encodings,
extra algorithm parameters, duplicate subject fields, CA/SAN requests and changed
signatures are rejected. Library verification uses the original signed request
information, not a fabricated replacement signature protocol.

The issued leaf has only Basic Constraints, Key Usage, clientAuth EKU, SKI and AKI.
It contains no serverAuth, CA power or CSR-requested extension. Tests verify its
signature and key correspondence, issuer linkage and exact extension profile.
Public/private purpose is preserved when common certificate input helpers are
shared with the existing Host identity module; existing Host profile tests remain.

The standard PKCS#10 syntax is defined by [RFC 2986](https://www.rfc-editor.org/rfc/rfc2986).
This uses PKCS#10 as a cryptographic request format; it does not claim complete
[EST / RFC 7030](https://www.rfc-editor.org/rfc/rfc7030) protocol compliance.
CSR signing demonstrates request authorship, **not fresh live key possession,
Google/SPS login, one-use pairing consumption, Host approval or Workspace access**.
The actual pairing adapter must bind those independent facts. No custom PoP
protocol is introduced alongside the approved mTLS design.

`asn1js` 3.0.10 was already present in the locked production transitive graph and
is now declared directly for bounded complete ASN.1 parsing. Its BSD-3-Clause
notice, including GMO GlobalSign/Peculiar Ventures attribution, is retained in the
Native PKI asset notice alongside existing MIT/Apache notices. No dependency
version was changed; actual packaged-license retention still needs a fresh package.

## Real Loopback TLS Evidence

The tracked TLS test generates only disposable software keys and listens on
`127.0.0.1` with an ephemeral port. Both ends require TLS 1.3. The server requires
and validates a client certificate against the separate Member issuer. The client
trusts the Host leaf only in that individual connection's CA options. There is no
global trust modification, verification bypass or `rejectUnauthorized: false`.

- Issued Member certificate plus matching private key: accepted by the server;
  both sides report the intended certificate and TLS 1.3 authorization.
- No client certificate: rejected.
- Different issuer: rejected.
- A serverAuth-only leaf signed by the *same trusted Member issuer*: rejected,
  independently exercising wrong EKU rather than merely wrong CA.
- Correct leaf plus wrong private key: rejected before successful authentication.
- Exactly one certificate was accepted; observed application bytes were zero.

Listen/handshake/observation/teardown have time bounds. Only owned loopback servers
and sockets are closed. No filesystem key, subprocess, OS certificate store,
firewall, Tailscale route, customer profile or external interface is used.

## Windows CI Fixture Correction

The exact parent Source [run 40177825073](https://github.com/Powerpunch777/SPS-Source/actions/runs/40177825073)
completed all nine Linux Core shards and Core typecheck/build, but Windows unit
tests failed **649/654**, and the Zod policy job failed separately. The sibling
run 40177828178 had the same five Windows unit failures. Native storage, Settings
and No-AI Electron steps were skipped: they provide no new runtime evidence.

Three failures used a lexical 8.3 temp-path alias against canonical filesystem
paths. Two lstat-mock comparisons consequently missed the actual canonical Vault
and failed to inject their intended error. The fixture now derives all paths from
the owned canonical root, and mocks compare canonical paths. Cleanup identities,
links and containment assertions are preserved; product filesystem guards were
not weakened. Local storage tests pass 24/24. This is not yet proof that the new
enclosing Source's Windows CI passed.

## Exact Verification

From `sps-server/desktop`:

```sh
npm test
node --test test/native-identity-certificates.test.mjs test/native-identity-profile.test.mjs test/native-member-certificates.test.mjs test/native-member-tls.test.mjs test/native-identity-store.test.mjs test/native-identity-integration-contract.test.mjs
npm run test:e2e:core-settings
npm run audit:release
npm run audit:development
npm run docs:security:check
npm run docs:candidate:check
```

- Full Desktop unit/contract suite: **668/668**, no skips.
- Exact focused command above: **56/56**, no skips.
- Member-specific tests: **12 unit cases and one multi-scenario loopback TLS case**.
- Existing Core Settings source Electron: all seven fresh/corrupt/recovery/deferred
  modes passed again on existing Electron **43.7.7**. This is not locked **43.8.3**,
  logged-in Member enrollment, new v2 DPAPI acceptance or a packaged app result.
- Both production and full development/build/Electron security policies remain
  **blocked by unapproved Zod High 1243066**, with two existing Low advisories.
  No waiver or held major migration was introduced. Generated security/candidate
  checks and diff whitespace check passed.
- Core and SDK worktrees remained clean; no new database migration was necessary.

## Still Required

No Main, renderer, HTTP, public SDK or CLI activation calls these new primitives.
Member private keys are currently temporary in-memory test data, not a completed
durable Member credential store. Exportable JavaScript keys are not TPM attestation
and cannot be guaranteed zeroized merely by clearing temporary DER buffers.

The next integration must validate a pinned Host before sending credentials,
bind current SPS user authentication and live TLS key possession to the exact
issued certificate, and atomically consume the invitation into pending device
registration. Issuance alone must never turn pending into approved, resurrect
revoked devices, grant Workspace membership, or enable Node/CLI/Source execution.
Explicit Host approval, current authorization, revoke/stream closure and recovery
remain separate requirements.

Member secure storage, first-enrollment transport, Native ingress and complete
HTTP/WS/resource coverage, credential recovery/renewal/pin/issuer rollover,
Tailscale-free Source access and actual two-PC proof remain incomplete.
Patched-runtime CI, unprivileged Windows No-AI, Zod remediation approval, Identity
rollout, Core main/independent review/protection, signing and identical final
signed bytes on two PCs remain release gates. No installer or release was created.
