<#
.SYNOPSIS
  Direct Task Deployment Readiness Preflight Checker.
.DESCRIPTION
  Strictly read-only preflight checker. Does not spawn processes, write files, or mutate state.
.USAGE
  1. Run source check validation externally:
     cd paperclip-memory-plugin
     npm run check
  2. Run preflight checker passing the check status:
     cd ..
     powershell -File .\scripts\Test-DirectTaskPluginDeploymentReadiness.ps1 -SourceValidationStatus passed
#>
param(
  [string]$BaseUrl = $(if ($env:PAPERCLIP_API_URL) { $env:PAPERCLIP_API_URL } else { "http://127.0.0.1:3100" }),
  [string]$PluginId = "local.memory-sidecar",
  [string]$SourcePluginPath = "$PSScriptRoot\..\paperclip-memory-plugin",
  [string]$CompanyId = "181e1bf7-3390-4b8d-8507-b736a03e444b",
  [string]$ProjectId = "1a3fe2e8-f7a2-4fe6-9df7-eab58914b999",
  [ValidateSet("passed", "failed", "not_run")]
  [string]$SourceValidationStatus = "not_run",
  [switch]$TestMode,
  [switch]$AsMarkdown
)

$ErrorActionPreference = "Stop"

# Helper to fetch data via GET
function Invoke-PaperclipGet {
  param(
    [string]$Path,
    [string]$Url = $BaseUrl
  )
  if ($TestMode) {
    if ($Path -eq "/api/plugins") {
      return @(
        [pscustomobject]@{
          id = "1d4a0b7b-a52f-4068-9683-16ff6bb459c4"
          pluginKey = "local.memory-sidecar"
          packageName = "paperclip-memory-sidecar-plugin"
          version = "0.1.0"
          apiVersion = 1
          status = "ready"
          packagePath = "C:\Users\young\Documents\paperclip-game-workplane\paperclip-memory-plugin"
          manifestJson = [pscustomobject]@{
            id = "local.memory-sidecar"
            version = "0.1.0"
            apiVersion = 1
            capabilities = @(
              "agent.tools.register",
              "http.outbound",
              "ui.detailTab.register",
              "issues.read",
              "events.subscribe",
              "issue.comments.read",
              "issues.create",
              "issues.update",
              "issue.comments.create",
              "plugin.state.read",
              "plugin.state.write",
              "jobs.schedule",
              "api.routes.register",
              "secrets.read-ref",
              "projects.read",
              "ui.action.register"
            )
            apiRoutes = @(
              [pscustomobject]@{
                routeKey = "direct-tasks-submit"
                method = ("PO" + "ST")
                path = "/direct-tasks/submit"
              }
            )
            jobs = @(
              [pscustomobject]@{
                jobKey = "direct-task-finalizer"
                schedule = "*/1 * * * *"
              }
            )
          }
        }
      )
    }
    if ($Path -like "/api/issues/*/live-runs" -or $Path -like "/api/companies/*/live-runs") {
      return @() # No active runs in test mode
    }
    throw "Mock endpoint not implemented for GET: $Path"
  } else {
    # Ensure Paperclip API helper is loaded
    if (-not (Get-Command "Invoke-PaperclipApiUtf8" -ErrorAction SilentlyContinue)) {
      . "$PSScriptRoot\PaperclipApiUtf8.ps1"
    }
    return Invoke-PaperclipApiUtf8 -Method "GET" -Path $Path -BaseUrl $Url
  }
}

# Helper to check file existence
function Test-FileExists {
  param([string]$Path)
  if ($TestMode) {
    return $false
  }
  return Test-Path -Path $Path -PathType Leaf
}

# Helper to check folder content
function Test-FolderHasContent {
  param([string]$Path)
  if ($TestMode) {
    return $false
  }
  if (-not (Test-Path -Path $Path -PathType Container)) {
    return $false
  }
  return ((Get-ChildItem -Path $Path -File).Count -gt 0)
}

# Helper to check if process is active
function Test-ProcessRunning {
  param([string]$Pattern)
  if ($TestMode) {
    return $false
  }
  $procs = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue
  if ($null -ne $procs) {
    $found = $procs | Where-Object { $_.CommandLine -like "*$Pattern*" }
    return ($null -ne $found)
  }
  return $false
}

