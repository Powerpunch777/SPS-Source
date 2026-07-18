param(
  [string]$LoaderPath = "C:\Users\young\AppData\Local\npm-cache\_npx\43414d9b790239bb\node_modules\@paperclipai\server\dist\adapters\plugin-loader.js"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $LoaderPath)) {
  throw "SPS adapter plugin loader was not found: $LoaderPath"
}

$resolved = (Resolve-Path -LiteralPath $LoaderPath).Path
$allowedRoot = (Resolve-Path -LiteralPath "C:\Users\young\AppData\Local\npm-cache\_npx").Path

if (-not $resolved.StartsWith($allowedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing to patch outside the expected SPS npx cache root: $resolved"
}

$source = Get-Content -LiteralPath $resolved -Raw -Encoding UTF8
$original = $source

if ($source -notmatch 'pathToFileURL') {
  $replacement = 'import path from "node:path";' + "`n" + 'import { pathToFileURL } from "node:url";'
  $source = $source -replace 'import path from "node:path";', $replacement
}

$source = $source -replace 'const mod = await import\(modulePath\);', 'const mod = await import(pathToFileURL(modulePath).href);'
$source = $source -replace 'const fileUrl = `file://\$\{modulePath\}`;', 'const fileUrl = pathToFileURL(modulePath).href;'

if ($source -eq $original) {
  "SPS adapter loader already appears patched: $resolved"
  exit 0
}

$backup = "$resolved.codex-backup"
if (-not (Test-Path -LiteralPath $backup)) {
  Copy-Item -LiteralPath $resolved -Destination $backup
}

Set-Content -LiteralPath $resolved -Value $source -Encoding UTF8 -NoNewline
"Patched SPS adapter loader: $resolved"
"Backup: $backup"
