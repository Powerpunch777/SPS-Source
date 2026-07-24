# SPS Official Registry

This directory is the public, static release channel for SPS plugins. After the
first signed release, the Desktop source URL is:

```text
https://redongames.com/registry/registry.json
```

`registry.json` is a signed index. Each `releases/<plugin>-<version>.json` and
`packages/<plugin>-<version>.spsplugin` file is immutable. The directory never
contains Registry or Publisher private keys.

The initial release is published only by the manual `Publish SPS Official
Registry` GitHub Action after its two signing-key Secrets are configured.
