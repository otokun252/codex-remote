param(
  [string]$TaskName = "CodexRemoteBridge",
  [string]$NodePath = "node"
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$Script = Join-Path $Root "scripts\start-product.js"
$LogDir = Join-Path $Root "tmp\startup"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$Action = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -Command `"Set-Location '$Root'; `$env:PHONE_PRODUCT_MODE='1'; & '$NodePath' '$Script' *> '$LogDir\bridge.log'`""
$Trigger = New-ScheduledTaskTrigger -AtLogOn
$Settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Days 7) `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Description "Starts the Codex Remote product bridge at Windows logon." -Force | Out-Null
Write-Output "Registered scheduled task: $TaskName"
