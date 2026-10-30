# Windows installer data preservation qualification

The previous Windows CI built and tested an unpacked Desktop but never executed
NSIS installation. A valid archive or updater mock cannot establish that
installation, replacement and uninstall preserve user data.

## Added acceptance path

The existing Desktop Windows job now builds an unsigned NSIS installer from its
already-tested unpacked directory with publishing disabled. A fixed mode in the
existing restricted-token/owned-Job launcher runs the installer qualification on
a GitHub-hosted Windows worker. PowerShell, the C# child and the Node script all
require the hosted-runner context. This does not provide adversarial machine
attestation; it prevents accidentally invoking the installer smoke as a normal
local/self-hosted test. No local environment is set to impersonate CI.

Before mutation the script rejects existing SPS uninstall registrations,
running Desktop processes or existing SPS data directories. It validates plain
path ancestors and owns a unique temporary install directory. It creates opaque
byte sentinels in all three actual NSIS deletion aliases: `@spsdesktop`,
`SPS Desktop` and the scoped package `@sps/desktop` below the hosted account's
APPDATA. These bytes are inert preservation fixtures, not real Secret encryption,
state schema migration or normal-profile startup evidence.

The test executes these real operations with silent per-user arguments:

1. Fresh installation; verify per-user registry identity, current version and
   five installed artifact hashes. Launch the installed binary through the
   existing isolated first-renderer smoke with its original assertions/deadline.
2. Deliberately damage the fixture's installed ASAR, then rerun the same
   installer. Verify the exact current payload is repaired and all data bytes
   survive. This cannot pass merely because installation was a no-op.
3. Copy the fixture uninstaller outside the install directory and wait for its
   in-place `_?=` execution. Verify registration and ASAR removal while default
   data retention preserves the sentinels. No keep-data override hides a broken
   default uninstall policy.
4. Reinstall, verify all bytes and run the installed binary's isolated first
   frame again. Preserve test fixtures in the disposable VM for its lifetime.

No installer uses force-run, data-deletion flags, a shell or alternate user-data
policy. NSIS final `/D=` and `_?=` parameters use an unquoted absolute tail as its
own documentation requires; executable quoting is separate. The existing outer
launcher alone accepts pending exit76 after confirming natural Job emptiness.
Timeout, failure or a forced cleanup remains a failure, and profiles/artifacts
are preserved. Existing modes, privilege rules and closure limits are retained.

## Evidence boundary

Local guard/path/argument tests, actual local rejection of the smoke, existing
workflow dependency checks and selected wrapper regression checks passed.
The updated C# helper compiled locally; no installer mode was run locally.
Actual installer qualification is pending until the new exact-head Windows
workflow completes and both the operation assertions and owning Job result are
inspected. Previous1075093 package and CI evidence is historical for this change.

This qualifies fresh installation, same-version repair and default uninstall/
reinstall retention only. An upgrade from the previously qualified Stable,
application schema migrations, backup/restore, actual credentials, normal-profile
OS integration, Authenticode signing and identical-byte physical Host/Member
qualification remain distinct requirements. No new Native, Builder or solution
plugin feature is introduced.

References used: [NSIS command-line rules](https://nsis.sourceforge.io/Docs/Chapter3.html#installerusage)
and the installed electron-builder26.17.0 NSIS templates (`multiUser.nsh`,
`include/installer.nsh`, `include/installUtil.nsh`, `uninstaller.nsh`). Existing
SDK/data/security and release policy are unchanged.
