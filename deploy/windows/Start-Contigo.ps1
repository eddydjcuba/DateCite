param(
  [string]$AppRoot = "C:\Contigo",
  [string]$EnvFile = "C:\Contigo\deploy\.env.production"
)

$ErrorActionPreference = "Stop"
Set-Location $AppRoot

if (Test-Path $EnvFile) {
  Get-Content $EnvFile | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#") -or -not $line.Contains("=")) {
      return
    }

    $parts = $line.Split("=", 2)
    [Environment]::SetEnvironmentVariable($parts[0].Trim(), $parts[1].Trim(), "Process")
  }
}

npm run start -w apps/api
