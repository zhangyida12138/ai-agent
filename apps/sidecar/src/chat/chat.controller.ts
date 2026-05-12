import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ChatHistoryStore } from '../db/chat-history-store';
import { AIProviderRouter } from '../ai/provider-router';
import { ChatService } from './chat.service';
import type { SendChatRequest } from '@ai-agent/shared';
import type { Response } from 'express';
import type { Request } from 'express';
import { Req, Res } from '@nestjs/common';

function ok<T>(data: T) {
  return { ok: true as const, code: 'SUCCESS', data };
}

function err(params: { code: string; message: string; retryable: boolean; nextAction?: string }) {
  return { ok: false as const, ...params };
}

@Controller()
export class ChatController {
  private chatService: ChatService;

  constructor() {
    const storePromise = ChatHistoryStore.create();
    const router = new AIProviderRouter();
    this.chatService = new ChatService(storePromise, router);
  }

  private async requireUser(authHeader?: string) {
    const token = this.extractToken(authHeader);
    if (!token) return null;
    const store = await ChatHistoryStore.create();
    return store.getUserByToken(token);
  }

  private extractToken(authHeader?: string): string | null {
    const v = String(authHeader ?? '').trim();
    if (!v.toLowerCase().startsWith('bearer ')) return null;
    return v.slice(7).trim() || null;
  }

  @Get('/conversations')
  async listConversations(
    @Headers('authorization') authHeader: string | undefined,
    @Query('limit') limitStr?: string,
    @Query('offset') offsetStr?: string
  ) {
    const user = await this.requireUser(authHeader);
    if (!user) return err({ code: 'UNAUTHORIZED', message: '请先登录', retryable: false });
    const limit = limitStr ? Math.max(1, Number(limitStr)) : 20;
    const offset = offsetStr ? Math.max(0, Number(offsetStr)) : 0;
    return ok(await this.chatService.listConversations(limit, user.id, offset));
  }

  @Get('/conversations/:conversationId/messages')
  async listMessages(
    @Headers('authorization') authHeader: string | undefined,
    @Param('conversationId') conversationId: string,
    @Query('limit') limitStr?: string,
    @Query('beforeCreatedAt') beforeCreatedAt?: string,
    @Query('beforeId') beforeId?: string
  ) {
    const user = await this.requireUser(authHeader);
    if (!user) return err({ code: 'UNAUTHORIZED', message: '请先登录', retryable: false });
    const store = await ChatHistoryStore.create();
    const owns = await store.conversationBelongsToUser(conversationId, user.id);
    if (!owns) return err({ code: 'FORBIDDEN', message: '无权访问该会话', retryable: false });
    const limit = limitStr ? Math.max(1, Number(limitStr)) : 50;
    const before =
      beforeCreatedAt && beforeId
        ? { createdAt: String(beforeCreatedAt).trim(), id: String(beforeId).trim() }
        : null;
    return ok(await this.chatService.listMessages(conversationId, limit, before));
  }

  @Delete('/conversations/:conversationId')
  async deleteConversation(
    @Headers('authorization') authHeader: string | undefined,
    @Param('conversationId') conversationId: string
  ) {
    const user = await this.requireUser(authHeader);
    if (!user) return err({ code: 'UNAUTHORIZED', message: '请先登录', retryable: false });
    const store = await ChatHistoryStore.create();
    const deleted = await store.deleteConversation(conversationId, user.id);
    if (!deleted) return err({ code: 'NOT_FOUND', message: '会话不存在', retryable: false });
    return ok({ conversationId });
  }

  @Patch('/conversations/:conversationId')
  async renameConversation(
    @Headers('authorization') authHeader: string | undefined,
    @Param('conversationId') conversationId: string,
    @Body() body: any
  ) {
    const user = await this.requireUser(authHeader);
    if (!user) return err({ code: 'UNAUTHORIZED', message: '请先登录', retryable: false });
    const title = String(body?.title ?? '').trim();
    if (!title) return err({ code: 'INVALID_PARAMS', message: 'title is required', retryable: false });
    const store = await ChatHistoryStore.create();
    const updated = await store.renameConversation(conversationId, user.id, title);
    if (!updated) return err({ code: 'NOT_FOUND', message: '会话不存在', retryable: false });
    return ok({ conversationId, title });
  }

