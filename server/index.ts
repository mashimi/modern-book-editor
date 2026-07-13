import express, { Request, Response } from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
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

// ── Multer Setup ───────────────────────────────────────────────────────────
const uploadDir = path.join(__dirname, '..', 'public', 'uploads');
app.use('/uploads', express.static(uploadDir));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });
const docUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ── DeepSeek Setup ─────────────────────────────────────────────────────────
const MODEL = process.env.MODEL || 'deepseek-chat';
let openai: OpenAI;
try {
  openai = new OpenAI({
    baseURL: 'https://api.deepseek.com',
    apiKey: process.env.OPENAI_API_KEY,
  });
} catch {
  openai = null as unknown as OpenAI;
}

// ── API: Parse Word Document ───────────────────────────────────────────────
app.post('/api/parse-docx', docUpload.single('document'), async (req: Request & { file?: any }, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const htmlResult = await mammoth.convertToHtml({ buffer: req.file.buffer });
    let html = htmlResult.value;
    html = html.replace(/<h1[^>]*>/gi, '\n\n=== CHAPTER START ===\n');
    html = html.replace(/<h2[^>]*>/gi, '\n\n=== SECTION START ===\n');
    html = html.replace(/<\/h[1-6]>/gi, '\n');
    html = html.replace(/<p[^>]*>/gi, '');
    html = html.replace(/<\/p>/gi, '\n\n');
    html = html.replace(/<[^>]+>/g, '');
    html = html.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    html = html.replace(/\n{4,}/g, '\n\n');
    const result = html.trim();
    const title = req.file.originalname.replace(/\.docx$/i, '').replace(/[_-]/g, ' ');
    res.json({ text: result, title });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to parse document', details: error.message });
  }
});

app.post('/api/upload-image', upload.single('image'), (req: Request & { file?: any }, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ url: `http://localhost:${process.env.PORT || '3001'}/uploads/${req.file.filename}` });
});

// ── AI Formatting ──────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `
You are an expert book editor. Convert raw text into a structured Markdown manuscript.
1. ONLY create a new chapter when you see explicit headings like "Chapter 1".
2. METADATA: Extract title and author.
3. MARKDOWN: Use **bold**, *italics*, - bullet lists, > blockquotes.
Return ONLY valid JSON. No markdown fences.
{
  "metadata": { "title": "Book Title", "author": "Author" },
  "chapters": [ { "title": "Chapter 1: Title", "content": "Markdown body..." } ]
}
`.trim();

function parseLenientJSON(text: string): any {
  try { return JSON.parse(text); } catch {}
  const match = text.match(/\{.*\}/s);
  if (match) {
    try { return JSON.parse(match[0]); } catch {}
  }
  throw new Error('Could not extract valid JSON');
}

const CHUNK_SIZE = 30_000;
function chunkText(text: string): string[] {
  if (text.length <= CHUNK_SIZE) return [text];
  const paragraphs = text.split(/\n\n+/u);
  const chunks: string[] = [];
  let current = '';
  for (const para of paragraphs) {
    const candidate = current ? `${current}\n\n${para}` : para;
    if (candidate.length > CHUNK_SIZE) {
      if (current) chunks.push(current);
      current = para;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

app.post('/api/format-book', async (req: Request, res: Response) => {
  const { rawText } = req.body as { rawText?: string };
  if (!rawText || rawText.trim().length < 100) return res.status(400).json({ error: 'Text too short' });

  try {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const chunks = chunkText(rawText);
    let bookData: any = null;

    for (let i = 0; i < chunks.length; i++) {
      res.write(`event: progress\ndata: ${JSON.stringify({ current: i + 1, total: chunks.length, chaptersSoFar: bookData?.chapters?.length ?? 0 })}\n\n`);
      
      const result = await openai.chat.completions.create({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Format this text:\n\n${chunks[i]}` }
        ],
        response_format: { type: 'json_object' },
      });

      const parsed = parseLenientJSON(result.choices[0]?.message?.content || '{}');
      
      if (i === 0) {
        if (!parsed.metadata) parsed.metadata = { title: 'Untitled', author: 'Unknown' };
        if (!Array.isArray(parsed.chapters)) parsed.chapters = [];
        bookData = parsed;
      } else {
        if (Array.isArray(parsed.chapters)) bookData.chapters.push(...parsed.chapters);
      }
    }

    res.write(`event: complete\ndata: ${JSON.stringify(bookData)}\n\n`);
    res.end();
  } catch (error: any) {
  }
});

// ── Pure Node.js PDF Generation ────────────────────────────────────────────
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
    
    const PW = 432, PH = 648; // 6x9 inches
    const ML = 72, MR = 54;   // Margins
    const MW = PW - ML - MR;
    const FS = 11;            // Font size
    const LH = 16.5;          // Line height

    const md = new MarkdownIt();

    // Title Page
    let page = pdfDoc.addPage([PW, PH]);
    page.drawText(metadata?.title || 'Untitled', { x: ML, y: PH - 300, size: 28, font: boldFont, color: rgb(0,0,0), maxWidth: MW });
    page.drawText(`by ${metadata?.author || 'Anonymous'}`, { x: ML, y: PH - 340, size: 14, font: bodyFont, color: rgb(0.2,0.2,0.2) });

    // Chapters
    for (const ch of chapters) {
      page = pdfDoc.addPage([PW, PH]);
      let cy = PH - 120;
      
      page.drawText(ch.title || 'Chapter', { x: ML, y: cy, size: 20, font: boldFont, color: rgb(0,0,0), maxWidth: MW });
      cy -= 40;

      const tokens = md.parse(ch.content || '', {});
      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (cy < 60) {
          page = pdfDoc.addPage([PW, PH]);
          cy = PH - 72;
        }

        if (token.type === 'heading_open') {
          const level = parseInt(token.tag.slice(1), 10);
          cy -= 10;
          const next = tokens[i + 1];
          if (next && next.type === 'inline') {
            const lines = wrapText(next.content, boldFont, 16 - (level * 2), MW);
            for (const line of lines) {
              page.drawText(line, { x: ML, y: cy, size: 16 - (level * 2), font: boldFont, color: rgb(0,0,0) });
              cy -= LH;
            }
          }
        } else if (token.type === 'inline' && token.content.trim()) {
          const lines = wrapText(token.content, bodyFont, FS, MW);
          for (const line of lines) {
            if (cy < 60) {
              page = pdfDoc.addPage([PW, PH]);
              cy = PH - 72;
            }
            page.drawText(line, { x: ML, y: cy, size: FS, font: bodyFont, color: rgb(0,0,0) });
            cy -= LH;
          }
          cy -= 6;
        }
      }
    }

    // Page Numbers
    const pages = pdfDoc.getPages();
    for (let i = 1; i < pages.length; i++) {
      pages[i].drawText(String(i), { x: PW / 2 - 6, y: 36, size: 9, font: bodyFont, color: rgb(0.4,0.4,0.4) });
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

// ── Start Server ───────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3001', 10);
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  if (!process.env.OPENAI_API_KEY) console.warn('⚠️ OPENAI_API_KEY is missing!');
});