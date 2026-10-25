# Host Plugin Deterministic Authentication Fixture

Date: 2026-10-26 KST. Status: **source app tested; exact-head packaged CI pending**.
Desktop remains unreleased 0.4.137. Core `0d306bd46` and public SDK
`d4d692084` are unchanged by this test-only follow-up.

## Observed Failure

Source `5211802` workflow `40216735206`, Windows job `121239389576`, failed
Host plugin lifecycle while waiting for a Marketplace Assistant result.
The actual heartbeat result was `configuration_incomplete` /
`codex_credentials_missing`: the production credential preflight correctly
rejected a managed Codex home with no credentials before the local deterministic
ACP fixture started. No provider quota or Native enrollment failure is inferred.

## Correction And Boundaries

- Deterministic mode creates only a plainly synthetic API key under the owned
  temporary test directory. The shared test `auth.json` uses the supported flat
  `OPENAI_API_KEY` form. It is not a real provider credential or OAuth token.
- Inherited credential environment names are filtered before their values are
  read into the child environment. The explicit shared `CODEX_HOME` points only
  to that temporary fixture. Electron userData isolation remains unchanged.
- The Agent receives the synthetic key, **not an external per-Agent CODEX_HOME**.
  Existing Core logic assigns the managed per-Agent home and performs its usual
  credential readiness/secret resolution. The harness checks the returned
  canonical plain bindings and containment in its own test userData.
- The configured ACP command must exactly match the local Node executable and
  deterministic fixture path. The fixture invokes the existing read-only MCP
  tool; it does not launch Codex or a paid model. Live mode remains a separate
  explicitly selected command and was not run.
- Production preflight, Core routes, SDK, policy, plugin lifecycle controls and
  Marketplace behavior are unchanged. The Marketplace-policy attachment is
  reviewed reference material, not implementation authorization.

Parent review rejected an initial external-home override because it would avoid
the managed-home readiness path. An intermediate UI run then exposed that
overriding HOME/USERPROFILE broke Electron's Windows AppData lookup; those
overrides were removed. Another test assertion incorrectly expected a raw string
instead of Core's canonical plain binding. Those failed iterations are not
accepted app evidence; the corrected final run below is separate.

## Verification

From `sps-server/desktop`:

```text
node --test test/host-plugin-lifecycle-desktop-e2e.test.mjs
node --check scripts/smoke-host-plugin-lifecycle-desktop.mjs
npm run prepare:owner-host-runtime
npm run test:e2e:host-plugin-lifecycle
```

Focused tests passed **3/3**. The final source Desktop app run exited **0** and
completed install, enable, disable, re-enable, uninstall cancellation and
confirmed uninstall through the actual UI. The deterministic Assistant completed
its search response without changing lifecycle state. Temporary data/process
teardown remains the harness's existing best-effort implementation. Its exit 0
does not independently attest natural Job emptiness, graceful Main exit or
complete temporary PostgreSQL/data cleanup; some cleanup errors are still
caught. This is functional source UI evidence, not the stricter Preview cleanup
qualification or physical/signed-release evidence. Host teardown hardening is
still required before treating it as a cleanup receipt.

Final full Desktop regression passed **836 total / 835 pass / 0 fail / 1 existing
skip**. Candidate/security-document consistency checks passed. The separate
Preview source app rerun after auxiliary runtime regeneration completed its
functional cases and confirmed orderly Main, PostgreSQL and temporary-data
cleanup with exit 0.

The auxiliary development runtime was regenerated with Core `0d306bd46` / SDK
`d4d692084`; its development manifest explicitly has `sourceDirty:true`. Source
Desktop executes the checked-out Core directly; the previously stale prepared
runtime was an auxiliary MCP/developer-tool artifact, not proof that the Core
server itself executed an old checkout. Preparation exited 0 despite the existing
optional cpu-features compiler warning. No signed-installer evidence is claimed.

The exact changed Source must still pass hosted Windows E2E. Its production audit
still rejects Zod High1243066 without an exception; the held major migration is
not waived. No installed app, customer data/key, firewall, external listener,
Google login, production Identity, support matrix or release asset was changed.
