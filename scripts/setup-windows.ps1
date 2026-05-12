param(
  [switch]$SkipCloudflared
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $Root

function Require-Command($Name, $InstallMessage) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "$Name was not found. $InstallMessage"
  }
}

Write-Host ""
Write-Host "Codex Remote Windows setup" -ForegroundColor Cyan
Write-Host "Repository: $Root"
Write-Host ""

Require-Command "node" "Install Node.js LTS from https://nodejs.org/."
Require-Command "npm" "Reinstall Node.js LTS from https://nodejs.org/."

$nodeVersion = (& node --version)
Write-Host "Node: $nodeVersion"

if (Test-Path "package-lock.json") {
  Write-Host "Installing dependencies with npm ci..."
  & npm ci
} else {
  Write-Host "Installing dependencies with npm install..."
  & npm install
}

if (-not $SkipCloudflared) {
  Write-Host "Preparing cloudflared for outside access..."
  & npm run setup:cloudflared
}

if (-not (Test-Path ".env") -and (Test-Path ".env.product.example")) {
  Copy-Item ".env.product.example" ".env.example.local" -Force
  Write-Host "Created .env.example.local as a local reference. Edit .env manually only when using a fixed domain."
}

Write-Host ""
Write-Host "Setup complete." -ForegroundColor Green
Write-Host "Start with: start.bat"
Write-Host "Optional memory: start-memory.bat"
Write-Host "Update later with: update.bat"
