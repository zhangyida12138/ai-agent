---
name: ai-provider-router
description: Route AI requests to configured text/vision/embedding providers (cloud or local) using a unified request/response protocol with standardized error handling. Use when implementing model-agnostic AI access for the desktop assistant.
---

# AI Provider Router

## When to Use

- 实现或扩展“模型供应商无关”的 AI 接入层（云端 OpenAI 兼容 / 本地 Ollama/LM Studio 等）。
- 需要统一处理：超时、配额、参数不合法、重试策略、返回格式与错误码。

## Input 契约

```json
{
  "taskType": "chat|summarize|embeddings|vision",
  "provider": { "providerKind": "openai|ollama|lmstudio|custom", "modelId": "string" },
  "input": {
    "prompt": "string",
    "messages": [{ "role": "user|assistant|system", "content": "string" }],
    "attachments": [{ "type": "image|file", "ref": "path-or-id", "mime": "optional" }]
  },
  "generation": { "temperature": 0.2, "maxTokens": 800, "topP": 1.0 },
  "requestContext": { "requestId": "string" }
}
```

## Output 契约

```json
{
  "ok": true,
  "code": "SUCCESS|null",
  "data": {
    "text": "string|null",
    "embeddings": [[0.0]],
    "vision": { "extractedText": "string|null", "structured": {} },
    "usage": { "promptTokens": 0, "completionTokens": 0, "totalTokens": 0 }
  }
}
```

失败：

```json
{
  "ok": false,
  "code": "<error-code>",
  "message": "human-readable",
  "retryable": true,
  "nextAction": "what to do"
}
```

## Workflow

1. **Provider 选择**：根据 `providerKind`/配置选出具体实现；未配置时返回 `PROVIDER_NOT_CONFIGURED`。
2. **请求规范化**：将统一输入映射到各 provider 的 API 参数（温度、maxTokens、messages/prompt 等）。
3. **安全与约束**：
   - 截断过长输入
   - 对 attachments 做 MIME/大小限制（在缺省策略里）
4. **调用与超时**：统一超时策略与重试（例如仅对网络/超时错误重试）。
5. **输出规范化**：把 provider 的响应转换成统一 `data` 结构；保留可用于审计的 `requestId`。
6. **错误码归一**：把常见错误映射成可被 orchestrator 处理的 error codes。

## Failure 与 Fallback

- provider 不可用：`retryable=true`，可切换备用 provider（如果配置支持）。
- 认证失败/权限不足：`retryable=false`，需要用户配置。
- 请求过大：`retryable=false`，建议截断或降低参数。

## Non-goals

- 不负责检索与索引。
- 不负责 orchestrator 的提示词策略（prompt/模板由上层传入）。

## 本项目已落地（2026-05）

- `apps/sidecar/src/ai/provider-router.ts` + `apps/sidecar/src/ai/langchain/*`（LangChain）：
  - `generateText` / `generateTextStream` / `generateEmbeddings`
  - 主路 `AI_PRIMARY_PROVIDER`（默认 zhipu），失败自动切 `AI_FALLBACK_PROVIDER`（默认 deepseek），并尝试链上其余已配置提供商
  - 密钥：`ZHIPU_API_KEY`、`DEEPSEEK_API_KEY`、`GEMINI_API_KEY`（或 `GOOGLE_API_KEY`），见根目录 `.env.example`
- 已统一错误映射（鉴权失败、限流、请求过大、服务不可用）。
