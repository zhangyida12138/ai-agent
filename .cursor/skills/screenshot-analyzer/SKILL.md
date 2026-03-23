---
name: screenshot-analyzer
description: Analyze screenshots by performing OCR/visual understanding and returning structured extracted text and key observations with confidence metadata. Use when implementing screenshot-based assistant features.
---

# Screenshot Analyzer

## When to Use
- 用户请求“分析截图/识别界面/提取文字/总结要点”。
- clipboard 或前端将截图引用传入，需要对图像内容做可用信息提取。

## Input 契约
```json
{
  "requestId": "string",
  "target": {
    "type": "path|ref",
    "value": "string"
  },
  "operation": "ocr|qa|summarize",
  "constraints": { "maxChars": 4000, "language": "zh-CN|null" },
  "requestContext": { "conversationId": "string|null" }
}
```

## Output 契约
```json
{
  "ok": true,
  "code": "SUCCESS|null",
  "data": {
    "extractedText": "string",
    "keyPoints": ["string"],
    "confidence": { "overall": 0.0, "perBlock": [] },
    "citations": [
      { "source": "screenshot", "id": "string", "bbox": [0,0,0,0] }
    ]
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
1. **获取图像**：从路径读取或从 ref 获取二进制数据（若通过权限通道）。
2. **选择策略**：
   - 若是截图文字为主：优先 OCR
   - 若需要理解 UI：使用视觉模型进行结构化提取（可选）
3. **执行 OCR/视觉理解**：得到文本、块级信息（可选坐标/置信度）。
4. **后处理**：
   - 清洗 OCR 噪声（换行、空格、识别错误）
   - 组织 keyPoints（从原文提炼）
5. **输出规范化**：按契约填充 extractedText/keyPoints/可选 citations。

## Failure 与 Fallback
- 图像不可读取：`retryable=false`（需要重新捕获/授权）。
- 模型不可用：`retryable=true`，必要时降级为“空 keyPoints + 原始 OCR（如果可用）”。

## Non-goals
- 不负责索引/embedding 写入（由 ingestion/indexer 负责）。
- 不负责 final 回复的对话编排（由 ai-response-orchestrator 负责）。

