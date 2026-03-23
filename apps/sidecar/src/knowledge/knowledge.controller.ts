import { Body, Controller, Get, Post } from '@nestjs/common';
import type { IngestTextRequest, IngestTextResponse } from '@ai-agent/shared';
import { ChatHistoryStore } from '../db/chat-history-store';

function ok<T>(data: T) {
  return { ok: true as const, code: 'SUCCESS', data };
}

function err(params: { code: string; message: string; retryable: boolean; nextAction?: string }) {
  return { ok: false as const, ...params };
}

@Controller()
export class KnowledgeController {
  private storePromise: Promise<ChatHistoryStore>;

  constructor() {
    this.storePromise = ChatHistoryStore.create();
  }

  @Post('/knowledge/ingest-text')
  async ingestText(@Body() body: any) {
    const text = String(body?.text ?? '').trim();
    if (!text) {
      return err({ code: 'INVALID_PARAMS', message: 'text is required', retryable: false });
    }

    const req: IngestTextRequest = {
      requestId: body?.requestId,
      title: body?.title ?? null,
      sourcePath: body?.sourcePath ?? null,
      text,
      options: body?.options
    };

    try {
      const data = await (await this.storePromise).ingestText(req);
      return ok<IngestTextResponse>(data);
    } catch (e: any) {
      return err({
        code: e?.code ? String(e.code) : 'INTERNAL_ERROR',
        message: e?.message ? String(e.message) : 'Ingest failed',
        retryable: true,
        nextAction: 'retry'
      });
    }
  }

  @Get('/knowledge/stats')
  async stats() {
    const store = await this.storePromise;
    return ok(await store.getKnowledgeStats());
  }

  @Post('/knowledge/retrieve')
  async retrieve(@Body() body: any) {
    const query = String(body?.query ?? '').trim();
    const topK = Number(body?.topK ?? 5);
    if (!query) {
      return err({ code: 'INVALID_PARAMS', message: 'query is required', retryable: false });
    }
    try {
      const store = await this.storePromise;
      const evidence = await store.lexicalRetrieveEvidence(query, Math.max(1, Math.floor(topK)));
      return ok({ evidence });
    } catch (e: any) {
      return err({
        code: e?.code ? String(e.code) : 'INTERNAL_ERROR',
        message: e?.message ? String(e.message) : 'Retrieve failed',
        retryable: true,
        nextAction: 'retry'
      });
    }
  }
}

