@echo off
setlocal
cd /d "%~dp0"

title Codex Remote Setup
echo.
echo =========================================
echo   Codex Remote Setup
echo =========================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File scripts\setup-windows.ps1
if errorlevel 1 goto failed
goto end

:failed
echo.
echo Setup failed. Please send a screenshot of this window.

:end
echo.
pause
