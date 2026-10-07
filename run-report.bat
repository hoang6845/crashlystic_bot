@echo off
setlocal
cd /d "%~dp0"
echo ========================================== >> run-report.log
echo Start Time: %date% %time% >> run-report.log
echo Running report generation... >> run-report.log
node run-report.js >> run-report.log 2>&1
echo End Time: %date% %time%, Exit Code: %errorlevel% >> run-report.log
echo ========================================== >> run-report.log
endlocal
