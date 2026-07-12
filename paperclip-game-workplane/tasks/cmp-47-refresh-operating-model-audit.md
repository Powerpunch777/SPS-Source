# CMP-47: Refresh the operating-model audit after direct Unreal workflows

## Objective

Update the status/audit documentation to accurately reflect the completed direct Agy Unreal Code and QA workflows, while preserving `02-final-operating-model-ko.md` as the locked operating contract.

## Facts that must be represented

- `CMP-43` added the direct local Unreal Code Worker Task Room path.
- `CMP-44` hardened `.uproject` containment so an explicit project file must be inside the resolved workspace; tests cover external and prefix-collision paths.
- `CMP-45` added the direct local Unreal QA Worker Task Room helper, reusing the shared validator, with a prompt-enforced default inspect/report boundary.
- `CMP-46` was an actual read-only QA baseline Task Room run. It completed as an unassigned issue with zero Paperclip managed live runs; its report and candidate were created through the direct workflow. The candidate is not approved memory.
- The Paperclip-managed CTO is currently quota-blocked. Do not imply that managed Agent Rooms are ready or that the blocker has been fixed.
- Managed post-run extraction remains disabled by configuration. Do not say it is live.
- The first QA report recommended an initial Git baseline, but no commit has been created. Do not create or stage a commit.

## Work

1. Update `04-structure-fit-checklist.md` with concise subsequent milestones for the direct Unreal boundary hardening and QA workflow/run.
2. Update `29-operating-model-fit-audit.md` to distinguish what is now aligned (direct Code/QA Task Room paths) from remaining gaps (runnable long-lived Agent Rooms while quota/scheduler behavior remains, explicit candidate review actions, other tool adapters, and a user-facing direct-request surface).
3. Update `README.md` only if it has a status/next-step section that would otherwise be misleading.
4. Do not modify `02-final-operating-model-ko.md`, code, plugin manifests, runtime configuration, candidates, or game project files.
5. Verify changed Markdown links/claims against the local scripts/logs and state this verification in a new next-numbered log.

## Completion format

Return `## Close Summary` with changed docs, verified facts, deliberately unchanged boundaries, and tests/validation performed. `Memory Candidates:` must be empty unless a genuinely durable process lesson was added only as a candidate.
