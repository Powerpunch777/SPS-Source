# SPS Agent Runtime Packs

> Historical measurement note: the archive sizes and example release metadata
> below were recorded for the `0.4.84` packaging audit. The current candidate
> version and supported Profile combination are defined by
> `../../release/support-matrix.json`; regenerate these measurements when a new
> runtime-pack release is published.

## Purpose

SPS Desktop ships one common Windows application. Its Owner Host contains the
workflow-neutral Core, the bundled Node runtime, plugins, and local Workspace
service. It does not need to include every vendor's Agent runtime.

An **Agent Runtime Pack** is an optional, versioned bundle containing one
provider-specific command and the files it needs. It is selected by the Host;
SPS never downloads or installs a provider runtime because an Agent, plugin,
or conversation suggested it.

This keeps a Member installation and a Host that only uses local CLIs from
paying the cost of unrelated providers.

## Current Packs

| Pack | Command exposed to Core | 0.4.84 archive size | Use case |
| --- | --- | ---: | --- |
| `codex-acp` | `codex-acp` | about 150 MB | Codex ACP execution lane |
| `claude-acp` | `claude-agent-acp` | about 79 MB | Claude ACP execution lane |

The base `0.4.84` installer is about 214.6 MB. The prior self-contained
`0.4.81` installer was about 360 MB because Codex and Claude runtime assets
were included for every installation.

Existing provider CLIs already available on the Host PATH remain usable. A
runtime pack is an offline, reproducible alternative; it does not contain an
account login, API key, or provider subscription.

## Host Installation Flow

1. Install SPS Desktop normally.
2. Download the desired `SPS-Agent-Runtime-Pack-*.zip` asset from the matching
   SPS Desktop release and compare its SHA-256 with
   `sps-agent-runtime-packs.json` or `sps-release-manifest.json`.
3. Extract the ZIP to a local folder.
4. In the local Owner Host setup, choose **Install runtime pack from folder**
   and select the extracted folder containing `sps-agent-runtime-pack.json`.
5. Restart the Owner Host before an Agent uses the newly installed provider.

The Desktop copies the selected pack into its own data directory. Moving or
deleting the downloaded folder afterwards does not change the installed copy.

## Core Contract

Core uses the product-neutral environment variable
`PAPERCLIP_AGENT_RUNTIME_PACKS_DIR`. A pack has a small manifest:

```json
{
  "format": 1,
  "id": "codex-acp",
  "label": "Codex ACP",
  "version": "0.4.84",
  "commands": {
    "codex-acp": "bin/codex-acp.cmd"
  }
}
```

Core accepts only command paths contained within that pack. The shared resolver
chooses a requested pack command before falling back to a Host PATH command.
The contract defines how a command is found, not which provider an Agent may
use, how a workflow delegates work, or which approval policy a plugin applies.

## Security and Update Rules

- Only the local Host can add a pack to its app-managed cache.
- Pack manifests are validated before and after copying; traversal paths and
  incomplete command files are rejected.
- A release manifest records each archived pack's version, command list, size,
  and SHA-256.
- Desktop and pack versions are independent but explicit. A future pack can be
  published without making every SPS user download it.
- Provider credentials remain in the provider's own login flow or in the
  appropriate SPS secret boundary. They are never embedded in a pack archive.

## Deliberate Scope

`Cursor Cloud` still uses its small direct SDK bridge in the base runtime. It
does not include a locally executed ACP binary and is not yet represented as a
command pack. If its runtime footprint or provider contract grows, it should
use the same explicit-pack model rather than become a hidden default payload.
