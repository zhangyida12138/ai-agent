import { Body, Controller, Delete, Get, Headers, Param, Post, Put } from '@nestjs/common';
import type { IngestTextRequest, IngestTextResponse } from '@ai-agent/shared';
import { ChatHistoryStore } from '../db/chat-history-store';
import { fail, failFromUnknown, ok } from '../http/api-response';

@Controller()
export class KnowledgeController {
  private storePromise: Promise<ChatHistoryStore>;

  constructor() {
    this.storePromise = ChatHistoryStore.create();
  }

  private async requireUser(authHeader?: string) {
    const token = this.extractToken(authHeader);
    if (!token) return null;
    return (await this.storePromise).getUserByToken(token);
  }

  private extractToken(authHeader?: string): string | null {
    const v = String(authHeader ?? '').trim();
    if (!v.toLowerCase().startsWith('bearer ')) return null;
    return v.slice(7).trim() || null;
  }

  @Post('/knowledge/ingest-text')
  async ingestText(@Headers('authorization') authHeader: string | undefined, @Body() body: any) {
    const user = await this.requireUser(authHeader);
    if (!user) return fail('UNAUTHORIZED', false);
    const text = String(body?.text ?? '').trim();
    if (!text) {
      return fail('INVALID_PARAMS', false);
    }

    const req: IngestTextRequest = {
      requestId: body?.requestId,
      title: body?.title ?? null,
      sourcePath: body?.sourcePath ?? null,
      text,
      options: body?.options
    };

    try {
      const data = await (await this.storePromise).ingestText(req, user.id);
      return ok<IngestTextResponse>(data);
    } catch (e: any) {
      return failFromUnknown('knowledge/ingest-text', e, 'INTERNAL_ERROR', true);
    }
  }

  @Get('/knowledge/stats')
  async stats(@Headers('authorization') authHeader: string | undefined) {
    const user = await this.requireUser(authHeader);
    if (!user) return fail('UNAUTHORIZED', false);
    const store = await this.storePromise;
    return ok(await store.getKnowledgeStats(user.id));
  }

  @Post('/knowledge/retrieve')
  async retrieve(@Headers('authorization') authHeader: string | undefined, @Body() body: any) {
    const user = await this.requireUser(authHeader);
    if (!user) return fail('UNAUTHORIZED', false);
    const query = String(body?.query ?? '').trim();
    const topK = Number(body?.topK ?? 5);
    if (!query) {
      return fail('INVALID_PARAMS', false);
    }
    try {
      const store = await this.storePromise;
      const evidence = await store.lexicalRetrieveEvidence(query, Math.max(1, Math.floor(topK)));
      return ok({ evidence });
    } catch (e: any) {
      return failFromUnknown('knowledge/retrieve', e, 'INTERNAL_ERROR', true);
    }
  }

  @Get('/knowledge/documents')
  async listDocuments(@Headers('authorization') authHeader: string | undefined) {
    const user = await this.requireUser(authHeader);
    if (!user) return fail('UNAUTHORIZED', false);
    const store = await this.storePromise;
    return ok({ documents: await store.listDocuments(user.id) });
  }

  @Get('/knowledge/documents/:docId')
  async getDocument(@Headers('authorization') authHeader: string | undefined, @Param('docId') docId: string) {
    const user = await this.requireUser(authHeader);
    if (!user) return fail('UNAUTHORIZED', false);
    const store = await this.storePromise;
    const doc = await store.getDocumentById(user.id, docId);
    if (!doc) return fail('DOC_NOT_FOUND', false);
    return ok({ document: doc });
  }

  @Put('/knowledge/documents/:docId')
  async updateDocument(
    @Headers('authorization') authHeader: string | undefined,
    @Param('docId') docId: string,
    @Body() body: any
  ) {
    const user = await this.requireUser(authHeader);
    if (!user) return fail('UNAUTHORIZED', false);
    const text = String(body?.text ?? '').trim();
    const title = body?.title == null ? null : String(body.title);
    if (!text) return fail('INVALID_PARAMS', false);
    try {
      const store = await this.storePromise;
      await store.updateDocument(user.id, docId, title, text);
      return ok({ id: docId });
    } catch (e: any) {
      if (String(e?.message) === 'DOC_NOT_FOUND') {
        return fail('DOC_NOT_FOUND', false);
      }
      return fail('INTERNAL_ERROR', true, { cause: e, logTag: 'knowledge/documents/update' });
    }
  }

  @Delete('/knowledge/documents/:docId')
  async deleteDocument(@Headers('authorization') authHeader: string | undefined, @Param('docId') docId: string) {
    const user = await this.requireUser(authHeader);
    if (!user) return fail('UNAUTHORIZED', false);
    const store = await this.storePromise;
    const okDeleted = await store.deleteDocument(user.id, docId);
    if (!okDeleted) return fail('DOC_NOT_FOUND', false);
    return ok({ id: docId });
  }
}
