import mammoth from 'mammoth';
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.mjs?url';

/** 与前端「上传说明」提示一致，单文件字节上限 */
export const KNOWLEDGE_UPLOAD_MAX_BYTES = 20 * 1024 * 1024;
const MAX_PDF_PAGES = 80;
const MAX_OCR_PAGES = 28;
const MIN_TEXT_LAYER_CHARS = 72;
const PDF_OCR_SCALE = 1.85;

let pdfWorkerConfigured = false;

function configurePdfWorker(pdfjs: typeof import('pdfjs-dist')) {
  if (pdfWorkerConfigured) return;
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;
  pdfWorkerConfigured = true;
}

function baseTitleFromFileName(fileName: string): string {
  const n = (fileName || '').trim() || 'document';
  return n.replace(/\.(txt|docx|pdf)$/i, '') || n;
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
    const text = (await file.text()).replace(/\u0000/g, '').trim();
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
