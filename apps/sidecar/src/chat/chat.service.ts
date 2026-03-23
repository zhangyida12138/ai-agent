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

export class ChatService {
  private storePromise: Promise<ChatHistoryStore>;
  private provider: AIProviderRouter;

  constructor(storePromise: Promise<ChatHistoryStore>, provider: AIProviderRouter) {
    this.storePromise = storePromise;
    this.provider = provider;
  }

  async listConversations(limit: number) {
    const store = await this.storePromise;
    return store.listConversations(limit);
  }

  async listMessages(conversationId: string, limit: number) {
    const store = await this.storePromise;
    return store.listMessages(conversationId, limit);
  }

  async sendMessage(req: SendChatRequest) {
    const store = await this.storePromise;
    const conversationId = req.conversationId;
    const userMessageId = randomUUID();
    const assistantMessageId = randomUUID();
    const createdAt = nowIso();

    // Ensure conversation exists (idempotent).
    await store.upsertConversation(conversationId, null);

    const userMsg: ChatMessage = {
      id: userMessageId,
      conversationId,
      role: 'user',
      content: req.userMessage,
      createdAt
    };

    await store.appendMessage(userMsg);

    // Load recent messages for context (MVP: last N messages before generation).
    const ctx = (await store.listMessages(conversationId, 20)).messages;

    try {
      const providerKind = (req.options?.useLocalKnowledge ? (process.env.AI_PROVIDER_KIND || 'mock') : (process.env.AI_PROVIDER_KIND || 'mock')).toLowerCase();

      const useLocalKnowledge = Boolean(req.options?.useLocalKnowledge);
      const retrievalTopK = req.options?.retrievalTopK ?? 5;
      const maxEvidenceChars = req.options?.maxEvidenceChars ?? 3000;

      let evidenceSystemMessage: { role: 'system'; content: string } | null = null;
      let citations: Array<{ refId: string; label: string; snippet: string }> = [];
      if (useLocalKnowledge) {
        const evidence = await store.lexicalRetrieveEvidence(req.userMessage, retrievalTopK);

        const trimmedEvidence = evidence.map((e) => ({
          id: e.id,
          source: e.source,
          score: e.score,
          text: e.text.length > maxEvidenceChars ? e.text.slice(0, maxEvidenceChars) : e.text
        }));

        evidenceSystemMessage = {
          role: 'system',
          content: `<<EVIDENCE>>${JSON.stringify(trimmedEvidence)}<</EVIDENCE>>`
        };

        if (req.options?.includeCitations) {
          citations = toCitations(trimmedEvidence);
        }
      }

      const providerMessages = evidenceSystemMessage
        ? [evidenceSystemMessage, ...toProviderMessages(ctx)]
        : toProviderMessages(ctx);

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
}

