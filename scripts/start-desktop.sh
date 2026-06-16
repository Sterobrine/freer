#!/usr/bin/env bash
# 兼容入口：转调跨平台 Node 脚本（Tauri 桌面模式）
exec node "$(cd "$(dirname "$0")" && pwd)/start.mjs" tauri "$@"
