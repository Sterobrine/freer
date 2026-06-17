@echo off
chcp 65001 >nul 2>&1
setlocal
REM Freer dev launcher (Windows CMD)

cd /d "%~dp0.."

where node >nul 2>&1
if errorlevel 1 (
  echo [freer] ERROR: node not found. Switch to Node 20 first:
  echo   C:\envs\node\use-node-20.cmd
  goto :fail
)

node "%~dp0start.mjs" %*
set "ERR=%ERRORLEVEL%"
if not "%ERR%"=="0" goto :fail
exit /b 0

:fail
echo.
echo [freer] Failed with exit code %ERR%
echo Try from project root: pnpm start
pause
exit /b %ERR%
