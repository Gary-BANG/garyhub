@echo off
setlocal
chcp 65001 >nul
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Push-GitHub.ps1"
set "UPDATE_RESULT=%ERRORLEVEL%"
echo.
pause
exit /b %UPDATE_RESULT%
