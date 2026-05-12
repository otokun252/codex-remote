@echo off
setlocal
cd /d "%~dp0"

title Codex Remote Memory
echo.
echo =========================================
echo   Codex Remote Memory
echo =========================================
echo.
echo This starts agentmemory on this PC.
echo Keep this window open while you want memory enabled.
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install Node.js LTS from https://nodejs.org/
  goto end
)

where npm >nul 2>nul
if errorlevel 1 (
  echo npm was not found. Reinstall Node.js LTS from https://nodejs.org/
  goto end
)

call npm run memory:start

:end
echo.
echo Press any key to close this window.
pause >nul

