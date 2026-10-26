# Native Workspace window integration

Core Settings now offers a separate **Open Workspace** action after discovering
the current Member's Workspaces on a saved Native Host. Main obtains the real
selected Workspace bootstrap through the existing saved-credential TLS client;
it retains the Host/Workspace selection in its window record. The renderer
cannot supply a target URL, certificate, session cookie or different Workspace.

Each window uses a random, nonpersistent Electron session and a dedicated
127.0.0.1 asset origin. Main sets the random launch cookie as HttpOnly/SameSite
Strict before loading the existing bundled Core SPA. The asset server snapshots
the Main-selected UI directory and admits only the index, declared asset MIME
types and fixed icons/manifest. It checks canonical file/directory identities
with BigInt metadata before and after descriptor reads. API routes, ServiceWorker,
traversal, redirects and arbitrary SPA paths are not served. CSP blocks network
connections, workers, frames and remote scripts; trusted index inline scripts
use hashes. Four active requests and a bounded queue serve browser asset bursts.

The same Core UI build has a Native capability mode selected by the dedicated
preload. It avoids the ordinary Board company bootstrap, plugin initialization,
ServiceWorker and live-update providers. Actual shell/dashboard/inbox reads use
only fixed preload operations. Neutral shell reuses the existing empty Workspace
component. Selected Plugin shells show their current unsupported state. Dashboard
declaration labels are explicitly identified as configured widgets whose Plugin
views are unavailable; Inbox displays text without executing actions or following
navigation targets. This is an incomplete mode of the same platform, not complete
Plugin or live-event integration.

Main authorizes the exact WebContents/main frame/root URL on every IPC and again
after awaiting a result. A bounded queue serializes the shared Member transport;
identical reads and overlapping bootstrap requests coalesce. Every accepted
response is bounded, cloned and frozen; Inbox rows must match the selected
Workspace. Arbitrary JSON metadata keys remain inert own data properties.
Window close or account/generation changes abort its requests, destroy its
window, dispose its asset server and clear its isolated session storage/cache.
Cleanup shares promises and reports deadline failures. Popups, off-origin
navigation, webviews, permissions and downloads are denied.

## Evidence

- Saved Member surface client/parser/controller: 75 focused tests passed,
  including real TLS cancellation and a subsequent operation after cancellation.
- Window lifecycle/preload/queue suite: 8 focused tests passed. Settings/window
  integration passed 57 tests before the queue refinement; the final renderer
  follow-up passed separately. Main/quit/preload/renderer contracts passed 56.
- Asset HTTP suite: 9 passed, including real HTTP launch checks, replacement and
  symlink rejection, fixed CSP, disposal, and eight parallel requests. The real
  built UI index and eight parallel assets also returned 200.
- Native Core UI: 7 focused tests passed with one worker. Scoped UI build passed.
  The initial default-worker test attempt timed out before collecting tests;
  no passing result is attributed to it. The repository token gate remains
  failed on 79 color, 36 bracket-value and one font-size violation in unrelated
  files; no new Native file was listed. No full suite or full Core build ran.
- Isolated actual Electron smoke exited 0 using the built Core SPA, actual
  launch cookie, preload, IPC, CSP and window controller. Workspace, Dashboard
  and Inbox rendered; ordinary Host/settings bridges were absent, no
  ServiceWorker registered, browser `/api` fetch was blocked, and generation
  invalidation destroyed the window. Main/stdio closed naturally and the owned
  temporary profile was removed. Its backend is public fixture data, not real
  Host authorization. Earlier fixture runs failed because of Electron entry
  initialization order and remain failed; the corrected run supplies evidence.

## Remaining work and rollback

The existing separate real TLS/Core/DB smoke proves transport and authorization;
the Electron fixture proves this UI/window composition. Neither proves their
single installed end-to-end path, real DPAPI or physical two-PC LAN. Plugin
assets and operations, live events with revocation, renewal, Source/Node transport,
real providers and signed installation/update/restore remain required. Current
security/release gates, Marketplace policy, Builder structure and public SDK
are unchanged. Native is still opt-in and Tailscale remains the supported release
transport.

Rollback removes the new open action and Native window composition, preserving
saved Host registrations, protected credentials and Workspace data. The ordinary
Workspace startup remains available through its existing transport.
