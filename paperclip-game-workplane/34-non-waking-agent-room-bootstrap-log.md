# Non-Waking Agent Room Bootstrap Log (CMP-40)

## Objective
Establish a non-waking Agent Room bootstrap convention and activation utility. Ensure that bootstrapping Agent Rooms creates the assigned Paperclip issue in a non-running (`blocked`) state by default to prevent consuming managed-agent runs and hitting Codex usage limits. Provide a safe, validated activation script to transition blocked rooms to a runnable (`backlog`) state with explicit consent.

## Investigation & Exact Evidence
1. **Local Schema Investigation**:
   We inspected the local Paperclip schema declarations under:
   [issue.d.ts](file:///C:/Users/young/Documents/AGENT%20%EA%B5%AC%EC%B6%95/paperclip-game-workplane/paperclip-memory-plugin/node_modules/@paperclipai/shared/dist/validators/issue.d.ts) (around lines 1839–1840):
   ```typescript
   } & {
       status: z.ZodOptional<z.ZodEnum<["backlog", "todo", "in_progress", "in_review", "done", "blocked", "cancelled"]>>;
   }
   ```
   This confirms that `createIssueInputSchema` accepts `status` on creation and `"blocked"` is a valid value, enabling direct creation of assigned issues in `blocked` status without waking the agent.

2. **The CMP-39 Finding (External Runtime Condition)**:
   The real CTO Room pilot `CMP-39` triggered a Paperclip Codex usage-limit failure. The agent status on the Paperclip server was found in a non-runnable `error` state:
   - **Error Message**: `You've hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit https://chatgpt.com/codex/settings/usage to purchase more credits or try again at 7:13 PM.`
   This is documented as an **external runtime usage-limit condition**. It is not a design flaw or a reason to replace Paperclip, but rather a temporary resource constraint. Transitioning to a non-waking Agent Room bootstrap model by default allows the platform to safely define role desks without triggering immediate agent runs.

## Implemented Components
1. **Bootstrap Script**: [Bootstrap-AgentRoom.ps1](file:///C:/Users/young/Documents/AGENT%20%EA%B5%AC%EC%B6%95/paperclip-game-workplane/scripts/Bootstrap-AgentRoom.ps1)
   - Updated parameter set to include `[switch]$StartImmediately`.
   - Defaults to creating the room issue with `status = "blocked"`.
   - Bypasses throwing an exception when checking agent status if `-StartImmediately` is not set (warns instead), allowing bootstrap to proceed for blocked rooms even if the agent is in an error state.
   - Enforces `-AcknowledgePotentialAgentRun` and checks agent readiness only if `-StartImmediately` is specified.
   - Outputs clear notices regarding LLM costs and run consequences.

2. **Activation Script**: [Activate-AgentRoom.ps1](file:///C:/Users/young/Documents/AGENT%20%EA%B5%AC%EC%B6%95/paperclip-game-workplane/scripts/Activate-AgentRoom.ps1)
   - Moves a blocked Agent Room issue to `status = "backlog"`.
   - Strictly enforces the `-Apply` and `-AcknowledgePotentialAgentRun` switches to ensure explicit agent activation consent.
   - Performs strict validations to fail closed if:
     - The issue does not exist.
     - The issue `projectId` does not match the requested project.
     - The issue `assigneeAgentId` does not match the target agent.
     - The issue title does not match the `[Agent Room]` naming convention.
     - The issue status is not currently `blocked`.
   - Displays clear cost/run consequence warning messages before application.

3. **Updated Verification Suite**: [Test-BootstrapAgentRoom.ps1](file:///C:/Users/young/Documents/AGENT%20%EA%B5%AC%EC%B6%95/paperclip-game-workplane/scripts/Test-BootstrapAgentRoom.ps1)
   - Expanded to 11 comprehensive test cases:
     - **TEST 1**: Syntax check on `Bootstrap-AgentRoom.ps1`.
     - **TEST 2**: Dry-run verification with valid agent (accepts `MatchingRoomExists` as true because of existing CMP-39).
     - **TEST 3**: Verification that starting immediately requires safety acknowledgment.
     - **TEST 4**: Rejection of invalid agent ID.
     - **TEST 5**: Exact Agent Room title matching check.
     - **TEST 6**: Idempotency check abort on duplicate creation attempt.
     - **TEST 7**: Syntax check on `Activate-AgentRoom.ps1`.
     - **TEST 8**: Dry-run activation of the existing room (CMP-39).
     - **TEST 9**: Activation safety acknowledgment gate check.
     - **TEST 10**: Activation fail closed on wrong Project ID.
     - **TEST 11**: Activation fail closed on wrong Assignee ID.

## Verification Performed
All verification tests pass successfully.

```text
=============================================
   Starting Agent Room Bootstrap Test Suite  
=============================================
[TEST 1] Syntax / Static check on Bootstrap-AgentRoom.ps1... [PASS]
[TEST 2] Dry-run with valid agent...WARNING: Selected agent '손영하-CTO' (ID: dfdde6a7-ae30-43f8-8b65-593c7eecf171) is in a non-runnable state: status='error'.
Since -StartImmediately is not specified, bootstrapping will proceed to create the Agent Room in BLOCKED status.
...
[DRY-RUN] Read-only verification completed.
 [PASS]
[TEST 3] Apply with StartImmediately without Acknowledge potential run safety... [PASS]
[TEST 4] Dry-run with invalid agent ID... [PASS]
[TEST 5] Exact Agent Room title matching guard... [PASS]
[TEST 6] Idempotency abort when trying to apply duplicate... [PASS]
[TEST 7] Syntax / Static check on Activate-AgentRoom.ps1... [PASS]
[TEST 8] Dry-run activation of CMP-39... [PASS]
[TEST 9] Apply activation without Acknowledge potential run safety... [PASS]
[TEST 10] Activation fail closed on wrong Project ID... [PASS]
[TEST 11] Activation fail closed on wrong Assignee ID... [PASS]
=============================================
      All Bootstrap & Activation Tests Passed!
=============================================
```

## Durable Lessons
- **Brackets in PowerShell wildcard matches**: Wildcard patterns in PowerShell treat square brackets `[` and `]` as special character sets. When matching exact strings containing brackets (like `[Agent Room]`), string methods like `.StartsWith()` or regex matching `-match` should be used instead of `-like` or `-notlike` to avoid pattern matching gotchas.
- **Fail-Closed Validation**: Helper scripts that perform system transitions should validate all inputs against target records before applying changes. Validating the projectId, assigneeAgentId, title, and current status of an issue guarantees that the script operates exactly on the intended target.
