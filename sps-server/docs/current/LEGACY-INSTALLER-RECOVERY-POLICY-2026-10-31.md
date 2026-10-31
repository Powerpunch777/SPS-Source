# Withdrawn Installer Recovery Policy

User decision: 2026-10-31. Scope: the withdrawn, unsigned historical Desktop
`0.4.86` only. This does not change the general automatic-update requirement or
make a failed old-version replacement successful.

## Product Behavior

- A failed old uninstaller keeps its nonzero outcome. Do not hide the failure,
  overwrite the old program, delete its files, or start a fallback automatically.
- For exact `0.4.86`, a non-silent Setup failure explains the data-preserving
  reinstall route. Silent update failure must return its original error instead
  of waiting on an invisible dialog. Other versions keep the ordinary fatal
  uninstall-error handling.
- The user first backs up SPS data and any work saved inside the program's
  installation folder. They then choose uninstall in Windows Installed Apps,
  without requesting deletion of app data, and run the current Setup themselves.
- Do not instruct users to delete SPS AppData, the Host Vault, project folders,
  credentials or source folders. A backup can contain sensitive information and
  must be kept private. A running or busy old installation is not forcibly
  removed by a recovery script.
- This is a user-guided recovery route, not a new unattended recovery installer
  or a claim that the old binary can be repaired in place.

## Required Evidence

1. Build the actual recovery guidance through both supported NSIS hooks. Check
   exact-version selection, silent/non-silent branches and original error exit.
   Do not execute installers on the developer's installed profile.
2. Keep normal current-package replacement, artifact hashes, installed first
   frame, repair, default uninstall and retained-data reinstall checks. The
   current-package replacement is measured before the withdrawn input, so it
   can be distinguished from the old binary's outcome.
3. Add a separate mandatory hosted clean-VM recovery acceptance: pinned old
   input; captured automatic replacement failure; unchanged old program and
   every inert user-data sentinel; explicit operator-recovery branch; actual
   standard old uninstall without a delete-data flag; candidate installation;
   exact installed artifact hashes; first frame and all retained bytes.
4. A timeout, signal, unknown exit, missing file or changed byte is not an
   accepted legacy failure. Failed/rejected recovery must leave diagnostics
   distinct and must not claim automatic upgrade, previous Stable or real
   application-data migration. Never launch the withdrawn old Main.
5. Preserve hosted-only checks, canonical owned paths, restricted token/private
   desktop/owned Job and natural process-tree closure. Do not shorten the
   original path, increase its deadline or bypass the old process guard.

## Current Status

Both supported NSIS hooks compile with the exact-version recovery guidance
(38967-byte compile-only fixture, no warnings, never executed). Silent mode
still returns the original failure. Current-package replacement is additionally
measured before the old input; the original historical gate still fails closed.

A separate hosted-only `historical-standard-recovery` diagnostic retains the
original long fixture path, uses the old uninstaller's ordinary semantics (no
`--updated`, KEEP or delete-data flag), and requires nine retained opaque user
records plus one external project record and complete program removal. Its
eight-minute child/ten-minute job bounds, same-user reduced token, private
desktop, owned Job and natural-cleanup requirement remain intact. This is only
the ordinary-uninstall prerequisite, explicitly not a completed reinstall or
automatic-upgrade proof. Hosted execution is still pending.

Focused installer/safety/recovery contracts20/20 and full local Desktop1713total/
1711pass/two unavailable-8.3-alias skips/zero failures passed. The complete
separate recovery flow, retained-installation hash proof and actual hosted
recovery outcome are not yet qualified. No installed local app/profile was used.
Merely approving this policy or compiling guidance is not release evidence.

Related evidence: [historical failure](../reviews/INSTALLER-CIM-DIAGNOSTIC-2026-10-31.md),
[completion checklist](CORE-FINAL-VALIDATION-2026-10-30.md).