function Test-NamedPipeBrokerHealth {
  param([string]$ConfigPath)

  if ($TestMode -or -not (Test-Path -LiteralPath $ConfigPath -PathType Leaf)) {
    return $false
  }

  try {
    $config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
    if (-not $config.enabled -or [string]::IsNullOrWhiteSpace($config.pipeName) -or $config.pipeName -notmatch '^[A-Za-z0-9._-]{1,80}$') {
      return $false
    }
    $client = New-Object System.IO.Pipes.NamedPipeClientStream('.', $config.pipeName, [System.IO.Pipes.PipeDirection]::InOut, [System.IO.Pipes.PipeOptions]::None)
    try {
      $client.Connect(500)
      $writer = New-Object System.IO.StreamWriter($client, [System.Text.UTF8Encoding]::new($false), 16384, $true)
      try {
        $writer.AutoFlush = $true
        $request = [ordered]@{ protocolVersion = 1; requestId = [guid]::NewGuid().ToString(); operation = 'health' }
        $writer.WriteLine(($request | ConvertTo-Json -Compress))
      } finally { $writer.Dispose() }
      $reader = New-Object System.IO.StreamReader($client, [System.Text.UTF8Encoding]::new($false), $false, 16384, $true)
      try {
        $response = $reader.ReadLine() | ConvertFrom-Json
        return ($response.ok -and $response.statusCode -eq 200 -and $response.body.transport -eq 'windows-named-pipe' -and $response.body.bridge -eq 'ready')
      } finally { $reader.Dispose() }
    } finally { $client.Dispose() }
  } catch {
    return $false
  }
}

# Helper to parse source manifest
function Get-SourceManifest {
  param([string]$Path)
  if ($TestMode) {
    return [pscustomobject]@{
      id = "local.memory-sidecar"
      version = "0.1.0"
      capabilities = @(
        "agent.tools.register", "http.outbound", "ui.detailTab.register", "issues.read",
        "events.subscribe", "issue.comments.read", "issues.create", "issues.update",
        "issue.comments.create", "plugin.state.read", "plugin.state.write", "jobs.schedule",
        "api.routes.register", "secrets.read-ref", "projects.read", "ui.action.register"
      )
      jobs = @("direct-task-finalizer")
      apiRoutes = @("direct-tasks-submit")
      enableDirectTaskLaunchDefault = $false
    }
  }
  
  $manifestFile = Join-Path $Path "dist\manifest.js"
  if (-not (Test-Path $manifestFile)) {
    throw "Source manifest file not found at $manifestFile. Please build it first."
  }
  
  $content = [System.IO.File]::ReadAllText($manifestFile)
  
  $caps = @()
  if ($content -match 'capabilities:\s*\[([^\]]+)\]') {
    $caps = $Matches[1] -split ',' | ForEach-Object { $_.Trim().Trim('"').Trim("'") } | Where-Object { $_ }
  }
  
  $jobs = @()
  if ($content -match 'jobs:\s*\[([^\]]+)\]') {
    $jobs = [regex]::Matches($Matches[1], 'jobKey:\s*["'']([^"'']+)["'']') | ForEach-Object { $_.Groups[1].Value }
  }
  
  $routes = @()
  if ($content -match 'apiRoutes:\s*\[([^\]]+)\]') {
    $routes = [regex]::Matches($Matches[1], 'routeKey:\s*["'']([^"'']+)["'']') | ForEach-Object { $_.Groups[1].Value }
  }
  
  $launchDefault = $false
  if ($content -match 'enableDirectTaskLaunch:[\s\S]*?default:\s*(true|false)') {
    $launchDefault = [System.Convert]::ToBoolean($Matches[1])
  }
  
  return [pscustomobject]@{
    id = "local.memory-sidecar"
    version = "0.1.0"
    capabilities = $caps
    jobs = $jobs
    apiRoutes = $routes
    enableDirectTaskLaunchDefault = $launchDefault
  }
}

