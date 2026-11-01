# Private Registry Artifact Inputs

2026-11-01 KST. Partial implementation, not cleanup completion.

The private Desktop Registry reader captures the existing `sources.json` index
and configured local Registry directories. It does not acquire or import package
code, fetch remote data, create metadata, or authorize removal. Ordinary source
load/save behavior and the public SDK are unchanged.

The reader requires bounded regular single-link metadata, unlinked directory
parents, strict UTF-8 and the current writer's canonical JSON. A single BOM,
CRLF and optional final newline are accepted. Unknown/duplicate/escaped-duplicate
fields, invalid encodings, oversized input, excess references and unavailable
paths reject. A retained index identity/byte snapshot and local directory
identities are rechecked. Core's existing parent-path capture separately checks
original/canonical path ancestry while its maintenance scope is held.

Local verification used Node24.22.1, without changing the user's installed Node:

```sh
node --test test/plugin-artifact-registry-references.test.mjs test/registry-source-catalog.test.mjs test/plugin-artifact-developer-references.test.mjs test/plugin-artifact-observation.test.mjs
node --test test/owner-host-artifact-channel.windows.test.mjs
```

The first selection passed41/41. The Windows test passed1/1 through the actual
restricted-token wrapper and two actual owned Core processes. It includes the
real Registry index and local directory in the held parent-path snapshot,
checks both Core scope locks, expiration/reuse and interruption, and requires
clean Core exit, natural owned Job closure and identity-checked temporary-data
cleanup. Two local processes are not two physical PCs or actual Settings UI.

After the final diagnostic change, `npm run test:ci` passed on localNode24.22.1:
the serial owned-command stage2/2 and remaining2048total/2045passed/3unavailable
8.3 skips, for2050total/2047passed/3skipped/0failed. Dependency synchronization
ran only after all owned source Host/Preview processes from the Builder trial
had closed. This local result does not turn the hosted PR failure into success.

Source `dc14d076` push run41303522644 has passed all nine Linux test partitions,
full Linux typecheck/build, compatibility, Identity and plugin gates, but its
Windows packaging/acceptance job was still active when this note was written.
The PR run41303527349 instead failed one Windows owned-Core test; its nested
stdout was not included in execFile's default error. Bounded nested TAP output
is now preserved on failure, without weakening the assertion or hiding failure.
Its missing installer-input artifact is downstream of that failed test, not a
successful legacy recovery result. The exact next CI must still complete.

Diagnostic run41303522659 separately reproduced the withdrawn historical
uninstaller's long-path failure, and its ordinary-recovery diagnostic found46
remaining long-path files despite exit0. Its compact-path control passed; that
control is not qualification of the original long-path installation or a
replacement for the mandatory residue-cleanup/data-preservation scenario.

Complete actual Main discovery, authorization and lifetime binding, Source and
restore/runtime references, fresh Host review, current ownership/inventory
eligibility, selected removal and the actual Settings surface remain required.
No installed user package or data was removed by this increment.

References: [Node file system](https://nodejs.org/api/fs.html),
[Electron IPC](https://www.electronjs.org/docs/latest/tutorial/ipc). Existing SPS
strict developer-reader and owned Core composition are reused; this is not a
new public filesystem service.

## Hosted Follow-Up: Windows Alias Regression

Sourcee41c3ee push41305221866 failed the Windows suite. The preserved nested
TAP output identified `Configured local Registry path is not canonical` in the
actual two-Core test; four direct reader cases failed for the same reason.
The CI's real temporary-directory spelling can use a Windows short-name alias.
Lexical equality with `realpath` is therefore too strong, even for link-free
paths. The older dc14 PR failure lacks equivalent nested diagnostics, so this
finding is not retroactive proof of that older failure's sole cause.

The reader now observes both original and canonical directory ancestries,
requires matching leaf device/inode/birthtime plus unchanged metadata, checks
both ancestries before return and compares them on revalidation. A different
directory, symlink/junction or changed ancestor still rejects. Paths must have
plain local roots. This reuses the existing Core reference-path algorithm's
identity-based principle without importing private Core code into Desktop.

The focused Registry/owned-Core selection passed16/16 locally onNode24.22.1.
It includes a deterministic injected filesystem alias view (not an actual8.3
claim), a mismatched canonical-directory rejection, existing junction and
replacement cases, and the two real owned Core processes with natural closure.
The next exact hosted run must still demonstrate its actual Windows alias path.
No failed hosted run was retried or relabeled as passing merely on that basis.
