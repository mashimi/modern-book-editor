import express, { Request, Response } from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { OpenAI } from 'openai';
import dotenv from 'dotenv';
import mammoth from 'mammoth';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import MarkdownIt from 'markdown-it';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
app.use(cors({ origin: ['http://localhost:5173', 'http://127.0.0.1:5173'] }));
app.use(express.json({ limit: '50mb' }));

// ── Uploads ────────────────────────────────────────────────────────────────
const uploadDir = path.join(__dirname, '..', 'public', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });
app.use('/uploads', express.static(uploadDir));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });
const docUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// ── DeepSeek ────────────────────────────────────────────────────────────────
const MODEL = process.env.MODEL || 'deepseek-chat';
let openai: OpenAI;
try {
  openai = new OpenAI({ baseURL: 'https://api.deepseek.com', apiKey: process.env.OPENAI_API_KEY });
} catch {
  openai = null as unknown as OpenAI;
}

const CHUNK_SIZE = parseInt(process.env.CHUNK_SIZE || '5000', 10);

// ── Health ─────────────────────────────────────────────────────────────────
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', model: MODEL, chunkSize: CHUNK_SIZE, openaiConfigured: !!process.env.OPENAI_API_KEY });
});


// ── Parse helpers ──────────────────────────────────────────────────────────
function decodeEntities(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
}

function htmlToCleanText(html: string): string {
  let h = html;
  h = h.replace(/<br\s*\/?>/gi, '\n');
  h = h.replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**');
  h = h.replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, '**$1**');
  h = h.replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, '*$1*');
  h = h.replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, '*$1*');
  h = h.replace(/<a[^>]*>([\s\S]*?)<\/a>/gi, '$1');
  h = h.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_m: any, t: string) => `\n# ${t.trim()}\n\n`);
  h = h.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_m: any, t: string) => `\n## ${t.trim()}\n\n`);
  h = h.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_m: any, t: string) => `\n### ${t.trim()}\n\n`);
  h = h.replace(/<h[4-6][^>]*>([\s\S]*?)<\/h[4-6]>/gi, (_m: any, t: string) => `\n#### ${t.trim()}\n\n`);
  h = h.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_m: any, t: string) => `- ${t.replace(/<[^>]+>/g, '').trim()}\n`);
  h = h.replace(/<\/?(ul|ol)[^>]*>/gi, '\n');
  h = h.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_m: any, t: string) => `${t.trim()}\n\n`);
  h = h.replace(/<[^>]+>/g, '');
  h = decodeEntities(h);
  h = h.replace(/\r/g, '');
  h = h.replace(/[ \t]+\n/g, '\n');
  h = h.replace(/\n{3,}/g, '\n\n');
  return h.trim();
}

app.post('/api/parse-docx', docUpload.single('document'), async (req: Request & { file?: any }, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const ext = path.extname(req.file.originalname).toLowerCase();
    let text = '';
    if (ext === '.docx' || ext === '.doc') {
      const htmlRes = await mammoth.convertToHtml({ buffer: req.file.buffer });
      text = htmlToCleanText(htmlRes.value);
    } else {
      text = decodeEntities(req.file.buffer.toString('utf8'));
    }
    text = text.replace(/\n{3,}/g, '\n\n').trim();
    const title = path.basename(req.file.originalname, path.extname(req.file.originalname)).replace(/[_-]+/g, ' ').trim();
    res.json({ text, title });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to parse document', details: error.message });
  }
});

app.post('/api/upload-image', upload.single('image'), (req: Request & { file?: any }, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ url: `http://localhost:${process.env.PORT || '3001'}/uploads/${req.file.filename}` });
});


// ── AI System Prompt ───────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a senior book editor and typesetter preparing a manuscript for print. You receive RAW extracted text from a book/document. Produce a CLEAN, COMPLETE, print-ready Markdown manuscript as JSON.

ABSOLUTE RULES:
1. PRESERVE 100% OF THE BODY TEXT. Never summarize, omit, shorten, paraphrase, or "tidy away" content. Every sentence of the source must appear in your output.
2. DROP any leading Table of Contents / "Contents" / list of chapter titles with page numbers or dot leaders. The TOC will be regenerated later. Do NOT turn TOC lines into chapters.
3. CHAPTER DETECTION: start a new chapter only at a real heading, e.g. "Chapter 1", "Part One", "Introduction", "Conclusion", "Appendix A", numbered/lettered section titles, or a clear standalone title line. Put ALL following body paragraphs under that chapter until the next heading. If a chunk has no heading at the top, it is a CONTINUATION of the previous chapter.
4. CLEANING: Join wrapped lines into ONE paragraph. Re-join hyphenated line breaks. Remove stray page numbers, running headers/footers, repeated page titles. Normalize quotes and dashes; fix obvious OCR/extraction glitches. One blank line between paragraphs. Keep lists as Markdown, blockquotes as >, emphasis as ** / *.
5. Do NOT invent content. Do NOT add commentary.