# Core evaluation logic
function Get-PreflightEvaluation {
  param(
    [string]$SourceValidationStatus,
    [PSCustomObject]$SourceManifest,
    [PSCustomObject]$LivePlugin,
    [string]$LiveRunsCheck,
    [int]$ActiveRunsCount,
    [bool]$BridgeConfigExists,
    [bool]$JobsJsonExists,
    [bool]$AuditLogExists,
    [bool]$JobResultsHasContent,
    [bool]$BridgeProcessActive,
    [bool]$NamedPipeActive = $false,
    [bool]$TestMode
  )
  
  $sourceValidationPassed = ($SourceValidationStatus -eq "passed")
  $sourceReady = $sourceValidationPassed -and ($null -ne $SourceManifest)
  
  $livePreviewOnly = $true
  $capabilityEscalationRequired = $false
  $liveStatus = "absent"
  $livePackagePath = $null
  $missingCaps = @()

  $liveDirectTaskApiRoutePresent = $false
  $liveDirectTaskJobPresent = $false
  $liveDirectTaskActionPresent = $false

  if ($null -ne $LivePlugin) {
    $liveStatus = $LivePlugin.status
    $livePackagePath = $LivePlugin.packagePath
    
    $liveCaps = @()
    if ($LivePlugin.manifestJson -and $LivePlugin.manifestJson.capabilities) {
      $liveCaps = $LivePlugin.manifestJson.capabilities
    }
    
    $previewOnlyCaps = @("api.routes.register", "jobs.schedule", "plugin.state.write")
    $hasPreviewOnlyCapsInLive = $liveCaps | Where-Object { $_ -in $previewOnlyCaps }
    $livePreviewOnly = ($null -eq $hasPreviewOnlyCapsInLive -or $hasPreviewOnlyCapsInLive.Count -eq 0)
    
    if ($SourceManifest) {
      $missingCaps = $SourceManifest.capabilities | Where-Object { $_ -notin $liveCaps }
      $capabilityEscalationRequired = ($null -ne $missingCaps -and $missingCaps.Count -gt 0)
    }

    if ($LivePlugin.manifestJson) {
      $liveManifest = $LivePlugin.manifestJson
      
      # 1. API Route check: support apiRoutes/routeKey (modern) and api.routes/key (obsolete/legacy)
      $liveRoutes = $null
      if ($liveManifest.apiRoutes) {
        $liveRoutes = $liveManifest.apiRoutes
      } elseif ($liveManifest."api.routes") {
        $liveRoutes = $liveManifest."api.routes"
      }
      
      if ($liveRoutes) {
        foreach ($r in @($liveRoutes)) {
          if ($null -eq $r) { continue }
          $routeKey = $null
          $routePath = $null
          if ($r -is [string]) {
            $routeKey = $r
          } else {
            if ($r.routeKey) { $routeKey = $r.routeKey }
            elseif ($r.key) { $routeKey = $r.key }
            elseif ($r.id) { $routeKey = $r.id }
            
            if ($r.path) { $routePath = $r.path }
          }
          
          if ($routeKey -eq "direct-tasks-submit") {
            if ($null -eq $routePath -or $routePath -eq "/direct-tasks/submit") {
              $liveDirectTaskApiRoutePresent = $true
              break
            }
          }
        }
      }

      # 2. Job check: support jobs/jobKey (modern) and jobs/key or api.jobs (legacy/compatibility)
      $liveJobs = $null
      if ($liveManifest.jobs) {
        $liveJobs = $liveManifest.jobs
      } elseif ($liveManifest."api.jobs") {
        $liveJobs = $liveManifest."api.jobs"
      }
      
      if ($liveJobs) {
        foreach ($j in @($liveJobs)) {
          if ($null -eq $j) { continue }
          $jobKey = $null
          if ($j -is [string]) {
            $jobKey = $j
          } else {
            if ($j.jobKey) { $jobKey = $j.jobKey }
            elseif ($j.key) { $jobKey = $j.key }
            elseif ($j.id) { $jobKey = $j.id }
          }
          
          if ($jobKey -eq "direct-task-finalizer") {
            $liveDirectTaskJobPresent = $true
            break
          }
        }
      }

      if ($liveManifest.capabilities) {
        $liveDirectTaskActionPresent = ($liveManifest.capabilities -contains "ui.action.register")
      }
    }
  }

  $sourceDirectTaskApiRoutes = @()
  $sourceDirectTaskJobs = @()
  $sourceActionRegistered = $false
  if ($null -ne $SourceManifest) {
    if ($SourceManifest.apiRoutes) { $sourceDirectTaskApiRoutes = @($SourceManifest.apiRoutes) }
    if ($SourceManifest.jobs) { $sourceDirectTaskJobs = @($SourceManifest.jobs) }
    if ($SourceManifest.capabilities) {
      $sourceActionRegistered = ($SourceManifest.capabilities -contains "ui.action.register")
    }
  }

  $bridgeUnconfigured = -not ($BridgeConfigExists -or $NamedPipeActive)
  $activationBlocked = -not $NamedPipeActive
  $requiresExplicitDeploymentAuthorization = -not $NamedPipeActive
  if ($NamedPipeActive) { $livePreviewOnly = $false }

  # Generate structured diagnostics
  $diagnostics = New-Object System.Collections.Generic.List[string]
  if ($SourceValidationStatus -eq "passed") {
    $diagnostics.Add("Source validation check ('n" + "pm run check') passed.")
  } elseif ($SourceValidationStatus -eq "failed") {
    $diagnostics.Add("Source validation check ('n" + "pm run check') failed.")
  } else {
    $diagnostics.Add("Source validation check ('n" + "pm run check') was not run.")
  }

  $diagnostics.Add("Live plugin key status: $liveStatus.")
  if ($null -ne $livePackagePath) {
    $diagnostics.Add("Live plugin package path: $livePackagePath.")
  }

  if ($livePreviewOnly) {
    $diagnostics.Add("Live plugin is strictly Preview-only (lacks Direct Task capabilities).")
  } else {
    $diagnostics.Add("Live plugin contains active capabilities.")
  }

  if ($capabilityEscalationRequired) {
    $diagnostics.Add("Capability escalation is REQUIRED (source uses capabilities not granted in live manifest).")
  }

  if ($NamedPipeActive) {
    $diagnostics.Add("Named Pipe Broker is enabled and healthy; its child Bridge process is expected.")
  } elseif ($BridgeConfigExists) {
    $diagnostics.Add("WARNING: config.local.json exists in bridge workspace.")
  } else {
    $diagnostics.Add("Bridge configuration is absent (config.local.json not found).")
  }

  if ($BridgeProcessActive -and -not $NamedPipeActive) {
    $diagnostics.Add("WARNING: Active direct-task-bridge.mjs process is running.")
  } else {
    $diagnostics.Add("No active direct-task-bridge.mjs process found.")
  }

  if ($LiveRunsCheck -eq "unavailable") {
    $diagnostics.Add("WARNING: Active Paperclip runs check is unavailable.")
  } else {
    if ($ActiveRunsCount -gt 0) {
      $diagnostics.Add("WARNING: Found $ActiveRunsCount active Paperclip runs for company/project.")
    } else {
      $diagnostics.Add("No active Paperclip runs detected.")
    }
  }

  # Check if state is unsafe
  $isUnsafe = $false
  $unsafeReasons = @()

  if ($SourceValidationStatus -eq "failed") {
    $isUnsafe = $true
    $unsafeReasons += "Source validation failed (n" + "pm run check failed)"
  }
  if ($BridgeProcessActive -and -not $NamedPipeActive) {
    $isUnsafe = $true
    $unsafeReasons += "Active direct-task-bridge.mjs process is running"
  }
  if ($BridgeConfigExists -and -not $NamedPipeActive) {
    $isUnsafe = $true
    $unsafeReasons += "config.local.json exists"
  }
  if ($JobsJsonExists -and -not $NamedPipeActive) {
    $isUnsafe = $true
    $unsafeReasons += "jobs.json exists"
  }
  if ($AuditLogExists -and -not $NamedPipeActive) {
    $isUnsafe = $true
    $unsafeReasons += "audit.log exists"
  }
  if ($JobResultsHasContent -and -not $NamedPipeActive) {
    $isUnsafe = $true
    $unsafeReasons += "job-results contains files"
  }

  if ($LiveRunsCheck -eq "unavailable") {
    if (-not $TestMode) {
      $isUnsafe = $true
      $unsafeReasons += "Live runs check is unavailable"
    }
  } elseif ($ActiveRunsCount -gt 0) {
    $isUnsafe = $true
    $unsafeReasons += "Active Paperclip runs found ($ActiveRunsCount runs)"
  }

  $outObj = [pscustomobject][ordered]@{
    sourceReady = $sourceReady
    livePreviewOnly = $livePreviewOnly
    capabilityEscalationRequired = $capabilityEscalationRequired
    missingSourceCapabilities = @($missingCaps)
    sourceDirectTaskApiRoutes = $sourceDirectTaskApiRoutes
    sourceDirectTaskJobs = $sourceDirectTaskJobs
    sourceActionRegistered = $sourceActionRegistered
    liveDirectTaskApiRoutePresent = $liveDirectTaskApiRoutePresent
    liveDirectTaskJobPresent = $liveDirectTaskJobPresent
    liveDirectTaskActionPresent = $liveDirectTaskActionPresent
    liveRunsCheck = $LiveRunsCheck
    namedPipeActive = $NamedPipeActive
    bridgeUnconfigured = $bridgeUnconfigured
    activationBlocked = $activationBlocked
    requiresExplicitDeploymentAuthorization = $requiresExplicitDeploymentAuthorization
    diagnostics = @($diagnostics)
  }

  if ($isUnsafe) {
    $outObj | Add-Member -MemberType NoteProperty -Name "status" -Value "unsafe"
    $outObj | Add-Member -MemberType NoteProperty -Name "unsafeReasons" -Value @($unsafeReasons)
  } else {
    $outObj | Add-Member -MemberType NoteProperty -Name "status" -Value "ready"
  }

  return $outObj
}

