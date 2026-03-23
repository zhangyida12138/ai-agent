# 功能清单（当前实现）

本文档汇总当前代码中**已经可用**的能力，不包含未落地规划。

## 1. 工程与运行形态

- Monorepo 结构：
  - `apps/sidecar`：NestJS 本地服务
  - `apps/desktop`：React + Vite 前端
  - `packages/shared`：共享 DTO / 错误码 / envelope
- 当前不依赖 Tauri/Rust 编译，先用浏览器形态联调 desktop。

## 2. 聊天能力

- 支持会话维度聊天：
  - 获取会话列表
  - 获取指定会话消息
  - 发送消息并生成回复
- 聊天数据本地持久化到 SQLite（`sql.js` 文件化）。
- 回复生成通过 `AIProviderRouter`：
  - 当前默认 provider：`mock`
  - 结构已预留后续接 OpenAI/Ollama。

## 3. 本地知识库能力（RAG MVP）

- 文本入库：
  - `POST /knowledge/ingest-text` 支持把纯文本切块后入库。
  - 可配置 `chunkSize` / `overlap`。
- 知识统计：
  - `GET /knowledge/stats` 返回文档数与块数。
- 检索（lexical）：
  - `POST /knowledge/retrieve` 用 token overlap 计算相关性并返回 `evidence[]`（调试/验证用途）。
- RAG 注入：
  - 聊天请求启用 `useLocalKnowledge=true` 时，会先检索 evidence，再注入 provider 输入。
  - `mock` provider 会识别 evidence 并返回可见的“证据来源/分数/片段”。
- 引用回填：
  - 聊天请求启用 `includeCitations=true` 时，会把检索到的 evidence 映射为结构化 `citations` 并写入 assistant 消息。

## 4. Desktop UI 能力

- 左侧会话列表 + 新建会话。
- 右侧聊天消息区 + 输入发送。
- 本地知识库操作面板：
  - 文档标题输入
  - 文本粘贴并导入
  - RAG 开关（`useLocalKnowledge`）
  - 知识库统计展示

## 5. 数据与存储（SQLite）

当前主要表：

- `conversations`
- `messages`
- `documents`
- `document_chunks`

默认文件路径：`apps/sidecar/data/ai-agent.sqlite`（可通过 `SQLITE_PATH` 覆盖）。

## 6. 当前限制

- 仅实现 `mock` provider；未接真实模型服务。
- 未接入 Tauri invoke/权限桥接（仍是 HTTP 联调形态）。
- 检索是 lexical MVP，尚未引入 embedding/向量检索。

