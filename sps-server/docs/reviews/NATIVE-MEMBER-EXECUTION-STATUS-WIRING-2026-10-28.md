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

The first joined run, root session91369, exited1 before UI assertions at the
existing45s Core-child readiness deadline. Natural child shutdown also timed out
at its existing20s deadline, so the exact owned child required failure cleanup.
The aggregate did not report a separate DB cleanup error; this is still failed
acceptance, not graceful cleanup evidence. The log is
native-member-execution-status-joined-2026-10-28.log. No retry or deadline increase
was used. The child now reports fixed startup phase enums before imports, DB and
channel setup; the parent accepts only those enums and includes the last phase
in readiness failures. Raw errors, output, paths and credentials remain omitted.
The diagnostics have syntax/diff checks, not a new runtime pass.

Run from external/sps-core:

```powershell
pnpm --filter @paperclipai/db exec tsx ../../../../sps-server/desktop/scripts/smoke-native-workspace-channel.mjs --isolated-native-workspace-channel --with-native-execution-control
```

After local package verification finished, the single phase-instrumented retry
session40652 exited0 on Source6cb80cc/Core df7436dc/SDK607b48a. It reached the
actual Member window and verified the stopped DTO, no controls, real Inbox state
operations, device revocation, denied direct status and discovery/shell/status
requests, refreshed UI clearing prior status, and natural Main/Core/database
cleanup. The final success line was emitted only after all cleanup completed.
Log: native-member-execution-status-joined-phase-2026-10-28.log. Earlier failed
session91369 remains a failed attempt. The retry did not increase its deadlines.
No claim is made that disk workload caused the earlier timeout.

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
It predates this Member fix. Its local materialization/verifier session95617
exited0: actual package/hash materialization, bundled Node/helper/gate, real file
Worker acknowledgement, IPC/stop4/empty Job and actual child close, and runtime
closure passed. Baseline Source58aaaa55/CoreDF/SDK607 dirty flags were all false.
The first materialization was slow on this machine; no hash/path/size checks were
bypassed. That artifact result does not qualify the newer Member fix package.

No full local suite or manual CI rerun. Native remains off by default, Tailscale
supported, Desktop0.4.137 a development candidate. Filesystem/Vault/network
isolation, physical LAN/SMB, trust-loss recovery, real providers/Identity, signed
installation/update/restore and exact-tuple release gates remain. Zod High and
its existing major hold are unchanged. No Marketplace policy or Builder redesign,
installed app, OS trust/firewall, customer data, merge, release or npm publication.

OpenAI Codex coordinator and GPT-6 Luna high implementation/review, as requested.
