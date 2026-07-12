# Named Pipe Direct Task Activation

## Status

Activated for the `강해린` Project Hub with no plugin secret, no bridge token,
and no Paperclip core change.

## Active Configuration

- Plugin config: `enableDirectTaskLaunch: true`,
  `directTaskTransport: windows-named-pipe`, and
  `directPipeName: PaperclipDirectTaskBroker`.
- Broker config: one explicit Company/Project/Goal/workspace/`.uproject`
  mapping for `강해린` only.
- Broker: running as a local PowerShell process with its child Bridge listening
  strictly on `127.0.0.1:3105`.
- No token, secret reference, bridge URL, or secret value is stored in the
  Paperclip plugin configuration.

## Verification

- Paperclip health is `ok`; Memory Sidecar is healthy.
- The plugin config returns only the three non-secret fields above.
- Named pipe health returns `ok: true` and Bridge `ready`.
- Company live runs remain zero.
- Live Project Hub UI presents Controlled Local Execution and filters the Code
  role to `CMP-74 [Agent Room] Code Worker`.

## Operating Boundary

The system is ready but does not create work automatically. A user selects an
Agent Room and explicitly launches a valid Task Room. That child issue is then
validated again by the local broker before external `agy.exe` is started.
