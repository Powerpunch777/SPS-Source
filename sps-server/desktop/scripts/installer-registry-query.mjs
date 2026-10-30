// Fixed, read-only uninstall-registration query for the hosted installer E2E.
// Keep this list explicit: callers must not choose registry roots or queries.
export const SPS_INSTALLER_REGISTRY_QUERY = String.raw`
$ErrorActionPreference = 'Stop'
$specs = @(
  @{ hive=[Microsoft.Win32.RegistryHive]::CurrentUser; path='Software\Microsoft\Windows\CurrentVersion\Uninstall'; perUser=$true },
  @{ hive=[Microsoft.Win32.RegistryHive]::LocalMachine; path='Software\Microsoft\Windows\CurrentVersion\Uninstall'; perUser=$false },
  @{ hive=[Microsoft.Win32.RegistryHive]::LocalMachine; path='Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall'; perUser=$false }
)
$items = [System.Collections.Generic.List[object]]::new()
foreach ($spec in $specs) {
  $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey($spec.hive, [Microsoft.Win32.RegistryView]::Default)
  try {
    $root = $base.OpenSubKey($spec.path, $false)
    if ($null -eq $root) { continue }
    try {
      foreach ($subName in $root.GetSubKeyNames()) {
        $key = $root.OpenSubKey($subName, $false)
        if ($null -eq $key) { throw 'An uninstall registration changed during inspection.' }
        try {
          $name = $key.GetValue('DisplayName', $null)
          if ($name -is [string] -and $name -match '(?i)^SPS(?:\s|$)') {
            $items.Add([pscustomobject]@{
              name=$name
              version=$key.GetValue('DisplayVersion', $null)
              uninstall=$key.GetValue('UninstallString', $null)
              perUser=[bool]$spec.perUser
            })
          }
        } finally { $key.Dispose() }
      }
    } finally { $root.Dispose() }
  } finally { $base.Dispose() }
}
ConvertTo-Json -InputObject @($items) -Compress
`;
