import { Body, Controller, Headers, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ChatHistoryStore } from '../db/chat-history-store';

type UpstreamKind = 'deepseek' | 'dashscope';

function resolveUpstream(): { kind: UpstreamKind; chatUrl: string; apiKey: string | null } {
  const raw = (process.env.PAGE_AGENT_UPSTREAM || 'deepseek').toLowerCase().trim();
  const kind: UpstreamKind = raw === 'dashscope' || raw === 'qwen' ? 'dashscope' : 'deepseek';

  if (kind === 'dashscope') {
    const baseUrl = (process.env.DASHSCOPE_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1').replace(/\/$/, '');
    const apiKey = process.env.DASHSCOPE_API_KEY?.trim() || null;
    return { kind, chatUrl: `${baseUrl}/chat/completions`, apiKey };
  }

  const baseUrl = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, '');
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim() || null;
  return { kind, chatUrl: `${baseUrl}/chat/completions`, apiKey };
}

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

  /**
   * Page Agent OpenAI 兼容入口：浏览器只带用户登录态，模型密钥仅服务端读取。
   * 上游由 `PAGE_AGENT_UPSTREAM` 选择：`deepseek`（默认）或 `dashscope`（通义千问兼容模式）。
   */
  @Post('/page-agent/llm/v1/chat/completions')
  async proxyChatCompletions(
    @Headers('authorization') authHeader: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: false }) res: Response
  ) {
    const user = await this.requireUser(authHeader);
    if (!user) {
      res.status(401).json({ error: { message: '请先登录', type: 'unauthorized' } });
      return;
    }

    const { kind, chatUrl, apiKey } = resolveUpstream();
    if (!apiKey) {
      const hint =
        kind === 'dashscope'
          ? '请在服务端环境配置 DASHSCOPE_API_KEY，并设置 PAGE_AGENT_UPSTREAM=dashscope'
          : '请在服务端环境配置 DEEPSEEK_API_KEY（或设置 PAGE_AGENT_UPSTREAM=dashscope 使用通义）';
      res.status(503).json({
        error: {
          message: `Page Agent 上游未配置 API Key（${kind}）。${hint}`,
          type: 'proxy_not_configured'
        }
      });
      return;
    }

    let upstream: globalThis.Response;
    try {
      upstream = await fetch(chatUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify(body ?? {})
      });
    } catch {
      res.status(502).json({ error: { message: '转发模型请求失败', type: 'upstream_network_error' } });
      return;
    }

    const ct = upstream.headers.get('content-type');
    if (ct) res.setHeader('Content-Type', ct);
    res.status(upstream.status);
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.send(buf);
  }
}