Return ONLY valid JSON: { "metadata": { "title": "...", "author": "..." }, "chapters": [{ "title": "...", "content": "body..." }] }`;

function parseLenientJSON(text: string): any {
  let t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(t); } catch {}
  const start = t.indexOf('{');
  if (start === -1) throw new Error('No JSON object in model output');
  let slice = t.slice(start);
  const end = slice.lastIndexOf('}');
  if (end !== -1) slice = slice.slice(0, end + 1);
  try { return JSON.parse(slice); } catch {}
  let out = slice, inStr = false, esc = false;
  const stack: string[] = [];
  for (const ch of out) {
    if (esc) { esc = false; continue; }
    if (ch === '\\') { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '{' || ch === '[') stack.push(ch);
    if (ch === '}' || ch === ']') stack.pop();
  }
  if (inStr) out += '"';
  out = out.replace(/,\s*$/, '');
  while (stack.length) { const o = stack.pop(); out += o === '{' ? '}' : ']'; }
  out = out.replace(/,\s*([}\]])/g, '$1');
  return JSON.parse(out);
}

function chunkText(text: string): string[] {
  if (text.length <= CHUNK_SIZE) return [text];
  const paragraphs = text.split(/\n\n+/u);
  const chunks: string[] = [];
  let current = '';
  for (const para of paragraphs) {
    const block = para;
    const candidate = current ? `${current}\n\n${block}` : block;
    if (candidate.length > CHUNK_SIZE) {
      if (current) chunks.push(current);
      if (block.length > CHUNK_SIZE) {
        for (let i = 0; i < block.length; i += CHUNK_SIZE) chunks.push(block.slice(i, i + CHUNK_SIZE));
        current = '';
      } else {
        current = block;
      }
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks.filter((c) => c.trim().length > 0);
}

const norm = (s: string) => (s || '').trim().toLowerCase().replace(/\s+/g, ' ');

function mergeChapters(target: any[], incoming: any[]) {
  for (const ch of incoming) {
    const last = target[target.length - 1];
    if (last && norm(last.title) === norm(ch.title)) {
      last.content = `${last.content}\n\n${ch.content}`.trim();
    } else {
      target.push(ch);
    }
  }
}

const send = (res: Response, event: string, data: any) =>
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

// ── AI Format Book ─────────────────────────────────────────────────────────
app.post('/api/format-book', async (req: Request, res: Response) => {
  const { rawText } = req.body as { rawText?: string };
  if (!rawText || rawText.trim().length < 50) return res.status(400).json({ error: 'Text too short' });
  if (!openai) return res.status(500).json({ error: 'OPENAI_API_KEY is not configured on the server.' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  try {
    const chunks = chunkText(rawText.trim());
    send(res, 'meta', { total: chunks.length });

    let bookData: any = null;
    let lastTitle: string | null = null;
    let lastTail = '';

    for (let i = 0; i < chunks.length; i++) {
      send(res, 'progress', { current: i + 1, total: chunks.length, chaptersSoFar: bookData?.chapters?.length ?? 0 });

      let userContent = `Format this text into clean Markdown, preserving ALL body content:\n\n${chunks[i]}`;
      if (i > 0 && lastTitle) {
        userContent =
          `CONTINUATION. The previous chunk ended inside chapter "${lastTitle}". ` +
          `Its last lines were:\n"""${lastTail}"""\n` +
          `If this text continues that chapter, reuse the exact same title and append the body. ` +
          `Only open a new chapter at a real heading.\n\n${userContent}`;
      }

      const result = await openai.chat.completions.create({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userContent },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
        max_tokens: 8192,
      });

      const raw = parseLenientJSON(result.choices[0]?.message?.content || '{}');
      const parsed = {
        metadata: raw.metadata || (i === 0 ? { title: 'Untitled', author: 'Unknown' } : undefined),
        chapters: Array.isArray(raw.chapters) ? raw.chapters : [],
      };

      if (i === 0) {
        bookData = { metadata: parsed.metadata || { title: 'Untitled', author: 'Unknown' }, chapters: parsed.chapters };
      } else {
        mergeChapters(bookData.chapters, parsed.chapters);
        if (!bookData.metadata && parsed.metadata) bookData.metadata = parsed.metadata;
      }

      const lastCh = bookData.chapters[bookData.chapters.length - 1];
      if (lastCh) {
        lastTitle = lastCh.title;
        lastTail = String(lastCh.content || '').slice(-300);
      }
    }

    if (!bookData || !bookData.chapters || bookData.chapters.length === 0) {
      send(res, 'error', { error: 'The AI returned no chapters. Try a different document or paste the text directly.' });
      return res.end();
    }
    if (!bookData.metadata) bookData.metadata = { title: 'Untitled', author: 'Unknown' };

    send(res, 'complete', bookData);
    res.end();
  } catch (error: any) {
    console.error('AI Format Error:', error);
    try { send(res, 'error', { error: error?.message || 'AI formatting failed' }); } catch {}
    res.end();
  }
});


// ── PDF Generation ─────────────────────────────────────────────────────────
function wrapText(text: string, font: any, fontSize: number, maxWidth: number): string[] {
  const lines: string[] = [];
  const words = text.split(' ');
  let line = '';
  for (const word of words) {
    const testLine = line ? line + ' ' + word : word;
    if (font.widthOfTextAtSize(testLine, fontSize) > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = testLine;
    }
  }
  if (line) lines.push(line);
  return lines;
}

app.post('/api/generate-pdf', async (req: Request, res: Response) => {
  const { metadata, chapters } = req.body;
  if (!chapters || !Array.isArray(chapters)) return res.status(400).json({ error: 'Invalid data' });
  try {
    const pdfDoc = await PDFDocument.create();
    const bodyFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    const boldFont = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
    const PW = 432, PH = 648;
    const ML = 72, MR = 54;
    const MW = PW - ML - MR;
    const FS = 11, LH = 16.5;
    const md = new MarkdownIt();
    let page = pdfDoc.addPage([PW, PH]);
    page.drawText(metadata?.title || 'Untitled', { x: ML, y: PH - 300, size: 28, font: boldFont, color: rgb(0, 0, 0), maxWidth: MW });
    page.drawText(`by ${metadata?.author || 'Anonymous'}`, { x: ML, y: PH - 340, size: 14, font: bodyFont, color: rgb(0.2, 0.2, 0.2) });
    for (const ch of chapters) {
      page = pdfDoc.addPage([PW, PH]);
      let cy = PH - 120;
      page.drawText(ch.title || 'Chapter', { x: ML, y: cy, size: 20, font: boldFont, color: rgb(0, 0, 0), maxWidth: MW });
      cy -= 40;
      const tokens = md.parse(ch.content || '', {});
      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (cy < 60) { page = pdfDoc.addPage([PW, PH]); cy = PH - 72; }
        if (token.type === 'heading_open') {
          const level = parseInt(token.tag.slice(1), 10);
          cy -= 10;
          const next = tokens[i + 1];
          if (next && next.type === 'inline') {
            const lines = wrapText(next.content, boldFont, 16 - level * 2, MW);
            for (const line of lines) { page.drawText(line, { x: ML, y: cy, size: 16 - level * 2, font: boldFont, color: rgb(0, 0, 0) }); cy -= LH; }
          }
        } else if (token.type === 'inline' && token.content.trim()) {
          const lines = wrapText(token.content, bodyFont, FS, MW);
          for (const line of lines) {
            if (cy < 60) { page = pdfDoc.addPage([PW, PH]); cy = PH - 72; }
            page.drawText(line, { x: ML, y: cy, size: FS, font: bodyFont, color: rgb(0, 0, 0) });
            cy -= LH;
          }
          cy -= 6;
        }
      }
    }
    const pages = pdfDoc.getPages();
    for (let i = 1; i < pages.length; i++) {
      pages[i].drawText(String(i), { x: PW / 2 - 6, y: 36, size: 9, font: bodyFont, color: rgb(0.4, 0.4, 0.4) });
    }
    const pdfBytes = await pdfDoc.save();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="book.pdf"');
    res.send(Buffer.from(pdfBytes));
  } catch (err: any) {
    console.error('PDF Error:', err);
    res.status(500).json({ error: 'PDF generation failed', details: err.message });
  }
});

// ── Start ──────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3001', 10);
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  if (!process.env.OPENAI_API_KEY) console.warn('⚠️ OPENAI_API_KEY is missing!');
});
