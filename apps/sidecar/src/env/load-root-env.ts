import path from 'node:path';
import fs from 'node:fs';
import dotenv from 'dotenv';
import { installGlobalFetchProxy } from './install-fetch-proxy';

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
      enableFetchProxyFromEnv();
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
    const parsed = dotenv.parse(fs.readFileSync(file, 'utf8'));
    for (const [key, value] of Object.entries(parsed)) {
      // 后加载文件中的空值不覆盖先前已配置的非空值（避免 .env.production 占位空行清掉 .env 里的密钥）
      if (value === '' && merged[key]) continue;
      merged[key] = value;
    }
    loadedFiles.push(file);
  }
  applyMergedEnv(merged, injected);
  enableFetchProxyFromEnv();
  return { root, loadedFiles };
}

/**
 * Node 内置 fetch 默认不走 HTTPS_PROXY；需开启 NODE_USE_ENV_PROXY（Node 22+）。
 * @see https://nodejs.org/api/cli.html#node_use_env_proxyvalue
 */
function enableFetchProxyFromEnv() {
  installGlobalFetchProxy();
}
