---
name: ai-response-orchestrator
description: Orchestrate a full local-first chat reply by combining chat history, optional knowledge retrieval evidence, AI provider generation, and persistence of the final response with citations. Use when implementing end-to-end assistant chat workflows.
---

# AI Response Orchestrator

## When to Use
- 实现/扩展桌面助手“用户消息 -> 生成回复”的完整链路。
- 需要同时考虑：会话历史、（可选）本地知识检索证据、模型生成、以及写回聊天记录。

## Input 契约
```json
{
  "requestId": "string",
  "conversationId": "string",
  "userMessage": "string",
  "options": {
    "language": "zh-CN",
    "useLocalKnowledge": true,
    "retrieval": { "topK": 5, "filters": {} },
    "maxReplyChars": 4000,
    "includeCitations": true
  }
}
```

## Output 契约
```json
{
  "ok": true,
  "code": "SUCCESS|null",
  "data": {
    "reply": {
      "text": "string",
      "citations": [
        { "refId": "string", "label": "source label", "snippet": "string" }
      ]
    },
    "persisted": { "conversationId": "string", "assistantMessageId": "string" }
  }
}
```

## Workflow
1. **拉取上下文**：从 `chat-history-store` 读取会话历史（按 token/时间窗口裁剪）。
2. **可选检索**：若 `useLocalKnowledge=true`：
   - 调 `knowledge-retriever` 得到 evidence
   - 把 evidence 格式化为“可引用证据段落/引用列表”
3. **组装生成输入**：
   - system/role 消息（由 orchestrator 负责编排策略）
   - 将用户消息与 evidence（如有）拼接或通过模板注入
4. **调用模型**：使用 `ai-provider-router` 请求文本生成。
5. **生成后处理**：
   - 校验长度与格式约束
   - 如需要 citations，确保引用标识与证据可对齐
6. **写回存储**：
   - 调 `chat-history-store` 保存 assistant 消息与引用元数据
7. **返回**：输出统一结构（包含 reply 文本与 citations）。

## Failure 与 Fallback
- 检索失败：回退为“纯对话模式”（仍写回历史）。
- 模型失败：返回降级答复（说明原因并给出下一步）。
- 存储失败：尽量返回结果，但标记 `persisted=false`（由上层决定是否重试）。

## Non-goals
- 不负责索引（由 document-ingestion-indexer / index-task-runner 完成）。
- 不负责 provider 细节（由 ai-provider-router 完成）。

