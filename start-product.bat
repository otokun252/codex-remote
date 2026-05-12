@echo off
setlocal
cd /d "%~dp0"

title Codex Remote Product Bridge
echo.
echo =========================================
echo   Codex Remote Product Bridge
echo =========================================
echo.
echo This mode is for fixed URL / daily use.
echo The supervisor will restart the bridge if it stops.
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found.
  echo Install the LTS version from https://nodejs.org/
  goto end
)

if not exist .env (
  echo .env was not found.
  echo Configure a fixed URL first:
  echo powershell -NoProfile -ExecutionPolicy Bypass -File scripts\configure-fixed-url.ps1 -PublicUrl https://your-domain.example.com
  goto end
)

call npm run phone:supervise

:end
echo.
pause
