# BIOCore Windows Service Uninstaller (T25 - Sprint 4 Track A hardening)
#
# Usage (Administrator PowerShell):
#   .\scripts\uninstall-windows-service.ps1
#   .\scripts\uninstall-windows-service.ps1 -ServiceName "BioCoreProd"

[CmdletBinding()]
param(
  [string]$ServiceName = "BioCore",
  [switch]$KeepData
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command nssm -ErrorAction SilentlyContinue)) {
  Write-Error "nssm not found in PATH."
  exit 1
}

$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if (-not $existing) {
  Write-Warning "Service '$ServiceName' does not exist; nothing to uninstall."
  exit 0
}

Write-Host "Stopping service '$ServiceName'..." -ForegroundColor Cyan
nssm stop $ServiceName 2>$null | Out-Null

Write-Host "Removing service '$ServiceName'..." -ForegroundColor Cyan
nssm remove $ServiceName confirm

Write-Host ""
Write-Host "Service '$ServiceName' removed." -ForegroundColor Green
if (-not $KeepData) {
  Write-Host "Data/logs/crashes preserved (logs/, crashes/, data/)."
  Write-Host "To purge: manually delete those directories."
}
