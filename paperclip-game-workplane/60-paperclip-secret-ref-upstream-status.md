# Paperclip Plugin Secret-Ref Upstream Status

## Decision

Keep the current Paperclip version and keep Direct Task execution disabled. Do
not downgrade to a pre-mitigation release and do not create a local core overlay
for this feature.

## Verified Upstream State

Paperclip has already documented this exact security gap as `PAP-2394` in its
company-scope reintroduction plan:

- [Plugin Secret Refs: Company Scope Reintroduction Plan](https://github.com/paperclipai/paperclip/blob/master/doc/plans/2026-04-26-plugin-secret-ref-company-scope.md)
- [Paperclip Plugin System Specification](https://github.com/paperclipai/paperclip/blob/master/doc/plugins/PLUGIN_SPEC.md)

The local Paperclip `2026.707.0` runtime retains the documented fail-closed
marker. A separate maintained Paperclip Telegram plugin reports the same host
behavior and advises against treating it as a plugin bug.

## Why No Overlay

The official plan requires four coordinated core changes:

1. Company-scoped plugin configuration persistence and access checks.
2. Immutable company context through worker config and secret-resolution calls.
3. Company-scoped secret bindings keyed by plugin and config path, with stale
   binding cleanup.
4. Regression coverage for cross-company config, execution, disclosure, and
   no-context failure paths.

The current runtime lacks the first two. A patch limited to the secret handler
would let a global plugin config resolve a company secret without a host-proven
company context. That is the upstream vulnerability the fail-closed gate fixes.

## Operating Path Until Upstream Lands

- Continue using explicit direct external `agy.exe` Task Room runners for Code
  and QA work.
- Keep the Project Hub Direct Task UI installed but disabled.
- Run `scripts\Test-PaperclipPluginSecretRefCapability.ps1 -AsMarkdown` after
  every Paperclip update. A result of `review_required` only starts CTO review;
  it never enables the bridge automatically.
- When an upstream version removes the gate, review its migration and regression
  coverage before configuring a company secret, bridge, or Direct Task launch.
