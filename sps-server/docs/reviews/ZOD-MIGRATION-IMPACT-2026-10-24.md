# Zod Security Migration Impact: 2026-10-24

Status: investigation only. The user explicitly deferred the Zod major migration
and replacement of the installed application pending this impact assessment.
This document is not a security exception or release acceptance.

## Baseline and Current Gate

- Desktop development candidate: `0.4.137`.
- Source implementation: `5c4d96604164558323c99836f79d7033c5615bf5`.
- Core: `0574df95db75bff132ef2b7f9704f7bbd73608c6`.
- Public SDK: `cfa64ec4f589ea9765661834e1685ef1f2e14453` (`0.11.0`).
- Fresh `npm run audit:release` exited 1: three production advisories, one High
  (`core:zod`, advisory `1243066`) and two Low. No waiver was added.
- Private audit output: `desktop/dist/builder-security-hold-audit.log`.

The [reviewed advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)
lists versions below `4.6.6` as affected and `4.6.6` as patched. The issue concerns
memory exhaustion while accumulating collection-validation errors. It does not
establish that SPS data was disclosed or that an unauthenticated SPS exploit has
been reproduced. Package presence and application exploitability are different
claims; this investigation establishes the former, not the latter.

## Exposure Observed in SPS

Core's `server/src/middleware/validate.ts` parses request bodies with Zod. The
shared manifest and Node schemas also use Zod collection validators. Generic
JSON bodies are limited to 10 MB and Workspace import to 64 MB by
`server/src/http/body-limits.ts`; those parsers run before the hostname and actor
middleware in `server/src/app.ts`.

These limits bound inbound bytes, not the number or memory cost of validation
issues. App-only access, authenticated routes, signed Node requests and package
review reduce particular entry paths but are not proof that the vulnerable
library is unreachable. Likewise, an array `.max()` declaration must not be
assumed to prevent validation issue accumulation without inspecting the actual
parser implementation and testing the boundary.

No unbounded stress input was sent to the user's Host. A subsequent authorized
security implementation should map route authorization order and every relevant
parse path, including local package files and Worker/CLI messages outside the
HTTP body limits. Test the issue only in an isolated, memory/time-limited child
process and retain the security gate until remediation is demonstrated.

## Compatibility Surfaces

| Surface | Current coupling | Required acceptance before migration |
| --- | --- | --- |
| Shared API validators | Zod 3 schemas; requiredness, defaults, records, coercion and refinement semantics | Compare accepted/rejected input and normalized output, not just typecheck. Preserve intentionally supported stored/configuration input. |
| HTTP errors | `server/src/middleware/error-handler.ts` uses `ZodError` identity and `err.errors` | Preserve 400 response shape and useful diagnostics; do not turn validation failures into 500s. |
| OpenAPI | `server/src/routes/openapi.ts` reads `_def.typeName`, checks and callable `_def.shape()` | Replace the version-specific conversion deliberately; diff representative request schemas, optional fields and response contracts. |
| Internal Core plugin SDK | `packages/plugins/sdk/src/index.ts` re-exports `z` | Account for plugin source/type compatibility. A Zod 4 re-export is not an invisible patch to a Zod 3 author's API. |
| Public SPS SDK | Separate `@sonparkserver/plugin-sdk` package, with no Zod dependency/peer or source references found; serialized manifest/protocol boundary | Keep the public JSON contract stable and rerun conformance; do not conflate the internal SDK with this package or require plugin rewrites without evidence. |
| MCP tooling | Direct Zod 3 schemas and MCP SDK/schema-conversion dependencies | Verify list/call schemas, malformed-input responses, tool errors and both supported transport lanes. |
| Cursor adapter | The installed Cursor SDK graph retains Zod 3 | Select and test a compatible upstream SDK rather than forcing an unsupported major via an override. |
| Build/package | Core dependency graph and bundled runtime change | Regenerate lockfile, audit, build, candidate tuple and runtime evidence; old installer checks do not certify the new graph. |

Six in-workspace Core manifests currently require Zod `^3.24.2`: CLI, server,
shared, internal plugin SDK, MCP server and MCP connector. The excluded
Kubernetes sandbox provider is another consumer if it is later included in the
shipped runtime. Cursor currently resolves SDK `1.0.19`; a compatible upstream
upgrade must be verified rather than assumed from the permissive `1.x` range.

The current lockfile also declares MCP SDK `1.32.0`'s peer as Zod `4.6.6` while
some importers resolve a Zod 3 peer instance. Resolve that peer inconsistency in
the future dependency change; successful focused MCP tests are not a blanket
third-party compatibility guarantee. No dependency was changed by this review.

The official [migration guide](https://zod.dev/v4/changelog) documents breaking
changes including error customization, issue representation and validator
semantics. The [library-author guidance](https://zod.dev/library-authors) describes
explicit major-version compatibility patterns. Dual support alone does not
remediate a vulnerable Zod 3 validation path and must not be used to suppress the
audit.

## Recommended Implementation, Not Yet Authorized

1. Freeze representative API, SDK and plugin compatibility fixtures before
   changing dependencies. Record which contracts are serialized JSON and which
   accept live schema objects. Include default/optional fields, invalid input,
   tool schemas, manifest loading, OpenAPI and stored configuration.
2. Move Core-owned validation and error handling to a patched Zod 4 version in
   one coherent change. Do not blanket-override all Zod 3 dependencies or rely on
   internal Zod 3 structures continuing to exist.
3. Update third-party version constraints only where supported upstream, then
   inspect the resolved production graph for remaining Zod 3 validation code.
   Treat internal SDK source compatibility as an explicit compatibility task;
   preserve the public manifest/Worker protocol unless a real change requires it.
4. Run focused contracts, all workspace typechecks, Core regression/build,
   SDK conformance and production/development security gates. Record failures and
   platform exclusions rather than substituting targeted tests for the full run.
5. Repeat actual isolated Lead-to-Worker authoring, repair, interactive Preview
   and manual Host installation using the new tuple. Only then consider a new
   installer. Signing, Linux CI, Identity rollout and physical Host/Member
   acceptance remain separate Stable requirements.

No database migration, new workflow roles, credential transfer, project reset or
user-data deletion is presently justified by this change. This is an expectation
from the inspected interfaces, not a guarantee about unexamined dependencies.

## Decision Boundary

Continue Builder verification on isolated development profiles. Keep the
installed app unchanged and the release audit blocked. Request authorization
before implementing the Zod major migration; do not infer approval from the
earlier accidentally submitted answer.
