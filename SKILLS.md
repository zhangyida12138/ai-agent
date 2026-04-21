# 项目标准 Skills 文档（AI 可理解版）

> 目的：把本项目桌面 AI 助手的能力拆成“可被 AI 稳定执行/组合”的 Skills 规格（而不是纯口头需求）。
> 后续你可以把本文档里的每个 Skill 进一步落地为 Cursor/Codex 的 `SKILL.md` 技能包目录结构。

## 0. 约定与原则

### 0.1 本项目的目标与边界（写入所有技能的默认上下文）

- **Local-first**：聊天记录、文档元数据、索引任务状态、导出结果等核心数据默认写入本地（SQLite + 本地文件系统）。
- **Sidecar 架构**：Tauri Rust 仅负责权限边界/窗口管理/原生桥接；主要业务编排在 Node.js + NestJS sidecar。
- **AI 能力抽象化**：模型、embedding、推理能力通过 Provider/Adapter 抽象，不把业务逻辑写死在单一模型供应商。
- **系统能力最小权限**：Tauri 侧只开放必要 capability；文件/剪贴板/截图等能力必须有权限策略与审计线索。
- **渐进交付**：先保证单机可用与离线部分能力，再考虑同步与团队协作。

### 0.2 Skills 的“AI 执行契约”

每个 Skill 都应在输出中做到：

1. **明确触发条件（When）**：用户请求/上下文满足哪些关键词或场景时触发。
2. **明确输入（Input）**：需要哪些参数/文件/上下文（例如：文档路径、会话 ID、索引任务 ID）。
3. **明确输出（Output）**：返回什么结构（JSON/文本/文件路径）以及成功/失败状态。
4. **明确失败处理（Failure）**：权限缺失、文件缺失、模型不可用、索引未就绪等情况如何降级或回退。
5. **明确边界（Non-goals）**：哪些事情不由该 Skill 负责（例如：UI 渲染细节、跨设备同步等）。

### 0.3 Skills 元信息（用于后续落地 `SKILL.md`）

当你把本文档中的 Skill 落地到目录时，建议每个技能包都有：

- `SKILL.md`：必需
- `references/`（可选）：接口契约、数据库 schema、协议说明等长文本
- `examples/`（可选）：典型输入输出示例
- `scripts/`（可选）：可重复执行且确定性强的脚本（例如索引任务调度、导出格式生成）

技能 `SKILL.md` 的 YAML frontmatter 建议只保留：

```yaml
---
name: <skill-slug>
description: <一句话写清 WHAT + WHEN（第三人称）>
---
```

## 1. 本项目 Skills 总目录（Phase 1 推荐）

以下是建议的“可组合能力单元”。每条都包含：`Skill 名称/触发/职责/输入输出/失败处理/非目标`。

### 1.1 `tauri-capability-bridge`

- **触发（When）**：用户请求“读取/写入文件、剪贴板、截图、执行外部程序、打开窗口”等需要系统权限的动作；或 sidecar 需要调用 Tauri invoke。
- **职责（What）**：定义并执行“权限受控”的桥接调用：Tauri capability 名称、参数校验、输入清洗、返回结构统一。
- **输入（Input）**：capability 名称、参数（例如 `path`, `rect`, `format`）、用户会话/任务上下文。
- **输出（Output）**：统一返回 `{"ok": true|false, "code": "...", "data": ...}`；失败时给出可操作的原因。
- **失败处理（Failure）**：权限不足 -> 返回明确的错误码与建议；参数越界 -> 拒绝并说明原因。
- **非目标（Non-goals）**：不负责业务编排与 AI 推理；只做系统能力边界。

### 1.2 `chat-history-store`

- **触发（When）**：用户开始对话、继续对话、请求“查看/导出/总结某段聊天记录”；或 sidecar 需要持久化上下文。
- **职责**：写入/读取聊天记录；管理会话索引（按会话 ID/时间/文档引用）。
- **输入**：`conversationId`、消息列表、用户意图标签（可选）、检索约束（最近 N 条/按时间范围）。
- **输出**：持久化确认、可用于检索的消息片段集合。
- **失败处理**：SQLite 失败 -> 返回可重试错误；会话不存在 -> 创建新会话或返回 404 类错误。
- **非目标**：不负责生成回复文本（由 LLM/summary skills 完成）。

