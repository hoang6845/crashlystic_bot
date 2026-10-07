@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\schedule-task.ps1" -Action Register
if errorlevel 1 (pause & exit /b 1)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\schedule-task.ps1" -Action Run
pause
