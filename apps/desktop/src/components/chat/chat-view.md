# ChatView 组件

## 作用
- 渲染聊天主区域：标题、消息列表、输入框和发送按钮。
- 支持 Markdown 消息展示、消息复制、回车发送（Shift+Enter 换行）。

## Props
- `title`: 当前会话标题
- `messages`: 消息列表
- `input`: 输入框内容
- `loading`: 是否正在发送
- `onInput(value)`: 输入变化回调
- `onSend()`: 发送消息
- `onCopyToast(text)`: 复制成功提示回调

## 用法示例
```tsx
<ChatView
  title={activeTitle}
  messages={messages}
  input={input}
  loading={loading}
  onInput={setInput}
  onSend={sendMessage}
  onCopyToast={(t) => setToast(t)}
/>
```
