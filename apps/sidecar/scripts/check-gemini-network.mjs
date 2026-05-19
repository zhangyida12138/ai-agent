/**
 * 诊断 Gemini 网络：node apps/sidecar/scripts/check-gemini-network.mjs
 * 在仓库根目录执行，会加载根 .env
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const envFile = path.join(root, '.env');
if (fs.existsSync(envFile)) dotenv.config({ path: envFile });

const proxy = process.env.HTTPS_PROXY?.trim() || process.env.HTTP_PROXY?.trim();
const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

console.log('GEMINI_MODEL', model);
console.log('HTTPS_PROXY', proxy || '(未设置)');

if (proxy) {
  process.env.NODE_USE_ENV_PROXY = '1';
  setGlobalDispatcher(new EnvHttpProxyAgent());
}

if (!key) {
  console.error('缺少 GEMINI_API_KEY');
  process.exit(1);
}

const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
const t0 = Date.now();

try {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: 'ping' }] }] }),
    signal: AbortSignal.timeout(20_000)
  });
  const text = await res.text();
  console.log(`OK ${Date.now() - t0}ms HTTP ${res.status}`);
  console.log(text.slice(0, 200));
} catch (e) {
  console.error(`FAIL ${Date.now() - t0}ms`, e?.message || e);
  if (!proxy) {
    console.error(
      '\n提示: 开 VPN 但 Node 不走 TUN 时，需在 Clash 打开「系统代理」或 .env 设置 HTTPS_PROXY=http://127.0.0.1:混合端口'
    );
  } else {
    console.error(`\n提示: 代理 ${proxy} 连不通，请确认 Clash 已启动且端口正确（常见 7890/7897，不是 7892）`);
  }
  process.exit(1);
}
