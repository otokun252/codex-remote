param(
  [Parameter(Mandatory=$true)]
  [string]$PublicUrl,
  [string]$Token = "",
  [int]$PhonePort = 45214,
  [int]$CodexPort = 45213,
  [string]$Model = "gpt-5.4"
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$EnvPath = Join-Path $Root ".env"

function New-SecretToken {
  $bytes = New-Object byte[] 24
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($bytes)
  } finally {
    $rng.Dispose()
  }
  return [Convert]::ToBase64String($bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
}

if (-not $Token) {
  $Token = New-SecretToken
}

$normalizedUrl = $PublicUrl.Trim().TrimEnd("/")
if ($normalizedUrl -notmatch '^https://') {
  throw "PublicUrl must start with https://"
}

$existing = @{}
if (Test-Path $EnvPath) {
  Get-Content $EnvPath -Encoding UTF8 | ForEach-Object {
    if ($_ -match '^([A-Za-z_][A-Za-z0-9_]*)=(.*)$') {
      $existing[$Matches[1]] = $Matches[2]
    }
  }
}

$updates = [ordered]@{
  PHONE_PRODUCT_MODE = "1"
  PHONE_PUBLIC_TUNNEL = "0"
  PHONE_PUBLIC_URL = $normalizedUrl
  PHONE_TOKEN = $Token
  PHONE_UI_PORT = "$PhonePort"
  PHONE_BIND_HOST = "127.0.0.1"
  PHONE_AUTO_PORT = "1"
  CODEX_APP_SERVER_PORT = "$CodexPort"
  CODEX_MODEL = $Model
  CODEX_LAUNCH_MODE = "app-server"
}

foreach ($key in $updates.Keys) {
  $existing[$key] = $updates[$key]
}

$lines = @(
  "# Codex Remote local configuration"
  "# Do not commit this file."
  ""
)
foreach ($key in $updates.Keys) {
  $lines += "$key=$($existing[$key])"
}

$extraKeys = $existing.Keys | Where-Object { -not $updates.Contains($_) } | Sort-Object
if ($extraKeys.Count -gt 0) {
  $lines += ""
  foreach ($key in $extraKeys) {
    $lines += "$key=$($existing[$key])"
  }
}

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($EnvPath, ($lines -join "`n") + "`n", $utf8NoBom)

Write-Host "Fixed URL configuration saved to .env" -ForegroundColor Green
Write-Host "Public URL: $normalizedUrl"
Write-Host "Phone port: $PhonePort"
Write-Host "Next: npm run phone:supervise"
