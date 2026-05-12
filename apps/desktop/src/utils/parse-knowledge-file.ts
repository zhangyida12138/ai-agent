import mammoth from 'mammoth';

/** 与前端「上传说明」提示一致，单文件字节上限 */
export const KNOWLEDGE_UPLOAD_MAX_BYTES = 20 * 1024 * 1024;
const MAX_PDF_PAGES = 80;
const MAX_OCR_PAGES = 28;
const MIN_TEXT_LAYER_CHARS = 72;
const PDF_OCR_SCALE = 1.85;

/** 与 vite「pdf-worker-public」插件一致：根路径 pdf.worker.js（避免 /assets/*.mjs 在生产环境 MIME/缓存问题） */
function getPdfWorkerSrc(): string {
  const raw = import.meta.env.BASE_URL || '/';
  if (raw === './') {
    return new URL('pdf.worker.js', document.baseURI).href;
  }
  return new URL('pdf.worker.js', new URL(raw, window.location.origin)).href;
}

let pdfWorkerConfigured = false;

function configurePdfWorker(pdfjs: typeof import('pdfjs-dist')) {
  if (pdfWorkerConfigured) return;
  pdfjs.GlobalWorkerOptions.workerSrc = getPdfWorkerSrc();
  pdfWorkerConfigured = true;
}

function baseTitleFromFileName(fileName: string): string {
  const n = (fileName || '').trim() || 'document';
  return n.replace(/\.(txt|docx|pdf)$/i, '') || n;
}

function decodeBytes(bytes: Uint8Array, encoding: string): string | null {
  try {
    return new TextDecoder(encoding, { fatal: false }).decode(bytes);
  } catch {
    return null;
  }
}

function scoreDecodedText(text: string): number {
  if (!text) return -Infinity;
  const len = text.length;
  if (len === 0) return -Infinity;

  let replacement = 0;
  let printable = 0;
  let suspicious = 0;
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (ch === '\uFFFD') replacement += 1;
    if (
      ch === '\n' ||
      ch === '\r' ||
      ch === '\t' ||
      (code >= 0x20 && code <= 0x7e) ||
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0x3000 && code <= 0x303f) ||
      (code >= 0xff00 && code <= 0xffef)
    ) {
      printable += 1;
    } else if (code < 0x20 && ch !== '\n' && ch !== '\r' && ch !== '\t') {
      suspicious += 1;
    }
  }

  // Heuristic: penalize replacement/control chars, reward printable ratio.
  return printable / len - replacement * 2 - suspicious * 0.2;
}

function decodeTxtFile(bytes: Uint8Array): string {
  // BOM first
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3));
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  }

  const candidates = ['utf-8', 'gb18030', 'utf-16le', 'utf-16be'];
  let best = '';
  let bestScore = -Infinity;
  for (const enc of candidates) {
    const decoded = decodeBytes(bytes, enc);
    if (decoded == null) continue;
    const s = scoreDecodedText(decoded);
    if (s > bestScore) {
      bestScore = s;
      best = decoded;
    }
  }
  return best || new TextDecoder('utf-8').decode(bytes);
}

function textItemToString(items: Array<{ str?: string; hasEOL?: boolean } | unknown>): string {
  const parts: string[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') continue;
    const it = raw as { type?: string; str?: string; hasEOL?: boolean };
    if (it.type === 'beginMarkedContent' || it.type === 'beginMarkedContentProps' || it.type === 'endMarkedContent') continue;
    if (typeof it.str === 'string') {
      parts.push(it.str);
      if (it.hasEOL) parts.push('\n');
    }
  }
  return parts.join('');
}

/**
 * 优先读取 PDF 文本层；若过短（常见于扫描件）则用 pdf.js 渲染页面 + Tesseract.js OCR。
 */
async function parsePdfToText(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  configurePdfWorker(pdfjs);

  const buf = await file.arrayBuffer();
  const data = new Uint8Array(buf);
  const loadingTask = pdfjs.getDocument({ data });
  const doc = await loadingTask.promise;

  try {
    const totalPages = doc.numPages;
    const pageLimit = Math.min(totalPages, MAX_PDF_PAGES);
    let textFromLayer = '';

    for (let i = 1; i <= pageLimit; i++) {
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      textFromLayer += textItemToString(tc.items as unknown[]) + '\n\n';
      page.cleanup();
    }

    const truncatedNote =
      totalPages > pageLimit ? `\n\n[说明：文档共 ${totalPages} 页，已提取前 ${pageLimit} 页。]` : '';

    const normalizedLayer = textFromLayer.replace(/\s+/g, ' ').trim();
    if (normalizedLayer.length >= MIN_TEXT_LAYER_CHARS) {
      return `${textFromLayer.replace(/\n{3,}/g, '\n\n').trim()}${truncatedNote}`;
    }

    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker('chi_sim+eng');
    const ocrLimit = Math.min(doc.numPages, MAX_OCR_PAGES);
    const chunks: string[] = [];

    try {
      for (let i = 1; i <= ocrLimit; i++) {
        const page = await doc.getPage(i);
        const viewport = page.getViewport({ scale: PDF_OCR_SCALE });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('无法创建画布以进行 OCR');
        const task = page.render({ canvasContext: ctx, viewport, canvas });
        await task.promise;
        const { data } = await worker.recognize(canvas);
        if (data.text?.trim()) {
          chunks.push(`--- 第 ${i} 页 ---\n${data.text.trim()}`);
        }
        page.cleanup();
      }
    } finally {
      await worker.terminate().catch(() => undefined);
    }

    const ocrText = chunks.join('\n\n').trim();
    if (ocrText) {
      const ocrNote = totalPages > MAX_OCR_PAGES ? `\n\n[说明：文档共 ${totalPages} 页，OCR 已处理前 ${ocrLimit} 页。]` : '';
      return `${ocrText}${ocrNote}`;
    }
    throw new Error('PDF 无可用文字（文本层过短且 OCR 未识别到内容）');
  } finally {
    await doc.destroy();
  }
}

export async function parseKnowledgeUploadFile(file: File): Promise<{ title: string; text: string }> {
  if (!file || file.size === 0) throw new Error('文件为空');
  if (file.size > KNOWLEDGE_UPLOAD_MAX_BYTES) {
    throw new Error(`文件过大（最大 ${Math.floor(KNOWLEDGE_UPLOAD_MAX_BYTES / (1024 * 1024))}MB）`);
  }

  const name = file.name || '';
  const lower = name.toLowerCase();
  const title = baseTitleFromFileName(name);

  if (lower.endsWith('.txt') || file.type === 'text/plain') {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const text = decodeTxtFile(bytes).replace(/\u0000/g, '').trim();
    if (!text) throw new Error('TXT 文件无有效文本内容');
    return { title, text };
  }

  if (lower.endsWith('.docx')) {
    const buf = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: buf });
    const text = String(result.value ?? '')
      .replace(/\u0000/g, '')
      .trim();
    if (!text) throw new Error('DOCX 解析后无文本内容');
    return { title, text };
  }

  if (lower.endsWith('.pdf') || file.type === 'application/pdf') {
    const text = (await parsePdfToText(file)).replace(/\u0000/g, '').trim();
    if (!text) throw new Error('PDF 解析后无文本内容');
    return { title, text };
  }

  throw new Error('仅支持 .txt、.docx 或 .pdf 文件');
}
