@echo off
setlocal
cd /d "%~dp0"

title Codex Remote Update
echo.
echo =========================================
echo   Codex Remote Update
echo =========================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File scripts\update-windows.ps1
if errorlevel 1 goto failed
goto end

:failed
echo.
echo Update failed. Please send a screenshot of this window.

:end
echo.
pause
