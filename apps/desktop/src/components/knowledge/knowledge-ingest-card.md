# KnowledgeIngestCard 组件

## 作用
- 提供本地知识库的导入入口。
- 包含 RAG 开关、文档标题输入、文本输入、导入按钮和统计信息展示。

## Props
- `useLocalKnowledge`: 是否启用本地知识库
- `setUseLocalKnowledge(value)`: 切换 RAG 开关
- `title` / `setTitle(value)`: 导入标题
- `text` / `setText(value)`: 导入文本
- `ingesting`: 是否正在导入
- `onIngest()`: 导入动作
- `statsText`: 统计文案

## 用法示例
```tsx
<KnowledgeIngestCard
  useLocalKnowledge={useLocalKnowledge}
  setUseLocalKnowledge={setUseLocalKnowledge}
  title={knowledgeTitle}
  setTitle={setKnowledgeTitle}
  text={knowledgeText}
  setText={setKnowledgeText}
  ingesting={ingesting}
  onIngest={ingest}
  statsText={statsText}
/>
```