  @Post('/conversations/export')
  async exportConversations(@Headers('authorization') authHeader: string | undefined, @Body() body: any) {
    const user = await this.requireUser(authHeader);
    if (!user) return err({ code: 'UNAUTHORIZED', message: '请先登录', retryable: false });
    const conversationIds = Array.isArray(body?.conversationIds)
      ? body.conversationIds.map((x: any) => String(x).trim()).filter(Boolean)
      : undefined;
    const store = await ChatHistoryStore.create();
    const data = await store.exportConversations(user.id, conversationIds);
    return ok(data);
  }

  @Post('/conversations/import')
  async importConversations(@Headers('authorization') authHeader: string | undefined, @Body() body: any) {
    const user = await this.requireUser(authHeader);
    if (!user) return err({ code: 'UNAUTHORIZED', message: '请先登录', retryable: false });
    try {
      const store = await ChatHistoryStore.create();
      const imported = await store.importConversations(user.id, body?.payload);
      return ok(imported);
    } catch (e: any) {
      if (String(e?.message) === 'INVALID_IMPORT_PAYLOAD') {
        return err({ code: 'INVALID_PARAMS', message: '导入数据格式无效', retryable: false });
      }
      return err({ code: 'IMPORT_FAILED', message: '导入失败', retryable: true });
    }
  }

  @Post('/chat/send')
  async sendChat(@Headers('authorization') authHeader: string | undefined, @Body() body: any) {
    const user = await this.requireUser(authHeader);
    if (!user) return err({ code: 'UNAUTHORIZED', message: '请先登录', retryable: false });
    // Minimal validation for MVP
    const conversationId = String(body?.conversationId ?? '').trim();
    const userMessage = String(body?.userMessage ?? '').trim();
    if (!conversationId) {
      return err({ code: 'INVALID_PARAMS', message: 'conversationId is required', retryable: false });
    }
    if (!userMessage) {
      return err({ code: 'INVALID_PARAMS', message: 'userMessage is required', retryable: false });
    }

    const requestId = String(body?.requestId ?? randomUUID());
    const req: SendChatRequest = {
      requestId,
      conversationId,
      userMessage,
      options: body?.options
    };
    (req as any).userId = user.id;

    try {
      const data = await this.chatService.sendMessage(req);
      return ok(data);
    } catch (e: any) {
      const code = e?.code ? String(e.code) : 'INTERNAL_PROVIDER_ERROR';
      const message = e?.message ? String(e.message) : 'Failed to generate reply';
      const retryable = Boolean(e?.retryable ?? true);
      const nextAction = e?.nextAction ? String(e.nextAction) : undefined;
      return err({ code, message, retryable, nextAction });
    }
  }

  @Post('/chat/stream')
  async streamChat(
    @Headers('authorization') authHeader: string | undefined,
    @Body() body: any,
    @Req() httpReq: Request,
    @Res() res: Response
  ) {
    const user = await this.requireUser(authHeader);
    if (!user) {
      res.status(401).json(err({ code: 'UNAUTHORIZED', message: '请先登录', retryable: false }));
      return;
    }
    const conversationId = String(body?.conversationId ?? '').trim();
    const userMessage = String(body?.userMessage ?? '').trim();
    if (!conversationId || !userMessage) {
      res.status(400).json(err({ code: 'INVALID_PARAMS', message: 'conversationId 和 userMessage 必填', retryable: false }));
      return;
    }
    const requestId = String(body?.requestId ?? randomUUID());
    const req: SendChatRequest = { requestId, conversationId, userMessage, options: body?.options };
    (req as any).userId = user.id;

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    let clientClosed = false;
    httpReq.on('close', () => {
      clientClosed = true;
    });
    const writeEvent = (event: string, data: any) => {
      if (clientClosed) return;
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };
    try {
      writeEvent('start', { requestId, conversationId });
      const data = await this.chatService.sendMessageStream(req, (delta) => writeEvent('delta', { delta }), () => clientClosed);
      if (!clientClosed) {
        writeEvent('done', data);
        res.end();
      }
    } catch (e: any) {
      if (String(e?.code) === 'ABORTED') {
        if (!clientClosed) res.end();
        return;
      }
      writeEvent('error', {
        code: e?.code ? String(e.code) : 'INTERNAL_PROVIDER_ERROR',
        message: e?.message ? String(e.message) : 'Failed to stream reply',
        retryable: Boolean(e?.retryable ?? true)
      });
      if (!clientClosed) res.end();
    }
  }
}

