# Hosted installer registration inspection

The Sourceb9 push installer acceptance failed before installation: its fixed PowerShell registry query exceeded the existing30-second child deadline with no output. The earlier direct `.NET RegistryKey` PowerShell optimization did not resolve this hosted failure. Logs do not distinguish PowerShell initialization from time spent in a registry API, so no narrower root cause is claimed.

Registration snapshots now call a fixed read-only subcommand in the already compiled Windows E2E launcher. `InstallerRegistryReader.cs` reads exactly the same HKCU/HKLM/HKLM-WOW6432Node uninstall roots with `RegistryView.Default` and read-only key handles. It keeps the SPS display-name filter and four-field JSON-array contract. A missing top-level root is skipped; disappeared enumerated children, access/read errors, unsupported value types and output limits fail the inspection. Registry data is never executed or written.

The restricted launcher supplies its own assembly path to its child. Node accepts only the canonical plain temporary helper directory and fixed executable name, rejects links/hardlinks, compares file identity before and after execution, and validates bounded JSON. The child has a fixed argument, no shell, a1MiB output limit and the unchanged30-second deadline. There is no PowerShell fallback, retry, failed-query-as-empty handling or installer guard bypass. Installer invocation remains limited to the existing GitHub-hosted Windows launch mode; the new local probe only reads registrations.

Focused verification passed:

- Registry parser/executor and installer-safety selections:8tests, including malformed output, execution failure, helper replacement and linked/outside paths, and local installer rejection.
- Two actual Windows launcher probes pass under the reduced same-user token/private Desktop: registry inspection and the original token/owned-object cleanup probe. Both confirm the entire owned Job naturally empty and the owned Desktop/WindowStation closed. Overlapping tests are not added as separate coverage.

These results do not establish hosted installer acceptance; the next exact Source CI must complete installation, repair, uninstall-retain and reinstall checks. No local installer or normal user profile was modified. This is CI qualification infrastructure, not new Native networking or an OS sandbox for plugins.

The implementation uses the existing Windows/.NET APIs without adding dependencies. Their read-only flag and missing-key behavior are documented by [Microsoft RegistryKey.OpenSubKey](https://learn.microsoft.com/en-us/dotnet/api/microsoft.win32.registrykey.opensubkey?view=netframework-4.8.1).
