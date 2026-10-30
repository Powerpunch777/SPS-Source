# No-AI Checklist Reference

This is a disposable acceptance fixture, not a default or published SPS plugin.
It uses the pinned public SDK, never imports private Core code, and requires no
Agent, model account, Gateway, OCE, Source grant or Node Runner.

The Worker supplies UI data/actions, company-scoped state, a custom event
subscriber and a manually triggered Workspace Job. Core owns event namespacing:
the Worker emits the bare name `changed` and subscribes to the fully qualified
`plugin.local.no-ai-checklist.changed` event. State mutation and event delivery
are separate operations, not an atomic transaction or durable event queue.

`createChecklistPackage` builds temporary output using the public authoring
bundler. The UI uses only React and public SDK bridge hooks. The headless and
capability-denied variants exist only to exercise actual Host checks.

Run from `sps-server/desktop` in Windows PowerShell:

```powershell
$env:SPS_DESKTOP_E2E_SOURCE = '1'
npm run test:e2e:no-ai-checklist
```

The harness starts real source Electron and an isolated Owner Host using a fake
local Identity service. It does not use production Google, customer credentials
or real model providers. Normal cleanup stops the test app and removes its
temporary data. `SPS_DESKTOP_E2E_SCREENSHOT` optionally sets an ignored local
screenshot destination. These are source acceptance results, not signed installer,
physical Host/Member, OS sandbox or complete network-egress evidence.

Worker unit tests use a fake scoped store; they are not Core enforcement proof.
The separate Electron acceptance exercises the real Plugin bridge, events, Job
coordinator, persistent store and Native recovery route.
