# Direct Task Agent Room Parenting

## Status

Implemented and verified with read-only Unreal Code and QA task dry runs.

## Change

The direct external `agy.exe` Task Room runners already accepted `ParentId`, but
they previously did not prove that the parent was a valid role desk. A shared
read-only validator now requires a supplied parent to be:

- in the same company and Project Hub;
- a root issue named as an Agent Room;
- open and unassigned; and
- aligned with the caller's Goal when both have one.

When the caller omits `GoalId`, the runner inherits the parent Agent Room goal.
The validated parent and resolved goal are then included in the created Task Room
payload.

The direct worker runner also reads the validated parent Agent Room at execution
time and injects its title and a bounded role brief into the worker prompt. The
brief is explicitly framed as durable role boundaries; the child Task Room remains
the authoritative execution objective.

## Affected Runners

- `scripts\Invoke-DirectAgyTaskRoom.ps1`
- `scripts\Invoke-DirectAgyUnrealTaskRoom.ps1`
- `scripts\Invoke-DirectAgyUnrealQATaskRoom.ps1`

## Verification

- A dry-run Code Task Room under `CMP-72` preserved `parentId`, inherited the
  `강해린` game goal, and included the CTO role brief in the worker prompt.
- A parent from the older Onboarding project was rejected before task creation.
- Existing Unreal Code and QA workspace-boundary test suites still pass.
- The company live-runs endpoint remains empty after all tests.

## Operating Result

The current operating route is now explicit: choose a Project Hub role desk,
create one child Task Room through the direct runner, execute it through external
`agy.exe`, review its close summary, and promote only approved memory candidates.
The Project Hub Direct Task UI remains disabled until the SPS upstream
company-scoped secret capability is reviewed and available.
