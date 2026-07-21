import express, { Request, Response } from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { OpenAI } from 'openai';
import dotenv from 'dotenv';
import mammoth from 'mammoth';
import { spawn } from 'child_process';
import { z } from 'zod';

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

// ── Config ────────────────────────────────────────────────────────────────
// CHUNK_SIZE controls how many characters are sent per DeepSeek call.
// Default is 8000 — large enough for natural chapter grouping, small enough
// to avoid token limit truncation. Override via CHUNK_SIZE env variable.
const CHUNK_SIZE = parseInt(process.env.CHUNK_SIZE || '8000', 10);

// ── Zod schemas for AI response validation ────────────────────────────────
const ChapterSchema = z.object({
  title: z.string().min(1, 'Chapter title must not be empty'),
  content: z.string().min(1, 'Chapter content must not be empty'),
});

const BookResponseSchema = z.object({
  metadata: z.object({
    title: z.string().default('Untitled'),
    author: z.string().default('Unknown'),
  }),
  chapters: z.array(ChapterSchema).min(1, 'At least one chapter is required'),
});

// ── Health Check ──────────────────────────────────────────────────────────
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    model: MODEL,
    chunkSize: CHUNK_SIZE,
    openaiConfigured: !!process.env.OPENAI_API_KEY,
  });
});



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

    let lastChapterTitle: string | null = null;

    for (let i = 0; i < chunks.length; i++) {
      res.write(`event: progress\ndata: ${JSON.stringify({ current: i + 1, total: chunks.length, chaptersSoFar: bookData?.chapters?.length ?? 0 })}\n\n`);

      // Build user message — include last-chapter context for continuation chunks
      let userContent = `Format this text:\n\n${chunks[i]}`;
      if (i > 0 && lastChapterTitle) {
        userContent = `The previous chunk ended with the chapter "${lastChapterTitle}". Continue naturally from where that text left off, appending new chapters as needed.\n\n${userContent}`;
      }

      const result = await openai.chat.completions.create({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userContent }
        ],
        response_format: { type: 'json_object' },
      });

      const raw = parseLenientJSON(result.choices[0]?.message?.content || '{}');

      // Validate against Zod schema
      let parsed: any;
      try {
        parsed = BookResponseSchema.parse(raw);
      } catch (validationError) {
        // Fallback: accept what we got even if incomplete
        parsed = {
          metadata: raw.metadata || { title: 'Untitled', author: 'Unknown' },
          chapters: Array.isArray(raw.chapters) ? raw.chapters : [],
        };
      }

      // Track last chapter title for continuation context
      if (Array.isArray(parsed.chapters) && parsed.chapters.length > 0) {
        lastChapterTitle = parsed.chapters[parsed.chapters.length - 1].title;
      }

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
    console.error('AI Format Error:', error);
    if (!res.headersSent) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: error.message || 'AI formatting failed' })}\n\n`);
    }
    res.end();
  }
});

// ── Python WeasyPrint PDF Generation ──────────────────────────────────────
/**
 * Calls the Python typesetting script (typeset.py) which uses WeasyPrint to
 * produce a print-ready PDF with crop marks, running headers, TOC, etc.
 */
function generatePDFwithPython(payload: object): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const typesetDir = path.join(__dirname, '..', 'typesetting');
    const scriptPath = path.join(typesetDir, 'typeset.py');

    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';

    // Build PATH for WeasyPrint DLL resolution (Windows)
    const weasyprintDirs = (process.env.WEASYPRINT_DLL_DIRECTORIES || '')
      .split(';')
      .filter(Boolean);
    const defaultDirs = [
      'C:\\GTK3-Runtime\\bin',
      'C:\\Program Files\\GTK3-Runtime Win64\\bin',
      'C:\\msys64\\mingw64\\bin',
    ];
    const extraPaths = [...defaultDirs, ...weasyprintDirs].join(';');
    const childPath = process.env.PATH
      ? `${extraPaths};${process.env.PATH}`
      : extraPaths;

    const child = spawn(pythonCmd, [scriptPath], {
      cwd: typesetDir,
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        PATH: childPath,
      },
    });

    const chunks: Buffer[] = [];
    let errorOutput = '';

    child.stdout.on('data', (data: Buffer) => chunks.push(data));
    child.stderr.on('data', (data: Buffer) => { errorOutput += data.toString(); });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Python typesetting exited with code ${code}: ${errorOutput}`));
        return;
      }
      resolve(Buffer.concat(chunks));
    });

    child.on('error', (err) => {
      reject(new Error(`Failed to start Python typesetting: ${err.message}`));
    });

    // Write JSON payload to stdin and close
    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

app.post('/api/generate-pdf', async (req: Request, res: Response) => {
  const { metadata, chapters } = req.body;
  if (!chapters || !Array.isArray(chapters)) return res.status(400).json({ error: 'Invalid data' });

  const payload = {
    metadata: metadata || { title: 'Untitled', author: 'Anonymous' },
    chapters: chapters.map((ch: any) => ({
      title: ch.title || 'Chapter',
      content: ch.content || '',
    })),
  };

  try {
    const pdfBuffer = await generatePDFwithPython(payload);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="book.pdf"');
    res.send(pdfBuffer);
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