# Workspace Agent Read Integration

The separate MY Builder repository's actual source Host test found that the
public SDK's declared `agents.list` RPC was unavailable in the dedicated
Workspace Worker lane. Generic Host handlers already implemented it, but the
Workspace adapter's explicit method subset omitted it. This was a real502,
not an empty Agent list or an authentication success.

Core `21f2feb21e75d0ef40db3aa4de4609968da7ea33` admits only this existing
read operation through the ordinary capability gate and exact current
Workspace invocation. Missing/invalid/cross-Workspace invocation or destination
is rejected before service delegation; missing `agents.read` still rejects.
Agent mutation, invocation and session methods are not exposed by this change.
No role, Lead, business workflow, Source grant, secret, migration or automatic
execution is added. The Plugin owns its Lead selection and safe UI projection.

The new regression failed before the one-method correction. The final existing
Workspace Host/Worker/process selection passed29/29 across3files:

```sh
pnpm exec vitest run server/src/__tests__/sps-workspace-plugin-host.test.ts server/src/__tests__/sps-workspace-plugin-workers.test.ts server/src/__tests__/sps-workspace-plugin-process.test.ts
pnpm -r typecheck
pnpm build
```

All30 workspace typechecks and the full build passed. The initially supplied
fourth capability-test pathname did not exist and contributed no tests; only
the three actual files/count above are evidence.

The independent Builder source Host acceptance then passed actual Agent options,
UI selection/save, separate Workspace data, foreign-Agent rejection, unchanged
original adapter configuration and Host restart preservation. Four owned Main
processes exited0 normally,8 output streams ended and exact temporary data
cleanup completed. It used mock Identity and inert Agents: no provider/CLI
invocation, production profile, signed installation or physical-PC claim.
Two preceding Builder Host attempts failed before this correction and remain
failures. The Builder itself still does not send AI messages.

Source support matrix and generated candidate document pin this new Core SHA.
Current exact-tuple Linux/Windows/installed CI remains pending and does not
inherit prior tuple success. Core completion and cleanup/physical/crash gates
remain open.
