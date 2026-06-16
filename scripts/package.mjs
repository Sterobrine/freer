#!/usr/bin/env node
/**
 * Freer 桌面版打包（跨平台）
 *
 * 用法:
 *   node scripts/package.mjs                  # 便携版：freer.exe + freer-engine（默认）
 *   node scripts/package.mjs portable           # 同上
 *   node scripts/package.mjs installer          # NSIS 安装包
 *   node scripts/package.mjs desktop            # 仅构建 GUI 可执行文件
 *   node scripts/package.mjs engine             # 仅 PyInstaller 引擎
 *
 * 便携版输出目录: dist/Freer/
 *   Freer.exe / freer.exe
 *   freer-engine.exe
 *
 * 环境变量:
 *   FREER_CONDA_ENV / FREER_PYTHON / FREER_ALLOW_SYSTEM_PYTHON — 同 start.mjs
 *   FREER_PACKAGE_SKIP_ENGINE=1 — 跳过引擎打包
 */

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TAURI_DIR = path.join(ROOT, 'src-tauri');
const BINARIES_DIR = path.join(TAURI_DIR, 'binaries');
const CONDA_ENV = process.env.FREER_CONDA_ENV || 'freer';
const ALLOW_SYSTEM_PYTHON = process.env.FREER_ALLOW_SYSTEM_PYTHON === '1';
const SKIP_ENGINE = process.env.FREER_PACKAGE_SKIP_ENGINE === '1';

const IS_WIN = process.platform === 'win32';
const PORTABLE_DIR = path.join(ROOT, 'dist', 'Freer');
const APP_EXE = IS_WIN ? 'freer.exe' : 'freer';
const ENGINE_EXE = IS_WIN ? 'freer-engine.exe' : 'freer-engine';

const KNOWN_FORMATS = new Set(['portable', 'installer']);
const KNOWN_MODES = new Set(['all', 'desktop', 'engine']);

function parseArgs(argv) {
  let format = 'portable';
  let mode = 'all';

  for (const raw of argv) {
    const arg = raw.toLowerCase();
    if (KNOWN_FORMATS.has(arg)) format = arg;
    else if (KNOWN_MODES.has(arg)) mode = arg;
    else {
      logErr(`未知参数: ${raw}`);
      logErr('用法: node scripts/package.mjs [portable|installer] [all|desktop|engine]');
      process.exit(1);
    }
  }

  return { format, mode };
}

function setupWindowsConsole() {
  if (!IS_WIN) return;
  try {
    spawnSync('cmd.exe', ['/d', '/s', '/c', 'chcp', '65001'], { stdio: 'ignore', windowsHide: true });
  } catch {
    /* ignore */
  }
  process.env.PYTHONIOENCODING = process.env.PYTHONIOENCODING || 'utf-8';
  process.env.PYTHONUTF8 = process.env.PYTHONUTF8 || '1';
}

function log(msg) {
  console.log(msg);
}

function logErr(msg) {
  console.error(msg);
}

function shouldUseShell(cmd) {
  return IS_WIN && !path.isAbsolute(cmd);
}

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: shouldUseShell(cmd),
    env: { ...process.env, ...(opts.env || {}) },
    ...opts,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runCapture(cmd, args) {
  return spawnSync(cmd, args, {
    cwd: ROOT,
    encoding: 'utf8',
    shell: shouldUseShell(cmd),
  });
}

function commandExists(cmd, args = ['--version']) {
  const result = spawnSync(cmd, args, { stdio: 'ignore', shell: IS_WIN });
  return result.status === 0;
}

function cargoBinDir() {
  const home = process.env.USERPROFILE || process.env.HOME;
  if (!home) return null;
  const dir = path.join(home, '.cargo', 'bin');
  return fs.existsSync(path.join(dir, IS_WIN ? 'cargo.exe' : 'cargo')) ? dir : null;
}

