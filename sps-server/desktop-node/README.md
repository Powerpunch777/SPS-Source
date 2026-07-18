# SPS Desktop Node Core

This package is the local, non-UI core that SPS Desktop will run from its Electron main process and its restricted execution worker.

It currently provides:

- Ed25519 device identity generation and signed heartbeat payloads.
- Public capability discovery for Codex CLI, Agy CLI, Ollama, and LM Studio.
- Hub registration and heartbeat requests.

It deliberately does not provide:

- A private-key file format or any Hub upload of private keys.
- CLI login-token extraction, API-key export, project-file upload, or shell execution.
- A replacement for the upcoming Electron secure-storage and account/device-auth flow.

Electron will supply OS-backed secure storage, the invitation/login UI, and a constrained IPC boundary. The Node core stays dependency-free so its cryptographic protocol can be tested independently.
