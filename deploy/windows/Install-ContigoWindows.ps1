param(
  [string]$AppRoot = "C:\Contigo",
  [string]$PublicHostname,
  [string]$DuckDnsToken = "",
  [string]$DuckDnsDomain = "",
  [string]$CaddyEmail = "admin@example.com",
  [string]$NssmPath = "C:\tools\nssm\nssm.exe",
  [string]$CaddyPath = "C:\tools\caddy\caddy.exe"
)

$ErrorActionPreference = "Stop"

if (-not $PublicHostname) {
  throw "Uso: .\Install-ContigoWindows.ps1 -PublicHostname contigo.duckdns.org"
}

if (-not (Test-Path $AppRoot)) {
  New-Item -ItemType Directory -Path $AppRoot | Out-Null
}

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Copy-Item -Path (Join-Path $RepoRoot "*") -Destination $AppRoot -Recurse -Force

Set-Location $AppRoot
npm install
npm run build -w apps/api
npm run build -w apps/web
New-Item -ItemType Directory -Path (Join-Path $AppRoot "data\logs") -Force | Out-Null

$envPath = Join-Path $AppRoot "deploy\.env.production"
if (-not (Test-Path $envPath)) {
  npm run setup:vps -- "https://$PublicHostname"
}

$webRoot = Join-Path $AppRoot "apps\web\dist"
$caddyRendered = Join-Path $AppRoot "deploy\Caddyfile.windows"
$caddyTemplate = Get-Content (Join-Path $AppRoot "deploy\Caddyfile") -Raw
$caddyTemplate = $caddyTemplate.Replace("{PUBLIC_HOSTNAME}", $PublicHostname)
$caddyTemplate = $caddyTemplate.Replace("{CADDY_EMAIL}", $CaddyEmail)
$caddyTemplate = $caddyTemplate.Replace("{API_PORT}", "4000")
$caddyTemplate = $caddyTemplate.Replace("{WEB_ROOT}", ($webRoot -replace "\\", "/"))
Set-Content -Path $caddyRendered -Value $caddyTemplate -Encoding UTF8

if ($DuckDnsToken -and $DuckDnsDomain) {
  $duckScript = Join-Path $AppRoot "deploy\windows\Update-DuckDns.ps1"
  $duckAction = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$duckScript`" -Domain `"$DuckDnsDomain`" -Token `"$DuckDnsToken`""
  $duckTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(2) -RepetitionInterval (New-TimeSpan -Minutes 5)
  Register-ScheduledTask -TaskName "Contigo DuckDNS Update" -Action $duckAction -Trigger $duckTrigger -Force | Out-Null
}

if (-not (Test-Path $NssmPath)) {
  throw "Falta NSSM en $NssmPath. Instala NSSM o pasa -NssmPath."
}

& $NssmPath install ContigoApi "powershell.exe" "-NoProfile -ExecutionPolicy Bypass -File `"$AppRoot\deploy\windows\Start-Contigo.ps1`" -AppRoot `"$AppRoot`""
& $NssmPath set ContigoApi AppDirectory $AppRoot
& $NssmPath set ContigoApi AppStdout "$AppRoot\data\logs\api.out.log"
& $NssmPath set ContigoApi AppStderr "$AppRoot\data\logs\api.err.log"
& $NssmPath set ContigoApi Start SERVICE_AUTO_START

if (Test-Path $CaddyPath) {
  & $NssmPath install ContigoCaddy $CaddyPath "run --config `"$caddyRendered`""
  & $NssmPath set ContigoCaddy AppDirectory $AppRoot
  & $NssmPath set ContigoCaddy Start SERVICE_AUTO_START
}

$backupScript = Join-Path $AppRoot "deploy\windows\Backup-Contigo.ps1"
$backupAction = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$backupScript`" -AppRoot `"$AppRoot`""
$backupTrigger = New-ScheduledTaskTrigger -Daily -At 3:15am
Register-ScheduledTask -TaskName "Contigo Daily Backup" -Action $backupAction -Trigger $backupTrigger -Force | Out-Null

New-NetFirewallRule -DisplayName "Contigo HTTP" -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow -ErrorAction SilentlyContinue | Out-Null
New-NetFirewallRule -DisplayName "Contigo HTTPS" -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow -ErrorAction SilentlyContinue | Out-Null

Start-Service ContigoApi
if (Get-Service ContigoCaddy -ErrorAction SilentlyContinue) {
  Start-Service ContigoCaddy
}

Write-Host "Contigo instalado en $AppRoot"
Write-Host "API: https://$PublicHostname/health"
Write-Host "Backups diarios: $AppRoot\backups"
