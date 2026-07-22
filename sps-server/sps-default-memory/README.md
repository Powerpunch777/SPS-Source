# SPS Default Memory

This is the bundled, first-party memory provider for SPS Desktop Owner Host.

It intentionally has one job: expose scoped recall and candidate-recording tools.
Task creation, work allocation, game-engine rules, and UI workflows do not belong
here. The Owner Host owns startup, storage location, local authentication, backup,
and provider selection.

The provider also receives the Core's declared memory lifecycle checkpoints. Each
checkpoint creates one idempotent, reviewable candidate in the local sidecar; it
never rewrites approved memory or project files by itself.
