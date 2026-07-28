# Plugin Compatibility and Updates

## Purpose

SPS must update its Core and Desktop without silently breaking installed plugins. A plugin update is always an explicit Owner action. A Desktop or Core update never installs, enables, or executes a new plugin release on its own.

## Three Compatibility Contracts

| Contract | Owner | Rule |
| --- | --- | --- |
| SPS Desktop | SPS Desktop | A signed release declares an explicit Desktop comparator range, for example `>=0.4.0 <0.5.0`. |
| Plugin API | SPS Core | The runtime API is exact. SPS currently supports API `1`. |
| Extension Profile | SPS product contract | The major profile version must match. SPS currently supports profile `1.0`. |

The signed Registry release is the source of truth for Desktop and Profile compatibility. The extracted static package manifest must agree with the signed Plugin API declaration. The dynamic runtime manifest is still checked by Core when a staged plugin is enabled.

## Release and Update Flow

1. A plugin author packages a static manifest and creates a signed Registry release through the SPS Plugin SDK.
2. The signed release must declare `compatibility.sps`, `compatibility.pluginApi`, and `compatibility.extensionProfile`.
3. Before extraction or staging, SPS Desktop checks the signed release against its own version, API, and profile.
4. During safe extraction, SPS compares the package identity, permission digest, capabilities, and Plugin API with the signed release.
5. The Owner explicitly reviews and enables a staged release.
6. Core checks the dynamic manifest API and `minimumHostVersion` before worker activation.

If any check fails, the release is not staged or enabled. The previous installed release and its data remain untouched.

## Desktop Range Grammar

SPS accepts a deliberately small, fail-closed range grammar:

```text
>=0.4.0 <0.5.0
>=0.4.79
=0.4.79
0.4.79
```

Unsupported shorthand such as `^0.4.0` or `~0.4.0` is rejected rather than guessed. This keeps signed release previews understandable and prevents a client from accepting a range it cannot safely interpret.

## Core Update Rules

- A compatible Core bug fix can ship without changing Plugin API or Extension Profile.
- A breaking runtime API change increments Plugin API. Old releases are rejected until authors publish a compatible version.
- A breaking SPS product contract change increments the Extension Profile major version. Desktop blocks releases for another major profile before extraction.
- `minimumHostVersion` protects a plugin that needs a newer Desktop-owned host behavior. SPS Desktop passes its actual release version to the product-neutral Core through `PAPERCLIP_HOST_VERSION`.
- Core updates do not run third-party migrations automatically. Any plugin-specific migration must be part of a future explicit, reviewed plugin lifecycle action.

## Operator Experience

The Owner sees a clear compatibility failure before a package is staged. Normal users do not need to edit version metadata. Plugin authors use the SDK defaults for the current supported Desktop range and Extension Profile, then intentionally change them when their release requires a newer baseline.

## Regression Coverage

The release baseline, SDK conformance suite, Desktop Registry staging tests, and packaged Owner Host smoke test cover this contract. The packaged smoke test proves that a plugin requiring a newer host version is rejected by the actual bundled Core runtime.
