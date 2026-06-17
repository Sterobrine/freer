@echo off
chcp 65001 >nul 2>&1
setlocal
REM Freer desktop package (Windows CMD)

cd /d "%~dp0.."

where node >nul 2>&1
if errorlevel 1 (
  echo [freer] ERROR: node not found
  set "ERR=1"
  goto :fail
)

where cargo >nul 2>&1
if errorlevel 1 (
  if exist "%USERPROFILE%\.cargo\bin\cargo.exe" (
    set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
  ) else (
    echo [freer] ERROR: cargo not found. Install Rust: winget install Rustlang.Rustup
    set "ERR=1"
    goto :fail
  )
)

node "%~dp0package.mjs" %*
set "ERR=%ERRORLEVEL%"
if not "%ERR%"=="0" goto :fail
exit /b 0

:fail
echo.
echo [freer] Package failed, exit code %ERR%
echo Try from project root: pnpm package
pause
exit /b %ERR%
