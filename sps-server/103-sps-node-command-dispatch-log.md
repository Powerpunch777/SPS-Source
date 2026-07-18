# SPS Node Command Dispatch

## Implemented path

SPS Desktop Node now executes an Agent command on the approved member computer.

1. The Hub resolves the Agent's primary SPS Node binding during a heartbeat.
2. The Hub validates that the Node is active, recently online, granted to the Agent, and advertises the requested runtime.
3. The Hub inserts a command into `sps_node_commands`; provider credentials are never stored in that command.
4. SPS Desktop polls the Hub with a signed request, claims the next command, and resolves the Hub project ID only through its locally configured workspace mapping.
5. The Node runs the CLI with its own local login state, streams stdout/stderr as ordered events, and reports the terminal result.
6. The regular SPS adapter parses that result and continues the normal Task/Room reporting flow.

## Security boundary

- Every Node request is signed with its locally stored Ed25519 key, timestamped, and protected from nonce replay.
- The Node re-checks the active Agent grant and primary binding when it claims a command. A revoked or reassigned queued command is failed instead of executed.
- Only narrow `PAPERCLIP_*` runtime context crosses the Hub/Node boundary. Provider credentials such as `CODEX_HOME`, `OPENAI_API_KEY`, and Google/Anthropic keys stay on the Node computer.
- The Hub sends a project ID, not an arbitrary local path. SPS Desktop maps that ID to a folder selected on the member computer and refuses missing or invalid folders.
- On Windows, a timed-out command terminates its process tree before SPS reports completion.

## Current runtime support

- Implemented end to end: `codex_local` through the Codex CLI already signed in on the Node computer.
- Implemented through the same signed Node dispatch queue: `sps_agy_local` through Agy CLI, `sps_ollama_local` through Ollama CLI, and `sps_lm_studio_local` through LM Studio CLI. Their account state and local model files stay on the Node computer.
- `opencode_local` can also use Ollama or LM Studio providers configured on that Node's OpenCode installation.

Capability detection alone never grants execution authority. Every runtime still needs an approved Node, an Agent grant, and that Agent's primary Node binding. The Node settings picker and Hub API both validate the Agent adapter against the Node's advertised runtime before a grant or primary binding is saved. This prevents an incompatible computer from being configured and only failing when a Task starts.

## Verification on 2026-07-18

The live SPS server was exercised with a temporary company that was deleted after the run:

`register Node -> signed heartbeat -> owner approval -> Agent grant -> primary binding -> signed claim -> local process -> streamed output -> completion`

Result: command status `succeeded`, exit code `0`, one streamed stdout event.

A second disposable run queued a command and then revoked the Node-Agent grant before the Node claimed it. The Node received no command and the Hub marked it `failed` with the revoked-or-reassigned reason.

A third disposable run confirmed that a Node overrides any Hub-host-local `PAPERCLIP_API_URL` with the Hub URL configured in SPS Desktop. This keeps Room and Task API calls pointed at the shared Hub from a different computer.

On Windows, a fourth run executed the real local `codex --version` command through the Node. SPS resolves the npm `codex.cmd` wrapper to `node.exe` plus the Codex JavaScript entry point, avoiding the `spawn EPERM` failure and any shell command construction. Result: `codex-cli 0.144.1`.

The following checks also passed:

- Desktop Node unit tests: 9 passed.
- SPS Desktop renderer tests: 3 passed.
- Server, adapter utility, Codex adapter, and UI TypeScript checks passed.
- SPS Agy, SPS Ollama, and SPS LM Studio adapter unit tests passed. The Ollama and LM Studio adapters send the task prompt over standard input, so long task instructions do not depend on Windows command-line length.
- Production UI build passed and the live browser rendered `Settings > Nodes`.
- Migration `0151_sps_node_command_dispatch` is present in the live embedded PostgreSQL database.

## Google login activation

The Google-only Hub and Desktop flow is implemented, but production activation requires a Google OAuth Web Client ID and Client Secret on the Hub host. See `102-sps-google-login-setup-ko.md`. Do not put those values in Git or an Agent instruction file.

