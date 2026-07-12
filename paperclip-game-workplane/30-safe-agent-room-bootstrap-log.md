# Safe Agent Room Bootstrap Tool Log

## Objective
Implement a safe, idempotent Agent Room bootstrap tool that instantiates the Agent Room contract defined in `02-final-operating-model-ko.md` without introducing a hidden controller or waking agents by default.

An Agent Room is represented as a long-lived, project-scoped assigned Paperclip issue.

## Implemented Components

1. **Bootstrap Utility**: [Bootstrap-AgentRoom.ps1](file:///C:/Users/young/Documents/AGENT%20%EA%B5%AC%EC%B6%95/paperclip-game-workplane/scripts/Bootstrap-AgentRoom.ps1)
   - Default is read-only dry-run. Lists the planned room and checks for existing active duplicates.
   - Requires: `CompanyId`, `ProjectId`, `RoleName`, `AssigneeAgentId`.
   - Allows optional `GoalId` and custom `Title`.
   - Verifies the assignee agent exists in Paperclip and is in a ready/runnable state (fails if status is error, paused, or disabled).
   - Validates that no active (non-done/non-cancelled) room with the same Agent Room title is already assigned to the agent in the project. Ordinary delivery Task Rooms never block role-desk creation.
   - Enforces the safety switches `-Apply` AND `-AcknowledgePotentialAgentRun` to execute the POST request.

2. **Role-Desk Description Template**: [AgentRoomDescriptionTemplate.md](file:///C:/Users/young/Documents/AGENT%20%EA%B5%AC%EC%B6%95/paperclip-game-workplane/templates/AgentRoomDescriptionTemplate.md)
   - Establishes the role-desk protocol:
     - Long-lived persistent room (do not close after a single request).
     - User comments are direct requests.
     - Memory recall is executed before work.
     - Production changes are performed in child Task Rooms.
     - Direct tool usage by CTO/Manager (no hidden controller).
     - Close child Task Rooms with close summaries and memory candidate proposals.

3. **Automated Verification Suite**: [Test-BootstrapAgentRoom.ps1](file:///C:/Users/young/Documents/AGENT%20%EA%B5%AC%EC%B6%95/paperclip-game-workplane/scripts/Test-BootstrapAgentRoom.ps1)
   - Verifies syntax checks.
   - Validates correct dry-run return objects and matching logic.
   - Validates safety blocks (throws error if `-Apply` is specified without `-AcknowledgePotentialAgentRun`).
   - Validates non-existent agent detection.
   - Confirms that duplicate detection includes the exact Agent Room title as well as assignee and project.

## Verification Performed

The test suite was run against the live local Paperclip instance:
```powershell
powershell -File scripts\Test-BootstrapAgentRoom.ps1
```

### Test Results
```
=============================================
   Starting Agent Room Bootstrap Test Suite  
=============================================
[TEST 1] Syntax / Static check on Bootstrap-AgentRoom.ps1... [PASS]
[TEST 2] Dry-run with valid agent...
=============================================
   Agent Room Bootstrap Plan & Validation    
=============================================
Company ID:       181e1bf7-3390-4b8d-8507-b736a03e444b
Project ID:       2e0a5142-c2d2-4f23-8079-a287e8c8e59f
Role/Room Name:   CTO
Agent Assignee:   손영하-CTO (ID: dfdde6a7-ae30-43f8-8b65-593c7eecf171)
Agent Status:     idle
Planned Title:    [Agent Room] CTO
---------------------------------------------
Status:           No matching active room exists. Safe to bootstrap.
=============================================
[DRY-RUN] Read-only verification completed.
No issues were created. To perform the actual room bootstrap, re-run with: 
  -Apply -AcknowledgePotentialAgentRun
 [PASS]
[TEST 3] Apply without Acknowledge potential run safety... [PASS] (Prevented apply without acknowledgement as expected)
[TEST 4] Dry-run with invalid agent ID... [PASS] (Rejected invalid agent ID as expected)
=============================================
      All Bootstrap Tests Passed!            
=============================================
```

## Durable Lessons
- **Explicit Acknowledgment Switch**: Since Paperclip triggers agent execution when an issue is assigned to an agent, bootstrapping must explicitly gate creation. Adding `-AcknowledgePotentialAgentRun` forces the operator to recognize that creation can immediately run an agent.
- **PowerShell Encoding**: Multi-byte character matches in tests should use wildcard matches (e.g. `-like "*CTO*"`) where possible to prevent locale/encoding discrepancies from breaking test cases across environments.
