# BIOCore Windows Service Installer (T25 - Sprint 4 Track A hardening)
# Uses NSSM (Non-Sucking Service Manager) to register BIOCore server as a Windows
# Service with auto-restart, log rotation, and runtime-guard env var injection.
#
# Dependencies:
#   - Node.js 20+ (default: C:\Program Files\nodejs\node.exe)
#   - NSSM (choco install nssm  or  https://nssm.cc/download)
#   - BIOCore built (pnpm -r build) into packages/server/dist/
#
# Usage (Administrator PowerShell):
#   .\scripts\install-windows-service.ps1
#   .\scripts\install-windows-service.ps1 -AppRoot "D:\biocore" -ServiceName "BioCoreProd"

[CmdletBinding()]
param(
  [string]$NodePath = "C:\Program Files\nodejs\node.exe",
  [string]$AppRoot = (Get-Item -Path $PSScriptRoot).Parent.FullName,
  [string]$ServiceName = "BioCore",
  [string]$NodeOptions = "--max-old-space-size=2048",
  [string]$OomThresholdMb = "auto",
  [int]$OomGraceSamples = 3,
  [int]$DiagnosticKeepLast = 50,
  [string]$NodeEnv = "production"
)

$ErrorActionPreference = "Stop"

# Pre-flight checks
if (-not (Get-Command nssm -ErrorAction SilentlyContinue)) {
  Write-Error "nssm not found in PATH. Install: choco install nssm  OR  https://nssm.cc/download"
  exit 1
}

if (-not (Test-Path $NodePath)) {
  Write-Error "Node.js not found at: $NodePath. Use -NodePath to specify location."
  exit 1
}

$EntryPoint = Join-Path $AppRoot "packages\server\dist\index.js"
if (-not (Test-Path $EntryPoint)) {
  Write-Error "BIOCore not built. Run first: cd $AppRoot ; pnpm -r build"
  exit 1
}

$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existing) {
  Write-Warning "Service '$ServiceName' already exists. Run uninstall-windows-service.ps1 first to recreate."
  exit 1
}

# Create runtime directories
$LogsDir = Join-Path $AppRoot "logs"
$CrashesDir = Join-Path $AppRoot "crashes"
$DataDir = Join-Path $AppRoot "data"
New-Item -ItemType Directory -Force -Path $LogsDir | Out-Null
New-Item -ItemType Directory -Force -Path $CrashesDir | Out-Null
New-Item -ItemType Directory -Force -Path $DataDir | Out-Null

# Install NSSM service
Write-Host "Installing service '$ServiceName'..." -ForegroundColor Cyan

nssm install $ServiceName $NodePath
nssm set $ServiceName AppParameters "`"$EntryPoint`""
nssm set $ServiceName AppDirectory $AppRoot

# Restart policy: auto-restart 5s after abnormal exit
nssm set $ServiceName AppExit Default Restart
nssm set $ServiceName AppRestartDelay 5000

# Log rotation: stdout + stderr to file, 50MB rotation
nssm set $ServiceName AppStdout (Join-Path $LogsDir "stdout.log")
nssm set $ServiceName AppStderr (Join-Path $LogsDir "stderr.log")
nssm set $ServiceName AppRotateFiles 1
nssm set $ServiceName AppRotateBytes 52428800
nssm set $ServiceName AppRotateOnline 1

# Environment variable injection (runtime-guard hardening)
nssm set $ServiceName AppEnvironmentExtra `
  "NODE_OPTIONS=$NodeOptions" `
  "BIOCORE_OOM_THRESHOLD_MB=$OomThresholdMb" `
  "BIOCORE_OOM_GRACE_SAMPLES=$OomGraceSamples" `
  "BIOCORE_DIAGNOSTIC_DUMP_DIR=$CrashesDir" `
  "BIOCORE_DIAGNOSTIC_KEEP_LAST=$DiagnosticKeepLast" `
  "NODE_ENV=$NodeEnv" `
  "DATA_DIR=$DataDir"

nssm start $ServiceName

Write-Host ""
Write-Host "Service '$ServiceName' installed and started." -ForegroundColor Green
Write-Host "  Logs:    $LogsDir\stdout.log, stderr.log"
Write-Host "  Crashes: $CrashesDir"
Write-Host "  Data:    $DataDir"
Write-Host ""
Write-Host "Management commands:"
Write-Host "  Status:    nssm status $ServiceName"
Write-Host "  Restart:   nssm restart $ServiceName"
Write-Host "  Stop:      nssm stop $ServiceName"
Write-Host "  Uninstall: .\scripts\uninstall-windows-service.ps1"