function ensureCargo() {
  if (commandExists('cargo', ['--version'])) return true;
  const binDir = cargoBinDir();
  if (!binDir) return false;
  const sep = path.delimiter;
  if (!(process.env.PATH || '').split(sep).includes(binDir)) {
    process.env.PATH = `${binDir}${sep}${process.env.PATH || ''}`;
    log(`已将 Rust 工具链加入 PATH: ${binDir}`);
  }
  return commandExists('cargo', ['--version']);
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

function resolveCondaPython(envName) {
  const direct = condaEnvPythonExe(envName);
  if (direct) return { cmd: direct, args: [], label: `conda:${envName}` };

  if (!commandExists('conda', ['--version'])) return null;

  const result = runCapture('conda', ['run', '-n', envName, 'python', '-c', 'import sys; print(sys.executable)']);
  if (result.status !== 0) return null;

  const lines = (result.stdout || '').trim().split(/\r?\n/).filter(Boolean);
  const resolved = lines.at(-1);
  if (resolved && fs.existsSync(resolved)) {
    return { cmd: resolved, args: [], label: `conda:${envName}` };
  }
  return null;
}

function resolveSystemPython() {
  if (IS_WIN) {
    if (commandExists('py', ['-3', '--version'])) return { cmd: 'py', args: ['-3'], label: 'py -3' };
    if (commandExists('python', ['--version'])) return { cmd: 'python', args: [], label: 'python' };
  } else {
    if (commandExists('python3', ['--version'])) return { cmd: 'python3', args: [], label: 'python3' };
    if (commandExists('python', ['--version'])) return { cmd: 'python', args: [], label: 'python' };
  }
  return null;
}

function resolvePython() {
  if (process.env.FREER_PYTHON) {
    return { cmd: process.env.FREER_PYTHON, args: [], label: 'FREER_PYTHON' };
  }
  const condaPython = resolveCondaPython(CONDA_ENV);
  if (condaPython) return condaPython;
  if (ALLOW_SYSTEM_PYTHON) return resolveSystemPython();
  return null;
}

function checkPythonDeps(python) {
  const script = 'import fastapi, uvicorn, yaml; print("ok")';
  const result = runCapture(python.cmd, [...python.args, '-c', script]);
  if (result.status === 0) return null;
  return (result.stderr || result.stdout || '').trim() || 'Python 依赖未安装';
}

function rustHostTriple() {
  const result = runCapture('rustc', ['-vV']);
  if (result.status !== 0) return null;
  const match = (result.stdout || '').match(/^host: (.+)$/m);
  return match?.[1]?.trim() ?? null;
}

function ensurePyInstaller(python) {
  const check = runCapture(python.cmd, [...python.args, '-c', 'import PyInstaller; print("ok")']);
  if (check.status === 0) return;

  log('安装 PyInstaller...');
  run(python.cmd, [...python.args, '-m', 'pip', 'install', '-r', 'requirements-dev.txt']);
}

function pythonPrefix(python) {
  const result = runCapture(python.cmd, [...python.args, '-c', 'import sys; print(sys.prefix)']);
  if (result.status !== 0) return null;
  const lines = (result.stdout || '').trim().split(/\r?\n/).filter(Boolean);
  return lines.at(-1) || null;
}

function pyInstallerSslArgs(prefix) {
  if (!prefix) return [];
  const args = [];
  const candidates = IS_WIN
    ? [
        path.join(prefix, 'Library', 'bin', 'libssl-3-x64.dll'),
        path.join(prefix, 'Library', 'bin', 'libcrypto-3-x64.dll'),
      ]
    : [
        path.join(prefix, 'lib', 'libssl.so.3'),
        path.join(prefix, 'lib', 'libcrypto.so.3'),
      ];

  for (const dll of candidates) {
    if (!fs.existsSync(dll)) continue;
    args.push('--add-binary', IS_WIN ? `${dll};.` : `${dll}:.`);
  }
  return args;
}

function killEngineProcesses() {
  if (!IS_WIN) return;
  spawnSync('taskkill', ['/F', '/IM', ENGINE_EXE], { stdio: 'ignore', shell: true });
}

function verifyEngineBinary(enginePath) {
  log('验证 freer-engine 能否启动...');
  killEngineProcesses();

  const child = spawnSync(enginePath, [], {
    cwd: path.dirname(enginePath),
    encoding: 'utf8',
    timeout: 12000,
    shell: false,
    windowsHide: true,
  });
  const output = `${child.stdout || ''}\n${child.stderr || ''}`.trim();
  killEngineProcesses();

  if (/ImportError|ModuleNotFoundError|Failed to execute script|DLL load failed/i.test(output)) {
    logErr('错误：freer-engine 启动自检失败');
    if (output) logErr(output);
    logErr('若在 conda 环境打包，请确认已包含 OpenSSL DLL（脚本会自动从 Library/bin 收集）');
    process.exit(1);
  }

  log('引擎启动自检通过');
}
function buildEngine(python) {
  log('打包 Python 引擎 (PyInstaller)...');

  ensurePyInstaller(python);

  const distName = ENGINE_EXE;
  const distPath = path.join(ROOT, 'dist', distName);
  if (fs.existsSync(distPath)) fs.unlinkSync(distPath);

  const prefix = pythonPrefix(python);
  const sslArgs = pyInstallerSslArgs(prefix);
  if (sslArgs.length > 0) {
    log(`收集 OpenSSL 依赖: ${sslArgs.filter((_, i) => i % 2 === 1).join(', ')}`);
  }

  const hiddenImports = [
    'ssl',
    'uvicorn',
    'fastapi',
    'cv2',
    'freer_api',
    'freer_api.app',
    'config',
    'paths',
    'freer_log',
    'serialization',
    'Tools',
    'Control',
    'Models',
  ];

  run(python.cmd, [
    ...python.args,
    '-m',
    'PyInstaller',
    '--noconfirm',
    '--clean',
    '--onefile',
    ...(IS_WIN ? ['--noconsole'] : []),
    '--name',
    'freer-engine',
    '--paths',
    ROOT,
    ...hiddenImports.flatMap((name) => ['--hidden-import', name]),
    '--collect-submodules',
    'freer_api',
    '--collect-submodules',
    'recognition',
    ...sslArgs,
    path.join(ROOT, 'freer_api', '__main__.py'),
  ]);

  if (!fs.existsSync(distPath)) {
    logErr(`错误：未找到引擎输出 ${distPath}`);
    process.exit(1);
  }

  verifyEngineBinary(distPath);

  const triple = rustHostTriple();
  if (!triple) {
    log('警告：无法检测 Rust host triple，跳过复制到 Tauri binaries/');
    log(`引擎输出: ${distPath}`);
    return distPath;
  }

  fs.mkdirSync(BINARIES_DIR, { recursive: true });
  const sidecarName = `freer-engine-${triple}${IS_WIN ? '.exe' : ''}`;
  const sidecarPath = path.join(BINARIES_DIR, sidecarName);
  fs.copyFileSync(distPath, sidecarPath);
  log(`已复制 sidecar: ${sidecarPath}`);
  return distPath;
}

function sidecarPath() {
  const triple = rustHostTriple();
  if (!triple) return null;
  return path.join(BINARIES_DIR, `freer-engine-${triple}${IS_WIN ? '.exe' : ''}`);
}

const TAURI_CONF = path.join(TAURI_DIR, 'tauri.conf.json');

function withExternalBinSidecar(fn) {
  const sidecar = sidecarPath();
  if (!sidecar || !fs.existsSync(sidecar)) {
    logErr(`错误：未找到 sidecar 引擎 ${sidecar ?? '(unknown path)'}`);
    logErr('请先运行: pnpm package 或 node scripts/package.mjs engine');
    process.exit(1);
  }

  const original = fs.readFileSync(TAURI_CONF, 'utf8');
  const conf = JSON.parse(original);
  conf.bundle = { ...conf.bundle, externalBin: ['binaries/freer-engine'] };
  fs.writeFileSync(TAURI_CONF, `${JSON.stringify(conf, null, 2)}\n`);

  try {
    fn();
  } finally {
    fs.writeFileSync(TAURI_CONF, original);
  }
}

function findBundleArtifacts() {
  const bundleRoot = path.join(TAURI_DIR, 'target', 'release', 'bundle');
  if (!fs.existsSync(bundleRoot)) return [];

  const found = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (/\.(exe|msi|dmg|app|deb|rpm|AppImage)$/i.test(entry.name)) {
        found.push(full);
      }
    }
  };
  walk(bundleRoot);
  return found;
}

