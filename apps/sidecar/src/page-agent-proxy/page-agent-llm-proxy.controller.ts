import { Body, Controller, Headers, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { ChatHistoryStore } from '../db/chat-history-store';
import { createClientAbortSignal, isClientAbortError } from '../common/client-abort';
import {
  buildUpstreamRequestBody,
  resolvePageAgentUpstreams,
  shouldFailoverPageAgentHttp,
  type PageAgentUpstream
} from './page-agent-upstream';

type ForwardResult = 'ok' | 'failover' | 'cancelled';

@Controller()
export class PageAgentLlmProxyController {
  private storePromise: Promise<ChatHistoryStore>;

  constructor() {
    this.storePromise = ChatHistoryStore.create();
  }

  private extractToken(authHeader?: string): string | null {
    const v = String(authHeader ?? '').trim();
    if (!v.toLowerCase().startsWith('bearer ')) return null;
    return v.slice(7).trim() || null;
  }

  private async requireUser(authHeader?: string) {
    const token = this.extractToken(authHeader);
    if (!token) return null;
    return (await this.storePromise).getUserByToken(token);
  }

  private async forwardUpstream(
    upstream: PageAgentUpstream,
    body: unknown,
    res: Response,
    clientSignal: AbortSignal
  ): Promise<ForwardResult> {
    if (clientSignal.aborted) return 'cancelled';

    let upstreamResp: globalThis.Response;
    try {
      upstreamResp = await fetch(upstream.chatUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${upstream.apiKey}`
        },
        body: buildUpstreamRequestBody(body, upstream.defaultModel),
        signal: clientSignal
      });
    } catch (err) {
      if (isClientAbortError(err, clientSignal)) return 'cancelled';
      throw err;
    }

    if (clientSignal.aborted) return 'cancelled';

    if (!upstreamResp.ok && shouldFailoverPageAgentHttp(upstreamResp.status)) {
      await upstreamResp.text().catch(() => '');
      return 'failover';
    }

    const ct = upstreamResp.headers.get('content-type');
    if (ct) res.setHeader('Content-Type', ct);
    res.status(upstreamResp.status);

    if (!upstreamResp.body) {
      res.end();
      return 'ok';
    }

    try {
      await pipeline(Readable.fromWeb(upstreamResp.body as Parameters<typeof Readable.fromWeb>[0]), res, {
        signal: clientSignal
      });
      return 'ok';
    } catch (err) {
      if (isClientAbortError(err, clientSignal) || res.writableEnded || res.destroyed) {
        return 'cancelled';
      }
      throw err;
    }
  }

  /**
   * Page Agent OpenAI 兼容入口：浏览器只带用户登录态，模型密钥仅服务端读取。
   * 默认按智谱 → Gemini（OpenAI 兼容）→ DeepSeek 故障转移；可用 `PAGE_AGENT_FAILOVER_ORDER` 覆盖。
   * 客户端断开或 Abort 后不再切换上游。
   */
  @Post('/page-agent/llm/v1/chat/completions')
  async proxyChatCompletions(
    @Headers('authorization') authHeader: string | undefined,
    @Body() body: unknown,
    @Req() httpReq: Request,
    @Res({ passthrough: false }) res: Response
  ) {
    const user = await this.requireUser(authHeader);
    if (!user) {
      res.status(401).json({ error: { message: '请先登录', type: 'unauthorized' } });
      return;
    }

    const upstreams = resolvePageAgentUpstreams();
    if (upstreams.length === 0) {
      console.error('[page-agent] 未配置任何可用上游（需 ZHIPU/GEMINI/DEEPSEEK 等 API Key）');
      res.status(503).json({
        error: {
          message: '服务器似乎出现了点问题，请稍后再试。',
          type: 'service_unavailable'
        }
      });
      return;
    }

    const clientSignal = createClientAbortSignal(httpReq, res);
    const attemptErrors: string[] = [];

    for (let i = 0; i < upstreams.length; i++) {
      if (clientSignal.aborted) {
        return;
      }

      const upstream = upstreams[i]!;
      if (i > 0) {
        // eslint-disable-next-line no-console
        console.warn(`[page-agent] 正在切换备用上游 ${upstream.id}…`);
      }

      try {
        const outcome = await this.forwardUpstream(upstream, body, res, clientSignal);
        if (outcome === 'cancelled') {
          return;
        }
        if (outcome === 'ok') {
          if (i > 0) {
            // eslint-disable-next-line no-console
            console.warn(`[page-agent] 已使用上游 ${upstream.id}`);
          }
          return;
        }
        attemptErrors.push(`[${upstream.id}] 上游返回可重试错误`);
      } catch (e) {
        if (isClientAbortError(e, clientSignal)) {
          return;
        }
        const msg = e instanceof Error ? e.message : String(e);
        attemptErrors.push(`[${upstream.id}] ${msg}`);
        if (i < upstreams.length - 1 && !clientSignal.aborted) {
          // eslint-disable-next-line no-console
          console.warn(`[page-agent] ${upstream.id} 调用失败，尝试下一上游: ${msg}`);
        }
      }
    }

    if (clientSignal.aborted || res.writableEnded) {
      return;
    }

    console.error('[page-agent] 所有上游均失败:', attemptErrors.join(' | '));
    res.status(502).json({
      error: {
        message: '服务器似乎出现了点问题，请稍后再试。',
        type: 'upstream_failover_exhausted'
      }
    });
  }
}
