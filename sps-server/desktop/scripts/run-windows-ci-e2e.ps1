param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('probe', 'probe-registry', 'probe-exit', 'probe-native-exit', 'probe-timeout', 'probe-descendant', 'probe-node', 'probe-preview-pending', 'probe-preview-pending-descendant', 'probe-preview-failure-descendant', 'probe-preview-zeroexit', 'workspace-pending', 'workspace-pending-descendant', 'workspace-failure-descendant', 'workspace-zeroexit', 'probe-exit-76', 'runtime-discovery', 'native-management', 'native-plugin-sdk', 'execution-control', 'workspace-surfaces', 'plugin-preview', 'host-plugin-lifecycle', 'installer-data-preservation', 'owner-vault-transfer', 'owner-vault-crash-recovery', 'owner-vault-state-migration')]
  [string] $Mode
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if ($env:OS -ne 'Windows_NT') { throw 'Windows E2E requires Windows.' }
$workspaceProbeModes = @('workspace-pending', 'workspace-pending-descendant', 'workspace-failure-descendant', 'workspace-zeroexit')
$isProbe = $Mode.StartsWith('probe', [StringComparison]::Ordinal) -or $workspaceProbeModes -ccontains $Mode
if (-not $isProbe -and
    ($env:GITHUB_ACTIONS -cne 'true' -or $env:RUNNER_OS -cne 'Windows')) {
  throw 'Desktop launch mode is restricted to Windows CI.'
}
if ($Mode -ceq 'installer-data-preservation' -and $env:RUNNER_ENVIRONMENT -cne 'github-hosted') {
  throw 'Installer data preservation E2E requires a GitHub-hosted runner.'
}
if (($Mode -ceq 'owner-vault-transfer' -or $Mode -ceq 'owner-vault-crash-recovery' -or $Mode -ceq 'owner-vault-state-migration') -and
    $env:RUNNER_ENVIRONMENT -cne 'github-hosted') {
  throw 'Owner Vault E2E requires a GitHub-hosted runner.'
}

function Assert-PlainDirectoryChain([string] $Directory) {
  $current = [IO.Path]::GetFullPath($Directory)
  while ($true) {
    $item = Get-Item -LiteralPath $current -Force
    if (-not $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
      throw 'Linked or invalid E2E helper directory.'
    }
    $parent = [IO.Path]::GetDirectoryName($current)
    if ([string]::IsNullOrEmpty($parent)) { break }
    $current = $parent
  }
}

function Write-ExitDiagnostic([string] $Kind, [string] $Phase, [int] $Code) {
  $unsignedCode = [uint64]($Code -band 0xffffffffL)
  [Console]::Error.WriteLine(('{0}:phase={1},code={2},hex=0x{3:X8}' -f $Kind, $Phase, $Code, $unsignedCode))
}

$desktop = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')).TrimEnd('\')
$temp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')
Assert-PlainDirectoryChain $temp
$name = 'sps-windows-e2e-helper-' + [Guid]::NewGuid().ToString('N')
$build = Join-Path $temp $name
New-Item -ItemType Directory -Path $build | Out-Null
$owned = Get-Item -LiteralPath $build -Force
$createdTicks = $owned.CreationTimeUtc.Ticks
$exitCode = 125
$phase = 'helper_setup'
$previousConsoleEncoding = [Console]::OutputEncoding
try {
  [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
  $phase = 'temp_validation'
  Assert-PlainDirectoryChain $build
  $source = Join-Path $PSScriptRoot 'windows-e2e\RestrictedE2eRunner.cs'
  $registrySource = Join-Path $PSScriptRoot 'windows-e2e\InstallerRegistryReader.cs'
  $exe = Join-Path $build 'RestrictedE2eRunner.exe'
  $phase = 'node_resolution'
  $compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
  $node = (Get-Command node.exe -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
  $phase = 'compile'
  & $compiler /nologo /optimize+ /platform:x64 "/out:$exe" $source $registrySource
  $compileExitCode = $LASTEXITCODE
  if ($compileExitCode -ne 0) {
    Write-ExitDiagnostic 'restricted_e2e_compile_exit' $phase $compileExitCode
    throw 'Windows E2E helper compilation failed.'
  }
  $phase = 'helper_execute'
  & $exe $Mode $node $desktop
  $exitCode = $LASTEXITCODE
  $phase = 'helper_exit'
  if ($exitCode -ne 0) { Write-ExitDiagnostic 'restricted_e2e_helper_exit' $phase $exitCode }
}
catch {
  [Console]::Error.WriteLine(('restricted_e2e_wrapper_error:phase={0},type={1}' -f $phase, $_.Exception.GetType().Name))
  throw
}
finally {
  [Console]::OutputEncoding = $previousConsoleEncoding
  # Delete only the exact temporary directory this invocation created.
  if ([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($build)) -cne $temp -or
      [IO.Path]::GetFileName($build) -cne $name) { throw 'Invalid E2E helper cleanup target.' }
  Assert-PlainDirectoryChain $build
  $current = Get-Item -LiteralPath $build -Force
  if ($current.CreationTimeUtc.Ticks -ne $createdTicks) { throw 'E2E helper cleanup identity changed.' }
  $entries = @(Get-ChildItem -LiteralPath $build -Force)
  foreach ($entry in $entries) {
    if ($entry.PSIsContainer -or ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -or
        $entry.Name -cne 'RestrictedE2eRunner.exe') { throw 'Unexpected E2E helper cleanup entry.' }
  }
  foreach ($entry in $entries) { Remove-Item -LiteralPath $entry.FullName -Force }
  Remove-Item -LiteralPath $build -Force
}
exit $exitCode
