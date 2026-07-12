param(
  [string]$WorkspacePath,
  [string]$ProjectFile
)

$ErrorActionPreference = "Stop"

# 1. Dynamic Discovery and Path Resolution
if ([string]::IsNullOrEmpty($WorkspacePath)) {
  $unrealProjectsRoot = "C:\Users\young\Documents\Unreal Projects"
  if (Test-Path $unrealProjectsRoot) {
    $subdirs = Get-ChildItem -Path $unrealProjectsRoot -Directory -ErrorAction SilentlyContinue
    foreach ($dir in $subdirs) {
      if ((Get-ChildItem -Path $dir.FullName -Filter *.uproject -File -ErrorAction SilentlyContinue).Count -eq 1) {
        $WorkspacePath = $dir.FullName
        break
      }
    }
  }
}

if ([string]::IsNullOrWhiteSpace($WorkspacePath)) {
  throw "WorkspacePath was not provided and could not be dynamically discovered."
}

$resolvedWorkspace = $null
try {
  $resolvedWorkspace = (Resolve-Path -LiteralPath $WorkspacePath -ErrorAction Stop).Path
} catch {
  throw "Workspace path does not exist or is invalid: $WorkspacePath. Exception: $_"
}

if (-not (Test-Path $resolvedWorkspace -PathType Container)) {
  throw "Workspace path is not a directory: $resolvedWorkspace"
}

# 2. Unreal Validation
$uprojectPath = $null
if (-not [string]::IsNullOrEmpty($ProjectFile)) {
  try {
    $resolvedProjectFile = (Resolve-Path -LiteralPath $ProjectFile -ErrorAction Stop).Path
  } catch {
    throw "Explicit project file path is invalid or does not exist: $ProjectFile"
  }
  if (-not (Test-Path $resolvedProjectFile -PathType Leaf)) {
    throw "Explicit project file is not a file: $resolvedProjectFile"
  }
  if ($resolvedProjectFile -notlike "*.uproject") {
    throw "Explicit project file must have a .uproject extension: $resolvedProjectFile"
  }
  # Validate path containment to ensure the project file is inside the workspace
  $dirSep = [System.IO.Path]::DirectorySeparatorChar.ToString()
  $altSep = [System.IO.Path]::AltDirectorySeparatorChar.ToString()
  $normWorkspace = $resolvedWorkspace.Replace($altSep, $dirSep)
  $normProject = $resolvedProjectFile.Replace($altSep, $dirSep)
  if (-not $normWorkspace.EndsWith($dirSep)) {
    $normWorkspace += $dirSep
  }
  if (-not $normProject.StartsWith($normWorkspace, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Explicit project file '$resolvedProjectFile' is outside the resolved workspace '$resolvedWorkspace'."
  }
  $uprojectPath = $resolvedProjectFile
} else {
  $uprojects = Get-ChildItem -Path $resolvedWorkspace -Filter *.uproject -File
  if ($uprojects.Count -eq 0) {
    throw "No .uproject file found in workspace: $resolvedWorkspace. Not a valid Unreal project workspace."
  } elseif ($uprojects.Count -gt 1) {
    throw "Multiple .uproject files found in workspace: $resolvedWorkspace. Ambiguous project selection. Please specify -ProjectFile explicitly."
  }
  $uprojectPath = $uprojects[0].FullName
}

return [pscustomobject]@{
  WorkspacePath = $resolvedWorkspace
  ProjectFile   = $uprojectPath
}
