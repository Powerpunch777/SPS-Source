# CMP-70 Paperclip Plugin Secret-Resolution Compatibility Gate

## Status

Verified against the installed Paperclip runtime. No Direct Task activation was
performed.

## Finding

The deployed Direct Task plugin is ready but disabled. Its future bridge token is
designed to be a Paperclip secret reference, not plaintext plugin configuration.
The installed Paperclip secret handler currently fails closed with a message that
plugin secret references are disabled until company-scoped plugin configuration is
available.

This is a Paperclip core capability gate, not a missing Direct Task plugin field or
workspace setup step. The required scope must reach secret resolution from the
authenticated Project Hub action and scheduled finalizer without trusting browser
input.

## Non-Negotiable Boundary

- Do not store a bridge token directly in plugin configuration.
- Do not remove bridge token authentication.
- Do not let browser code call the loopback bridge directly.
- Do not enable Direct Task while the host cannot scope secret resolution to the
  owning company.

## Current Working Path

Use the existing direct external `agy.exe` Task Room runners for explicitly
requested Code and QA work. They create unassigned Paperclip Task Rooms, use the
bound Unreal workspace through their existing validator, write close summaries,
and only propose memory candidates for review.

## Upstream Status and Decision

Paperclip already documents this exact follow-up as `PAP-2394`:
`https://github.com/paperclipai/paperclip/blob/master/doc/plans/2026-04-26-plugin-secret-ref-company-scope.md`.
Its plan requires company-scoped plugin config, runtime company context, bound
secret resolution, stale-binding cleanup, and cross-company regression coverage.

The installed Paperclip `2026.707.0` runtime still has the same fail-closed
marker. A separate maintained Paperclip plugin reports the same limitation, so
this is confirmed upstream behavior rather than a local plugin defect.

Decision: retain current Paperclip updates, keep Direct Task disabled, and do
not downgrade or overlay the core. The direct external runner remains the working
execution path. `60-paperclip-secret-ref-upstream-status.md` records the update
monitor and the criteria for future review.

No overlay, core fork, raw secret, or Direct Task bridge configuration was created
by this audit.
