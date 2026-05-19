import {
  langchainGenerateEmbeddings,
  langchainGenerateText,
  langchainGenerateTextStream
} from './langchain/langchain-router';

export type ProviderTaskType = 'chat' | 'summarize' | 'embeddings' | 'vision';

export type ProviderRequest = {
  requestId: string;
  taskType: ProviderTaskType;
  providerKind: string;
  modelId?: string | null;
  input: {
    prompt?: string | null;
    messages?: Array<{ role: string; content: string }>;
    texts?: string[];
  };
  generation?: {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
  };
};

export type ProviderTextResponse = {
  text: string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
};

/**
 * LangChain 多模型路由：默认智谱优先，失败自动切换 DeepSeek / Gemini（见 .env）。
 */
export class AIProviderRouter {
  generateText(req: ProviderRequest): Promise<ProviderTextResponse> {
    return langchainGenerateText(req);
  }

  generateTextStream(
    req: ProviderRequest,
    onDelta: (delta: string) => void,
    options?: { signal?: AbortSignal; shouldStop?: () => boolean }
  ): Promise<ProviderTextResponse> {
    return langchainGenerateTextStream(req, onDelta, options);
  }

  generateEmbeddings(req: ProviderRequest): Promise<number[][]> {
    return langchainGenerateEmbeddings(req);
  }
}
