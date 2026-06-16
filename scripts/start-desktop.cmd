@echo off
chcp 65001 >nul 2>&1
setlocal
REM Freer desktop launcher (Windows CMD)

cd /d "%~dp0.."

where node >nul 2>&1
if errorlevel 1 (
  echo [freer] ERROR: node not found. Switch to Node 20 first:
  echo   C:\envs\node\use-node-20.cmd
  set "ERR=1"
  goto :fail
)

where cargo >nul 2>&1
if errorlevel 1 (
  if exist "%USERPROFILE%\.cargo\bin\cargo.exe" (
    set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
  ) else (
    echo [freer] ERROR: cargo not found. Install Rust: winget install Rustlang.Rustup
    echo   https://rustup.rs/
    set "ERR=1"
    goto :fail
  )
)

node "%~dp0start.mjs" tauri %*
set "ERR=%ERRORLEVEL%"
if not "%ERR%"=="0" goto :fail
exit /b 0

:fail
echo.
echo [freer] Desktop launch failed, exit code %ERR%
echo Try from project root: pnpm start:desktop
pause
exit /b %ERR%
