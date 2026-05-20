import React, { useCallback, useEffect, useRef } from 'react';
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

function attachDisposeCleanup(agent: PageAgent, agentRef: React.MutableRefObject<PageAgent | null>) {
  const onDispose = () => {
    agent.removeEventListener('dispose', onDispose);
    if (agentRef.current === agent) {
      agentRef.current = null;
    }
    if (window.pageAgent === agent) {
      delete window.pageAgent;
    }
  };
  agent.addEventListener('dispose', onDispose);
}

async function instantiatePageAgent(): Promise<PageAgent> {
  const { PageAgent } = await import('page-agent');
  // 与 Sidecar Page Agent 代理一致（默认千问 qwen-plus；实际模型以服务端 PAGE_AGENT_MODEL 为准）
  const model = (import.meta.env.VITE_PAGE_AGENT_MODEL as string | undefined)?.trim() || 'qwen-plus';
  const baseURL = pageAgentLlmBaseUrl();
  const language = PAGE_AGENT_LANG === 'en-US' || PAGE_AGENT_LANG === 'zh-CN' ? PAGE_AGENT_LANG : 'zh-CN';
  return new PageAgent({
    model,
    baseURL,
    language,
    customFetch: createAuthFetch()
  });
}

/**
 * 在已登录会话中初始化 Page Agent：
 * - `baseURL` 指向本应用 Sidecar 的 OpenAI 兼容代理（同源的 `/api/...` 或 `VITE_SIDECAR_URL`），**不把模型密钥写进前端**；
 * - `customFetch` 携带用户登录 Bearer；服务端默认千问优先，再智谱 → DeepSeek → Gemini（`PAGE_AGENT_FAILOVER_ORDER` 可配置）。
 * - 不传 `apiKey`：page-agent 仅在 `apiKey` 非空时才会加 `Authorization: Bearer <模型密钥>`，此处由代理负责鉴权到上游。
 *
 * 说明：用户在面板空闲时点「X」会触发库内 `agent.dispose()`，面板 DOM 会被移除。此处在 `dispose` 时清空引用，并在 Ctrl+F 时按需重新创建实例，才能再次打开面板。
 */
export function PageAgentHost({ enabled }: Props) {
  const agentRef = useRef<PageAgent | null>(null);
  const creatingRef = useRef<Promise<PageAgent> | null>(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const getOrCreateAgent = useCallback(async (): Promise<PageAgent> => {
    const cur = agentRef.current;
    if (cur && !cur.disposed) return cur;
    if (creatingRef.current) return creatingRef.current;
    const p = (async () => {
      const agent = await instantiatePageAgent();
      attachDisposeCleanup(agent, agentRef);
      agentRef.current = agent;
      window.pageAgent = agent;
      return agent;
    })();
    creatingRef.current = p;
    try {
      return await p;
    } finally {
      creatingRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    void getOrCreateAgent().then((agent) => {
      if (cancelled) {
        agent.dispose();
      }
    });

    return () => {
      cancelled = true;
      agentRef.current?.dispose();
      agentRef.current = null;
      if (window.pageAgent) delete window.pageAgent;
      creatingRef.current = null;
    };
  }, [enabled, getOrCreateAgent]);

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.key.toLowerCase() !== 'f') return;
      if (!enabledRef.current) return;
      e.preventDefault();
      e.stopPropagation();

      void (async () => {
        const agent = await getOrCreateAgent();
        if (!enabledRef.current) {
          agent.dispose();
          return;
        }
        agent.panel.show();
      })();
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [enabled, getOrCreateAgent]);

  return null;
}
