# Objective

Audit the existing SPS Direct Task plugin and local direct runner sources
for a Windows-only named-pipe execution broker. Do not edit files.

## Required Constraints

- SPS remains the system of record for Task Rooms and close summaries.
- The browser must never call a local broker directly.
- Do not weaken, remove, or put a bridge secret in SPS plugin config.
- Do not patch SPS core or its npm cache.
- The transport must be local-only and use Windows ACL-backed access control.
- Only explicit `unreal-code` and `unreal-qa` roles may be accepted initially.
- A request must be linked to the same-company, same-project, unassigned Agent
  Room parent and bounded workspace.
- Memory remains candidate-only.

## Read These Areas

- `direct-task-bridge/`
- `sps-memory/dist/worker.js`
- `scripts/Invoke-AgyDirectTask.ps1`
- `scripts/Invoke-DirectAgyUnrealTaskRoom.ps1`
- `scripts/Invoke-DirectAgyUnrealQATaskRoom.ps1`

## Deliverable

Return only a structured Close Summary with:

- the smallest safe implementation boundary;
- data that must cross the pipe and data that must not;
- which existing close/finalization path should be reused;
- security risks to test before enabling anything.