### 1.3 `document-ingestion-indexer`

- **触发（When）**：用户请求“导入文档/开始索引/更新索引/重新索引”；或后台检测到文件变更需要入库。
- **职责**：将文件变成可检索单元（分块、提取元数据、生成 embedding、写入索引/任务状态）。
- **输入**：文件路径列表、索引策略（分块大小/重叠、语言检测、是否 OCR）、任务上下文（任务 ID）。
- **输出**：索引任务状态（进行中/成功/失败）、统计（文档数/块数/耗时）。
- **失败处理**：文件读取失败 -> 标记失败块并继续；embedding 失败 -> 降级到“仅关键字索引（若实现）”或返回明确错误。
- **非目标**：不负责“回答用户问题”（由 `knowledge-retriever` & `ai-response-orchestrator` 完成）。

### 1.4 `knowledge-retriever`

- **触发（When）**：用户对“本地文档/知识库”提问；sidecar 需要检索相关证据（passages）。
- **职责**：从索引中检索 top-k 证据；必要时做重排/去重/引用格式化。
- **输入**：查询文本、检索参数（topK、时间过滤、文件过滤）、会话上下文（可选）。
- **输出**：证据集合（每条包含：`id`, `source`, `text`, `score`, `metadata`）。
- **失败处理**：索引未就绪 -> 返回“需要先索引”的状态码；无证据 -> 返回空集合但不失败。
- **非目标**：不负责最终回复生成（由 `ai-response-orchestrator` 负责）。

### 1.5 `ai-provider-router`

- **触发（When）**：用户请求“用云模型/本地模型/指定模型生成”；或需要 embedding/vision/OCR 相关推理。
- **职责**：根据配置与可用性选择 Provider（云端/OpenAI 兼容/本地 Ollama/LM Studio）；统一请求/响应协议。
- **输入**：`providerKind`（可选）、`modelId`（可选）、任务类型（chat/summarize/vision/embeddings）、prompt/input。
- **输出**：标准化的 `{"text": "...", "usage": {...}}` 或 embedding 数组。
- **失败处理**：超时/不可用 -> 返回可重试信息，或切换到备用 provider（若配置了）。
- **非目标**：不负责业务提示词策略（提示词由 orchestrator/能力模板控制）。

### 1.6 `clipboard-assistant`

- **触发（When）**：用户请求“分析剪贴板/把剪贴板内容总结成 Markdown/提取要点/生成任务”；或后台监控到剪贴板变化并触发一次处理。
- **职责**：读取剪贴板内容（文本/URL/文件路径/图片引用）；按类型路由到相应处理链。
- **输入**：剪贴板快照（text/url/imageRef）；目标动作（summarize/extract/transform）。
- **输出**：结构化结果（提取字段）+ 人类可读 Markdown（可选）。
- **失败处理**：剪贴板访问失败 -> 提示需要授权；未知类型 -> 尝试降级为文本化。
- **非目标**：不做长期监控策略（策略可由 Task runner 实现）。

### 1.7 `screenshot-analyzer`

- **触发（When）**：用户请求“分析截图/从截图提取文字/理解界面/总结要点”；或 clipboard/screen 引用触发。
- **职责**：把截图转成可用信息（OCR/视觉理解）；必要时提取 UI 结构或关键文本。
- **输入**：截图文件路径或内存引用；分析目标（ocr/qa/summarize）。
- **输出**：OCR 文本、结构化要点、（可选）引用坐标或置信度。
- **失败处理**：图像解码/权限失败 -> 返回明确错误码；模型不可用 -> 返回仅 OCR 或空结果（取决于实现）。
- **非目标**：不负责索引入库（可由 `document-ingestion-indexer` 承担）。

### 1.8 `markdown-summarizer`

- **触发（When）**：用户请求“把某内容总结成 Markdown/生成企业风格简报/对文档输出提要”；或需要对检索证据做摘要。
- **职责**：生成高质量 Markdown 输出，包含可复用模板（标题、要点、引用、待办）。
- **输入**：源文本/证据集合/约束（长度、语言、语气、是否包含引用）。
- **输出**：Markdown（含统一标题层级），可附带结构化 summary JSON。
- **失败处理**：输入过长 -> 自动截断/分段摘要；输出格式不符合约束 -> 重试一次校正（可选）。
- **非目标**：不负责检索；不负责 embedding。

