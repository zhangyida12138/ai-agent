export type Conversation = {
  id: string;
  title?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ChatMessage = {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system";
  content: string;
  citations?: Array<{
    refId: string;
    label: string;
    snippet: string;
  }>;
  tags?: string[];
  createdAt: string;
};

export type SendChatRequest = {
  requestId: string;
  conversationId: string;
  userMessage: string;
  options?: {
    language?: string;
    useLocalKnowledge?: boolean;
    includeCitations?: boolean;
    maxReplyChars?: number;
    retrievalTopK?: number;
    maxEvidenceChars?: number;
  };
};

export type SendChatResponse = {
  reply: {
    text: string;
    citations?: Array<{
      refId: string;
      label: string;
      snippet: string;
    }>;
  };
  persisted: {
    conversationId: string;
    assistantMessageId: string;
  };
};

export type ListMessagesRequest = {
  conversationId: string;
  limit?: number;
  from?: string | null;
  to?: string | null;
};

export type ListMessagesResponse = {
  conversationId: string;
  messages: ChatMessage[];
  total: number;
};

export type DocumentRef = {
  docId: string;
  title?: string | null;
  sourcePath?: string | null;
};

export type Evidence = {
  id: string; // chunk id
  source: {
    docId: string;
    path: string;
  };
  text: string;
  score: number;
  metadata?: {
    chunkIndex?: number;
    language?: string;
  };
};

export type IngestTextRequest = {
  requestId?: string;
  title?: string | null;
  sourcePath?: string | null;
  text: string;
  options?: {
    chunkSize?: number;
    overlap?: number;
    maxChunks?: number;
  };
};

export type IngestTextResponse = {
  doc: DocumentRef;
  stats: {
    chars: number;
    chunkSize: number;
    overlap: number;
    chunks: number;
  };
};