function engineDistPath() {
  return path.join(ROOT, 'dist', ENGINE_EXE);
}

function releaseExePath() {
  if (process.env.CARGO_TARGET_DIR) {
    return path.join(process.env.CARGO_TARGET_DIR, 'release', APP_EXE);
  }
  return path.join(TAURI_DIR, 'target', 'release', APP_EXE);
}

function copyPortableArtifacts(enginePath) {
  const releaseExe = releaseExePath();
  if (!fs.existsSync(releaseExe)) {
    logErr(`错误：未找到 ${releaseExe}`);
    logErr('请先成功执行: pnpm tauri build --no-bundle');
    process.exit(1);
  }

  fs.mkdirSync(PORTABLE_DIR, { recursive: true });

  const appOut = path.join(PORTABLE_DIR, APP_EXE);
  fs.copyFileSync(releaseExe, appOut);

  const engineSrc = enginePath || engineDistPath();
  if (fs.existsSync(engineSrc)) {
    fs.copyFileSync(engineSrc, path.join(PORTABLE_DIR, ENGINE_EXE));
  } else {
    log('警告：未找到 freer-engine，便携版将依赖本机 Python');
  }

  for (const item of ['data', 'config.yaml']) {
    const src = path.join(ROOT, item);
    const dest = path.join(PORTABLE_DIR, item);
    if (!fs.existsSync(src)) continue;
    if (fs.statSync(src).isDirectory()) {
      fs.cpSync(src, dest, { recursive: true });
    } else {
      fs.copyFileSync(src, dest);
    }
  }

  for (const dir of ['img', 'logs']) {
    fs.mkdirSync(path.join(PORTABLE_DIR, dir), { recursive: true });
  }

  log('\n便携版输出目录:');
  log(`  ${PORTABLE_DIR}`);
  log('\n直接运行:');
  log(`  ${appOut}`);
  log('\n目录需包含: freer.exe、freer-engine.exe、data/、config.yaml');
}

