# Image Worker Asset Tool

Updated: 2026-07-15

## Purpose

`Image Worker` can select a visual-generation provider for an explicitly
assigned asset Task without changing SPS Core or exposing provider keys
in Rooms, Tasks, repositories, or `AGENTS.md`.

The tool lives at:

```text
C:\Users\young\.sps\tools\image-worker-asset-tool\asset-worker-tool.mjs
```

The SPS Image Worker receives this path through its
`IMAGE_WORKER_ASSET_TOOL` environment value. The `PAPERCLIP_*` prefix is
reserved by the SPS runtime and must not be used for custom tools.

## Provider Choice

| Provider | Select when | Output |
| --- | --- | --- |
| `pixel_lab` | Style-consistent pixel-art sprites, 4/8-direction characters, animations, UI, icons, or tiles are required. This is the default for the current 2D pixel game. | PNG files and character ZIP metadata |
| `meshy` | A Task explicitly requires a 3D asset. Do not select it for 2D sprite work. | GLB, FBX, OBJ, preview PNG when returned |

## Worker Flow

1. Designer supplies an approved visual reference and the Task defines its
   asset scope, target engine, dimensions, and acceptance criteria.
2. Image Worker creates a versioned JSON asset specification in the selected
   Project Workspace.
3. Image Worker runs `providers`, then validates and runs that specification.
4. Output is written under `<asset.outputDir>/<asset.name>/` together with an
   `asset-manifest.json`; provider keys are excluded.
5. Image Worker checks the generated output and reports it for user review.
   It does not silently promote generated candidates into final Unity paths.

For production character work, use `create_character_v3` once, retain the
returned `characterId`, and run `animate_character` for each approved motion.
For props and UI, approve one style anchor first and use
`generate_with_style_v2` with that reference. Prompt-only generation is for
exploration, not for an entire asset set.

```powershell
node $env:IMAGE_WORKER_ASSET_TOOL providers
node $env:IMAGE_WORKER_ASSET_TOOL balance --provider pixel_lab
node $env:IMAGE_WORKER_ASSET_TOOL validate --spec Art/Requests/hero.asset.json
node $env:IMAGE_WORKER_ASSET_TOOL start --spec Art/Requests/hero.asset.json
node $env:IMAGE_WORKER_ASSET_TOOL status --run-id <run-id>
node $env:IMAGE_WORKER_ASSET_TOOL wait --run-id <run-id> --timeout-ms 300000
node $env:IMAGE_WORKER_ASSET_TOOL recover-character --spec Art/Requests/hero.asset.json --character-id <existing-character-id>
```

Examples are in `image-worker-asset-tool/examples/`.

## Secret Setup

The implementation intentionally has no provider token yet. Create the token as
a SPS encrypted Secret and bind only the needed Secret to the Image
Worker environment:

```text
PIXELLAB_API_KEY=<PixelLab API token>
MESHY_API_KEY=<Meshy API token>
```

Keep them as `secret_ref` Agent environment values, never as plain values in an
asset specification, Room, Task, instruction, or project repository.

After creating a PixelLab token, use the secure connector below. It reads the
token through hidden input, creates or rotates the encrypted Secret, preserves
the Image Worker's existing model/account/instructions configuration, and adds
only the `PIXELLAB_API_KEY` secret reference.

```powershell
.\scripts\Connect-SPSPixelLab.ps1
.\scripts\Test-SPSPixelLabConnection.ps1
```

Some `PixelLab` endpoints return background job IDs, while character creation
may keep a synchronous request open longer than an agent shell turn. The
`start` command therefore runs generation in a detached process and persists
its state under `~/.sps/image-worker-runs/`. Immediately after provider
acceptance, the state is written as `submitted` with job IDs and persistent
resource IDs, before polling begins. `recover-character` fetches an
already-created character by ID without paying for a duplicate generation.
The tool records all returned job IDs plus persistent character, tileset, and
UI resource IDs. `Meshy` image-to-3D likewise submits a task, waits for it, and
downloads returned model formats.

## MCP versus API

PixelLab's official remote MCP is useful for ad-hoc generation in an MCP client,
but the Workplane production lane uses the API wrapper. The wrapper gives every
provider-independent Image Worker the same versioned JSON contract, keeps
output paths inside the selected repository, records seeds and provider IDs,
supports deterministic retries, and avoids depending on Codex dynamic-tool
capabilities. MCP may be enabled separately for manual exploration, but it is
not the authoritative asset-production path.

## Update Boundary

This is an external companion tool linked from the Agent environment. It does
not modify SPS Core or the installed Antigravity adapter, so both can be
updated independently.
