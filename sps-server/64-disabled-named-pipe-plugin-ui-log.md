# Disabled Named Pipe Plugin And Project Hub UI

## Status

Implemented, tested, deployed, and then activated through a non-secret local
named-pipe configuration.

## Behavior

- The plugin defaults to `windows-named-pipe`; the older HTTP-token transport
  remains explicit `legacy-http-token` compatibility code only.
- Named-pipe requests use raw, newline-delimited JSON through `node:net` and
  validate protocol version, request ID, success/status consistency, response
  body presence, response size, and timeout.
- In named-pipe mode the plugin does not call `ctx.secrets.resolve` and does
  not use `fetch` for Direct Task submit or finalizer polling.
- A submit requires an open, unassigned root Agent Room in the same Company and
  Project Hub. Code tasks require `[Agent Room] Code Worker`; QA tasks require
  `[Agent Room] QA Worker`. The child Task Room receives `parentId` and inherits
  the desk Goal.
- The Project Hub Direct Task Preview fetches eligible Agent Rooms and filters
  the selector by worker role before preview or launch.

## Deployment Verification

- `npm run check` passed in `sps-memory`.
- The Node Direct Task Bridge and PowerShell Pipe Broker test suites passed.
- SPS was restarted only after verification. The live manifest now
  exposes `directTaskTransport: windows-named-pipe` and
  `directPipeName: SPSDirectTaskBroker`.
- The live plugin config contains only `enableDirectTaskLaunch`, transport, and
  pipe name. A single-workspace broker config is present and running; it stores
  no bridge token or secret reference. SPS live runs remain zero.
- Browser verification on the `강해린` Project Hub showed that selecting
  `unreal-code` exposes `CMP-74 [Agent Room] Code Worker` as the only eligible
  Agent Room choice.

## Remaining Activation Gate

The first explicit user Task Room is the next operational step. The SPS
plugin secret-ref gate remains blocked; it is not used by the named-pipe path
and no core overlay is required.
