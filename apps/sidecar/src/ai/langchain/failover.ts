import { ErrorCodes } from '@ai-agent/shared';
import type { LlmProviderId } from './provider-config';
import { formatProviderAttemptError, shouldFailover, toProviderError, type ProviderError } from './map-error';

export type FailoverAttemptContext = {
  attemptIndex: number;
  isFallback: boolean;
};

export async function withProviderFailover<T>(
  order: LlmProviderId[],
  run: (providerId: LlmProviderId, ctx: FailoverAttemptContext) => Promise<T>,
  options?: { signal?: AbortSignal }
): Promise<{ result: T; providerId: LlmProviderId }> {
  if (order.length === 0) {
    throw {
      code: ErrorCodes.PROVIDER_NOT_CONFIGURED,
      message:
        '未配置可用的 AI 提供商。请在根目录 .env 中设置 ZHIPU_API_KEY、DASHSCOPE_API_KEY（千问）、DEEPSEEK_API_KEY 和/或 GEMINI_API_KEY。',
      retryable: false
    } satisfies ProviderError;
  }

  const attemptErrors: string[] = [];
  let lastError: unknown;

  for (let i = 0; i < order.length; i++) {
    if (options?.signal?.aborted) {
      throw { code: 'ABORTED', message: 'request cancelled', retryable: false };
    }
    const providerId = order[i]!;
    try {
      // eslint-disable-next-line no-console
      if (i > 0) console.warn(`[ai-provider] 正在调用备用模型 ${providerId}…`);
      const result = await run(providerId, { attemptIndex: i, isFallback: i > 0 });
      if (i > 0) {
        // eslint-disable-next-line no-console
        console.warn(`[ai-provider] 已切换至备用模型: ${providerId}`);
      }
      return { result, providerId };
    } catch (err) {
      if (options?.signal?.aborted) {
        throw { code: 'ABORTED', message: 'request cancelled', retryable: false };
      }
      lastError = err;
      attemptErrors.push(formatProviderAttemptError(providerId, err));
      const hasNext = i < order.length - 1;
      if (!hasNext || !shouldFailover(err)) {
        break;
      }
      const next = order[i + 1]!;
      // eslint-disable-next-line no-console
      console.warn(
        `[ai-provider] ${providerId} 调用失败，切换至 ${next}: ${formatProviderAttemptError(providerId, err)}`
      );
    }
  }

  const detail = attemptErrors.join('；');
  const base = toProviderError(lastError);
  throw {
    ...base,
    message: attemptErrors.length > 1 ? detail : base.message,
    retryable: base.retryable
  } satisfies ProviderError;
}
