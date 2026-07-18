# CMP-56: Direct Task Plugin Source Hardening Corrections

## Context

`CMP-55` added a source-only SPS plugin route and scheduled finalizer for the Direct Task Bridge. The installed runtime plugin must remain Preview-only. No plugin reinstall, no configuration change, no secret creation, and no bridge process startup is permitted in this task.

The target operating model remains `02-final-operating-model-ko.md`: SPS issue/comments are the Task Room; direct execution creates an unassigned issue only; no agent is assigned or awakened; a terminal Task Room gets one bounded Close Summary and no automatic durable-memory promotion.

## Required Corrections

Work only in the local source tree and its hermetic tests/docs.

1. Correct the SPS SDK secret-reference contract.
   - `ctx.secrets.resolve()` requires a string secret reference.
   - Make `directBridgeSecretRef` a string config field and validate it before resolving.
   - Update every hermetic test to use a string ref and assert the correct value is passed to `secrets.resolve`.

2. Tighten bridge routing and error confidentiality.
   - Direct Task Bridge is bound to `127.0.0.1`; accept only `http://127.0.0.1:<port>` endpoint URLs. Reject hostname aliases, IPv6, credentials/userinfo, query/hash, non-HTTP schemes, missing/invalid explicit port, and non-root base paths before any issue/state write or secret resolution.
   - A resolved token must never appear in an API response, a SPS comment, plugin state, or logger fields, even if a bridge/network exception or bridge response echoes it. Do not return raw upstream exception/response text to the caller.
   - Keep useful error *codes* only and use bounded generic user-facing messages. Bound any comment text to 4000 characters.
   - Validate a successful bridge submit response before persisting state: it must contain a valid bridge job id and a supported nonterminal status. An invalid response must leave a clear cancelled Task Room without exposing raw body text.
   - Reject a body company id that conflicts with the host-resolved `input.companyId`.

3. Make finalization retry-safe.
   - Namespace all Direct Task Bridge state keys (for example `namespace: "direct-task-bridge"`) so the integration cannot collide with other plugin state.
   - Never emit duplicate close/failure comments when a scheduler retry follows a partial finalization failure. Use a deterministic, internal marker based on the bridge job id and check existing Task Room comments before creating a terminal comment.
   - Keep terminal transition order safe: post/find the marker-bearing bounded comment, update the issue status (`done` only for a structurally valid completed/exit-0 Close Summary, otherwise `blocked`), then clear state. A retry must converge without a duplicate comment or agent assignment/wakeup.
   - Validate bridge status response shape and matching job id. Unknown/malformed/nonmatching results must fail closed to a bounded blocked Task Room rather than create a false success.

4. Extend `scripts/verify-direct-tasks.mjs` with hermetic tests proving all of the above, including:
   - string secret-ref contract;
   - disabled / invalid-config paths have zero write side effects;
   - secret echo from the bridge or network error cannot reach response, logs, comments, or state;
   - invalid bridge success response fails closed;
   - company mismatch rejection;
   - finalizer partial-update retry produces exactly one marker-bearing comment and converges to terminal state;
   - malformed or mismatched bridge status cannot mark an issue done.

5. Run `npm run check` in `sps-memory`.

## Non-Negotiable Boundaries

- Do not install/reinstall the SPS plugin.
- Do not modify the live plugin record/configuration, SPS data, or browser UI state.
- Do not create a Direct Task Bridge config file, secret, jobs file, audit log, or process.
- Do not run a real `agy` execution from the plugin/bridge.
- Do not alter `02-final-operating-model-ko.md`.
- Do not enable managed candidate extraction or promote any candidate memory.
- Do not add agent assignment or wakeup behavior.

## Documentation

Create a concise new numbered implementation log after `47-...` and update the README and fit/audit documents only where the source-only status and corrected guarantees need recording. State explicitly that the runtime remains Preview-only and disabled.

## Completion Report

Report changed files, exact verification command/result, and the unchanged live-runtime boundaries. Include a standard `## Close Summary`.
