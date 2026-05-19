import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';

export function toLangChainMessages(messages: Array<{ role: string; content: string }>): BaseMessage[] {
  const out: BaseMessage[] = [];
  for (const m of messages) {
    const role = String(m.role || 'user').toLowerCase();
    const content = String(m.content ?? '');
    if (role === 'system') out.push(new SystemMessage(content));
    else if (role === 'assistant') out.push(new AIMessage(content));
    else out.push(new HumanMessage(content));
  }
  if (out.length === 0 && messages.length === 0) {
    out.push(new HumanMessage(''));
  }
  return out;
}

export function contentToText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && 'text' in part) return String((part as { text?: string }).text ?? '');
        return '';
      })
      .join('');
  }
  return content == null ? '' : String(content);
}
