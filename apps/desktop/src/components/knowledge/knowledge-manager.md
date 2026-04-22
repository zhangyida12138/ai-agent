# KnowledgeManager 组件

## 作用
- 展示知识库文档列表和右侧编辑面板。
- 支持文档打开、编辑、保存和删除。

## Props
- `docs`: 文档列表
- `loading`: 列表加载状态
- `editingDocId`: 当前编辑文档 ID
- `editingTitle` / `setEditingTitle(value)`: 编辑标题
- `editingText` / `setEditingText(value)`: 编辑正文
- `saving`: 保存状态
- `onOpenDoc(id)`: 打开文档
- `onSave()`: 更新文档
- `onDelete()`: 删除文档

## 用法示例
```tsx
<KnowledgeManager
  docs={knowledgeDocs}
  loading={knowledgeLoading}
  editingDocId={editingDocId}
  editingTitle={editingTitle}
  setEditingTitle={setEditingTitle}
  editingText={editingText}
  setEditingText={setEditingText}
  saving={savingDoc}
  onOpenDoc={openDoc}
  onSave={saveDoc}
  onDelete={removeDoc}
/>
```
