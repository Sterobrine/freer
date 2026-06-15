# Freer 开发启动 (Windows PowerShell)
# 用法:
#   .\scripts\start.ps1
#   .\scripts\start.ps1 -Mode tauri

param(
    [ValidateSet("web", "tauri")]
    [string]$Mode = "web"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

$ApiHost = if ($env:FREER_API_HOST) { $env:FREER_API_HOST } else { "127.0.0.1" }
$ApiPort = if ($env:FREER_API_PORT) { $env:FREER_API_PORT } else { "17890" }
$HealthUrl = "http://${ApiHost}:${ApiPort}/health"

$Python = $null
foreach ($cmd in @("python", "py")) {
    if (Get-Command $cmd -ErrorAction SilentlyContinue) {
        $Python = $cmd
        break
    }
}
if (-not $Python) {
    Write-Error "未找到 python"
}

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Write-Error "未找到 pnpm"
}

$ApiProcess = $null
$StartedApi = $false

function Test-ApiHealthy {
    try {
        $null = Invoke-WebRequest -Uri $HealthUrl -UseBasicParsing -TimeoutSec 2
        return $true
    } catch {
        return $false
    }
}

function Stop-Api {
    if ($StartedApi -and $ApiProcess -and -not $ApiProcess.HasExited) {
        Write-Host "正在停止 freer_api..."
        Stop-Process -Id $ApiProcess.Id -Force -ErrorAction SilentlyContinue
    }
}

if (Test-ApiHealthy) {
    Write-Host "freer_api 已在运行: $HealthUrl"
} else {
    Write-Host "启动 freer_api (${ApiHost}:${ApiPort})..."
    if ($Python -eq "py") {
        $ApiProcess = Start-Process -FilePath "py" -ArgumentList "-m", "freer_api" -PassThru -WindowStyle Hidden
    } else {
        $ApiProcess = Start-Process -FilePath "python" -ArgumentList "-m", "freer_api" -PassThru -WindowStyle Hidden
    }
    $StartedApi = $true

    $ready = $false
    for ($i = 0; $i -lt 40; $i++) {
        if (Test-ApiHealthy) {
            $ready = $true
            break
        }
        if ($ApiProcess.HasExited) {
            Write-Error "freer_api 进程已退出"
        }
        Start-Sleep -Milliseconds 250
    }
    if (-not $ready) {
        Stop-Api
        Write-Error "等待 freer_api 就绪超时"
    }
    Write-Host "freer_api 已就绪"
}

try {
    if ($Mode -eq "tauri") {
        Write-Host "启动 Tauri 开发模式..."
        pnpm tauri:dev
    } else {
        Write-Host "启动 Web 前端: http://localhost:5173"
        pnpm dev
    }
} finally {
    Stop-Api
}
