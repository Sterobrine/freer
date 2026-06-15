#!/usr/bin/env node
/**
 * Freer 开发启动（跨平台：Windows / macOS / Linux）
 *
 * 用法:
 *   node scripts/start.mjs          # Web 模式
 *   node scripts/start.mjs tauri    # Tauri 模式
 *   pnpm start
 */

import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODE = process.argv[2] || 'web';
const API_HOST = process.env.FREER_API_HOST || '127.0.0.1';
const API_PORT = process.env.FREER_API_PORT || '17890';
const HEALTH_URL = `http://${API_HOST}:${API_PORT}/health`;

const IS_WIN = process.platform === 'win32';

function log(msg) {
  console.log(msg);
}

function logErr(msg) {
  console.error(msg);
}

function healthCheck() {
  return new Promise((resolve) => {
    const req = http.get(HEALTH_URL, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function commandExists(cmd, args = ['--version']) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { stdio: 'ignore', shell: IS_WIN });
    p.on('error', () => resolve(false));
    p.on('exit', (code) => resolve(code === 0));
  });
}

async function resolvePython() {
  if (IS_WIN) {
    if (await commandExists('py', ['-3', '--version'])) return { cmd: 'py', args: ['-3'] };
    if (await commandExists('python', ['--version'])) return { cmd: 'python', args: [] };
  } else {
    if (await commandExists('python3', ['--version'])) return { cmd: 'python3', args: [] };
    if (await commandExists('python', ['--version'])) return { cmd: 'python', args: [] };
  }
  return null;
}

function checkPythonDeps(python) {
  const script = [
    'import fastapi, uvicorn, yaml',
    'print("ok")',
  ].join('; ');
  const result = spawnSync(python.cmd, [...python.args, '-c', script], {
    cwd: ROOT,
    encoding: 'utf8',
    shell: IS_WIN,
  });
  if (result.status === 0) return null;
  const err = (result.stderr || result.stdout || '').trim();
  return err || 'Python 依赖未安装';
}

function spawnProc(cmd, args, opts = {}) {
  return spawn(cmd, args, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: IS_WIN,
    ...opts,
  });
}

function spawnDetachedApi(python) {
  const args = [...python.args, '-m', 'freer_api'];
  const child = spawn(python.cmd, args, {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: !IS_WIN,
    windowsHide: true,
    shell: IS_WIN,
  });
  if (!IS_WIN) {
    child.unref();
  }
  return child;
}

async function waitForApi(child) {
  let exited = false;
  let stderr = '';
  let stdout = '';
  child.stderr?.on('data', (chunk) => {
    stderr += chunk.toString();
  });
  child.stdout?.on('data', (chunk) => {
    stdout += chunk.toString();
  });
  child.on('exit', () => {
    exited = true;
  });

  for (let i = 0; i < 40; i++) {
    if (await healthCheck()) return true;
    if (exited || child.exitCode !== null) {
      logErr('错误：freer_api 进程已退出，请检查依赖与日志');
      const detail = (stderr || stdout).trim();
      if (detail) {
        logErr('--- freer_api 输出 ---');
        logErr(detail);
      }
      return false;
    }
    await sleep(250);
  }
  logErr(`错误：等待 freer_api 就绪超时 (${HEALTH_URL})`);
  if (stderr.trim()) logErr(stderr.trim());
  return false;
}

function stopApi(child, started) {
  if (!started || !child || child.killed) return;
  log('\n正在停止 freer_api...');
  try {
    if (IS_WIN) {
      child.kill();
    } else if (child.pid) {
      process.kill(-child.pid, 'SIGTERM');
    }
  } catch {
    try {
      child.kill('SIGTERM');
    } catch {
      /* ignore */
    }
  }
}

async function main() {
  if (!['web', 'tauri'].includes(MODE)) {
    logErr(`未知模式: ${MODE}（可用: web | tauri）`);
    process.exit(1);
  }

  const python = await resolvePython();
  if (!python) {
    logErr('错误：未找到 Python（Windows: py -3 / python；macOS/Linux: python3）');
    process.exit(1);
  }

  const depErr = checkPythonDeps(python);
  if (depErr) {
    logErr('错误：Python 依赖缺失');
    logErr(depErr);
    logErr('请先执行: pip install -r requirements.txt');
    process.exit(1);
  }

  if (!(await commandExists('pnpm', ['--version']))) {
    logErr('错误：未找到 pnpm，请先安装 Node.js 与 pnpm');
    process.exit(1);
  }

  let apiChild = null;
  let startedApi = false;

  const onExit = () => {
    stopApi(apiChild, startedApi);
    process.exit(0);
  };
  process.on('SIGINT', onExit);
  process.on('SIGTERM', onExit);

  if (await healthCheck()) {
    log(`freer_api 已在运行: ${HEALTH_URL}`);
  } else {
    log(`启动 freer_api (${API_HOST}:${API_PORT})...`);
    apiChild = spawnDetachedApi(python);
    if (!IS_WIN && apiChild.pid) {
      apiChild.unref();
    }
    startedApi = true;

    if (!(await waitForApi(apiChild))) {
      stopApi(apiChild, true);
      process.exit(1);
    }
    log('freer_api 已就绪');
  }

  const frontendArgs = MODE === 'tauri' ? ['tauri:dev'] : ['dev'];
  log(MODE === 'tauri' ? '启动 Tauri 开发模式...' : '启动 Web 前端: http://localhost:5173');

  const frontend = spawnProc('pnpm', frontendArgs);
  frontend.on('exit', (code) => {
    stopApi(apiChild, startedApi);
    process.exit(code ?? 0);
  });
}

main().catch((err) => {
  logErr(err?.message || String(err));
  process.exit(1);
});
