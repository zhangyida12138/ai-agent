import path from 'node:path';
import fs from 'node:fs';
import dotenv from 'dotenv';

function findRepoRoot(startDir: string): string | null {
  let dir = path.resolve(startDir);
  for (let i = 0; i < 8; i++) {
    const marker = path.join(dir, 'pnpm-workspace.yaml');
    if (fs.existsSync(marker)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export type RootEnvLoadResult = { root: string; loadedFiles: string[] };

/**
 * 将多个 .env 文件解析合并（后者覆盖前者），再写入 process.env。
 * 已在进程环境中存在且非空的变量（如 systemd / Docker 注入的密钥）不会被文件中的空值覆盖。
 */
function applyMergedEnv(merged: Record<string, string>, injected: NodeJS.ProcessEnv) {
  for (const [key, value] of Object.entries(merged)) {
    const prior = injected[key];
    if (prior !== undefined && prior !== '') {
      process.env[key] = prior;
      continue;
    }
    if (value === '') {
      if (prior !== undefined) process.env[key] = prior;
      continue;
    }
    process.env[key] = value;
  }
}

function fallbackLoadDotEnv(): RootEnvLoadResult | null {
  const injected = { ...process.env };
  let dir = path.resolve(process.cwd());
  for (let i = 0; i < 6; i++) {
    const file = path.join(dir, '.env');
    if (fs.existsSync(file)) {
      const merged = dotenv.parse(fs.readFileSync(file, 'utf8'));
      applyMergedEnv(merged, injected);
      return { root: dir, loadedFiles: [file] };
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/**
 * 在 monorepo 根目录按顺序加载环境变量（后者覆盖前者）。
 * 与 Vite 的 envDir 对齐，便于共用 `.env.development` / `.env.production`。
 */
export function loadRootEnvFiles(): RootEnvLoadResult | null {
  const injected = { ...process.env };
  const root = findRepoRoot(process.cwd());
  if (!root) return fallbackLoadDotEnv();

  const nodeEnv = process.env.NODE_ENV;
  const mode = nodeEnv === 'production' ? 'production' : 'development';

  const files = [
    path.join(root, '.env'),
    path.join(root, '.env.local'),
    path.join(root, `.env.${mode}`),
    path.join(root, `.env.${mode}.local`)
  ];

  const merged: Record<string, string> = {};
  const loadedFiles: string[] = [];
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    Object.assign(merged, dotenv.parse(fs.readFileSync(file, 'utf8')));
    loadedFiles.push(file);
  }
  applyMergedEnv(merged, injected);
  return { root, loadedFiles };
}