function buildDesktop(format, enginePath) {
  if (format === 'installer') {
    log('构建 NSIS 安装包...');
    withExternalBinSidecar(() => {
      run('pnpm', ['tauri', 'build', '--bundles', 'nsis']);
    });

    const artifacts = findBundleArtifacts();
    if (artifacts.length === 0) {
      log(`构建完成，请查看: ${path.join(TAURI_DIR, 'target', 'release', 'bundle')}`);
      return;
    }

    log('\n安装包输出:');
    for (const file of artifacts) {
      log(`  ${file}`);
    }
    return;
  }

  log('构建可执行程序 (portable)...');
  const releaseExe = releaseExePath();
  if (fs.existsSync(releaseExe)) {
    fs.unlinkSync(releaseExe);
  }
  run('pnpm', ['tauri', 'build', '--no-bundle']);
  copyPortableArtifacts(enginePath);
}

function main() {
  setupWindowsConsole();

  const { format, mode } = parseArgs(process.argv.slice(2));

  const buildDesktopStep = mode !== 'engine';
  let buildEngineStep = mode !== 'desktop' && !SKIP_ENGINE;

  if (buildDesktopStep && !buildEngineStep) {
    const sidecar = sidecarPath();
    if (!sidecar || !fs.existsSync(sidecar)) {
      log('未找到 sidecar 引擎，将先打包 Python 引擎...');
      buildEngineStep = true;
    }
  }

  if (buildEngineStep || buildDesktopStep) {
    if (!commandExists('pnpm', ['--version'])) {
      logErr('错误：未找到 pnpm，请先安装 Node.js 与 pnpm');
      process.exit(1);
    }
  }

  let enginePath = null;

  if (buildEngineStep) {
    const python = resolvePython();
    if (!python) {
      logErr(`错误：未找到 conda 环境 "${CONDA_ENV}"`);
      logErr(`请先: conda create -n ${CONDA_ENV} python=3.11 -y && pip install -r requirements-dev.txt`);
      process.exit(1);
    }

    log(`使用 Python (${python.label}): ${python.cmd}`);
    const depErr = checkPythonDeps(python);
    if (depErr) {
      logErr('错误：Python 依赖缺失');
      logErr(depErr);
      process.exit(1);
    }

    enginePath = buildEngine(python);
  } else if (buildDesktopStep) {
    log('跳过 Python 引擎打包');
    enginePath = fs.existsSync(engineDistPath()) ? engineDistPath() : null;
  }

  if (buildDesktopStep) {
    if (!ensureCargo()) {
      logErr('错误：未找到 cargo（Tauri 打包需要 Rust 工具链）');
      logErr('安装: winget install Rustlang.Rustup');
      logErr('Windows 还需 Visual Studio C++ 构建工具');
      process.exit(1);
    }

    buildDesktop(format, enginePath);
  }

  log('\n打包完成');
}

main();
