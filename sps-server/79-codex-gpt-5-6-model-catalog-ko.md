# Codex GPT-5.6 Model Catalog

## Purpose

SPS Core's bundled `codex_local` adapter may ship with a model picker
that lags behind the installed Codex CLI. This workplane keeps the Core
untouched and supplies the picker through SPS's supported
`PAPERCLIP_ADAPTER_MODELS` operator environment variable.

## Source Of Truth

- Catalog: `config/paperclip-adapter-models.json`
- Synchronizer: `scripts/Sync-SPSAdapterModelCatalog.ps1`
- Local SPS launcher: `scripts/Start-SPSLocalServer.ps1`

The catalog currently contains GPT-5.6 Sol, Terra, and Luna as well as the
existing legacy Codex choices. It only changes what can be selected in Agent
settings. Existing agents keep their configured model until a user changes it.

## Runtime Behavior

1. The synchronizer validates the JSON and writes it to the current process
   and the Windows user environment as `PAPERCLIP_ADAPTER_MODELS`.
2. SPS reads that variable when serving the agent-model endpoint.
3. The pre-existing `SPSLocalServer` scheduled task inherits the user
   environment after the next logon or reboot, so it also receives the catalog
   without modifying the task or SPS Core.
4. `Start-SPS.ps1` starts SPS through the same launcher
   when it needs to start a stopped local server.

## Updating Later

1. Update `config/paperclip-adapter-models.json` with confirmed Codex model
   IDs.
2. Run `scripts/Sync-SPSAdapterModelCatalog.ps1`.
3. Restart SPS, then refresh the browser.

The Codex CLI must support a chosen model. GPT-5.6 requires Codex CLI 0.144.0
or newer; this machine is on 0.144.1. Availability still follows the signed-in
ChatGPT account and OpenAI's rollout status.
