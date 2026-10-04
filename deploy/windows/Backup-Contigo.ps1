param(
  [string]$AppRoot = "C:\Contigo",
  [int]$KeepDays = 14
)

$ErrorActionPreference = "Stop"

$dataRoot = Join-Path $AppRoot "data"
$backupRoot = Join-Path $AppRoot "backups"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$target = Join-Path $backupRoot "contigo-$timestamp.zip"

New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null

if (-not (Test-Path $dataRoot)) {
  throw "No existe $dataRoot"
}

Compress-Archive -Path (Join-Path $dataRoot "*") -DestinationPath $target -Force

$cutoff = (Get-Date).AddDays(-$KeepDays)
Get-ChildItem $backupRoot -Filter "contigo-*.zip" |
  Where-Object { $_.LastWriteTime -lt $cutoff } |
  Remove-Item -Force

Write-Host "Backup creado: $target"
