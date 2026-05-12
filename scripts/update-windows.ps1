param(
  [switch]$SkipCheck
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $Root

Write-Host ""
Write-Host "Codex Remote update" -ForegroundColor Cyan
Write-Host "Repository: $Root"
Write-Host ""

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  throw "Git が見つかりません。GitHubから zip で入れた場合は、新しい zip をダウンロードして上書きしてください。"
}

if (-not (Test-Path ".git")) {
  throw "このフォルダは Git clone 版ではありません。GitHubから最新版を clone し直してください。"
}

Write-Host "Fetching latest changes..."
& git fetch --prune

$branch = (& git branch --show-current).Trim()
if (-not $branch) {
  throw "現在のブランチを確認できません。"
}

Write-Host "Updating branch: $branch"
& git pull --ff-only

Write-Host "Installing updated dependencies..."
if (Test-Path "package-lock.json") {
  & npm ci
} else {
  & npm install
}

if (-not $SkipCheck) {
  Write-Host "Running verification..."
  & npm run check
}

Write-Host ""
Write-Host "Update complete." -ForegroundColor Green
Write-Host "Start with: start.bat"
