# Installer qualification registry inspection

Source98 PR40988193319 (Windows job123844036677) failed before installation: its initial read-only uninstall-registry query exceeded the existing 30-second child-process limit, without stdout/stderr. The signed-in user's PowerShell profile was not involved (`-NoProfile -NonInteractive`). This failure does not establish an installer/data-preservation defect, and it is not a passing installer qualification.

The query now uses .NET RegistryKey directly instead of PowerShell's per-key provider/property objects. It reads the same three fixed HKCU/HKLM/native/WOW6432Node uninstall locations in the process's default registry view and retains the same case-insensitive SPS name predicate and four output fields. All keys open read-only and are disposed. Missing top-level locations are allowed; access/read errors and disappearance of an enumerated subkey fail closed. The caller still rejects an existing SPS installation before making changes.

The exact PowerShell invocation flags and 30-second limit, hosted-runner guard, installer actions, hash/sentinel assertions and owned-Job cleanup rules are unchanged. No retry, broader local install permission, ignored query failure or timeout increase was added.

Read-only local comparisons kept both complete results in memory and printed only equality/count/timing: old4272ms/new1747ms and, after integration, old2182ms/new1023ms, one identical SPS record. These measurements show local equivalence and lower overhead; they do not prove the hosted timeout is resolved. Both script syntax checks and four installer safety tests passed. Current exact-head hosted installer qualification remains required.

References: [RegistryKey.OpenSubKey](https://learn.microsoft.com/en-us/dotnet/api/microsoft.win32.registrykey.opensubkey), [RegistryKey.GetSubKeyNames](https://learn.microsoft.com/en-us/dotnet/api/microsoft.win32.registrykey.getsubkeynames). No dependency or copied upstream implementation was added.
