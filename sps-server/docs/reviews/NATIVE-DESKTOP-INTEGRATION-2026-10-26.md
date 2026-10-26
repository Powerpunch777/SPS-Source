# Native Desktop integration development checkpoint

Date: 2026-10-26 KST. Desktop remains the unreleased 0.4.137 development candidate.
This checkpoint is not Native LAN, whole-Job cleanup or release acceptance.

## Implemented composition

Core Settings now has explicit Member enrollment, saved registration lookup and
locally confirmed interrupted-publication recovery actions. Electron Main binds
each operation to the current Identity issuer, account subject and connection
generation, verifies the requesting settings frame, and disposes active Native
clients on account/connection invalidation or quit. Host approval, Workspace
membership, Plugin capabilities, Agent, Node and Source grants remain separate.
No optional Agent or Plugin is involved in these operations.

Enrollment confirms the invitation's Host address and server pin before public
issuer bootstrap. Main reserves the account/Host key ID, saves the encrypted
pending key and verified target, exchanges the current Identity token over the
pinned transport, and persists issuance before requesting completion. A lost
completion response can be queried explicitly using the existing protected
target/key/certificate without an invitation or automatic retry. An incomplete
indexed slot is never repaired by silently replacing or rotating its key.

Local publication recovery authenticates retained scope-bound ciphertext and
only unlinks a verified generated temporary alias of an exact two-link final
slot. It creates no key, trusts no new peer, and sends no network request. The
pending/issued/target sequence is not atomic: a later failure can follow an
earlier repaired alias. UI reports this and permits another explicit attempt.
Ordinary reads do not invoke recovery. Filesystem-state fixtures do not prove
power-loss durability or immunity from a malicious same-user filesystem race.

Account refresh and sign-in now use session epochs and scope checks. Stale
refresh success/error cannot overwrite or sign out a later account, including
logout/login back to the same identity. Interprocess rotated refresh credentials
are adopted only for the same issuer, subject and Desktop device. Local state
saves serialize by destination and recheck synchronous commit guards before
writing and renaming, preventing competing local saves from sharing temporary
bytes. This is not a cross-process file lock or transactional filesystem claim.

Core development bootstrap is pinned to `1e107a67e1f8e1fb4eee1704f70850624942b13a`.
Windows workspace links use absolute directory junctions without requiring
symlink privilege, preserve existing different targets, and retain POSIX links.
This changes development setup, not the Core runtime's Native authorization.

## Verification at the first local checkpoint

- New controller and existing Core Settings focused tests passed 36/36 before
  subsequent repair/UI additions.
- State/controller/account lifecycle focused run passed 42/42 at its recorded
  source state; later account refresh epoch concurrency coverage passed 10/10.
- Focused pending/issued/target store suites passed 47/47. They use an AES-GCM
  safeStorage substitute, not real DPAPI. Hardlink and directory-junction
  security fixtures ran; file-symlink fixtures report unavailable privilege.
- A later integration-focused run passed 125/126; its single failure was a
  source-text assertion for the changed epoch variable. After correcting that
  assertion, the complete preload contract file passed 24/24. These separate
  results are not relabelled as one complete full-suite pass.
- Core link helper tests passed 7/7 and 4/4; Core Settings Main contracts passed
  5/5. Core full typecheck/build and Desktop full regression are still being
  collected at this checkpoint.
- Real Electron rendered the settings surface at 1000px and 620px with no
  horizontal overflow and loaded the local font. Its natural Quit smoke failed;
  forced cleanup is not accepted as success. Opt-in fixed-stage shutdown
  diagnostics were added without weakening natural-exit acceptance.
- The new controller/Core temporary PostgreSQL and fresh TLS interop command
  exists, but no passing result has been recorded at this checkpoint. Its first
  attempt committed registration but failed lookup with a sanitized error.
  Review subsequently found an issued-store DTO mismatch: the transport needs
  the nested public issuance, not the store's credential-bearing result. The
  controller and unit fixture were corrected; a passing real interop rerun is
  still required. The fixture uses a bounded 30-minute certificate validity.

