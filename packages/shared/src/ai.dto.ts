export type ProviderRequest = {
  requestId: string;
  taskType: "chat" | "summarize" | "embeddings" | "vision";
  providerKind: string; // provider selection
  modelId?: string | null;
  input: {
    prompt?: string | null;
    messages?: Array<{ role: string; content: string }>;
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

