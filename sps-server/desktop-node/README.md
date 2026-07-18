# SPS Desktop Node Core

This package is the local, non-UI core that SPS Desktop will run from its Electron main process and its restricted execution worker.

It provides:

- Ed25519 device identity generation and signed heartbeat payloads.
- Public capability discovery for Claude Code, Codex CLI, Agy CLI, Gemini CLI,
  OpenCode CLI, Pi CLI, Ollama, and LM Studio.
- Hub registration, owner-authenticated heartbeats, and signed command requests.
- Approved CLI and local-model commands with argument-array process spawning.
- Node-owner project folder mappings: a command for a Project cannot fall back
  to the default folder or to another Project's repository.

It deliberately does not provide:

- A private-key file format or any Hub upload of private keys.
- CLI login-token extraction, API-key export, or project-file upload.
- Shell execution, Hub-supplied working directories, or a fallback from one
  Project folder to another.
- A replacement for the upcoming Electron secure-storage and account/device-auth flow.

Electron will supply OS-backed secure storage, the invitation/login UI, and a constrained IPC boundary. The Node core stays dependency-free so its cryptographic protocol can be tested independently.