Reproduction commands from `sps-server/desktop`:

```text
node --test --test-concurrency=2 test/*.test.mjs
node --test test/native-member-controller.test.mjs test/state.test.mjs test/desktop-account-controller.test.mjs
node --test test/native-member-pending-store.test.mjs test/native-member-issued-store.test.mjs test/native-member-target-store.test.mjs
node scripts/smoke-core-settings-desktop.mjs
```

From `external/sps-core`:

```text
npx --offline pnpm@11.9.0 typecheck
npx --offline pnpm@11.9.0 build
npx --offline pnpm@11.9.0 --filter @paperclipai/db exec tsx ../../../../sps-server/desktop/scripts/smoke-native-enrollment-client-core.mjs --isolated-native-member-controller
```

## Follow-up evidence and fixes

The production Main controller/client/store composition subsequently passed the
real temporary Core PostgreSQL and fresh loopback TLS integration command. It
reconstructs the controller and reloads the persisted index after dropping only
the committed completion response, reads the same pending device twice, verifies
unchanged device/audit rows, and rejects a different current account before any
network request. Its owned fixture was removed. Encryption is still an AES-GCM
safeStorage substitute; this does not qualify actual DPAPI, Desktop enrollment
UI, product Native listener, or physical LAN.

Source `dbbfec1` hosted run `40279549952` passed Core full Linux typecheck/build,
all nine Core Linux regression shards, bundled plugins, SDK/Registry, Room and
Identity jobs. It failed the unchanged Zod security gate and Windows Desktop
unit job (999 pass / 2 fail / 2 existing skips). One failure was the stale
success-log source contract, now updated for both isolated modes; the other
exposed a real post-unlink inode comparison mixing exact BigInt and rounded
Number identities on NTFS. Recovery now retains exact BigInt identities and
bounded single-/two-link reads. The deterministic precision regression uses two
different inode values above 2^53 that would collapse to the same Number. The
pending/issued/target suites passed 48/48 after this fix; hosted rerun is required.

Local full Desktop regression completed 1003 tests with 983 pass, 9 fail,
1 cancelled and 10 skipped at its recorded, partially superseded source state.
Besides the corrected source contract, failures were child/TLS/Electron or
Windows-helper deadlines under machine load. They remain failed, not accepted
as environmental skips. After state/contract corrections, a separate focused
run completed 80 tests: 78 pass, 0 fail, 2 explicit file-symlink privilege skips.

State persistence additionally rejects linked/nonregular destination/temp slots,
validates existing critical state before replacement, exclusively claims its
temporary file, verifies directory and file identity including birth time, and
rechecks current authority immediately before rename. Cleanup removes only its
owned temp through the same verified directory. Corrupt and future-version state
bytes are preserved. Tests cover linked slots, directory junctions and stale
guards; no cross-process file lock or atomic power-loss recovery is claimed.

The Core dependency-review job initially failed because the repository's
dependency graph was disabled, not because of a dependency change in PR27.
Repository vulnerability alerts/dependency graph were enabled through GitHub's
documented administration endpoint and the failed review rerun was requested.
This does not change the SPS security policy or waive Zod.

## Remaining product and release work

Core's Native identity, session exchange and enrollment handlers remain
unmounted. Desktop actions cannot connect to a product Host until the dedicated
opt-in TLS ingress is implemented. No generic Core HTTP proxy, listener, firewall
rule, installed application, customer credentials or production service was
changed. Native LAN remains off/unsupported; the supported remote transport
remains Tailscale.

Source full CI, the held Zod High security gate, exact-head Windows owned-Job
natural cleanup, actual DPAPI enrollment/recovery composition, certificate
renewal, full HTTP/WS/resource authorization, physical Host/Member/Node LAN and
identical-byte installation/update/restore verification remain outstanding.
Earlier evidence is not reused as proof of the new source tuple. Marketplace
policy and Plugin Builder architecture are outside this increment.