Before inviting a second computer, run the release preflight from the workspace
root. It checks the public Hub URL, Google-only settings, installer presence,
and trusted Windows signature without printing secret values:

```powershell
.\sps-server\scripts\Test-SPS-MultiNodeRelease.ps1
```

## Desktop workspace shell

`SPS Desktop` is now more than a Node connector. After a user has accepted an
invite and approved the Desktop connection, **Open SPS workspace** loads the
same Hub workplane inside the Electron window.

- The Desktop process keeps the Board token in Windows secure storage. It is
  never exposed to the Hub page's JavaScript.
- Electron adds that token only to `/api` requests for the currently selected
  Hub origin. It is not sent with static assets, links, or requests to another
  origin.
- The existing Hub API resolves the Board token back to the signed-in user, so
  Rooms, Tasks, Projects, and Agent permissions keep their normal server-side
  authorization rules.
- Navigation away from the selected Hub opens in the system browser, preventing
  another site from inheriting the Desktop bridge or authenticated API header.
- The native **SPS Desktop** menu always offers **Connection setup** and local
  sign-out, even while the Hub workplane is visible.
- On Windows, closing the app window hides it to the system tray rather than
  stopping an approved Node. The tray menu has an explicit **Quit SPS Desktop**
  action for stopping Node activity.
- A member can opt in to **Start SPS Desktop when I sign in to Windows**. It
  starts hidden in the tray, so an approved Node reconnects after reboot
  without reopening the main window.
- After Google sign-in and company selection, SPS Desktop now loads only the
  projects that user can access and lets them map each project to its local
  clone. Changing the Hub or company clears earlier project-folder mappings.
- The setup screen refreshes its connection status without overwriting form
  input. It shows the latest signed Hub heartbeat and command-poll time, plus
  a safe connection notice when the Hub cannot be reached.
- npm-installed CLIs on Windows are resolved through `node.exe` and the
  wrapper's verified local JavaScript entry point. This extends the earlier
  Codex `spawn EPERM` fix to compatible Agy, LM Studio, and future npm CLI
  runtimes without invoking a command shell.

The invite deep link is also retained when it launches a fresh Windows app
process. Changing Hub or company clears the prior Node binding, and changing
Hub additionally clears the local Board token and cached company list.

### Validation

- Desktop Node tests: 11 passed.
- SPS Desktop invitation, Hub-origin, project-picker, and update-service tests: 9 passed.
- SPS UI TypeScript check: passed.
- Browser regression check: the existing SPS dashboard rendered with no console
  errors after the Desktop-aware sign-out hook was added.
- Windows installer built successfully:
  `desktop/dist-sps-desktop-hidden-autostart-v1/SPS Desktop Setup 0.1.0.exe`.
- The packaged ASAR was inspected after the build: it contains the Desktop
  project picker, Node connection status, generic npm CLI launcher, and the
  explicit `--sps-start-hidden` Windows-login path, plus the complete
  `@sps/desktop-node` runtime.
- The packaged release configuration contains the public
  `Powerpunch777/SPS` GitHub update channel. The update service leaves both
  automatic download and automatic install disabled, and exposes a separate
  user-approved download and restart path.
- A release-mode build with `forceCodeSigning=true` was intentionally run
  without a certificate and failed before an installer was produced. This
  verifies that missing CI signing secrets cannot silently publish an unsigned
  update.

### Release work still requiring a real deployment

1. Set Google OAuth client credentials on an HTTPS Hub and turn on
   `SPS_AUTH_GOOGLE_ONLY=true`.
2. On a second Windows PC, accept a real invite, register the Node, approve an
   Agent grant, and run a real Codex, Agy, Ollama, or LM Studio Task.
3. Configure the GitHub Actions signing secrets and publish the first signed
   Desktop release. The update channel and user-approved update UI are now in
   place, but the current local installer is **not Authenticode signed**. See
   `104-sps-desktop-release-channel-ko.md`.
