# MIT reuse integration review — 2026-10-28

This note records a small, auditable MIT reuse increment for SPS Core and the
Owner Host. It does not qualify the product for release or establish plugin
isolation.

Core commits: policy fence872b60c5, Identity verifier3036f15f, migration tooling
9e0516a1. The candidate pins full Core revision
`9e0516a129ae765d6dff0b62c2ec05967d5cacaa`; Desktop remains0.4.137
development-candidate, Native opt-in and Tailscale supported. The public SDK
pin and version are unchanged by this increment.

## Integrated: `jose` for SPS Identity JWT verification

Core now declares [`jose` 6.2.3](../../../external/sps-core/server/package.json)
directly. Version 6.2.3 was already resolved transitively in the lockfile, so
this makes the imported API an explicit server dependency without introducing a
new version into the graph. The pinned upstream [MIT license](https://github.com/panva/jose/blob/408077285541d63e37590604ff7946ef90595463/LICENSE.md)
is at commit `408077285541d63e37590604ff7946ef90595463`.

The manual JWT signature code was removed from
[`sps-identity.ts`](../../../external/sps-core/server/src/auth/sps-identity.ts)
and moved to a small private verifier in
[`sps-identity-token.ts`](../../../external/sps-core/server/src/auth/sps-identity-token.ts).
`jose` verifies the compact token and registered claims against a local,
kid-selected JWK. Core still:

- fetches keys only from its configured trusted JWKS URL, with the existing
  5-second abort and 5-minute cache;
- accepts only configured RSA keys with a matching `kid`, and only `RS256`;
- does not resolve `jku` or `x5u` from token headers, refresh on an unknown `kid`,
  or expose key/token details in error responses;
- requires exact issuer, configured audience, `sps.core.session` scope (string
  or array), a finite expiration strictly later than the current second, and
  retains the existing 30-second `nbf` tolerance;
- keeps first-match behavior if the trusted JWKS contains duplicate key IDs.

The verified profile remains the only result passed into the existing user and
session persistence path. Session exchange, API routes, Native cookie parsing,
Native enrollment/session authority, and cookie options were not changed.
Malformed registered claims may now be rejected more strictly by `jose` than
the previous hand-written parser.

The fetch/cache callback remains in `sps-identity.ts`. The fixture-free token
tests cover claims, signature/key selection, fixed errors, and token-supplied
key URLs in
[`sps-identity-token.test.ts`](../../../external/sps-core/server/src/__tests__/sps-identity-token.test.ts).

## Local atomic-write pattern

[`owner-host-config.mjs`](../../desktop/src/owner-host-config.mjs) references
`atomically` at pinned commit
[`5d3af2b945ef332483f86ae9cbb18a3b19657eb7`](https://github.com/fabiospampinato/atomically/tree/5d3af2b945ef332483f86ae9cbb18a3b19657eb7)
as a local design reference. It is not an installed dependency, and upstream
code was not copied. The reference's [MIT license](https://github.com/fabiospampinato/atomically/blob/5d3af2b945ef332483f86ae9cbb18a3b19657eb7/license)
is pinned with the source link.

The local Owner Host writer keeps SPS-specific identity checks: it creates a
same-directory UUID temporary file with `O_EXCL` and mode `0600`, writes and
syncs it, verifies the temporary-file and parent-directory identities, then
renames it over the config. Cleanup removes a temporary file only when its
identity still matches the file created by that write. Only the ensure path's
initial config `readFile` treats `ENOENT` as absence; the update path and other
read failures propagate. Native credential-store behavior is unchanged.

## Schema and verification boundary

The Source CLI Drizzle check loaded the TypeScript schema index and enumerated
164 tables; it found no migration to generate for that check. The redundant
TypeScript pass in that migration-generation command was removed. Normal build
and typecheck commands are unchanged. The separate Native authority migration
0172 is pending actual database validation.

Recorded focused results: the fixture-free `jose` tests passed 10/10, and the
Owner Host config focused tests passed 16/16. An earlier restore-sanitizer
fixture passed 10/10, and the DB compile, migration generator, and migration
checks passed. The Native database run exited before assertions: its
120-second `beforeAll` hook timed out after a 143-second import, leaving 15
tests skipped and zero assertions; cleanup was not proven. No DB repeat was run.
The final server-only TypeScript check exited 0. These results do not clear the
existing Zod High or CI startup failure, and do not qualify physical Node/CLI
isolation or signed/installed Desktop artifacts.

The scoped frozen-lockfile, scripts-disabled installation exited0 after
preserving the pre-existing Drizzle tsx4.22.4 resolution. Better Auth peer
snapshot identities were normalized to its already-resolved Zod4.6.6; no
application Zod major migration was performed. Candidate document generation,
check and all4 candidate-document cases passed with the new Core pin. The
Native fixture teardown ownership follow-up was statically reviewed without
another actual database run; see the separate Native policy review.
