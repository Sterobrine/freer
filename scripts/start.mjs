#!/usr/bin/env node
/**
 * Freer 开发启动（跨平台：Windows / macOS / Linux）
 *
 * 用法:
 *   node scripts/start.mjs          # Web 模式
 *   node scripts/start.mjs tauri    # Tauri 模式
 *   pnpm start
 *
 * Python 默认使用 Miniconda/Anaconda 环境 freer（可通过 FREER_CONDA_ENV 改名）。
 * 设置 FREER_ALLOW_SYSTEM_PYTHON=1 可回退到系统 Python。
 */

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODE = process.argv[2] || 'web';
const API_HOST = process.env.FREER_API_HOST || '127.0.0.1';
const API_PORT = process.env.FREER_API_PORT || '17890';
const HEALTH_URL = `http://${API_HOST}:${API_PORT}/health`;
const CONDA_ENV = process.env.FREER_CONDA_ENV || 'freer';
const ALLOW_SYSTEM_PYTHON = process.env.FREER_ALLOW_SYSTEM_PYTHON === '1';

const IS_WIN = process.platform === 'win32';

function setupWindowsConsole() {
  if (!IS_WIN) return;

  try {
    spawnSync('cmd.exe', ['/d', '/s', '/c', 'chcp', '65001'], {
      stdio: 'ignore',
      windowsHide: true,
    });
  } catch {
    /* ignore */
  }

  process.env.PYTHONIOENCODING = process.env.PYTHONIOENCODING || 'utf-8';
  process.env.PYTHONUTF8 = process.env.PYTHONUTF8 || '1';

  for (const stream of [process.stdout, process.stderr]) {
    stream?.setDefaultEncoding?.('utf8');
  }
}

function childEnv(extra = {}) {
  return { ...process.env, ...extra };
}

function shouldUseShell(cmd) {
  return IS_WIN && !path.isAbsolute(cmd);
}

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

function commandExists(cmd, args = ['--version'], opts = {}) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { stdio: 'ignore', shell: IS_WIN, ...opts });
    p.on('error', () => resolve(false));
    p.on('exit', (code) => resolve(code === 0));
  });
}

function cargoBinDir() {
  const home = process.env.USERPROFILE || process.env.HOME;
  if (!home) return null;
  const dir = path.join(home, '.cargo', 'bin');
  return fs.existsSync(path.join(dir, IS_WIN ? 'cargo.exe' : 'cargo')) ? dir : null;
}

async function ensureCargo() {
  if (await commandExists('cargo', ['--version'])) {
    return true;
  }

  const binDir = cargoBinDir();
  if (!binDir) {
    return false;
  }

  const sep = path.delimiter;
  if (!(process.env.PATH || '').split(sep).includes(binDir)) {
    process.env.PATH = `${binDir}${sep}${process.env.PATH || ''}`;
    log(`已将 Rust 工具链加入 PATH: ${binDir}`);
  }

  return commandExists('cargo', ['--version']);
}

function logCargoInstallHint() {
  logErr('错误：未找到 cargo（Tauri 桌面版需要 Rust 工具链）');
  logErr('请安装 Rust：https://rustup.rs/');
  logErr('Windows 可执行:');
  logErr('  winget install Rustlang.Rustup');
  logErr('安装完成后重新打开终端，再运行: pnpm start:desktop');
  logErr('若已安装但仍报错，确认 %USERPROFILE%\\.cargo\\bin 在 PATH 中');
}

function condaRoots() {
  const roots = new Set();
  const add = (value) => {
    if (value) roots.add(path.normalize(value));
  };

  add(process.env.FREER_CONDA_ROOT);
  if (process.env.CONDA_EXE) {
    add(path.dirname(path.dirname(process.env.CONDA_EXE)));
  }

  const home = process.env.USERPROFILE || process.env.HOME;
  if (home) {
    for (const dir of ['miniconda3', 'Miniconda3', 'anaconda3', 'Anaconda3', 'miniforge3', 'Miniforge3']) {
      add(path.join(home, dir));
    }
  }

  return [...roots];
}

function condaEnvPythonExe(envName) {
  const prefix = process.env.CONDA_PREFIX;
  if (prefix && path.basename(prefix) === envName) {
    const active = IS_WIN ? path.join(prefix, 'python.exe') : path.join(prefix, 'bin', 'python');
    if (fs.existsSync(active)) return active;
  }

  for (const root of condaRoots()) {
    const exe = IS_WIN
      ? path.join(root, 'envs', envName, 'python.exe')
      : path.join(root, 'envs', envName, 'bin', 'python');
    if (fs.existsSync(exe)) return exe;
  }

  return null;
}

