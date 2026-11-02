# Plugin Artifact Parent Paths: Implementation And Qualification Notes

2026-11-01 KST. This is a development implementation note, not a product
acceptance, eligibility decision, removal authorization or Core completion.
Local qualification and failed attempts are separated below. Hosted current
tuple, Main/Settings composition and final acceptance remain incomplete.

## Implemented

Core's private direct-parent artifact channel accepts optional `parentPaths`
only on `begin`. It validates exact plain data, unique references, absolute
canonical paths and file/directory kinds; the bound is 4096 entries and 4 MiB
serialized parent-path data. An explicit empty array means parent-path coverage;
omitting the field remains Core-only coverage. Core captures canonical path
observations, includes them in the snapshot fingerprint, and checks that the
captured paths remain current while the private scope is held. The existing
overall snapshot bound remains 8 MiB. This is an observation channel, not an
HTTP or SDK API and grants no deletion authority.

Desktop's developer-project reader is deliberately strict. It rejects linked
parents/files, hardlinked or oversized state files, unstable file identity,
changes during the read, invalid UTF-8/JSON and noncanonical state. It reports
the developer index, source directories and last-known-good build archives as
references, and supplies `assertCurrent()` to detect a changed index.

The private `createSpsPluginArtifactObservation` composition helper holds the
Desktop activity maintenance gate while it captures inputs and nests the
Host-owned Core scope and, when supplied, the Preview-owned Core scope. It
combines Core and Desktop references and exposes an `assertCurrent()` check
through the callback. The Windows fixture exercises actual owned Core
processes, rather than only a synthetic channel response.

## Not Mounted Or Decided

The composition helper is not mounted in Main or Settings. Its caller still
owns complete Host authorization, discovery of every relevant participant,
Registry coverage, restore handling and runtime-reference coverage. Supplying
an incomplete participant list is not made complete by this helper.

No plugin eligibility rule, artifact-removal path, Settings/Main UI, or user
workflow is implemented here. Reference observation must not be presented as
approval to remove, uninstall or otherwise alter an artifact.

## Hosted Failure And New Gate

The prior hosted Source `292b6cd`, run `41301177766`, completed **FAILURE**.
Its Desktop actual-Core test ran with an administrator token, and PostgreSQL
denied the operation. The mandatory legacy job then failed with
`missing-inputartifact`. That legacy job did not recover or pass; the run is
not acceptance evidence.

The new Windows fixture uses a fixed restricted probe. It checks that the
child runs with a reduced token, that the outer owned Job empties naturally,
and that Core exits cleanly. This Windows gate is mandatory and must not be
recorded as skipped or optional. Exact hosted results remain for the parent
to fill in; no test counts or full-suite claim are made here.

On Node 26.4.0, asserting strict clean exit in the same local fixture exposed
a real `UV_HANDLE_CLOSING` abort. The fixture passed locally on Node 24.22.1.
This observation does not prove a global root cause, establish Node 26.4 as
supported, or show that all Core failures are solved. Node PR
[#61999](https://github.com/nodejs/node/pull/61999) concerns a Windows libuv
assertion and is noted as related upstream context only; no causal connection
or fix for this fixture is claimed.

The official [Node24.20.0 changelog](https://nodejs.org/en/blog/release/v24.20.0)
includes that upstream patch. This supports its presence in the newer24 line,
not proof that it is the sole cause of the observed26.4 abort. No arbitrary
delay, swallowed nonzero exit or test skip was added. The failed strict-exit
attempt retained its temporary fixture rather than deleting after a cleanup
assertion failed; the outer Job was confirmed empty, not a clean Core exit.
Normal user installations, credentials and Vaults were untouched.

## Local Verification

Core `431e2e67aa57e08fb0dd6027d4f54d1f61990cef`:

- `pnpm exec vitest run server/src/__tests__/sps-plugin-artifact-parent-paths.test.ts server/src/__tests__/sps-plugin-artifact-parent-channel.test.ts server/src/__tests__/sps-workspace-plugin-host.test.ts server/src/__tests__/server-startup-feedback-export.test.ts`:
  36/36 in four files. The first added parent-path test reused a request ID and
  created a missing child before, rather than after, capture; those fixture
  mistakes were corrected without removing replay or path checks. Cheap invalid
  relative/empty path validation was moved before Core source reads.
- All30 Core workspace `pnpm -r typecheck` and `pnpm build` passed locally on
  Node24.22.1. These do not replace the full exact-revision Linux regression gate.
- Core's original no-parent-path mode retains its previous validation order;
  an early extra-check experiment failed two controlled sequencing tests and
  was corrected, not treated as a pass.

Desktop on Node24.22.1 with the same temporary PATH passed through the fixed
restricted wrapper and its nested Core processes:

- `npm run test:ci`: serial2/2 plus2039total/2036pass/three unavailable8.3-alias
  skips; aggregate2041total/2038pass, zero failures. This includes the mandatory
  actual Windows owned-Core test, not a skipped PostgreSQL gate.
- `node --test test/plugin-artifact-observation.test.mjs test/plugin-artifact-developer-references.test.mjs test/plugin-artifact-parent-client.test.mjs test/plugin-artifact-parent-process.test.mjs`:
  56/56. The composition-only cases use synthetic scoped owners. Other cases
  use actual owned temporary files and actual forked Node/Core IPC.
- `node --test test/owner-host-artifact-channel.windows.test.mjs`: actual Host
  and Preview Core/embedded-DB processes under owned Windows Jobs, Desktop
  developer-index reference capture, held/reused/expired scopes, and shutdown
  during a held callback passed. Both contexts remain held during Main-side
  work. The fixed restricted-token probe requires real child success, a clean
  Core exit, natural outer-Job emptiness and owned desktop cleanup. This is two
  local Core processes, not two physical PCs or a mounted Settings UI.
- Owner guards are awaited; false, async false, rejection and non-receipt values
  deny before input reads or owner scope acquisition.
- Production security policy passed: three advisories, zeroCritical/High;
  two low and one reviewed moderate expiring2026-11-07. Not zero vulnerabilities.
- Candidate-doc consistency and diff whitespace checks passed.

Builder ownership/design clarification follows the user's explicit request:
new Builder decisions use the separate `SPS-MY-PluginBuilder` repository's
current integrated design (currentlyv15), technology research and UI reference.
Older Core/bundled Builder descriptions are not the new design source. These
documents do not authorize new Builder implementation in this Core task.

The complete Desktop reference discovery, current Host authority, Main mount,
inventory eligibility, Host-bound review/removal and real Settings acceptance
remain mandatory next work. Actual two-PC Runner, packaged abnormal Main-loss,
SQL activation crash windows and final exact-tuple installed/CI evidence also
remain incomplete. No old green result is inherited by this new revision.
