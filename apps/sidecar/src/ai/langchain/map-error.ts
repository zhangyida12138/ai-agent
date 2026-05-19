import { ErrorCodes } from '@ai-agent/shared';

export type ProviderError = {
  code: string;
  message: string;
  retryable: boolean;
  partialText?: string;
};

function messageFromUnknown(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as { message?: string; error?: { message?: string } };
    if (e.message) return String(e.message);
    if (e.error?.message) return String(e.error.message);
  }
  return String(err);
}

function statusFromUnknown(err: unknown): number | null {
  if (!err || typeof err !== 'object') return null;
  const e = err as { status?: number; response?: { status?: number }; statusCode?: number };
  if (typeof e.status === 'number') return e.status;
  if (typeof e.statusCode === 'number') return e.statusCode;
  if (typeof e.response?.status === 'number') return e.response.status;
  const msg = messageFromUnknown(err);
  const m = msg.match(/\b(400|401|402|403|413|429|5\d{2})\b/);
  return m ? Number(m[1]) : null;
}

/** 仅识别 sidecar 主动抛出的结构化错误，避免把 OpenAI/LangChain APIError 误判为 ProviderError */
export function isProviderError(err: unknown): err is ProviderError {
  if (!err || typeof err !== 'object') return false;
  const e = err as ProviderError;
  return typeof e.code === 'string' && typeof e.message === 'string' && typeof e.retryable === 'boolean';
}

export function isNetworkOrTimeoutError(err: unknown): boolean {
  const msg = messageFromUnknown(err).toLowerCase();
  return (
    /fetch failed/.test(msg) ||
    /network/.test(msg) ||
    /econnrefused|etimedout|enotfound|socket/i.test(msg) ||
    /超时/.test(msg) ||
    /timed?\s*out/.test(msg)
  );
}

function isBalanceOrQuotaError(err: unknown): boolean {
  const msg = messageFromUnknown(err).toLowerCase();
  return (
    /insufficient\s+balance/.test(msg) ||
    /insufficient_quota/.test(msg) ||
    /quota/.test(msg) ||
    /billing/.test(msg) ||
    /余额/.test(msg)
  );
}

export function shouldFailover(err: unknown): boolean {
  if (isProviderError(err)) {
    if (err.code === 'ABORTED') return false;
    if (err.code === ErrorCodes.INVALID_PARAMS) return false;
    return err.retryable !== false;
  }

  const status = statusFromUnknown(err);
  if (status === 402) return true;
  if (status === 401 || status === 403) return true;
  if (status === 429) return true;
  if (status !== null && status >= 500) return true;
  if (status === 413) return false;
  if (isBalanceOrQuotaError(err)) return true;
  if (isNetworkOrTimeoutError(err)) return true;

  return true;
}

export function toProviderError(err: unknown, partialText?: string): ProviderError {
  if (isProviderError(err)) {
    return partialText && !err.partialText ? { ...err, partialText } : err;
  }

  const status = statusFromUnknown(err);
  const message = messageFromUnknown(err);
  let code: string = ErrorCodes.INTERNAL_PROVIDER_ERROR;
  let retryable = true;

  if (status === 402 || isBalanceOrQuotaError(err)) {
    code = ErrorCodes.PROVIDER_UNAVAILABLE;
    retryable = true;
  } else if (status === 401 || status === 403) {
    code = ErrorCodes.AUTH_FAILED;
    retryable = true;
  } else if (status === 429) {
    code = ErrorCodes.RATE_LIMITED;
  } else if (status === 413) {
    code = ErrorCodes.REQUEST_TOO_LARGE;
    retryable = false;
  } else if (status !== null && status >= 500) {
    code = ErrorCodes.PROVIDER_UNAVAILABLE;
  } else if (isNetworkOrTimeoutError(err)) {
    code = ErrorCodes.PROVIDER_UNAVAILABLE;
    retryable = true;
  }

  const out: ProviderError = { code, message, retryable };
  if (partialText) out.partialText = partialText;
  return out;
}

export function formatProviderAttemptError(providerId: string, err: unknown): string {
  const pe = isProviderError(err) ? err : toProviderError(err);
  if (providerId === 'gemini' && isNetworkOrTimeoutError(err)) {
    const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
    const proxyHint = proxy
      ? `（已配置代理 ${proxy}，若仍失败请确认 Clash 已开启且端口正确，并重启 Sidecar）`
      : '（未检测到 HTTPS_PROXY，国内通常需代理）';
    return `[gemini] 无法连接 Google API${proxyHint}：${pe.message}`;
  }
  return `[${providerId}] ${pe.message}`;
}
