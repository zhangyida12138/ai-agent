/** 复制纯文本；在 HTTP 或非安全上下文中回退到 execCommand，便于服务器部署环境。 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  const t = text ?? '';
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(t);
      return true;
    }
  } catch {
    // 回退
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = t;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
