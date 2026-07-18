param(
  [string]$NpxCacheRoot = (Join-Path $env:LOCALAPPDATA "npm-cache\\_npx"),
  [string]$PackageRoot = ""
)

$ErrorActionPreference = "Stop"

function Assert-WithinCache([string]$Path, [string]$CacheRoot) {
  $resolvedPath = (Resolve-Path -LiteralPath $Path).Path
  $resolvedCache = (Resolve-Path -LiteralPath $CacheRoot).Path
  if (-not $resolvedPath.StartsWith($resolvedCache, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to patch outside the SPS npx cache: $resolvedPath"
  }
  return $resolvedPath
}

if (-not (Test-Path -LiteralPath $NpxCacheRoot -PathType Container)) {
  throw "SPS npx cache was not found: $NpxCacheRoot"
}

if (-not $PackageRoot) {
  $registry = Get-ChildItem -Path $NpxCacheRoot -Filter registry.js -File -Recurse |
    Where-Object { $_.FullName -match "node_modules\\@paperclipai\\server\\dist\\adapters\\registry\.js$" } |
    Sort-Object LastWriteTimeUtc -Descending |
    Select-Object -First 1
  if (-not $registry) {
    throw "An installed SPS server registry was not found under: $NpxCacheRoot"
  }
  $PackageRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent (Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $registry.FullName)))))
}

$PackageRoot = Assert-WithinCache $PackageRoot $NpxCacheRoot
$adapterRoot = Join-Path $PackageRoot "node_modules\\@paperclipai\\adapter-codex-local\\dist"
$serverRoot = Join-Path $PackageRoot "node_modules\\@paperclipai\\server\\dist"
$adapterIndex = Join-Path $adapterRoot "server\\index.js"
$adapterExecute = Join-Path $adapterRoot "server\\execute.js"
$adapterSchema = Join-Path $adapterRoot "server\\config-schema.js"
$registryPath = Join-Path $serverRoot "adapters\\registry.js"

foreach ($path in @($adapterIndex, $adapterExecute, $registryPath)) {
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    throw "Expected SPS Codex adapter file was not found: $path"
  }
}

function Backup-Once([string]$Path) {
  $backup = "$Path.sps-codex-config-backup"
  if (-not (Test-Path -LiteralPath $backup)) {
    Copy-Item -LiteralPath $Path -Destination $backup
  }
}

$schemaSource = @'
// paperclip-local-codex-account-schema
import fs from "node:fs";
import path from "node:path";

function codexAccountLabel(directoryName) {
  if (directoryName === ".codex") return "Default Codex account";
  const suffix = directoryName.replace(/^\.codex-?/, "").replace(/[-_]+/g, " ").trim();
  return suffix ? `${suffix.replace(/\b\w/g, (character) => character.toUpperCase())} Codex account` : "Codex account";
}

function localCodexAccountOptions() {
  const root = process.env.USERPROFILE || process.env.HOME || "";
  if (!root) return [{ value: ".codex", label: "Default Codex account (sign in required)" }];
  try {
    const entries = fs.readdirSync(root, { withFileTypes: true });
    const accounts = entries
      .filter((entry) => entry.isDirectory() && (entry.name === ".codex" || entry.name.startsWith(".codex-")))
      .filter((entry) => fs.existsSync(path.join(root, entry.name, "auth.json")))
      .map((entry) => ({ value: entry.name, label: codexAccountLabel(entry.name) }))
      .sort((left, right) => left.value === ".codex" ? -1 : right.value === ".codex" ? 1 : left.label.localeCompare(right.label));
    return accounts.length ? accounts : [{ value: ".codex", label: "Default Codex account (sign in required)" }];
  } catch {
    return [{ value: ".codex", label: "Default Codex account (sign in required)" }];
  }
}

export function getConfigSchema() {
  const accounts = localCodexAccountOptions();
  return {
    fields: [
      {
        key: "codexAccount",
        label: "Codex CLI account",
        type: "select",
        default: accounts[0]?.value ?? ".codex",
        options: accounts,
        hint: "Choose the locally signed-in CODEX_HOME profile. Changing it starts a new underlying Codex session on the next run; SPS Task and Room history remain intact."
      },
      { key: "model", label: "Model", type: "text", hint: "Optional Codex model id." },
      {
        key: "modelReasoningEffort",
        label: "Reasoning effort",
        type: "select",
        options: ["minimal", "low", "medium", "high", "xhigh"].map((value) => ({ value, label: value }))
      },
      { key: "cwd", label: "Working directory", type: "text", hint: "Absolute fallback directory. A Project workspace overrides this for assigned Tasks." },
      { key: "command", label: "Codex command", type: "text", hint: "Defaults to codex." },
      { key: "timeoutSec", label: "Timeout seconds", type: "number", hint: "Use 0 for the adapter default." },
      { key: "graceSec", label: "Termination grace seconds", type: "number" },
      { key: "search", label: "Web search", type: "toggle", default: false },
      { key: "fastMode", label: "Fast mode", type: "toggle", default: false },
      { key: "dangerouslyBypassApprovalsAndSandbox", label: "Bypass approvals and sandbox", type: "toggle", default: false, hint: "Use only for trusted local Agents." },
      { key: "env", label: "Environment JSON", type: "textarea", hint: "Optional environment values. codexAccount takes precedence over an env.CODEX_HOME value." }
    ]
  };
}
'@

