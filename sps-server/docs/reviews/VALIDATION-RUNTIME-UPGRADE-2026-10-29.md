# Validation runtime upgrade: compatibility and release evidence

Status: focused source checks passed; no installed-app replacement or release
qualification. This follows the current authorized Core completion
work and supersedes the older investigation-only dependency hold for this
compatibility-preserving source change.

## Changes and dependencies

Six Core workspace manifests pin official Zod 4.6.6. Own validation code and the
internal Plugin SDK's `z` re-export explicitly use `zod/v3`, preserving the v3
HTTP errors, type surface, manifest contracts and OpenAPI conversion. External
SDK 61a929f is unchanged and has no Zod dependency. Zod 4's normal root exports
remain available for dependencies that use them. The lock contains no Zod 3
workspace resolution. The separately installed Kubernetes sandbox provider is
excluded from this graph and is not repinned.

Upstream 4.6.6 fixes its v4 collection size handling; its bundled v3 is not
automatically fixed. Core patches four v3 ESM/CommonJS files to retain the
existing 100-issue ceiling, reject declared oversize arrays/Sets before effects,
and bound failed Array/Set/Map traversal after diagnostic exhaustion. Async
collection parsing runs batches of 32. Successful alternative schemas and catch
defaults remain valid. Each function argument/return parse gets its own budget,
preventing valid noisy arguments from hiding a later return error. Initial
collection cardinality also fences callbacks that append values.

This changes invalid-input diagnostic completeness and collection callback
scheduling/lazy reads. Valid huge inputs, object/record traversal, custom
callbacks, deep schemas and JSON decoding still need their own limits. This is
not a global CPU/memory quota. See Core's `doc/SPS-ZOD-V3-ISSUE-BUDGET.md`.

Source verifiers exercise the actual Core server dependency, separately checking
upstream v4 root size guards and SPS v3 issue/work bounds. The deployed-runtime
verifier forks a fresh process with 128MiB heap. Bounded virtual inputs ensure a
missing traversal guard fails without memory exhaustion. Existing dependency
escape, version, identity and patch-removal negative fixtures are retained.

The refreshed production audit removed the previous High Zod finding, but
exposed Moderate 1243661 in `@hono/node-server` 1.19.15. This is an indirect
dependency of MCP SDK 1.32.0. The SDK HTTP server transport imports
`getRequestListener`; no SPS source imports `serve-static`. Rather than adding
an exception, the Node adapter is pinned to official 2.1.3. Its Node >=20 engine
matches Core's minimum. A real loopback MCP HTTP session supplements the existing
in-memory schema/validation check for the adapter override.

Official sources:

- [Zod versioned imports](https://zod.dev/library-authors)
- [Zod advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)
- [Hono Node advisory](https://github.com/honojs/node-server/security/advisories/GHSA-rmxm-3fg6-px4f)
- [Hono Node 2.1.3 release](https://github.com/honojs/node-server/releases/tag/v2.1.3)

## Verification checkpoints

Before the final cardinality fence and Hono change:

- Frozen offline install with ignored lifecycle scripts passed.
- Core issue-budget, validation compatibility and OpenAPI: 28 tests passed.
- MCP tools, plugin-session tools and actual SDK schema round-trip: 32 passed.
- Packaged verifier fixtures: 10 passed, including all previous negative cases.
- Installed-copy verifier passed with Zod 4.6.6 and the recorded patch hash.
- Production audit: 0 critical/high, 2 low and the new Moderate Hono blocker.

These are intermediate results, not proof of the final dependency tuple.
Final focused checks and audit results must be recorded after installing the
final patch and adapter override. Windows CI, actual bundled runtime and physical
Host/Member acceptance remain separate. No full local suite has been run for
this change. Security policy/severities/exceptions are unchanged.

### Final dependency tuple checks

The final Zod patch SHA-256 is
`0f6c388d940b44540cf653714b80c96e7e472af6045ea0528016bbd8f629e719`.
The frozen install passed with this exact patch and Hono Node 2.1.3.

- Core security, validation and OpenAPI suites: **29/29 passed**, including
  callback-appended values and independent function-return diagnostics.
- MCP selected suites: **33/33 passed**, including the installed SDK's schema
  round-trip and a real loopback Streamable HTTP session using the new adapter.
- The actual CommonJS SDK HTTP transport also constructed/closed successfully;
  its resolved Hono Node package was independently asserted to be 2.1.3.
- Shared plugin validators: **29/29 passed**. Shared/SDK builds and server
  typecheck passed; the final MCP package typecheck passed. The runtime-only
  final Zod patch does not modify declarations.
- The changed issue-budget test also passed its isolated strict TypeScript
  check. Its deliberately invalid function-call data is explicitly typed as a
  runtime-negative fixture; generator return values conform to TS5.9 iterators.
- Packaged verifier positive and new missing-work-bound negative: **2/2 passed**
  on the final tuple. The preceding 10-case negative/identity/escape suite also
  passed; these overlapping runs are not a 12-case final suite.
- Installed-copy verification passed and printed the exact final patch hash.
- Production security gate **passed**, with no critical/high/moderate findings.
  Low advisories 1119438 (`@tootallnate/once`) and 1241206 (`katex`) remain
  reported under the unchanged policy. No exception or path review was added.

The Workspace diff consumer initially had 4 passes and 2 failures. Investigation
found that this machine's temporary directory is inside a parent Git repository
(`C:/Users/user2`), so its purported non-Git fixture was actually in Git. Windows
also denied the file-symlink fixture with EPERM. The fixture correction must
isolate Git discovery and exercise a real directory-junction escape on Windows
when file symlinks are unavailable, retaining every assertion. The corrected
fixture passed **6/6** with no skips and no plugin product-code change. Actual
packaged Windows/CI qualification remains separate evidence.

## First current-tuple CI follow-up

Source a12dc446 / Core a01b395e reached the remote pipeline. Core compatibility
passed, including both production and full dependency security gates. The full
local graph audit also passed, reporting only the three existing low findings
(production once/katex plus development deepmerge); the generated security
document check passed unchanged.

The PR Windows unit step reported 1444 passed, one failed and two existing skips.
Its sole failure was the old 3.25.76 version assertion in
`owner-host-runtime-build.test.mjs`, missed during the verifier migration. That
expectation now requires 4.6.6; all other assertions remain. The targeted build
contract file passed 11/11 with no skips. This is not a whole-suite rerun result.

The push Windows prerequisite step separately timed out while checking OpenSSL
on PATH, Git's usr binary and the official image binary, each at the existing
5-second limit. The PR's same prerequisite succeeded on PATH in 511ms. These
logs show different runner outcomes; they do not establish a missing dependency
or a product defect. No timeout, check or fixture was removed. A fresh pipeline
for the corrected source must verify the prerequisite and the complete Windows
path; the earlier failed run is retained as failed evidence.

## Rollback

Restore Core manifests, imports, patch registration and lock together, plus
Source verifiers, then reinstall. There is no data/schema/credential migration.
Do not advertise the previous vulnerable dependency graph as release-qualified.