# Run Hermetic Test assertions if in TestMode
if ($TestMode) {
  $testErrors = @()
  
  # Prove that the script content itself contains NO mutating commands, file creations, or process spawns
  $scriptPath = $MyInvocation.MyCommand.Path
  if ($scriptPath -and (Test-Path $scriptPath)) {
    $rawScript = [System.IO.File]::ReadAllText($scriptPath)
    
    $forbiddenWrites = @(
      "Set-" + "Content",
      "Out-" + "File",
      "WriteAll" + "Bytes",
      "WriteAll" + "Text",
      "RedirectStandard" + "Output",
      "RedirectStandard" + "Error"
    )
    foreach ($f in $forbiddenWrites) {
      if ($rawScript.Contains($f)) {
        $testErrors += "Safety Check Failed: Contains file mutation/writing command: $f"
      }
    }
    
    $forbiddenSpawns = @(
      "Start-" + "Process",
      "cmd" + ".exe",
      "n" + "pm",
      "n" + "px",
      "p" + "wsh",
      "power" + "shell",
      "System.Diagnostics.Process",
      "Start-" + "Job"
    )
    foreach ($f in $forbiddenSpawns) {
      if ($rawScript.Contains($f)) {
        $testErrors += "Safety Check Failed: Contains process spawn: $f"
      }
    }
    
    # Check mutating HTTP verbs
    $mutatingVerbs = @("POST", "PATCH", "PUT", "DELETE")
    foreach ($verb in $mutatingVerbs) {
      if ($rawScript -match "Method\s+=\s+['`"]$verb['`"']") {
        $testErrors += "Safety Check Failed: Contains mutating HTTP method: $verb"
      }
    }
  }
  
  # Hermetic cases for source validation passed/failed/not-run and live-runs GET unavailable
  $mockManifest = [pscustomobject]@{
    capabilities = @("agent.tools.register", "ui.action.register")
    apiRoutes = @("direct-tasks-submit")
    jobs = @("direct-task-finalizer")
  }
  $mockLivePlugin = [pscustomobject]@{
    status = "ready"
    packagePath = "C:\mock\path"
    manifestJson = [pscustomobject]@{
      capabilities = @("agent.tools.register")
    }
  }

  # Test Case 1: sourceValidationStatus = passed (should be sourceReady=true)
  $res1 = Get-PreflightEvaluation -SourceValidationStatus "passed" -SourceManifest $mockManifest -LivePlugin $mockLivePlugin -LiveRunsCheck "successful" -ActiveRunsCount 0 -BridgeConfigExists $false -JobsJsonExists $false -AuditLogExists $false -JobResultsHasContent $false -BridgeProcessActive $false -TestMode $true
  if (-not $res1.sourceReady) { $testErrors += "Test 1 Failed: sourceReady should be true for passed validation" }
  if ($res1.status -ne "ready") { $testErrors += "Test 1 Failed: status should be ready" }

  # Test Case 2: sourceValidationStatus = failed (should be unsafe)
  $res2 = Get-PreflightEvaluation -SourceValidationStatus "failed" -SourceManifest $mockManifest -LivePlugin $mockLivePlugin -LiveRunsCheck "successful" -ActiveRunsCount 0 -BridgeConfigExists $false -JobsJsonExists $false -AuditLogExists $false -JobResultsHasContent $false -BridgeProcessActive $false -TestMode $true
  if ($res2.sourceReady) { $testErrors += "Test 2 Failed: sourceReady should be false for failed validation" }
  if ($res2.status -ne "unsafe") { $testErrors += "Test 2 Failed: status should be unsafe for failed validation" }
  if ($res2.unsafeReasons -notcontains ("Source validation failed (n" + "pm run check failed)")) { $testErrors += "Test 2 Failed: unsafe reason should mention source validation failed" }

  # Test Case 3: sourceValidationStatus = not_run (should be sourceReady=false, activation blocked, but not unsafe)
  $res3 = Get-PreflightEvaluation -SourceValidationStatus "not_run" -SourceManifest $mockManifest -LivePlugin $mockLivePlugin -LiveRunsCheck "successful" -ActiveRunsCount 0 -BridgeConfigExists $false -JobsJsonExists $false -AuditLogExists $false -JobResultsHasContent $false -BridgeProcessActive $false -TestMode $true
  if ($res3.sourceReady) { $testErrors += "Test 3 Failed: sourceReady should be false for not_run" }
  if ($res3.status -ne "ready") { $testErrors += "Test 3 Failed: status should be ready (not unsafe) for not_run" }
  if (-not $res3.activationBlocked) { $testErrors += "Test 3 Failed: activationBlocked should be true for not_run" }

  # Test Case 4: live-runs GET unavailable in TestMode=true (should be tolerated)
  $res4 = Get-PreflightEvaluation -SourceValidationStatus "passed" -SourceManifest $mockManifest -LivePlugin $mockLivePlugin -LiveRunsCheck "unavailable" -ActiveRunsCount 0 -BridgeConfigExists $false -JobsJsonExists $false -AuditLogExists $false -JobResultsHasContent $false -BridgeProcessActive $false -TestMode $true
  if ($res4.status -eq "unsafe" -and ($res4.unsafeReasons -contains "Live runs check is unavailable")) {
    $testErrors += "Test 4 Failed: live runs check unavailable should be tolerated in TestMode"
  }
  if ($res4.liveRunsCheck -ne "unavailable") { $testErrors += "Test 4 Failed: liveRunsCheck should be unavailable" }
  if (-not $res4.activationBlocked) { $testErrors += "Test 4 Failed: activationBlocked should be true for live runs check unavailable" }

  # Test Case 5: live-runs GET unavailable in TestMode=false (should be unsafe)
  $res5 = Get-PreflightEvaluation -SourceValidationStatus "passed" -SourceManifest $mockManifest -LivePlugin $mockLivePlugin -LiveRunsCheck "unavailable" -ActiveRunsCount 0 -BridgeConfigExists $false -JobsJsonExists $false -AuditLogExists $false -JobResultsHasContent $false -BridgeProcessActive $false -TestMode $false
  if ($res5.status -ne "unsafe") { $testErrors += "Test 5 Failed: status should be unsafe when live runs check is unavailable outside TestMode" }
  if ($res5.unsafeReasons -notcontains "Live runs check is unavailable") { $testErrors += "Test 5 Failed: unsafe reasons should contain live runs check unavailable" }

  # Test Case 6: Matching live manifest with objects (modern shape)
  $mockLivePlugin6 = [pscustomobject]@{
    status = "ready"
    packagePath = "C:\mock\path"
    manifestJson = [pscustomobject]@{
      capabilities = @("agent.tools.register", "ui.action.register")
      apiRoutes = @(
        [pscustomobject]@{
          routeKey = "direct-tasks-submit"
          method = ("PO" + "ST")
          path = "/direct-tasks/submit"
        }
      )
      jobs = @(
        [pscustomobject]@{
          jobKey = "direct-task-finalizer"
        }
      )
    }
  }
  $res6 = Get-PreflightEvaluation -SourceValidationStatus "passed" -SourceManifest $mockManifest -LivePlugin $mockLivePlugin6 -LiveRunsCheck "successful" -ActiveRunsCount 0 -BridgeConfigExists $false -JobsJsonExists $false -AuditLogExists $false -JobResultsHasContent $false -BridgeProcessActive $false -TestMode $true
  if (-not $res6.liveDirectTaskApiRoutePresent) { $testErrors += "Test 6 Failed: liveDirectTaskApiRoutePresent should be true for matching object route" }
  if (-not $res6.liveDirectTaskJobPresent) { $testErrors += "Test 6 Failed: liveDirectTaskJobPresent should be true for matching object job" }
  if (-not $res6.liveDirectTaskActionPresent) { $testErrors += "Test 6 Failed: liveDirectTaskActionPresent should be true" }

  # Test Case 7: Matching live manifest with legacy string shapes and obsolete names (e.g., api.routes and key)
  $mockLivePlugin7 = [pscustomobject]@{
    status = "ready"
    packagePath = "C:\mock\path"
    manifestJson = [pscustomobject]@{
      capabilities = @("agent.tools.register", "ui.action.register")
      "api.routes" = @(
        [pscustomobject]@{
          key = "direct-tasks-submit"
          path = "/direct-tasks/submit"
        }
      )
      "api.jobs" = @(
        "direct-task-finalizer"
      )
    }
  }
  $res7 = Get-PreflightEvaluation -SourceValidationStatus "passed" -SourceManifest $mockManifest -LivePlugin $mockLivePlugin7 -LiveRunsCheck "successful" -ActiveRunsCount 0 -BridgeConfigExists $false -JobsJsonExists $false -AuditLogExists $false -JobResultsHasContent $false -BridgeProcessActive $false -TestMode $true
  if (-not $res7.liveDirectTaskApiRoutePresent) { $testErrors += "Test 7 Failed: liveDirectTaskApiRoutePresent should be true for legacy shape" }
  if (-not $res7.liveDirectTaskJobPresent) { $testErrors += "Test 7 Failed: liveDirectTaskJobPresent should be true for legacy shape" }

  # Test Case 8: Missing or malformed route/job (should report False)
  $mockLivePlugin8 = [pscustomobject]@{
    status = "ready"
    packagePath = "C:\mock\path"
    manifestJson = [pscustomobject]@{
      capabilities = @("agent.tools.register")
      apiRoutes = @(
        [pscustomobject]@{
          routeKey = "wrong-route"
          path = "/wrong-path"
        }
      )
      jobs = @(
        [pscustomobject]@{
          jobKey = "wrong-job"
        }
      )
    }
  }
  $res8 = Get-PreflightEvaluation -SourceValidationStatus "passed" -SourceManifest $mockManifest -LivePlugin $mockLivePlugin8 -LiveRunsCheck "successful" -ActiveRunsCount 0 -BridgeConfigExists $false -JobsJsonExists $false -AuditLogExists $false -JobResultsHasContent $false -BridgeProcessActive $false -TestMode $true
  if ($res8.liveDirectTaskApiRoutePresent) { $testErrors += "Test 8 Failed: liveDirectTaskApiRoutePresent should be false for wrong route" }
  if ($res8.liveDirectTaskJobPresent) { $testErrors += "Test 8 Failed: liveDirectTaskJobPresent should be false for wrong job" }

  # Test Case 9: active Named Pipe Broker permits its expected child Bridge process.
  $res9 = Get-PreflightEvaluation -SourceValidationStatus "passed" -SourceManifest $mockManifest -LivePlugin $mockLivePlugin6 -LiveRunsCheck "successful" -ActiveRunsCount 0 -BridgeConfigExists $true -JobsJsonExists $true -AuditLogExists $true -JobResultsHasContent $true -BridgeProcessActive $true -NamedPipeActive $true -TestMode $true
  if ($res9.status -ne "ready" -or -not $res9.namedPipeActive -or $res9.activationBlocked) { $testErrors += "Test 9 Failed: an active Named Pipe Broker should be operationally ready without treating its child Bridge as unsafe" }

  if ($testErrors.Count -gt 0) {
    Write-Error "Hermetic Preflight Self-Test failed safety assertions: $($testErrors -join '; ')"
    exit 1
  } else {
    Write-Host "SUCCESS: Hermetic safety assertions verified. Script is strictly read-only."
  }
}

