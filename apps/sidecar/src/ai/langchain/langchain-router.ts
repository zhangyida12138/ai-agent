import { ErrorCodes } from '@ai-agent/shared';
import type { ProviderRequest, ProviderTextResponse } from '../provider-router';
import { getProviderProfile, resolveFailoverOrder, type LlmProviderId } from './provider-config';
import { withProviderFailover } from './failover';
import { createChatModel, createEmbeddingsModel } from './model-factory';
import { contentToText, toLangChainMessages } from './to-messages';
import { isProviderError, toProviderError } from './map-error';
import { isTimeoutError, mergeAbortSignals, providerTimeoutMs, withPromiseTimeout } from './with-timeout';

function usageFromResponse(res: {
  usage_metadata?: Record<string, number>;
}): ProviderTextResponse['usage'] | undefined {
  const u = res.usage_metadata;
  if (!u) return undefined;
  const promptTokens = Number(u.input_tokens ?? u.prompt_tokens ?? 0);
  const completionTokens = Number(u.output_tokens ?? u.completion_tokens ?? 0);
  const totalTokens = Number(u.total_tokens ?? promptTokens + completionTokens);
  if (!promptTokens && !completionTokens && !totalTokens) return undefined;
  return { promptTokens, completionTokens, totalTokens };
}

function callSignal(providerId: LlmProviderId, isFallback: boolean, parent?: AbortSignal): AbortSignal {
  return mergeAbortSignals(parent, providerTimeoutMs(providerId, isFallback));
}

function rethrowAbort(err: unknown): never {
  if (isProviderError(err) && err.code === 'ABORTED') {
    throw err;
  }
  if (isTimeoutError(err)) {
    throw {
      code: ErrorCodes.TIMEOUT,
      message: err instanceof Error ? err.message : '模型请求超时',
      retryable: true
    };
  }
  if ((err as { name?: string })?.name === 'AbortError') {
    throw {
      code: 'ABORTED',
      message: 'generation aborted',
      retryable: false
    };
  }
  throw err;
}

export async function langchainGenerateText(req: ProviderRequest): Promise<ProviderTextResponse> {
  const messages = toLangChainMessages(req.input.messages ?? []);
  const order = resolveFailoverOrder(req.providerKind);
  const { result } = await withProviderFailover(
    order,
    async (providerId, ctx) => {
      const profile = getProviderProfile(providerId);
      if (!profile) {
        throw {
          code: ErrorCodes.PROVIDER_NOT_CONFIGURED,
          message: `Provider "${providerId}" is not configured`,
          retryable: true
        };
      }
      const model = createChatModel(profile, {
        modelId: req.modelId,
        temperature: req.generation?.temperature,
        maxTokens: req.generation?.maxTokens,
        topP: req.generation?.topP
      });
      const signal = callSignal(providerId, ctx.isFallback);
      try {
        const res = await model.invoke(messages, { signal });
        return {
          text: contentToText(res.content),
          usage: usageFromResponse(res as { usage_metadata?: Record<string, number> })
        };
      } catch (err) {
        rethrowAbort(err);
      }
    },
    undefined
  );
  return result;
}

export async function langchainGenerateTextStream(
  req: ProviderRequest,
  onDelta: (delta: string) => void,
  options?: { signal?: AbortSignal; shouldStop?: () => boolean }
): Promise<ProviderTextResponse> {
  const messages = toLangChainMessages(req.input.messages ?? []);
  const order = resolveFailoverOrder(req.providerKind);
  const shouldStop = options?.shouldStop;

  try {
    const { result } = await withProviderFailover(
      order,
      async (providerId, ctx) => {
        const profile = getProviderProfile(providerId);
        if (!profile) {
          throw {
            code: ErrorCodes.PROVIDER_NOT_CONFIGURED,
            message: `Provider "${providerId}" is not configured`,
            retryable: true
          };
        }
        const model = createChatModel(profile, {
          modelId: req.modelId,
          temperature: req.generation?.temperature,
          maxTokens: req.generation?.maxTokens,
          topP: req.generation?.topP
        });

        const signal = callSignal(providerId, ctx.isFallback, options?.signal);
        let text = '';
        try {
          const stream = await model.stream(messages, { signal });
          for await (const chunk of stream) {
            if (shouldStop?.()) {
              throw {
                code: 'ABORTED',
                message: 'Stream aborted by caller',
                retryable: false,
                partialText: text
              };
            }
            const delta = contentToText(chunk.content);
            if (!delta) continue;
            text += delta;
            onDelta(delta);
          }
          return { text };
        } catch (err) {
          rethrowAbort(err);
        }
      },
      { signal: options?.signal }
    );
    return result;
  } catch (err) {
    if (options?.signal?.aborted || (err as { name?: string })?.name === 'AbortError') {
      throw {
        code: 'ABORTED',
        message: 'generation aborted',
        retryable: false,
        partialText: isProviderError(err) ? err.partialText : undefined
      };
    }
    if (isProviderError(err) && err.code === 'ABORTED') {
      throw {
        code: 'ABORTED',
        message: err.message,
        retryable: false,
        partialText: err.partialText
      };
    }
    throw toProviderError(err);
  }
}

export async function langchainGenerateEmbeddings(req: ProviderRequest): Promise<number[][]> {
  const texts = req.input.texts ?? [];
  if (texts.length === 0) return [];

  const order = resolveFailoverOrder(req.providerKind);
  const { result } = await withProviderFailover(order, async (providerId, ctx) => {
    const profile = getProviderProfile(providerId);
    if (!profile) {
      throw {
        code: ErrorCodes.PROVIDER_NOT_CONFIGURED,
        message: `Provider "${providerId}" is not configured`,
        retryable: true
      };
    }
    const embedder = createEmbeddingsModel(profile);
    const timeoutMs = providerTimeoutMs(providerId, ctx.isFallback);
    try {
      const vectors = await withPromiseTimeout(embedder.embedDocuments(texts), timeoutMs, `${providerId} embedding`);
      return vectors.map((row) => row.map((x) => Number(x)));
    } catch (err) {
      rethrowAbort(err);
    }
  });
  return result;
}
