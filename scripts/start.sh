#!/usr/bin/env bash
# Freer 开发启动：自动拉起 freer_api sidecar，就绪后启动前端。
# 用法:
#   ./scripts/start.sh          # Web 模式 (Vite, http://localhost:5173)
#   ./scripts/start.sh tauri    # Tauri 集成模式 (需 Rust)
#   FREER_API_PORT=17891 ./scripts/start.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

MODE="${1:-web}"
API_HOST="${FREER_API_HOST:-127.0.0.1}"
API_PORT="${FREER_API_PORT:-17890}"
HEALTH_URL="http://${API_HOST}:${API_PORT}/health"

PYTHON=""
for cmd in python3 python; do
  if command -v "$cmd" >/dev/null 2>&1; then
    PYTHON="$cmd"
    break
  fi
done
if [[ -z "$PYTHON" ]]; then
  echo "错误：未找到 python3 / python" >&2
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "错误：未找到 pnpm，请先安装 Node.js 与 pnpm" >&2
  exit 1
fi

API_PID=""
STARTED_API=false

cleanup() {
  if [[ "$STARTED_API" == true ]] && [[ -n "$API_PID" ]] && kill -0 "$API_PID" 2>/dev/null; then
    echo ""
    echo "正在停止 freer_api (pid ${API_PID})..."
    kill "$API_PID" 2>/dev/null || true
    wait "$API_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

api_healthy() {
  curl -sf "$HEALTH_URL" >/dev/null 2>&1
}

if api_healthy; then
  echo "freer_api 已在运行: ${HEALTH_URL}"
else
  echo "启动 freer_api (${API_HOST}:${API_PORT})..."
  "$PYTHON" -m freer_api &
  API_PID=$!
  STARTED_API=true

  ready=false
  for _ in $(seq 1 40); do
    if api_healthy; then
      ready=true
      break
    fi
    if ! kill -0 "$API_PID" 2>/dev/null; then
      echo "错误：freer_api 进程已退出，请检查依赖与日志" >&2
      exit 1
    fi
    sleep 0.25
  done

  if [[ "$ready" != true ]]; then
    echo "错误：等待 freer_api 就绪超时 (${HEALTH_URL})" >&2
    exit 1
  fi
  echo "freer_api 已就绪"
fi

case "$MODE" in
  tauri)
    echo "启动 Tauri 开发模式..."
    exec pnpm tauri:dev
    ;;
  web)
    echo "启动 Web 前端: http://localhost:5173"
    echo "API 代理: /api -> ${HEALTH_URL%/health}"
    exec pnpm dev
    ;;
  *)
    echo "未知模式: ${MODE}（可用: web | tauri）" >&2
    exit 1
    ;;
esac