async function resolveCondaPython(envName) {
  const direct = condaEnvPythonExe(envName);
  if (direct) {
    return { cmd: direct, args: [], label: `conda:${envName}` };
  }

  if (!(await commandExists('conda', ['--version']))) {
    return null;
  }

  const result = spawnSync(
    'conda',
    ['run', '-n', envName, 'python', '-c', 'import sys; print(sys.executable)'],
    { cwd: ROOT, encoding: 'utf8', shell: IS_WIN },
  );
  if (result.status !== 0) return null;

  const lines = (result.stdout || '').trim().split(/\r?\n/).filter(Boolean);
  const resolved = lines.at(-1);
  if (resolved && fs.existsSync(resolved)) {
    return { cmd: resolved, args: [], label: `conda:${envName}` };
  }

  return null;
}

async function resolveSystemPython() {
  if (IS_WIN) {
    if (await commandExists('py', ['-3', '--version'])) {
      return { cmd: 'py', args: ['-3'], label: 'py -3' };
    }
    if (await commandExists('python', ['--version'])) {
      return { cmd: 'python', args: [], label: 'python' };
    }
  } else {
    if (await commandExists('python3', ['--version'])) {
      return { cmd: 'python3', args: [], label: 'python3' };
    }
    if (await commandExists('python', ['--version'])) {
      return { cmd: 'python', args: [], label: 'python' };
    }
  }
  return null;
}

async function resolvePython() {
  if (process.env.FREER_PYTHON) {
    return { cmd: process.env.FREER_PYTHON, args: [], label: 'FREER_PYTHON' };
  }

  const condaPython = await resolveCondaPython(CONDA_ENV);
  if (condaPython) return condaPython;

  if (ALLOW_SYSTEM_PYTHON) {
    return resolveSystemPython();
  }

  return null;
}

function checkPythonDeps(python) {
  const script = 'import fastapi, uvicorn, yaml; print("ok")';
  const result = spawnSync(python.cmd, [...python.args, '-c', script], {
    cwd: ROOT,
    encoding: 'utf8',
    shell: shouldUseShell(python.cmd),
  });
  if (result.status === 0) return null;
  const err = (result.stderr || result.stdout || '').trim();
  return err || 'Python 依赖未安装';
}

function spawnProc(cmd, args, opts = {}) {
  const { env, ...rest } = opts;
  return spawn(cmd, args, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: shouldUseShell(cmd),
    env: childEnv(env),
    ...rest,
  });
}

function spawnDetachedApi(python) {
  const args = [...python.args, '-m', 'freer_api'];
  const child = spawn(python.cmd, args, {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: !IS_WIN,
    windowsHide: true,
    shell: shouldUseShell(python.cmd),
    env: childEnv(),
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
    stderr += chunk.toString('utf8');
  });
  child.stdout?.on('data', (chunk) => {
    stdout += chunk.toString('utf8');
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
  setupWindowsConsole();

  if (!['web', 'tauri'].includes(MODE)) {
    logErr(`未知模式: ${MODE}（可用: web | tauri）`);
    process.exit(1);
  }

  const python = await resolvePython();
  if (!python) {
    logErr(`错误：未找到 conda 环境 "${CONDA_ENV}"`);
    logErr('请先创建环境并安装依赖：');
    logErr(`  conda create -n ${CONDA_ENV} python=3.11 -y`);
    logErr(`  conda activate ${CONDA_ENV}`);
    logErr('  pip install -r requirements.txt');
    logErr('若 conda 安装在非默认路径，可设置 FREER_CONDA_ROOT');
    logErr('临时使用系统 Python 可设置 FREER_ALLOW_SYSTEM_PYTHON=1');
    process.exit(1);
  }

  log(`使用 Python (${python.label}): ${python.cmd}`);

  const depErr = checkPythonDeps(python);
  if (depErr) {
    logErr('错误：Python 依赖缺失');
    logErr(depErr);
    logErr(`请在 conda 环境中安装: conda activate ${CONDA_ENV} && pip install -r requirements.txt`);
    process.exit(1);
  }

  if (!(await commandExists('pnpm', ['--version']))) {
    logErr('错误：未找到 pnpm，请先安装 Node.js 与 pnpm');
    process.exit(1);
  }

  if (MODE === 'tauri' && !(await ensureCargo())) {
    logCargoInstallHint();
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
