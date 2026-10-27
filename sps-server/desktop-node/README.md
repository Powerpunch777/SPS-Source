# SPS Desktop Node Runtime

This package is the local, non-UI core that SPS Desktop will run from its Electron main process and its restricted execution worker.

It provides:

- Ed25519 device identity generation and signed heartbeat payloads.
- Public capability discovery for Claude Code, Codex CLI, Agy CLI, Gemini CLI,
  OpenCode CLI, Pi CLI, Ollama, and LM Studio.
- Published Ollama and LM Studio model identifiers, capped and filtered so
  local filesystem paths never leave the computer.
- Host registration, signed heartbeats, and signed command requests.
- Approved CLI and local-model commands with argument-array process spawning.
- Host-issued workspace access: a command cannot fall back to an unrelated
  local folder or another Project workspace.
- Computer-owner Node disconnection, which revokes that computer's active
  execution connection and requires a fresh registration before reconnecting.

It deliberately does not provide:

- A private-key file format or any Hub upload of private keys.
- CLI login-token extraction, API-key export, or project-file upload.
- Shell execution, Hub-supplied working directories, or a fallback from one
  Project folder to another.
- A replacement for SPS Desktop's Electron secure-storage and account/device-auth flow.

SPS Desktop supplies OS-backed secure storage, the invitation/login UI, and a constrained IPC boundary. Its connection check is read-only: it sends no login token, Node key, or local capability data. The Node core stays dependency-free so its cryptographic protocol can be tested independently.

Owned command cancellation waits for process termination before releasing a
Source or reporting completion. Windows taskkill has a bounded helper deadline;
failure remains recorded even if fallback stops the direct child. A terminal
Windows PID is never killed again to retry an unconfirmed tree termination.
See [termination evidence and limits](../docs/reviews/NATIVE-TERMINATION-AND-DIAGNOSTICS-2026-10-27.md).
