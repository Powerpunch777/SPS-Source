# CMP-48: Design a safe Project Hub direct-request launcher

## Objective

Produce an evidence-based implementation design for a **user-facing Project Hub direct-request launcher** that can eventually start the verified local Unreal Code and QA direct Agy Task Room workflows without turning the SPS plugin or memory sidecar into an unsafe arbitrary command runner.

## Operating-model contract

- User starts a request in Project Hub; the request becomes one unassigned SPS Task Room with a concrete objective.
- Local direct `agy.exe` performs the work; SPS remains the source of truth for issue/comments/status.
- The launcher must not create/assign a SPS managed agent, wake an Agent Room, or bypass candidate-first memory.
- `02-final-operating-model-ko.md` is locked. Do not modify it.

## Research required

Inspect the local source and installed SPS plugin SDK declarations for:

1. Existing memory-plugin UI/worker/API route patterns and its current capabilities.
2. Memory Sidecar HTTP security model and whether it should remain memory-only.
3. Existing direct Agy PowerShell helpers and their trusted input/validation boundaries.
4. Plugin API route and board authentication capabilities that could support a same-origin Project Hub form.
5. Any existing task-bridge conventions relevant to authenticated task writes.

## Deliverable

Write a next-numbered design/feasibility log that contains:

- A simple request flow diagram from Project Hub through the intended local bridge to the closed Task Room.
- A clear decision: keep Memory Sidecar memory-only; introduce a separate Direct Task Bridge if and only if necessary.
- A minimal API proposal for **preview**, **submit**, and **status** with request/response fields and a client idempotency key.
- Threats and non-negotiable controls: loopback binding, explicit bridge secret, SPS board authentication, fixed role allowlist (`unreal-code`, `unreal-qa` only initially), registered project/workspace mapping, path validation, argument-array process invocation, no raw shell command field, bounded title/description, concurrency limit, process/job status, audit logging, and no automatic memory promotion.
- A recommended phased implementation plan with a non-executing preview UI first and an explicitly configured submit path second.
- A precise list of plugin/sidecar/script/config files that later implementation would need to change.

## Boundaries

- Do not add API routes, UI controls, process spawning, credentials, config changes, plugin capabilities, or runtime services in this task.
- Do not send a request to the live local SPS server and do not alter the Unreal project.
- Do not claim that browser-side execution is already available.

## Completion format

Return `## Close Summary` with inspected evidence, architecture decision, recommended next implementation task, and residual risks. `Memory Candidates:` should normally be empty.
