import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';

let installed = false;

/**
 * 让进程内所有 fetch（含 @google/generative-ai）走 HTTPS_PROXY / HTTP_PROXY。
 * 系统 VPN（TUN）若未劫持 Node，仍需在 .env 配置 Clash 本地 HTTP 端口。
 */
export function installGlobalFetchProxy(): string | null {
  if (installed) {
    return process.env.HTTPS_PROXY?.trim() || process.env.HTTP_PROXY?.trim() || null;
  }

  const proxy = process.env.HTTPS_PROXY?.trim() || process.env.HTTP_PROXY?.trim();
  if (!proxy) return null;

  if (!process.env.HTTPS_PROXY) process.env.HTTPS_PROXY = proxy;
  process.env.NODE_USE_ENV_PROXY = '1';

  try {
    setGlobalDispatcher(new EnvHttpProxyAgent());
    installed = true;
    return proxy;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[sidecar] 无法安装 undici 代理调度器:', e instanceof Error ? e.message : e);
    return proxy;
  }
}