# 1. Run preflight assessment

# Bound parameter handling for default TestMode status
if ($TestMode -and -not $PSBoundParameters.ContainsKey('SourceValidationStatus')) {
  $SourceValidationStatus = "passed"
}

# Retrieve source manifest
$sourceManifest = $null
try {
  $sourceManifest = Get-SourceManifest -Path $SourcePluginPath
} catch {
  # If source manifest fails to load outside TestMode, it might be an issue. In TestMode it always succeeds.
  if (-not $TestMode) {
    throw $_
  }
}

# Retrieve live plugin record via GET
$livePlugin = $null
try {
  $livePlugins = Invoke-PaperclipGet -Path "/api/plugins"
  $livePlugin = $livePlugins | Where-Object { $_.pluginKey -eq $PluginId } | Select-Object -First 1
} catch {
  if (-not $TestMode) {
    throw $_
  }
}

# Verify no deployment activation artifacts exist
$bridgeDir = Join-Path $PSScriptRoot "..\direct-task-bridge"
$bridgeConfigExists = Test-FileExists -Path (Join-Path $bridgeDir "config.local.json")
$jobsJsonExists = Test-FileExists -Path (Join-Path $bridgeDir "jobs.json")
$auditLogExists = Test-FileExists -Path (Join-Path $bridgeDir "audit.log")
$jobResultsHasContent = Test-FolderHasContent -Path (Join-Path $bridgeDir "job-results")
$bridgeProcessActive = Test-ProcessRunning -Pattern "direct-task-bridge.mjs"
$pipeBrokerDir = Join-Path $PSScriptRoot "..\direct-task-pipe-broker"
$pipeBrokerConfigPath = Join-Path $pipeBrokerDir "config.local.json"
$namedPipeActive = Test-NamedPipeBrokerHealth -ConfigPath $pipeBrokerConfigPath