if (-not (Test-Path -LiteralPath $adapterSchema) -or -not ((Get-Content -LiteralPath $adapterSchema -Raw -Encoding UTF8) -match "paperclip-local-codex-account-schema")) {
  if (Test-Path -LiteralPath $adapterSchema) { Backup-Once $adapterSchema }
  Set-Content -LiteralPath $adapterSchema -Value $schemaSource -Encoding UTF8 -NoNewline
}

$indexSource = Get-Content -LiteralPath $adapterIndex -Raw -Encoding UTF8
if ($indexSource -notmatch 'getConfigSchema.*config-schema') {
  Backup-Once $adapterIndex
  $indexSource = $indexSource.TrimEnd() + "`n" + 'export { getConfigSchema } from "./config-schema.js";' + "`n"
  Set-Content -LiteralPath $adapterIndex -Value $indexSource -Encoding UTF8 -NoNewline
}

$executeSource = Get-Content -LiteralPath $adapterExecute -Raw -Encoding UTF8
if ($executeSource -notmatch 'paperclip-local-codex-account-resolver') {
  Backup-Once $adapterExecute
  $needle = '    const envConfig = parseObject(config.env);'
  $replacement = @'
    const envConfig = parseObject(config.env);
    // paperclip-local-codex-account-resolver
    // The Configuration form stores only an approved local profile directory name,
    // never credentials or a user-entered absolute path.
    const selectedCodexAccount = typeof config.codexAccount === "string" ? config.codexAccount.trim() : "";
    if (selectedCodexAccount) {
        if (!/^\.[A-Za-z0-9][A-Za-z0-9._-]*$/.test(selectedCodexAccount)) {
            throw new Error("codexAccount must be a local .codex profile directory name.");
        }
        const accountHomeRoot = process.env.USERPROFILE || process.env.HOME || "";
        if (!accountHomeRoot) {
            throw new Error("Cannot resolve the current user's Codex profile directory.");
        }
        envConfig.CODEX_HOME = path.join(accountHomeRoot, selectedCodexAccount);
    }
'@
  if (-not $executeSource.Contains($needle)) { throw "Codex execute patch anchor changed; no files were modified." }
  $executeSource = $executeSource.Replace($needle, $replacement.TrimEnd())
  Set-Content -LiteralPath $adapterExecute -Value $executeSource -Encoding UTF8 -NoNewline
}

$registrySource = Get-Content -LiteralPath $registryPath -Raw -Encoding UTF8
if ($registrySource -notmatch 'getCodexConfigSchema') {
  Backup-Once $registryPath
  $importNeedle = 'testEnvironment as codexTestEnvironment, sessionCodec as codexSessionCodec, getQuotaWindows as codexGetQuotaWindows,'
  if (-not $registrySource.Contains($importNeedle)) { throw "Codex registry import anchor changed; no files were modified." }
  $registrySource = $registrySource.Replace($importNeedle, 'testEnvironment as codexTestEnvironment, sessionCodec as codexSessionCodec, getQuotaWindows as codexGetQuotaWindows, getConfigSchema as getCodexConfigSchema,')
  $propertyNeedle = '    getQuotaWindows: codexGetQuotaWindows,'
  if (-not $registrySource.Contains($propertyNeedle)) { throw "Codex registry property anchor changed; no files were modified." }
  $registrySource = $registrySource.Replace($propertyNeedle, "    getQuotaWindows: codexGetQuotaWindows,`n    getConfigSchema: getCodexConfigSchema,")
  Set-Content -LiteralPath $registryPath -Value $registrySource -Encoding UTF8 -NoNewline
}

Write-Output "Enabled Codex account selection in Agents > Configuration."
Write-Output "Patched package root: $PackageRoot"
Write-Output "Restart SPS after applying this script. Run it again after a SPS package update before restarting."
