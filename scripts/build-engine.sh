#!/usr/bin/env bash
# 打包 Python 引擎为 sidecar 可执行文件（Windows 目标请在 Windows 上运行）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

pip install pyinstaller
pyinstaller \
  --onefile \
  --name freer-engine \
  --paths "$ROOT" \
  --hidden-import=uvicorn \
  --hidden-import=fastapi \
  --hidden-import=cv2 \
  --collect-submodules recognition \
  freer_api/__main__.py

echo "输出: dist/freer-engine (或 freer-engine.exe)"