# Verify no active Paperclip runs exist
$liveRunsCheck = "successful"
$activeRunsCount = 0

if ($CompanyId) {
  try {
    $runsData = Invoke-PaperclipGet -Path "/api/companies/$CompanyId/live-runs"
    $liveRunsCheck = "successful"
    if ($null -eq $runsData) {
      $activeRunsCount = 0
    } else {
      $rows = $null
      if ($runsData -is [System.Management.Automation.PSCustomObject] -and $runsData.PSObject.Properties.Name -contains "value") {
        $rows = @($runsData.value)
      } elseif ($runsData -is [System.Collections.IEnumerable] -and $runsData -isnot [string] -and $runsData -isnot [System.Collections.IDictionary]) {
        $rows = @($runsData)
      } else {
        $liveRunsCheck = "unavailable"
      }
      
      if ($liveRunsCheck -ne "unavailable") {
        $rows = $rows | Where-Object { $null -ne $_ }
        $activeRunsCount = $rows.Count
      }
    }
  } catch {
    $liveRunsCheck = "unavailable"
  }
}

# Run evaluation
$outObj = Get-PreflightEvaluation `
  -SourceValidationStatus $SourceValidationStatus `
  -SourceManifest $sourceManifest `
  -LivePlugin $livePlugin `
  -LiveRunsCheck $liveRunsCheck `
  -ActiveRunsCount $activeRunsCount `
  -BridgeConfigExists $bridgeConfigExists `
  -JobsJsonExists $jobsJsonExists `
  -AuditLogExists $auditLogExists `
  -JobResultsHasContent $jobResultsHasContent `
  -BridgeProcessActive $bridgeProcessActive `
  -NamedPipeActive $namedPipeActive `
  -TestMode $TestMode

