# ConversationSidebar 组件

## 作用
- 展示当前用户、会话列表、页面切换入口（聊天/知识库）和退出登录按钮。
- 支持会话选中、右键菜单触发、会话名原位编辑输入框。

## Props
- `userName`: 当前用户名
- `conversations`: 会话数组
- `activeId`: 当前激活会话 ID
- `onSelect(id)`: 选中会话
- `onNew()`: 新建会话
- `onLogout()`: 退出登录
- `tab`: 当前页面标签
- `onTab(tab)`: 切换页面标签
- `onContextMenu(event, conversationId)`: 打开会话右键菜单
- `renamingId`: 当前正在重命名的会话 ID
- `renamingTitle`: 重命名输入值
- `setRenamingTitle(value)`: 更新重命名输入值
- `onRenameBlur(id)`: 失焦保存重命名
- `onRenameCancel()`: 取消重命名
- `error`: 错误信息（可选）

## 用法示例
```tsx
<ConversationSidebar
  userName="alice"
  conversations={conversations}
  activeId={activeId}
  onSelect={setActiveId}
  onNew={newConversation}
  onLogout={logout}
  tab="chat"
  onTab={(t) => navigate(t === 'chat' ? '/chat' : '/knowledge')}
  onContextMenu={handleContextMenu}
  renamingId={renamingId}
  renamingTitle={renamingTitle}
  setRenamingTitle={setRenamingTitle}
  onRenameBlur={saveRename}
  onRenameCancel={cancelRename}
/>
```
