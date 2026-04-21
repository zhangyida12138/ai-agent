import { randomUUID } from 'crypto';
import type { ChatMessage, SendChatRequest } from '@ai-agent/shared';
import { ErrorCodes } from '@ai-agent/shared';
import { AIProviderRouter } from '../ai/provider-router';
import { ChatHistoryStore } from '../db/chat-history-store';

function nowIso() {
  return new Date().toISOString();
}

function toProviderMessages(history: ChatMessage[]) {
  return history.map((m) => ({ role: m.role, content: m.content }));
}

function toCitations(
  evidence: Array<{ id: string; source: { path: string }; text: string; metadata?: { chunkIndex?: number } }>
): Array<{ refId: string; label: string; snippet: string }> {
  return evidence.map((e, idx) => {
    const sourceLabel = e.source.path || 'local-doc';
    const chunk = typeof e.metadata?.chunkIndex === 'number' ? `#${e.metadata.chunkIndex}` : '';
    const label = `${idx + 1}. ${sourceLabel}${chunk ? ` ${chunk}` : ''}`;
    const snippet = e.text.length > 180 ? `${e.text.slice(0, 180)}...` : e.text;
    return { refId: e.id, label, snippet };
  });
}

function cosineSimilarity(a: number[], b: number[]) {
  if (!a.length || !b.length || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    na += av * av;
    nb += bv * bv;
  }
  if (na <= 0 || nb <= 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export class ChatService {
  private storePromise: Promise<ChatHistoryStore>;
  private provider: AIProviderRouter;

  constructor(storePromise: Promise<ChatHistoryStore>, provider: AIProviderRouter) {
    this.storePromise = storePromise;
    this.provider = provider;
  }

  async listConversations(limit: number, userId: string) {
    const store = await this.storePromise;
    return store.listConversations(limit, userId);
  }

  async listMessages(conversationId: string, limit: number) {
    const store = await this.storePromise;
    return store.listMessages(conversationId, limit);
  }

  private async buildGenerationContext(req: SendChatRequest) {
    const store = await this.storePromise;
    const conversationId = req.conversationId;
    await store.upsertConversation(conversationId, null, (req as any).userId ?? null);

    const userMsg: ChatMessage = {
      id: randomUUID(),
      conversationId,
      role: 'user',
      content: req.userMessage,
      createdAt: nowIso()
    };
    await store.appendMessage(userMsg);
    const ctx = (await store.listMessages(conversationId, 20)).messages;

    const providerKind = (process.env.AI_PROVIDER_KIND || 'deepseek').toLowerCase();
    const useLocalKnowledge = Boolean(req.options?.useLocalKnowledge);
    const retrievalTopK = req.options?.retrievalTopK ?? 5;
    const maxEvidenceChars = req.options?.maxEvidenceChars ?? 3000;
    const retrievalScoreThreshold = Number(process.env.RAG_SCORE_THRESHOLD ?? 0.08);
    const rerankWeight = Number(process.env.RAG_RERANK_WEIGHT ?? 0.65);
    let evidenceSystemMessage: { role: 'system'; content: string } | null = null;
    let citations: Array<{ refId: string; label: string; snippet: string }> = [];
    let noEvidenceFallbackText: string | null = null;
    if (useLocalKnowledge) {
      const candidates = await store.lexicalRetrieveEvidence(req.userMessage, Math.max(retrievalTopK * 4, 12));
      const reranked = await this.rerankEvidenceByEmbeddings(providerKind, req.requestId, req.userMessage, candidates, rerankWeight);
      const filtered = reranked.filter((e) => (Number(e.score) || 0) >= retrievalScoreThreshold).slice(0, retrievalTopK);
      const deduped = filtered.filter((item, idx, arr) => arr.findIndex((x) => x.text === item.text) === idx);
      const trimmedEvidence = deduped.map((e) => ({
        id: e.id,
        source: e.source,
        score: e.score,
        text: e.text.length > maxEvidenceChars ? e.text.slice(0, maxEvidenceChars) : e.text
      }));
      if (trimmedEvidence.length === 0) {
        noEvidenceFallbackText = '未检索到相关资料。请先导入相关文档，或换一个更具体的问题再试。';
      } else {
        const ragInstruction =
          '你处于强制RAG模式：只能依据<<EVIDENCE>>中的证据回答。若证据不足，请明确回答“未检索到相关资料”。不要编造。';
        evidenceSystemMessage = {
          role: 'system',
          content: `${ragInstruction}\n<<EVIDENCE>>${JSON.stringify(trimmedEvidence)}<</EVIDENCE>>`
        };
        if (req.options?.includeCitations) citations = toCitations(trimmedEvidence);
      }
    }

    const providerMessages = evidenceSystemMessage ? [evidenceSystemMessage, ...toProviderMessages(ctx)] : toProviderMessages(ctx);
    return { store, providerKind, providerMessages, citations, noEvidenceFallbackText };
  }

  private async rerankEvidenceByEmbeddings(
    providerKind: string,
    requestId: string,
    query: string,
    candidates: Array<{ id: string; source: { path: string }; text: string; score: number; metadata?: { chunkIndex?: number } }>,
    rerankWeight: number
  ) {
    if (candidates.length === 0) return candidates;
    try {
      const texts = [query, ...candidates.map((c) => c.text.slice(0, 1200))];
      const vectors = await this.provider.generateEmbeddings({
        requestId,
        taskType: 'embeddings',
        providerKind,
        input: { texts }
      });
      if (vectors.length !== texts.length) return candidates;
      const queryVec = vectors[0];
      if (!queryVec) return candidates;
      const rescored = candidates.map((c, idx) => {
        const candidateVec = vectors[idx + 1];
        const sim = candidateVec ? cosineSimilarity(queryVec, candidateVec) : 0;
        const hybridScore = (1 - rerankWeight) * (c.score || 0) + rerankWeight * sim;
        return { ...c, score: hybridScore };
      });
      rescored.sort((a, b) => (b.score || 0) - (a.score || 0));
      return rescored;
    } catch {
      return candidates;
    }
  }

  async sendMessage(req: SendChatRequest) {
    const conversationId = req.conversationId;
    const assistantMessageId = randomUUID();

    try {
      const { store, providerKind, providerMessages, citations, noEvidenceFallbackText } = await this.buildGenerationContext(req);
      if (noEvidenceFallbackText) {
        const assistantMsg: ChatMessage = {
          id: assistantMessageId,
          conversationId,
          role: 'assistant',
          content: noEvidenceFallbackText,
          citations,
          createdAt: nowIso()
        };
        await store.appendMessage(assistantMsg);
        return {
          reply: { text: noEvidenceFallbackText, citations },
          persisted: { conversationId, assistantMessageId }
        };
      }
      const providerResp = await this.provider.generateText({
        requestId: req.requestId,
        taskType: 'chat',
        providerKind,
        modelId: null,
        input: {
          prompt: null,
          messages: providerMessages
        },
        generation: {
          temperature: 0.2,
          maxTokens: req.options?.maxReplyChars ? Math.max(256, Math.floor(req.options.maxReplyChars / 4)) : 800,
          topP: 1
        }
      });

      const assistantMsg: ChatMessage = {
        id: assistantMessageId,
        conversationId,
        role: 'assistant',
        content: providerResp.text,
        citations,
        createdAt: nowIso()
      };
      await store.appendMessage(assistantMsg);

      return {
        reply: {
          text: providerResp.text,
          citations
        },
        persisted: {
          conversationId,
          assistantMessageId
        }
      };
    } catch (e: any) {
      const code = e?.code ? String(e.code) : ErrorCodes.INTERNAL_PROVIDER_ERROR;
      const retryable = Boolean(e?.retryable ?? true);
      const message = e?.message ? String(e.message) : 'AI generation failed';
      const nextAction = e?.nextAction ? String(e.nextAction) : undefined;
      throw { code, message, retryable, nextAction };
    }
  }

  async sendMessageStream(
    req: SendChatRequest,
    onDelta: (delta: string) => void
  ): Promise<{ reply: { text: string; citations: Array<{ refId: string; label: string; snippet: string }> }; persisted: { conversationId: string; assistantMessageId: string } }> {
    const conversationId = req.conversationId;
    const assistantMessageId = randomUUID();
    try {
      const { store, providerKind, providerMessages, citations, noEvidenceFallbackText } = await this.buildGenerationContext(req);
      if (noEvidenceFallbackText) {
        onDelta(noEvidenceFallbackText);
        const assistantMsg: ChatMessage = {
          id: assistantMessageId,
          conversationId,
          role: 'assistant',
          content: noEvidenceFallbackText,
          citations,
          createdAt: nowIso()
        };
        await store.appendMessage(assistantMsg);
        return {
          reply: { text: noEvidenceFallbackText, citations },
          persisted: { conversationId, assistantMessageId }
        };
      }
      const providerResp = await this.provider.generateTextStream(
        {
          requestId: req.requestId,
          taskType: 'chat',
          providerKind,
          modelId: null,
          input: { prompt: null, messages: providerMessages },
          generation: {
            temperature: 0.2,
            maxTokens: req.options?.maxReplyChars ? Math.max(256, Math.floor(req.options.maxReplyChars / 4)) : 800,
            topP: 1
          }
        },
        onDelta
      );
      const assistantMsg: ChatMessage = {
        id: assistantMessageId,
        conversationId,
        role: 'assistant',
        content: providerResp.text,
        citations,
        createdAt: nowIso()
      };
      await store.appendMessage(assistantMsg);
      return {
        reply: { text: providerResp.text, citations },
        persisted: { conversationId, assistantMessageId }
      };
    } catch (e: any) {
      const code = e?.code ? String(e.code) : ErrorCodes.INTERNAL_PROVIDER_ERROR;
      const retryable = Boolean(e?.retryable ?? true);
      const message = e?.message ? String(e.message) : 'AI generation failed';
      const nextAction = e?.nextAction ? String(e.nextAction) : undefined;
      throw { code, message, retryable, nextAction };
    }
  }
}

