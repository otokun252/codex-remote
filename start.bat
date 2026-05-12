@echo off
setlocal
cd /d "%~dp0"

title Codex Remote Access
echo.
echo =========================================
echo   Codex Remote Access
echo =========================================
echo.
echo This window must stay open while using the phone app.
echo Please wait until the URL and QR code appear.
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found.
  echo Install the LTS version from https://nodejs.org/
  echo Then run this file again.
  goto end
)

where npm >nul 2>nul
if errorlevel 1 (
  echo npm was not found.
  echo Reinstall Node.js LTS from https://nodejs.org/
  echo Then run this file again.
  goto end
)

if not exist node_modules (
  echo First setup: installing packages...
  call npm install
  if errorlevel 1 goto failed
)

echo Preparing public tunnel...
call npm run setup:cloudflared
if errorlevel 1 goto failed

echo.
echo Starting Codex phone app...
echo When the URL appears, open it from your phone.
echo.
set PHONE_PUBLIC_TUNNEL=1
call npm run phone:tunnel
goto end

:failed
echo.
echo Startup failed. Please send a screenshot of this window.

:end
echo.
echo Press any key to close this window.
pause >nul
