# Main Artifact Context And Config Inputs

2026-11-02 KST. Private known-input observation only. Cleanup eligibility,
Host confirmation, removal and Settings remain incomplete.

## Implemented Increment

- Main captures the existing signed-in Host/profile read scope, account device
  and issuer, connection/restore generation, exact owned Host, optional Preview
  and Memory managers, profile/Vault paths and Preview identity/auxiliary paths.
  It rejects account/context change, unowned/nonrunning Host, active or uncertain
  restore and replacement managers. It joins Identity token validation and
  rechecks the captured context before taking the shared observation scopes.
- The private Main call site composes Desktop admission with the existing held
  Host/Preview scopes. It exposes no renderer IPC or arbitrary-path/delete API.
  Its explicit coverage is `desktop-known-inputs-and-owned-cores` and
  `cleanupReady:false`; it must not be used as a deletion approval.
- The input reader joins Developer and local Registry indexes, immutable live
  runtime inputs, named config paths and Preview fixture/access-token files.
  It does not add the whole Owner Vault as a blanket protected directory.
- Core configs contribute DB, logs, storage, encryption-key and optional backup
  paths. Memory configs contribute data and journal paths, resolving relative
  Memory paths exactly from the config directory. A configured but stopped
  Memory manager still retains its config/data/journals rather than appearing
  empty. Missing or unsupported config inputs deny the observation.
- Config reads are bounded128KiB, strict UTF-8 and canonical JSON. One BOM, CRLF
  and optional final newline are accepted; duplicate keys, malformed text,
  links/hardlinks and changed file/ancestor identities are rejected. File bytes,
  identity and metadata are rechecked without writing/importing a package.
  No token, URL, password or config body is included in reference DTOs.
- Runtime snapshot changes or non-synchronous/nonempty authority receipts deny
  input reads. Accidentally returned native Promise rejections are drained,
  never accepted as authorization or allowed to become unhandled rejections.

References consulted, not copied code:
- [Node filesystem and Stats contracts](https://nodejs.org/api/fs.html#fsstats)
- [Node native realpath](https://nodejs.org/api/fs.html#fsrealpathnativepath-options-callback)
- Existing SPS Developer/Registry snapshot readers and private Core observation
  scopes. There is no new dependency, SDK, public API or DB schema.

## Windows Path Regression

The previous Source972 Windows CI `41317934173`, job `124881843073`, failed the
new development Node symlink test: legacy sync realpath retained the runner's
8.3 alias while native/promisified realpath returned its long name. The hosted
suite reported2081/2085 passed,1 failed,3 unavailable-alias skips; the downstream
legacy installer job lacked an installer input. This was an executed failure,
not a billing/queue failure and not a whole CI pass.

The development helper now uses `realpathSync.native`. The symlink test still
requires equality to the independent native/promisified filesystem result; its
expectation was not relaxed to case-insensitive or basename-only comparison.
The fixed hosted regression has not yet been proved on a new candidate.

## Verification And Limits

Node24.22.1 focused selection passed77/77,0 skips:

```powershell
node --test test/desktop-artifact-context.test.mjs test/desktop-artifact-inputs.test.mjs test/runtime-config-artifact-references.test.mjs test/development-node-command.test.mjs test/plugin-artifact-observation.test.mjs
```

The Main context tests execute the actual extracted Main functions in a VM with
synthetic Identity/Host state. Input/config tests use actual temporary files and
synthetic launch snapshots. These are not an actual signed-in UI interaction.

The updated Windows owned-Core test passed1/1 (28.2s), using the combined reader
against two real local Core processes and their live configs. It asserted the
DB and Preview auxiliary references, held both private scopes, invalidated on
stop and required natural Job closure plus exact temporary-data removal.
It has no real Memory process, Google OAuth, Electron Main context or second PC.

Final Node24.22.1 `npm run test:ci` exited0: serialized4/4, remaining2133/2136
with three unavailable Windows8.3-alias skips; aggregate2140 total,2137 passed,
3 skipped,0 failed. This includes the real two-owned-Core scope test against the
final input-reader code, as well as the Core config and Memory-idle protection
tests. The ignored local log is
`desktop/dist/artifact-main-context-final-node24-20261102.log`.
No new screenshot, installed app or physical acceptance is claimed for this
increment. Source633 CI `41318059600` independently reproduced
the same pre-fix short-alias failure; it is not counted as a pass.

### Source App Recheck

After committing Source `2ee7a348e205f3323903ababfe292b7cc429ddf6`, the separate
Builder acceptance ran with Core `f8ef641e`, SDK `61a929f6`, Builder docs4cef and
unchanged runtime0a935, under Node24.22.1. It exited0: actual source Electron/Core
installation/activation, Builder bridge, A/B isolation, explicit text save,
Agent binding/config preservation, restart and independent Settings recovery.
The UI index hash remained `c099f8b77d49656c5117bd5395fd0f44c2752f2759bee30a47a77d9a6bba4ba0`.
Four Main exits were orderly, eight output streams ended without failure and
the exact isolated temporary root was removed. The local ignored Builder log
is `artifacts/core-host-main-context-20261102.log`.

This uses mock Identity and proves startup/regression, not live Google OAuth or
invocation of the new unmounted private Main observation/cleanup workflow.
There is no actual AI, Main-launched Preview, whole-descendant/physical or signed
installer qualification, and no new screenshot was generated. Source2ee hosted
runs `41320030775`/`41320034930` were submitted but not complete at this record.

Remaining work includes the full Source/Runner and other live-process reference
audit, complete ownership/inventory eligibility under the same fence, fresh
account/Host/inventory-bound confirmation and selective removal, and actual
Settings interaction. The known-input scope deliberately cannot certify that
work. Original Core/Builder, abnormal-loss/SQL-crash, installer/recovery and
exact-candidate Windows/Linux/two-PC requirements remain unchanged. User apps,
profiles, Vaults, external projects, original checkout and Production were not
changed.
