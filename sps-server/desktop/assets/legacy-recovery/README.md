# Pinned Historical Program Inventory

`program-inventory-0.4.86.json.gz` contains relative program filenames, sizes
and SHA-256 values, not executable bytes or a user backup. It is for the
user-approved, explicitly confirmed old-program residue recovery only. It
does not approve the withdrawn old package for execution or Stable upgrade.

Origin: Source `be40e0cf3290c8e5b9462d8b12e43c45f3af3910`, guarded clean
GitHub-hosted Windows prepare job `124428171626`, workflow `41164222114`,
attempt1. The owner observed natural Job closure after old install exit0 and
the bounded inventory capture. Private Actions artifact ID `13029076121`,
archive digest `4e879bfe41f1bce9c7227ccfa9b7ef7bd592b1583ced5bcd5eb79268ecf161ce`.
The artifact was downloaded and independently canonicalized against the
snapshot content hash and exact pinned installer digest before import.

- Original installer SHA-256:
  `d65da55e0e326e65ed0b9b5c21a015b1d8cc2c79bfea589626a50288b00e0c56`.
- Raw inventory:5909697bytes, SHA-256
  `dc41392de7ff7390a396a898f352cbc6883072d5a8b5203c780294720a872322`.
- Gzip:1313545bytes, SHA-256
  `35834b4d078b72938ea9b2149933cd05356c6398c2ae8b873b927a781a52dfd7`.
- Complete content-tree SHA-256:
  `659b8fa1d418bfa3b8b1756506121e80ff699d56b4ce9fbf988721121d6d75d3`.
-29314files,3051directories;29237files under the old expanded runtime.

No account, computer name, IP, absolute path, root OS file identity, checkpoint
or AppData is included. All paths are relative package members. Runtime loading
requires the exact compressed and decompressed hashes, bounds and canonical
content structure; arbitrary replacement catalogs or live-user snapshots are
not accepted. The build-time importer requires this exact raw inventory and
refuses overwrite. The old installer itself was unsigned/withdrawn and had
dirty build provenance; this inventory does not remedy those limitations.

The native removal library separately verifies real object handles, unchanged
file bytes, no reparse points, hardlinks, named streams or unexpected entries.
Caller authorization, actual old-install/process/registry binding, backup and
target confirmation, signing and complete recovery acceptance remain separate.
At this checkpoint no installer UI or production cleanup executable is wired.
