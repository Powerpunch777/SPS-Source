# Optional model Host settings

The existing Core model connection/broker services had no configuration page in
the Core baseline. The baseline also omitted the existing Secret management
route, so a Host could not create a credential and configure an optional model
using the product UI. This increment connects those existing services to Host
settings; it does not introduce a new execution engine or public SDK contract.
The resulting Core candidate is `619a3d94ae3040ecb657a6a722949795888e0bde`.

The model page lives at `/company/settings/instance/model-connections`, under
the already reserved `instance` route segment. Existing Plugin settings routes
and manifests are not displaced. Host overview, sidebar, settings navigation
and remembered settings location expose the page. Credentials links reuse the
existing `/company/settings/secrets` page and its existing Secret policy; the
new model page receives Secret metadata only and never reads credential values.

The Host selects an active company-scoped credential, endpoint and model for
the existing Responses-compatible text protocol. HTTPS is the default; local
HTTP requires explicit loopback opt-in. Saved configuration is distinct from
provider availability, login or a successful request. Saving never probes a
provider, creates an Agent or grants a Plugin access automatically.

Each Plugin approval invokes the existing Workspace/connection grant route,
which enforces availability/capability and creates the exact credential binding.
Plugin choices require the installed manifest's `sps.models.submit` declaration;
the existing company Plugin list adds that declaration metadata without granting
new authority. Current dependency/availability checks still run on approval.
The UI does not write binding rows or provide secret-resolution RPC. Explicit
disable and revoke operations retain existing grant invalidation semantics;
reenabling a connection requires separate Plugin approval. Server Host proofs,
Workspace authorization and current dispatch/result checks remain authoritative.

AI remains optional. No connection is required for ordinary Workspace use.
Marketplace policy and Plugin Builder structure are unchanged.

Focused API/navigation checks passed 11/11 across four files. The combined
attempt could not start its Sidebar worker; that startup failure is not a
passing run. The Sidebar follow-up passed 7/7. The new model page's final
render checks passed 6/6: Host denial before Secret/Plugin reads, creation and
explicit approval, cancelled/confirmed revoke, uncertain write reconciliation
without resubmission, declared-capability filtering and Workspace-switch fencing.
Its preceding run had one incorrect fixture text assertion (5/6); that failed
attempt is not relabeled as passing. The scoped UI build exited 0 (5m18), with
existing CSS/Rollup/chunk-size warnings. A read of prior Source `01bdbd2` CI
found two Inbox test-fixture TS2322 errors; its timestamp fields are now typed
explicitly without changing runtime behavior. The UI-only typecheck no longer
reported those errors, but found three new test-only declaration errors (Secret
managed-mode literal and button element types). Those declarations are corrected;
a typecheck restricted to the new model files and their imports exited 0.
The failed UI-wide run is not relabeled as green. No full Desktop/Core workspace suite,
server typecheck or server build was requested.
Previous model broker/runtime evidence belongs to its recorded revisions; it
does not establish actual provider authentication for the new page.

Native Plugin execution remains a separate required integration. Reusing the
ordinary same-realm Plugin ESM loader in the isolated Native window would expose
the window's ambient Workspace bridge to Plugin code. A Plugin-scoped isolated
context and narrow message/RPC boundary are required before enabling it; a list
of Plugin metadata is not a substitute for working Plugin UI and execution.

Native continuity review also identified a remaining certificate-renewal gap:
expired Member issuance is currently generalized to unavailable/corrupt and
Retry cannot renew it. Existing Host trust and original device keys must survive
an explicit renewal implementation. This review does not claim that gap fixed.

Rollback removes the new page and navigation while preserving existing
connections, grants, Secrets and model runs. No data migration is introduced.
