param(
  [Parameter(Mandatory = $true)][string]$Domain,
  [Parameter(Mandatory = $true)][string]$Token
)

$ErrorActionPreference = "Stop"
$uri = "https://www.duckdns.org/update?domains=$Domain&token=$Token&ip="
$response = Invoke-RestMethod -Uri $uri -TimeoutSec 20
if ($response -ne "OK") {
  throw "DuckDNS respondio: $response"
}

Write-Host "DuckDNS actualizado para $Domain"
