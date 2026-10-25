param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('probe', 'probe-exit', 'probe-timeout', 'probe-descendant', 'probe-node', 'runtime-discovery', 'workspace-surfaces', 'plugin-preview', 'host-plugin-lifecycle')]
  [string] $Mode
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if ($env:OS -ne 'Windows_NT') { throw 'Windows E2E requires Windows.' }
if (-not $Mode.StartsWith('probe', [StringComparison]::Ordinal) -and
    ($env:GITHUB_ACTIONS -cne 'true' -or $env:RUNNER_OS -cne 'Windows')) {
  throw 'Desktop launch mode is restricted to Windows CI.'
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

$desktop = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')).TrimEnd('\')
$temp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')
Assert-PlainDirectoryChain $temp
$name = 'sps-windows-e2e-helper-' + [Guid]::NewGuid().ToString('N')
$build = Join-Path $temp $name
New-Item -ItemType Directory -Path $build | Out-Null
$owned = Get-Item -LiteralPath $build -Force
$createdTicks = $owned.CreationTimeUtc.Ticks
$exitCode = 125
$previousConsoleEncoding = [Console]::OutputEncoding
try {
  [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
  Assert-PlainDirectoryChain $build
  $source = Join-Path $PSScriptRoot 'windows-e2e\RestrictedE2eRunner.cs'
  $exe = Join-Path $build 'RestrictedE2eRunner.exe'
  $compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
  $node = (Get-Command node.exe -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
  & $compiler /nologo /optimize+ /platform:x64 "/out:$exe" $source
  if ($LASTEXITCODE -ne 0) { throw 'Windows E2E helper compilation failed.' }
  & $exe $Mode $node $desktop
  $exitCode = $LASTEXITCODE
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
