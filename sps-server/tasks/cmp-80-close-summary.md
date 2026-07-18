## Close Summary

Goal:
Implement a disabled-by-default Windows Named Pipe Direct Task transport in the
SPS memory plugin while preserving the Project Hub -> Agent Room -> Task
Room operating model.

Result:
- Added the `windows-named-pipe` transport as the safe default and retained
  `legacy-http-token` only as an explicit legacy option.
- The plugin sends bounded, one-line JSON requests to the local broker through
  `node:net`, validates the response envelope, and never resolves a SPS
  secret or calls the Direct Task HTTP transport in named-pipe mode.
- Direct Task creation requires an open, unassigned role-matched Agent Room;
  created child Task Rooms inherit the desk Goal and retain SPS as the
  task and close-summary authority.
- Project Hub Direct Task Preview now loads eligible Agent Rooms and presents
  only Code Worker or QA Worker rooms for the matching role.
- The plugin was rebuilt and SPS was restarted with the updated disabled
  manifest. Live plugin config remains null, no broker config/process exists,
  and no live run was created.

Changed Files Or Artifacts:
- `sps-memory/dist/manifest.js`
- `sps-memory/dist/worker.js`
- `sps-memory/src/ui/MemoryTab.jsx`
- `sps-memory/scripts/verify-plugin.mjs`
- `sps-memory/scripts/verify-direct-tasks.mjs`
- `direct-task-pipe-broker/*`
- `direct-task-bridge/direct-task-bridge.mjs`

Verification Performed:
- `npm run check` in `sps-memory` passed.
- `node test.mjs` in `direct-task-bridge` passed.
- `Test-DirectTaskPipeBroker.ps1` passed.
- Live SPS manifest exposes `windows-named-pipe` and
  `SPSDirectTaskBroker`; config remains null and company live runs remain
  zero.
- Project Hub UI verification confirmed that selecting `unreal-code` exposes
  `CMP-74 [Agent Room] Code Worker` as the Agent Room option.

Durable Lessons:
- The broker protocol is raw newline-delimited JSON, not HTTP over a pipe.
- A Direct Task is valid only as a child of its role-matched durable Agent Room.

Memory Candidates:
- None promoted. Existing candidate proposals remain pending explicit review.

Follow-up Tasks:
- Create and review the explicit no-secret local broker configuration for the
  bound Unreal workspace before enabling Direct Task launch.
- Run one deliberate read-only end-to-end Task Room only after that activation
  review.
