@echo off
setlocal
REM Freer 开发启动 (Windows CMD)
REM 双击运行失败时会 pause，便于查看错误信息。

cd /d "%~dp0.."

where node >nul 2>&1
if errorlevel 1 (
  echo [freer] 错误：未找到 node，请先切换到 Node 20：
  echo   C:\envs\node\use-node-20.cmd
  goto :fail
)

echo [freer] 项目目录: %CD%
echo [freer] 启动中...（Web: http://localhost:5173  API: http://127.0.0.1:17890）
echo.

node "%~dp0start.mjs" %*
set "ERR=%ERRORLEVEL%"
if not "%ERR%"=="0" goto :fail
exit /b 0

:fail
echo.
echo [freer] 启动失败，错误码 %ERR%
echo 建议在项目根目录执行: pnpm start
pause
exit /b %ERR%
