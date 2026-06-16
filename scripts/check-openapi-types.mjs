#!/usr/bin/env node
/**
 * OpenAPI 契约检查（用于 CI）
 *
 * 做法：
 * 1) 拉取当前后端 /openapi.json
 * 2) 用 openapi-typescript 生成临时 types 文件
 * 3) 与仓库里的 gui/src/api/types.ts 做一致性对比
 *
 * 失败即退出码非 0，提示需要更新 gui/src/api/types.ts。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const GUI_DIR = path.join(ROOT, 'gui');

const OPENAPI_URL = process.env.FREER_OPENAPI_URL || 'http://127.0.0.1:17890/openapi.json';
const REPO_TYPES_PATH = path.join(GUI_DIR, 'src', 'api', 'schema.ts');

if (!fs.existsSync(REPO_TYPES_PATH)) {
  console.error(`[openapi] Missing: ${REPO_TYPES_PATH}`);
  process.exit(1);
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'freer-openapi-'));
const tmpTypesPath = path.join(tmpDir, 'types.ts');

function run() {
  // 优先使用 gui 目录下的本地 openapi-typescript（不依赖 PATH 里的 pnpm）
  const binDir = path.join(GUI_DIR, 'node_modules', '.bin');
  const candidates = [
    path.join(binDir, 'openapi-typescript.cmd'),
    path.join(binDir, 'openapi-typescript.ps1'),
    path.join(binDir, 'openapi-typescript'),
  ];
  const cli = candidates.find((p) => fs.existsSync(p));
  if (!cli) {
    console.error('[openapi] Missing openapi-typescript binary. Run in gui:');
    console.error('  pnpm --dir gui install');
    process.exit(1);
  }

  const args = [OPENAPI_URL, '-o', tmpTypesPath];
  const needsShell = cli.endsWith('.cmd') || cli.endsWith('.ps1');
  execFileSync(cli, args, {
    cwd: GUI_DIR,
    stdio: 'inherit',
    shell: needsShell,
  });
}

try {
  run();

  const before = fs.readFileSync(REPO_TYPES_PATH, 'utf8').trim();
  const after = fs.readFileSync(tmpTypesPath, 'utf8').trim();

  if (before === after) {
    console.log('[openapi] Types are up-to-date.');
    process.exit(0);
  }

  console.error('[openapi] Types out-of-date. Please run:');
  console.error('  pnpm --dir gui api:types');
  console.error(`[openapi] Diff check: ${REPO_TYPES_PATH}`);
  process.exit(2);
} finally {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

