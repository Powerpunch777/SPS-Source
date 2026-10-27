# Native Member execution-status wiring — 2026-10-28

The actual Member window's execution-status request was blocked before transport:
Core, the Native client/response validator, window bridge and UI all supported
executionControl, but the Main-owned Member controller's surface allowlist omitted
it. The UI caught that rejection and displayed unavailable status. This increment
adds that existing surface to the closed allowlist; it does not expose mutation,
arbitrary URLs, extra selectors or Host authority.

The fixed path is UI readSurface → window IPC/Main → Member controller → saved
credential Native client → exact mTLS GET → current Core session/device/Workspace
authorization → closed status DTO. Core requires canControl:false. Archived is
still valid only for Inbox, and unknown properties are rejected.

## Checks and joined acceptance

The selected controller regression passed1/1. It exercises the real controller
with its saved credential flow and checks the stopped DTO/canControl:false,
fixed client input and rejection of extra/archive selectors. The client itself
is substituted in this unit test; it is not actual transport qualification.
Changed JavaScript syntax and diff checks passed.

The existing actual Core DB/TLS/Electron/DPAPI smoke now has the separate
--with-native-execution-control mode. It stops a fresh Workspace through Core's
real service before opening the Member window, with zero Agents/Plugins. The
window must show stopped state, exact read-only DTO and no execution actions.
A child/parent barrier then revokes that actual device; subsequent direct reads
must be denied and Refresh must remove the old state. The parent separately
checks revoked discovery/shell/status GET denial. Other modes retain their own
authority sequence; shared surface observations include the UI's status request.

The bounded parent acknowledgment listener is installed before the child sends
its request. No capability, Identity exchange, certificate or authorization
bypass was added. The existing mock Identity token exchange remains explicitly
substituted; the new smoke is not physical two-PC or installed-product evidence.

At this documentation point the joined run is active, not passed. Root session
91369 and task-local native-member-execution-status-joined-2026-10-28.log retain
its exact result. Run from external/sps-core:

```powershell
pnpm --filter @paperclipai/db exec tsx ../../../../sps-server/desktop/scripts/smoke-native-workspace-channel.mjs --isolated-native-workspace-channel --with-native-execution-control
```

## Independent Windows fake-test lifetime correction

Source58aaaa55 Windows CI passed all app acceptance stages, including packaged
runtime, packaged restart, Workspace/preview/Host lifecycle. Its final Node
suite cancelled Host Job fake cases because unresolved promises remained after
the event loop emptied. Fake helpers/sockets have no OS handles to keep the loop
alive while production's unref deadlines run. A per-test referenced interval now
models that handle lifetime and is removed in the test's after hook. Production
deadline/ref policy and assertions are unchanged. The fake file passed8/8 after
the correction; log windows-host-job-fake-lifetime-2026-10-28.log.

The actual package artifact for Source58aaaa55/Core df7436dc/SDK607b48a was built
separately and its hashes are recorded in packaged-host-artifact-58aaaa55-2026-10-28.json.
It predates this Member fix. Its local materialization/verifier session95617 is
still active; current CI evidence must not be expanded to this new source head.

No full local suite or manual CI rerun. Native remains off by default, Tailscale
supported, Desktop0.4.137 a development candidate. Filesystem/Vault/network
isolation, physical LAN/SMB, trust-loss recovery, real providers/Identity, signed
installation/update/restore and exact-tuple release gates remain. Zod High and
its existing major hold are unchanged. No Marketplace policy or Builder redesign,
installed app, OS trust/firewall, customer data, merge, release or npm publication.

OpenAI Codex coordinator and GPT-6 Luna high implementation/review, as requested.
