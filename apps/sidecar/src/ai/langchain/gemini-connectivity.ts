/**
 * 启动时探测 Gemini 是否可达（仅主路为 gemini 时），便于区分「Key 无效」与「网络不通」。
 */
export async function warnIfGeminiUnreachable(): Promise<void> {
  const primary = (process.env.AI_PRIMARY_PROVIDER || process.env.AI_PROVIDER_KIND || 'gemini').toLowerCase();
  if (!primary.includes('gemini')) return;

  const apiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)?.trim();
  if (!apiKey) return;

  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  const base = (process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com').replace(/\/$/, '');
  const version = process.env.GEMINI_API_VERSION || 'v1beta';
  const url = `${base}/${version}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const timeoutMs = Number(process.env.GEMINI_CONNECT_PROBE_MS || 12_000);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'POST',
      signal: ac.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: 'ping' }] }] })
    });
    if (res.ok) return;
    const body = await res.text();
    // eslint-disable-next-line no-console
    console.warn(
      `[ai-provider] Gemini 探测 HTTP ${res.status}：${body.slice(0, 200)}（Key 可能无效或模型名错误，见 GEMINI_MODEL）`
    );
  } catch (e) {
    const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
    // eslint-disable-next-line no-console
    console.warn(
      `[ai-provider] Gemini 无法连通（${e instanceof Error ? e.message : String(e)}）。` +
        (proxy
          ? ` 已配置代理 ${proxy}，请确认代理可用。`
          : ' 国内请在 .env 设置 HTTPS_PROXY=http://127.0.0.1:端口 或 GEMINI_BASE_URL 反代地址。')
    );
  } finally {
    clearTimeout(timer);
  }
}
