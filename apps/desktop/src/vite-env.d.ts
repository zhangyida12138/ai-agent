/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SIDECAR_URL?: string;
  /** 与 Sidecar `PAGE_AGENT_UPSTREAM` 对应的上游模型名，如 `qwen-plus`、`deepseek-chat` */
  readonly VITE_PAGE_AGENT_MODEL?: string;
  /** `zh-CN` | `en-US`，缺省为 zh-CN */
  readonly VITE_PAGE_AGENT_LANGUAGE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
