# Retained Owner Runtime Artifact References

2026-11-01 KST. Private read-model increment, not complete cleanup delivery.

The existing Owner Host manager can now retain immutable launch-path references
for its opt-in artifact observer. Known packaged and development launch shapes
capture the actual executable, working directory, bootstrap or loader/preflight/
entry, config and explicitly named path environment inputs. The copied launch
arguments and effective environment are the values actually passed to spawn,
not mutable caller objects retained across asynchronous Windows Job preparation.
No provider token/environment values appear in the reference DTO.

Unknown shapes, relative executables and unsupported paths return unavailable,
not an empty safe set. Startup behavior for unsupported introspection remains
unchanged. In particular Main's unresolved development `node` command is not
qualified by the absolute-executable fixture. This is not all configuration-
derived paths or optional Memory-sidecar discovery. The whole Vault container
is not treated as a recursively live artifact directory.

The exact Node `process.env` object is supported despite its special prototype;
own enumerable string values are still detached through descriptor checks.
Unrelated class instances/accessors remain unavailable. This was separately
reproduced and corrected before shipping the read model, rather than assuming
the plain-object fixture represented Main's default environment.

Each launch retains its own references until the exact Windows Job confirms
termination, or the non-Job child's output closes. Leader exit alone is not
release evidence. An older output-closing generation cannot remove a newer
generation's references. Lost Job acknowledgement keeps the original paths.
Read-model unavailability does not grant filesystem removal or Host authority.

## Actual Integration Failure And Correction

Adding real Host/Preview runtime paths to the existing two-Core Windows test
initially produced `SPS_PLUGIN_ARTIFACT_CHANNEL_UNAVAILABLE`. Both Core children
still closed normally and exact temporary cleanup completed; the observation
failure was not relabeled a pass.

Read-only filesystem inspection identified pnpm preflight/loader files with
multiple hardlinks. The Core path observer's default single-link rule refused
them. The private direct-parent channel now explicitly permits read-only file
hardlink observations. The default Core reference reader remains single-link;
artifact ownership, inventory and removal checks are unchanged. File identity,
size, timestamps and link count remain fixed through check/end. Directory links
and symbolic-link ancestry remain rejected. No new wire field, HTTP endpoint,
SDK capability, database migration or arbitrary deletion facility was added.

After correction the actual Windows test passed with two directly owned Core
processes and embedded databases under the reduced-token wrapper. It covered
developer/Registry and both runtime launch inputs in the held scope, simultaneous
Host/Preview maintenance exclusion, scope expiry, stop interruption and natural
Job closure. This is two local processes, not two physical PCs or installed
Settings acceptance. All owned temporary roots were identity-checked on removal.

## Verification

Local Node24.22.1 was selected on process PATH only; the installed system Node
and user profiles were not changed.

```sh
node --test test/owner-host-runtime-references.test.mjs test/owner-host.test.mjs
node --test test/owner-host-artifact-channel.windows.test.mjs
```

The final first selection passed45/45, including the actual `process.env` case;
the actual Windows test passed1/1 after the correction. Controlled retention
tests are not OS-level descendant evidence.

Final `npm run test:ci` passed the serial owned-command stage2/2 and the remaining
2061total/2058pass/three unavailable8.3 skips:2063total/2060pass/3skips/0fail.
An earlier assembly run failed its baseline test because the support matrix had
been updated before staging the Core gitlink; it was not treated as a passing
run. After aligning the tracked gitlink, a full run passed, and the final full
run was repeated after the `process.env` correction. Dependency synchronization
was performed only after previous owned fixture processes had closed.

Core `f8ef641e3c6f71699ea0c95d38e979f6c76b28df` passed84/84 across these suites:

```sh
pnpm exec vitest run server/src/__tests__/sps-plugin-artifact-reference-path.test.ts server/src/__tests__/sps-plugin-artifact-parent-channel.test.ts server/src/__tests__/sps-plugin-artifact-parent-paths.test.ts server/src/__tests__/sps-plugin-artifact-references.test.ts server/src/__tests__/sps-plugin-artifact-ownership.test.ts server/src/__tests__/sps-plugin-artifact-inventory.test.ts
pnpm -r typecheck
pnpm build
```

All30 Core workspace typechecks and the full build passed. Existing CSS highlight
and large-chunk warnings remain. Full exact-head Linux CI and packaged/installed
qualification are separate requirements, not inferred from these local checks.

`npm run audit:release` also passed the production policy: three advisories,
zero Critical/High, two reported Low and one reviewed Moderate expiring
2026-11-07. This is not a claim of zero vulnerabilities or a development-
dependency audit.

The final working source then passed `node scripts/smoke-plugin-preview-desktop.mjs`:
actual isolated Electron sign-in/mock Identity, independent Agent folders without
CLI launch, old bundled compatibility authoring/Developer Registry, external SDK
Preview alongside the normal Workspace, renderer-crash diagnostics and real
account sign-out. Sign-out closed the previous Preview target/server while
preserving its data. Main exited normally, CDP and temporary PostgreSQL closed,
the mock Identity stopped and temporary cleanup completed. This exercises the
retained compatibility Preview, not the new separate v15 Builder's AI execution,
installed bytes, abnormal Main-loss descendants or physical two-PC acceptance.

Actual Main complete discovery and current account/Host binding, Memory/restore
and Source composition, current ownership/inventory eligibility, fresh Host
confirmation, selected removal and actual Settings UI remain mandatory. No user
package was removed and no existing installation was replaced.

Reference: [Node child processes](https://nodejs.org/api/child_process.html)
for effective environment and close-versus-exit behavior;
[Node filesystem](https://nodejs.org/api/fs.html) for identity and hardlink reads.
The implementation reuses SPS's existing manager, private IPC and path observer.
