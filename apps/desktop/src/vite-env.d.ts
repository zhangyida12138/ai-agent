/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SIDECAR_URL?: string;
  /** Page Agent 模型名，默认 glm-4-flash；服务端会按上游替换为 ZHIPU_MODEL 等 */
  readonly VITE_PAGE_AGENT_MODEL?: string;
  /** `zh-CN` | `en-US`，缺省为 zh-CN */
  readonly VITE_PAGE_AGENT_LANGUAGE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
