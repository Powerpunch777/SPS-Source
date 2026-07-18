# Image Worker Asset Tool

This is a local, provider-selectable tool for SPS's Image Worker. It is
not a SPS Core modification and it never stores provider API keys in a
specification, manifest, Room, or repository.

## Provider Selection

| Provider | Use it for | Required environment key |
| --- | --- | --- |
| `pixel_lab` | Style-consistent pixel-art sprites, 4/8-direction characters, animations, UI, and tilesets | `PIXELLAB_API_KEY` |
| `meshy` | Optional 3D assets when a Task explicitly requires a GLB/FBX/OBJ workflow | `MESHY_API_KEY` |

PixelLab is the default for the current 2D pixel game. Meshy is not a
replacement for sprite production; it is available for a later 3D workflow.

## PixelLab Operations

| Operation | Production use |
| --- | --- |
| `generate_image_v2` | Initial concept candidates or isolated props |
| `generate_with_style_v2` | Production sprites that must match 1-4 approved style references |
| `create_character_v3` | Persistent high-quality character with eight rotations |
| `animate_character` | Multi-direction animation for a previously approved `characterId` |
| `create_character_4_directions` / `create_character_8_directions` | Lower-cost template character alternatives |
| `create_tileset` | Seamless terrain transition tiles |
| `generate_ui_v2` / `create_ui_asset` | Pixel UI icons, controls, and scalable panel candidates |

Use `create_character_v3` followed by `animate_character` for hero, named NPC,
and boss production. Use `generate_with_style_v2` after an art-direction anchor
has been approved. A prompt-only image is an exploration candidate, not a style
contract.

Animation frame counts must be even values from 4 through 16. When directions
are omitted, the tool deliberately generates only `south` as a cost-safe motion
test. List every required direction explicitly only after that test passes
visual review.

## Use From Image Worker

```powershell
node $env:IMAGE_WORKER_ASSET_TOOL providers
node $env:IMAGE_WORKER_ASSET_TOOL balance --provider pixel_lab
node $env:IMAGE_WORKER_ASSET_TOOL validate --spec Art/Requests/forest-ranger.asset.json
node $env:IMAGE_WORKER_ASSET_TOOL preflight --spec Art/Requests/forest-ranger.asset.json
node $env:IMAGE_WORKER_ASSET_TOOL run --spec Art/Requests/forest-ranger.asset.json
node $env:IMAGE_WORKER_ASSET_TOOL start --spec Art/Requests/forest-ranger.asset.json
node $env:IMAGE_WORKER_ASSET_TOOL latest --spec Art/Requests/forest-ranger.asset.json
node $env:IMAGE_WORKER_ASSET_TOOL status --run-id <run-id>
node $env:IMAGE_WORKER_ASSET_TOOL wait --run-id <run-id> --timeout-ms 300000
```

Run the command from the selected Project Workspace. `asset.outputDir` and any
local reference image must remain inside that workspace. Generated files land
in `<outputDir>/<asset.name>/` with an `asset-manifest.json` recording the
provider, request, seed, job ID, and generated paths. API keys are excluded.

For PixelLab Pro image operations, `validate` reports the documented estimated
usage and `preflight` compares it with the live subscription balance. The
estimate follows PixelLab's output-grid tiers: 20, 25, or 40 subscription
generations. A 640x360 one-frame request is in the 40-generation tier. Both
`run` and `start` perform the same preflight automatically, before any provider
generation request is submitted.

USD credits are disabled by default. When subscription generations are
insufficient, the tool stops with `preflight_blocked`, records the balance and
estimate in durable state, and leaves `submission` empty. Only a Task Owner may
explicitly approve USD credit use by setting `PIXELLAB_ALLOW_USD_CREDITS=true`
in the Worker environment before a new run. Never set this flag speculatively.

Use `start` for character creation and other requests that may run longer than
an agent shell turn. It launches a hidden detached process and returns a run ID
immediately. Durable state and logs live under
`~/.sps/image-worker-runs/`; provider credentials are never written
there. As soon as the provider accepts the request, the state changes to
`submitted` and records the job IDs and persistent resource IDs before polling
continues. A timeout or reboot can therefore recover the accepted request
without submitting and paying for it again.

`start` is idempotent for the same workspace and unchanged specification. If a
queued, submitted, completed, or paid-but-failed durable run already exists, it
returns that run instead of creating another paid provider request. If the
shell loses the original JSON receipt, use `latest --spec ...`, then `wait`
with the recovered run ID. Never repeat a paid request merely because stdout
was empty.

A failed run without a provider submission receipt is also parked by default.
`start` returns the existing failure with
`matching_spec_failed_requires_explicit_retry` instead of silently retrying it.
Only after the Task Owner approves a new provider attempt may the Worker use
`--retry-failed true`.

If PixelLab completed a character but the original caller lost the synchronous
response, recover the existing result without another paid generation:

```powershell
node $env:IMAGE_WORKER_ASSET_TOOL recover-character `
  --spec Art/Requests/forest-ranger.asset.json `
  --character-id <existing-character-id>
```

## Review Gate

Generated output is a candidate, not a final asset. The Image Worker must
inspect the PNG/GLB, report paths and validation, and leave the Task in
`in_review`. Promote only reviewed assets into the final Unity asset folders.

The manifest records all background job IDs and persistent PixelLab resource
IDs. Character animation also downloads the authenticated character ZIP so the
Unity import step receives rotations, frames, and metadata together.

PixelLab v3 stores the input direction reference as frame index `0` alongside
the generated animation. Therefore `frameCount: 6` produces seven stored PNGs
per direction: reference frame `0` plus playable frames `1` through `6`. The
manifest records this under `delivery.animation`; the reference frame is not an
extra playable frame and must not trigger another generation.
