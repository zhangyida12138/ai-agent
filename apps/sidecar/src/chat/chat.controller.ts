import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ChatHistoryStore } from '../db/chat-history-store';
import { AIProviderRouter } from '../ai/provider-router';
import { ChatService } from './chat.service';
import type { SendChatRequest } from '@ai-agent/shared';

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

  @Get('/conversations')
  async listConversations(@Query('limit') limitStr?: string) {
    const limit = limitStr ? Math.max(1, Number(limitStr)) : 20;
    return ok(await this.chatService.listConversations(limit));
  }

  @Get('/conversations/:conversationId/messages')
  async listMessages(
    @Param('conversationId') conversationId: string,
    @Query('limit') limitStr?: string
  ) {
    const limit = limitStr ? Math.max(1, Number(limitStr)) : 50;
    return ok(await this.chatService.listMessages(conversationId, limit));
  }

  @Post('/chat/send')
  async sendChat(@Body() body: any) {
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
}

