$ErrorActionPreference = "Stop"
$scriptsRoot = $PSScriptRoot

Write-Output "=== Testing Invoke-DirectAgyUnrealQATaskRoom.ps1 ==="

# Helper to verify condition
function Assert-Equals {
  param(
    [object]$Actual,
    [object]$Expected,
    [string]$Message
  )
  if ($Actual -ne $Expected) {
    throw "ASSERTION FAILED: $Message. Expected: '$Expected', Actual: '$Actual'"
  }
}

function Assert-Contains {
  param(
    [string]$Haystack,
    [string]$Needle,
    [string]$Message
  )
  if ($null -eq $Haystack -or -not $Haystack.Contains($Needle)) {
    throw "ASSERTION FAILED: $Message. Expected string to contain '$Needle', but it was: `n$Haystack"
  }
}

# Define test folders
$tempTestDir = Join-Path $env:TEMP "DirectAgyUnrealQaTest-$([guid]::NewGuid().ToString().Substring(0,8))"
New-Item -ItemType Directory -Path $tempTestDir -Force | Out-Null

try {
  # --- Test Case 1: Fail Closed on non-existent workspace ---
  Write-Output "Running Test Case 1: Non-existent workspace..."
  $failedClosed = $false
  try {
    $params = @{
      CompanyId = "comp-123"
      Title = "Test"
      Description = "Test"
      WorkspacePath = (Join-Path $tempTestDir "non-existent")
      DryRun = $true
    }
    & "$scriptsRoot\Invoke-DirectAgyUnrealQATaskRoom.ps1" @params
  } catch {
    $failedClosed = $true
    Assert-Contains $_.Exception.Message "Workspace path does not exist" "Should fail closed on invalid path"
  }
  Assert-Equals $failedClosed $true "Should throw an exception for non-existent workspace"
  Write-Output "Test Case 1 Passed!"

  # --- Test Case 2: Fail Closed on missing .uproject ---
  Write-Output "Running Test Case 2: Missing .uproject..."
  $emptyWorkspace = Join-Path $tempTestDir "empty-workspace"
  New-Item -ItemType Directory -Path $emptyWorkspace -Force | Out-Null
  $failedClosed = $false
  try {
    $params = @{
      CompanyId = "comp-123"
      Title = "Test"
      Description = "Test"
      WorkspacePath = $emptyWorkspace
      DryRun = $true
    }
    & "$scriptsRoot\Invoke-DirectAgyUnrealQATaskRoom.ps1" @params
  } catch {
    $failedClosed = $true
    Assert-Contains $_.Exception.Message "No .uproject file found" "Should fail closed on missing .uproject"
  }
  Assert-Equals $failedClosed $true "Should throw an exception for missing uproject"
  Write-Output "Test Case 2 Passed!"

  # --- Test Case 3: Fail Closed on multiple .uproject ---
  Write-Output "Running Test Case 3: Multiple .uprojects..."
  $multiWorkspace = Join-Path $tempTestDir "multi-workspace"
  New-Item -ItemType Directory -Path $multiWorkspace -Force | Out-Null
  New-Item -ItemType File -Path (Join-Path $multiWorkspace "project1.uproject") -Force | Out-Null
  New-Item -ItemType File -Path (Join-Path $multiWorkspace "project2.uproject") -Force | Out-Null
  
  $failedClosed = $false
  try {
    $params = @{
      CompanyId = "comp-123"
      Title = "Test"
      Description = "Test"
      WorkspacePath = $multiWorkspace
      DryRun = $true
    }
    & "$scriptsRoot\Invoke-DirectAgyUnrealQATaskRoom.ps1" @params
  } catch {
    $failedClosed = $true
    Assert-Contains $_.Exception.Message "Multiple .uproject files found" "Should fail closed on ambiguous uproject files"
  }
  Assert-Equals $failedClosed $true "Should throw an exception for multiple uprojects"
  Write-Output "Test Case 3 Passed!"

  # --- Test Case 4: Safe Explicit Project File ---
  Write-Output "Running Test Case 4: Explicit project file path override..."
  $params = @{
    CompanyId = "comp-123"
    Title = "Explicit Test"
    Description = "Testing explicit uproject parameter"
    WorkspacePath = $multiWorkspace
    ProjectFile = (Join-Path $multiWorkspace "project1.uproject")
    DryRun = $true
  }
  $resExplicit = & "$scriptsRoot\Invoke-DirectAgyUnrealQATaskRoom.ps1" @params

  Assert-Equals $resExplicit.mode "dry-run" "Should return dry-run mode"
  Assert-Contains $resExplicit.runnerResult.promptContent "- Project File: project1.uproject" "Should reference explicit uproject file"
  Write-Output "Test Case 4 Passed!"

  # --- Test Case 5: Fail Closed on Project File Outside Workspace ---
  Write-Output "Running Test Case 5: Explicit project file outside workspace is rejected..."
  $outsideProjectFile = Join-Path $tempTestDir "project_outside.uproject"
  New-Item -ItemType File -Path $outsideProjectFile -Force | Out-Null
  
  $failedClosedOutside = $false
  try {
    $params = @{
      CompanyId = "comp-123"
      Title = "Outside Project Test"
      Description = "Testing outside uproject rejection"
      WorkspacePath = $multiWorkspace
      ProjectFile = $outsideProjectFile
      DryRun = $true
    }
    & "$scriptsRoot\Invoke-DirectAgyUnrealQATaskRoom.ps1" @params
  } catch {
    $failedClosedOutside = $true
    Assert-Contains $_.Exception.Message "outside the resolved workspace" "Should fail closed on project file outside workspace"
  }
  Assert-Equals $failedClosedOutside $true "Should throw an exception when project file is outside workspace"
  Write-Output "Test Case 5 Passed!"

  # --- Test Case 6: Substring-prefix path containment regression ---
  Write-Output "Running Test Case 6: Substring-prefix containment..."
  $gameWorkspace = Join-Path $tempTestDir "game"
  $gameOldWorkspace = Join-Path $tempTestDir "game-old"
  New-Item -ItemType Directory -Path $gameWorkspace -Force | Out-Null
  New-Item -ItemType Directory -Path $gameOldWorkspace -Force | Out-Null
  $uprojectInGameOld = Join-Path $gameOldWorkspace "project.uproject"
  New-Item -ItemType File -Path $uprojectInGameOld -Force | Out-Null

  $failedClosedPrefix = $false
  try {
    $params = @{
      CompanyId = "comp-123"
      Title = "Substring Prefix Test"
      Description = "Testing substring prefix rejection"
      WorkspacePath = $gameWorkspace
      ProjectFile = $uprojectInGameOld
      DryRun = $true
    }
    & "$scriptsRoot\Invoke-DirectAgyUnrealQATaskRoom.ps1" @params
  } catch {
    $failedClosedPrefix = $true
    Assert-Contains $_.Exception.Message "outside the resolved workspace" "Should fail closed when project file is in a directory that shares prefix but is outside workspace"
  }
  Assert-Equals $failedClosedPrefix $true "Should throw an exception for prefix mismatch"
  Write-Output "Test Case 6 Passed!"

  # --- Test Case 7: End-to-End Dry-Run and Prompt Assertions on actual Unreal Workspace ---
  Write-Output "Running Test Case 7: Dry-Run on actual Unreal Project workspace with prompt QA assertions..."
  
  # Discover Unreal project folder dynamically
  $unrealProjectsRoot = "C:\Users\young\Documents\Unreal Projects"
  $subdirs = Get-ChildItem -Path $unrealProjectsRoot -Directory
  $realWorkspace = $null
  foreach ($dir in $subdirs) {
    if ((Get-ChildItem -Path $dir.FullName -Filter *.uproject -File).Count -eq 1) {
      $realWorkspace = $dir.FullName
      break
    }
  }
  if (-not $realWorkspace) {
    throw "Could not dynamically discover the actual Unreal workspace containing exactly one .uproject file in $unrealProjectsRoot"
  }

  $expectedProjectFileName = (Get-ChildItem -Path $realWorkspace -Filter *.uproject -File)[0].Name

  $params = @{
    CompanyId = "comp-123"
    Title = "Unreal QA Task"
    Description = "Testing Unreal QA workflow dry-run"
    WorkspacePath = $realWorkspace
    DryRun = $true
  }
  $resReal = & "$scriptsRoot\Invoke-DirectAgyUnrealQATaskRoom.ps1" @params

  # General assertions
  Assert-Equals $resReal.mode "dry-run" "Mode must be dry-run"
  Assert-Equals $resReal.liveRunCount 0 "Live run count must be 0 for dry-run"
  Assert-Equals (Test-Path $resReal.runnerResult.promptPath) $true "Prompt file artifact must be written"

  $prompt = $resReal.runnerResult.promptContent

  # Assert role
  Assert-Contains $prompt "You are a direct local QA Worker" "Prompt must identify as QA Worker"

  # Assert scope
  Assert-Contains $prompt "- Scope: QA/Unreal" "Prompt must use QA/Unreal scope"
  Assert-Contains $prompt "- Project File: $expectedProjectFileName" "Prompt must reference the discovered project file"

  # Assert operating boundary
  Assert-Contains $prompt "inspect and report by default" "Prompt must state default operating boundary: inspect and report"
  Assert-Contains $prompt "do not edit gameplay code, Blueprints, assets, project settings, build, package, launch the editor, or run destructive commands unless the Task Room explicitly authorizes that exact action" "Prompt must state default operating boundary restrictions"

  # Assert Close Summary QA result details requested
  Assert-Contains $prompt "Test scope" "Prompt must request test scope in Close Summary"
  Assert-Contains $prompt "Reproducible steps or inspection basis" "Prompt must request reproducible steps in Close Summary"
  Assert-Contains $prompt "Expected versus actual behavior" "Prompt must request expected vs actual in Close Summary"
  Assert-Contains $prompt "Severity/risk" "Prompt must request severity/risk in Close Summary"
  Assert-Contains $prompt "Recommended next action" "Prompt must request recommended next action in Close Summary"
  Assert-Contains $prompt "Do not require or create a new game-project document by default" "Prompt must not require a new game-project document by default"

  Write-Output "Test Case 7 Passed!"

} finally {
  # Clean up temp folder
  if (Test-Path $tempTestDir) {
    Remove-Item -Path $tempTestDir -Recurse -Force -ErrorAction SilentlyContinue | Out-Null
  }
}

Write-Output "=== All Invoke-DirectAgyUnrealQATaskRoom.ps1 validation, dry-run, and QA prompt assertions passed successfully! ==="
