import React, { useEffect, useRef } from 'react';
import type { PageAgent } from 'page-agent';
import { AUTH_TOKEN_KEY } from '../api';
import { pageAgentLlmBaseUrl } from './page-agent-llm-base-url';

function createAuthFetch(): typeof fetch {
  return (input: RequestInfo | URL, init?: RequestInit) => {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    const headers = new Headers(init?.headers);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return fetch(input, { ...init, headers });
  };
}

declare global {
  interface Window {
    /** 调试或脚本调用：`await window.pageAgent?.execute('...')` */
    pageAgent?: PageAgent;
  }
}

type Props = {
  /** 仅在主界面挂载，避免登录页加载大体积依赖 */
  enabled: boolean;
};

const PAGE_AGENT_LANG = (import.meta.env.VITE_PAGE_AGENT_LANGUAGE as string | undefined)?.trim();

/**
 * 在已登录会话中初始化 Page Agent：
 * - `baseURL` 指向本应用 Sidecar 的 OpenAI 兼容代理（同源的 `/api/...` 或 `VITE_SIDECAR_URL`），**不把 DashScope / DeepSeek 等模型密钥写进前端**；
 * - `customFetch` 携带用户登录 Bearer，由服务端校验后再用 `DASHSCOPE_API_KEY` 或 `DEEPSEEK_API_KEY` 调用上游（见 `PAGE_AGENT_UPSTREAM`）。
 * - 不传 `apiKey`：page-agent 仅在 `apiKey` 非空时才会加 `Authorization: Bearer <模型密钥>`，此处由代理负责鉴权到上游。
 */
export function PageAgentHost({ enabled }: Props) {
  const agentRef = useRef<PageAgent | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    (async () => {
      const { PageAgent } = await import('page-agent');
      if (cancelled) return;

      const model = (import.meta.env.VITE_PAGE_AGENT_MODEL as string | undefined)?.trim() || 'deepseek-chat';
      const baseURL = pageAgentLlmBaseUrl();
      const language = PAGE_AGENT_LANG === 'en-US' || PAGE_AGENT_LANG === 'zh-CN' ? PAGE_AGENT_LANG : 'zh-CN';

      const agent = new PageAgent({
        model,
        baseURL,
        language,
        customFetch: createAuthFetch()
      });

      agentRef.current = agent;
      window.pageAgent = agent;
    })();

    return () => {
      cancelled = true;
      agentRef.current?.dispose();
      agentRef.current = null;
      if (window.pageAgent) delete window.pageAgent;
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.key.toLowerCase() !== 'f') return;
      const agent = agentRef.current;
      if (!agent) return;
      e.preventDefault();
      e.stopPropagation();
      agent.panel.show();
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [enabled]);

  return null;
}