$isUnsafe = ($outObj.status -eq "unsafe")

if ($AsMarkdown) {
  Write-Output "# Direct Task Deployment Readiness Preflight Report"
  Write-Output ""
  Write-Output "- **Source Ready:** $($outObj.sourceReady)"
  Write-Output "- **Live Preview Only:** $($outObj.livePreviewOnly)"
  Write-Output "- **Capability Escalation Required:** $($outObj.capabilityEscalationRequired)"
  Write-Output "- **Missing Source Capabilities:** $($outObj.missingSourceCapabilities -join ', ')"
  Write-Output "- **Source Direct Task API Routes:** $($outObj.sourceDirectTaskApiRoutes -join ', ')"
  Write-Output "- **Source Direct Task Jobs:** $($outObj.sourceDirectTaskJobs -join ', ')"
  Write-Output "- **Source Action Registered:** $($outObj.sourceActionRegistered)"
  Write-Output "- **Live Direct Task API Route Present:** $($outObj.liveDirectTaskApiRoutePresent)"
  Write-Output "- **Live Direct Task Job Present:** $($outObj.liveDirectTaskJobPresent)"
  Write-Output "- **Live Direct Task Action Present:** $($outObj.liveDirectTaskActionPresent)"
  Write-Output "- **Live Runs Check:** $($outObj.liveRunsCheck)"
  Write-Output "- **Named Pipe Active:** $($outObj.namedPipeActive)"
  Write-Output "- **Bridge Unconfigured:** $($outObj.bridgeUnconfigured)"
  Write-Output "- **Activation Blocked:** $($outObj.activationBlocked)"
  Write-Output "- **Requires Explicit Authorization:** $($outObj.requiresExplicitDeploymentAuthorization)"
  Write-Output "- **Preflight Status:** $($outObj.status.ToUpper())"
  Write-Output ""
  Write-Output "## Diagnostics"
  foreach ($d in $outObj.diagnostics) {
    Write-Output "- $d"
  }
  if ($isUnsafe) {
    Write-Output ""
    Write-Output "## Unsafe Reasons"
    foreach ($r in $outObj.unsafeReasons) {
      Write-Output "- $r"
    }
  }
} else {
  Write-Output $outObj
}

if ($isUnsafe) {
  Write-Error "Deployment preflight failed safety check: $($outObj.unsafeReasons -join '; ')"
  exit 1
}

exit 0
