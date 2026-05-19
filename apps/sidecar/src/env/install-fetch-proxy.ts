let installed = false;

type UndiciProxyModule = {
  EnvHttpProxyAgent: new () => unknown;
  setGlobalDispatcher: (dispatcher: unknown) => void;
};

function tryLoadUndici(): UndiciProxyModule | null {
  try {
    // 避免顶层 import：undici 8+ 在较旧 Node 上会在加载阶段抛错，导致整个 Sidecar 起不来
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('undici') as UndiciProxyModule;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[sidecar] 无法加载 undici:', e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * 让进程内 fetch 走 HTTPS_PROXY / HTTP_PROXY。
 * 优先 undici EnvHttpProxyAgent；失败时退回 NODE_USE_ENV_PROXY（Node 22+ 内置 fetch）。
 */
export function installGlobalFetchProxy(): string | null {
  if (installed) {
    return process.env.HTTPS_PROXY?.trim() || process.env.HTTP_PROXY?.trim() || null;
  }

  const proxy = process.env.HTTPS_PROXY?.trim() || process.env.HTTP_PROXY?.trim();
  if (!proxy) return null;

  if (!process.env.HTTPS_PROXY) process.env.HTTPS_PROXY = proxy;
  process.env.NODE_USE_ENV_PROXY = '1';

  const undici = tryLoadUndici();
  if (undici) {
    try {
      undici.setGlobalDispatcher(new undici.EnvHttpProxyAgent());
      installed = true;
      return proxy;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[sidecar] 无法安装 undici 代理调度器:', e instanceof Error ? e.message : e);
    }
  }

  // 仍返回 proxy：Node 22+ 可能仅靠 NODE_USE_ENV_PROXY；旧 Node 需升级或换网络
  // eslint-disable-next-line no-console
  console.warn(
    '[sidecar] 已设置 NODE_USE_ENV_PROXY=1；若访问 Gemini 仍失败，请将服务器 Node 升级到 22+ 或检查 undici 与 Node 版本兼容'
  );
  return proxy;
}
