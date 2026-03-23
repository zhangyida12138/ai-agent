# 运行与验收手册

## 1. 启动

在仓库根目录执行：

```powershell
pnpm --filter @ai-agent/sidecar dev
```

另开一个终端：

```powershell
pnpm --filter @ai-agent/desktop dev
```

打开：

- `http://localhost:5173/`

## 2. 快速验收（UI）

1. 打开页面，确认左侧会话区可见。
2. 在“本地知识库”面板粘贴一段文本并点击“导入到本地知识库”。
3. 勾选“使用本地知识库（RAG）”。
4. 在聊天框提问与该文本相关的问题并发送。
5. 观察回复是否包含 evidence 信息（来源/分数/片段）。

## 3. 快速验收（API）

### 健康检查

```powershell
Invoke-RestMethod -Method Get -Uri "http://localhost:3001/health"
```

### 导入文本

```powershell
$body=@{
  requestId=[guid]::NewGuid().ToString()
  title='demo'
  sourcePath='manual'
  text='local knowledge base for testing retrieval'
  options=@{chunkSize=40; overlap=5}
} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "http://localhost:3001/knowledge/ingest-text" -ContentType "application/json" -Body $body
```

### 发送聊天（启用 RAG）

```powershell
$cid=[guid]::NewGuid().ToString()
$body=@{
  requestId=[guid]::NewGuid().ToString()
  conversationId=$cid
  userMessage='How does retrieval work?'
  options=@{useLocalKnowledge=$true; retrievalTopK=3; maxEvidenceChars=2000}
} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "http://localhost:3001/chat/send" -ContentType "application/json" -Body $body
```

## 4. 常见问题

- 端口被占用：关闭占用 `3001` 或 `5173` 的进程后重启。
- 模型配置报错：当前默认 `mock`，若设置了其他 provider 但未实现，会返回 `PROVIDER_NOT_CONFIGURED`。
- 看不到知识效果：确认已导入文本、`useLocalKnowledge=true`、提问内容与导入文本相关。

