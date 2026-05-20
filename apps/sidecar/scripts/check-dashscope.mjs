/**
 * 诊断千问 DashScope Key：在仓库根目录执行
 *   pnpm --filter @ai-agent/sidecar run check:qwen
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
for (const name of ['.env', '.env.local', '.env.development']) {
  const f = path.join(root, name);
  if (fs.existsSync(f)) dotenv.config({ path: f });
}

const key = (process.env.DASHSCOPE_API_KEY || process.env.QWEN_API_KEY || '').trim();
const base = (process.env.DASHSCOPE_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1').replace(/\/$/, '');
const model = process.env.DASHSCOPE_MODEL || process.env.PAGE_AGENT_QWEN_MODEL || 'qwen-plus';

console.log('DASHSCOPE_BASE_URL', base);
console.log('model', model);
console.log('DASHSCOPE_API_KEY', key ? `${key.slice(0, 8)}…${key.slice(-4)} (${key.length} chars)` : '(未设置)');

if (!key) {
  console.error('\n缺少 DASHSCOPE_API_KEY。请在根目录 .env 填写：');
  console.error('https://bailian.console.aliyun.com/?tab=model#/api-key');
  process.exit(1);
}

const url = `${base}/chat/completions`;
const t0 = Date.now();

try {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 16
    }),
    signal: AbortSignal.timeout(25_000)
  });
  const text = await res.text();
  if (res.ok) {
    console.log(`\nOK ${Date.now() - t0}ms HTTP ${res.status}`);
    console.log(text.slice(0, 200));
    process.exit(0);
  }
  console.error(`\nFAIL ${Date.now() - t0}ms HTTP ${res.status}`);
  console.error(text.slice(0, 500));
  if (res.status === 401) {
    console.error('\n提示: API Key 无效或已作废。请到阿里云百炼/Model Studio 重新创建 Key，并确认：');
    console.error('  - 国内账号常用: https://dashscope.aliyuncs.com/compatible-mode/v1');
    console.error('  - 国际账号常用: https://dashscope-intl.aliyuncs.com/compatible-mode/v1');
    console.error('  - Key 与 Base URL 须同一区域；改 .env 后重启 Sidecar');
  }
  process.exit(1);
} catch (e) {
  console.error(`\nFAIL ${Date.now() - t0}ms`, e?.message || e);
  process.exit(1);
}