### 1.9 `ai-response-orchestrator`

- **触发（When）**：用户提出“生成回复”（聊天），需要同时考虑：会话历史 + 知识检索证据 + 最终生成策略。
- **职责**：编排完整链路：从 `chat-history-store` 拉取上下文 -> `knowledge-retriever` 获取证据（可选）-> `ai-provider-router` 生成 -> 把证据/回复写回存储。
- **输入**：user message、conversationId、检索开关（是否查本地知识）、输出约束（语言/长度/是否引用）。
- **输出**：最终回复文本 + 引用列表 + 写回存储的元数据。
- **失败处理**：检索失败 -> 用纯对话模式；模型失败 -> 返回降级答复并标注原因。
- **非目标**：不负责具体 embedding 与索引落库（由各自 skills）。

### 1.10 `index-task-runner`

- **触发（When）**：索引、导入、导出、批处理任务需要后台运行；用户请求“查看索引进度/取消任务/重试”。
- **职责**：统一管理任务队列、状态机、并发与重试策略；写入 SQLite 任务表。
- **输入**：任务类型（ingest/index/export）、任务参数、并发策略、超时与重试策略。
- **输出**：任务状态事件流（可用于 UI 实时更新）+ 终态结果。
- **失败处理**：可重试失败 -> 自动退避重试；不可重试 -> 状态标记失败并保留错误原因。
- **非目标**：不负责具体任务内容（由 ingestion/summarizer skills 完成）。

## 2. Phase 1 的推荐实现顺序

1. 先完成 `ai-provider-router`（统一模型/embedding/vision 接入协议）
2. 再完成 `chat-history-store`（保证单机对话可持续）
3. 接着实现 `document-ingestion-indexer` + `knowledge-retriever`（让“本地文档”可用）
4. 再实现 `ai-response-orchestrator`（把对话链路串起来）
5. 最后补齐 `clipboard-assistant`、`screenshot-analyzer`、`markdown-summarizer`
6. 由 `index-task-runner` 统一做任务与进度

## 3. 每个 Skill 的落地模板（用于后续创建目录）

把下面模板复制到每个技能包的 `SKILL.md` 里（并替换字段）：

```markdown
---
name: <skill-slug>
description: <一句话：WHAT + WHEN（第三人称，非“我可以”表述）>
---

# <技能中文名>

## 触发条件（When）
- ...

## 输入契约（Input）
- ...

## 输出契约（Output）
- ...

## 处理流程（Workflow）
1. ...
2. ...

## 失败与降级（Failure / Fallback）
- ...

## 非目标（Non-goals）
- ...
```

## 4. 本项目通用输出格式建议（强烈建议写入各 Skill）

- 当输出包含多条证据/引用时：使用统一的 `引用列表`段落，元素包含 `source + id + 片段摘要`。
- 当输出包含“操作建议/待办”时：使用 `- [ ]` 或 `1. 2. 3.`，避免随意混用。
- 当处理失败时：返回“错误码 + 用户可理解原因 + 下一步建议”。

## 5. 当前实现归档（2026-04）

已按能力归档到对应 `SKILL.md`（位于 `.cursor/skills/*/SKILL.md`）：

- `ai-provider-router`：DeepSeek 文本/流式/embedding 统一适配已落地
- `chat-history-store`：聊天、用户会话、文档与分块存储及归属校验已落地
- `document-ingestion-indexer`：文本导入、分块、文档 CRUD 管理接口已落地
- `knowledge-retriever`：召回 + embedding rerank + 阈值去噪已落地
- `ai-response-orchestrator`：完整聊天编排与 SSE 输出已落地
- `markdown-summarizer`：前端回复 Markdown 渲染能力已落地

前端结构层面的新增能力（页面/模块/组件拆分、路由守卫、组件文档）已在 `apps/desktop/src` 中实现，可作为后续新增 UI Skill 的参考基线。

