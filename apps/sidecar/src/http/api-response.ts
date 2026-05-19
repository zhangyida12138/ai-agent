import type { ErrorEnvelope } from '@ai-agent/shared';
import { GENERIC_SERVER_ERROR_MESSAGE, resolveUserFacingMessage, USER_FACING_MESSAGES } from '@ai-agent/shared';

export function ok<T>(data: T) {
  return { ok: true as const, code: 'SUCCESS' as const, data };
}

export function logServerError(tag: string, detail: unknown, extra?: Record<string, unknown>) {
  if (extra && Object.keys(extra).length > 0) {
    console.error(`[api:${tag}]`, detail, extra);
    return;
  }
  console.error(`[api:${tag}]`, detail);
}

/** 返回给客户端的错误信封（不含技术细节；未知错误记日志） */
export function fail(
  code: string,
  retryable: boolean,
  opts?: { cause?: unknown; logTag?: string; message?: string }
): ErrorEnvelope {
  if (opts?.cause) {
    logServerError(opts.logTag ?? code, opts.cause, opts.message ? { hint: opts.message } : undefined);
  } else if (!USER_FACING_MESSAGES[code] && opts?.message) {
    logServerError(opts.logTag ?? code, opts.message);
  }

  const mapped = USER_FACING_MESSAGES[code];
  const message = mapped ?? GENERIC_SERVER_ERROR_MESSAGE;

  return { ok: false, code, message, retryable };
}

export function failFromUnknown(
  tag: string,
  err: unknown,
  fallbackCode = 'INTERNAL_ERROR',
  retryable = true
): ErrorEnvelope {
  const code =
    err && typeof err === 'object' && 'code' in err && typeof (err as { code: unknown }).code === 'string'
      ? String((err as { code: string }).code)
      : fallbackCode;
  const internalMessage =
    err instanceof Error
      ? err.message
      : err && typeof err === 'object' && 'message' in err
        ? String((err as { message: unknown }).message)
        : String(err);

  return fail(code, retryable, { cause: err, logTag: tag, message: internalMessage });
}

export { resolveUserFacingMessage, GENERIC_SERVER_ERROR_MESSAGE };
