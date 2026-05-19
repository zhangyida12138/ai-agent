import type { LlmProviderId } from './provider-config';

export function providerTimeoutMs(providerId: LlmProviderId, isFallback: boolean): number {
  const primary = Number(process.env.AI_PROVIDER_TIMEOUT_MS || 60_000);
  const fallback = Number(process.env.AI_FALLBACK_TIMEOUT_MS || 25_000);
  return isFallback ? fallback : primary;
}

/**
 * 合并调用方 signal 与单次请求超时，避免备用模型（如 Gemini）长时间无响应导致前端一直 loading。
 */
export function mergeAbortSignals(parent: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  if (typeof AbortSignal.timeout === 'function' && !parent) {
    return AbortSignal.timeout(timeoutMs);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new Error(`模型请求超时（${Math.round(timeoutMs / 1000)}s），请检查网络或代理`));
  }, timeoutMs);

  const abortFrom = (source: AbortSignal) => {
    clearTimeout(timer);
    controller.abort(source.reason ?? new Error('请求已取消'));
  };

  if (parent) {
    if (parent.aborted) {
      abortFrom(parent);
    } else {
      parent.addEventListener('abort', () => abortFrom(parent), { once: true });
    }
  }

  return controller.signal;
}

export function withPromiseTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label}超时（${Math.round(timeoutMs / 1000)}s），请检查网络或代理`));
    }, timeoutMs);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

export function isTimeoutError(err: unknown): boolean {
  const name = err && typeof err === 'object' ? String((err as { name?: string }).name ?? '') : '';
  if (name === 'AbortError' || name === 'TimeoutError') return true;
  const msg = err && typeof err === 'object' && 'message' in err ? String((err as Error).message) : String(err);
  return /timed?\s*out|超时|ETIMEDOUT|ECONNREFUSED|fetch failed/i.test(msg);
}
