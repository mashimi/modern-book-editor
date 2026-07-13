import express, { Request, Response } from 'express';
import cors from 'cors';
import { spawn } from 'child_process';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { OpenAI } from 'openai';
import dotenv from 'dotenv';
import mammoth from 'mammoth';

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
const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'), false);
  },
  limits: { fileSize: 10 * 1024 * 1024 },
});

const docUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ── DeepSeek / OpenAI Setup ────────────────────────────────────────────────
const MODEL = process.env.MODEL || 'deepseek-chat';
let openai: OpenAI;
try {
  openai = new OpenAI({
    baseURL: 'https://api.deepseek.com',
    apiKey: process.env.OPENAI_API_KEY,
  });
} catch {
  openai = null as unknown as OpenAI;
  console.warn('⚠️  OpenAI client initialization failed (API key may be missing)');
}

// ── API: Parse Word Document ───────────────────────────────────────────────
app.post('/api/parse-docx', docUpload.single('document'), async (req: Request & { file?: any }, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }
  try {
    const htmlResult = await mammoth.convertToHtml({ buffer: req.file.buffer });
    let html = htmlResult.value;
    html = html.replace(/<h1[^>]*>/gi, '\n\n=== CHAPTER START ===\n');
    html = html.replace(/<h2[^>]*>/gi, '\n\n=== SECTION START ===\n');
    html = html.replace(/<h3[^>]*>/gi, '\n\n--- Subsection ---\n');
    html = html.replace(/<\/h[1-6]>/gi, '\n');
    html = html.replace(/<p[^>]*>/gi, '');
    html = html.replace(/<\/p>/gi, '\n\n');
    html = html.replace(/<br\s*\/?>/gi, '\n');
    html = html.replace(/<li[^>]*>/gi, '- ');
    html = html.replace(/<\/li>/gi, '\n');
    html = html.replace(/<[^>]+>/g, '');
    html = html.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    html = html.replace(/\n{4,}/g, '\n\n');
    const result = html.trim();
    const title = req.file.originalname.replace(/\.docx$/i, '').replace(/[_-]/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
    res.json({ text: result, title, message: `Extracted ${result.length.toLocaleString()} characters` });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to parse document', details: error.message });
  }
});

app.post('/api/upload-image', upload.single('image'), (req: Request & { file?: any }, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }
  const baseUrl = `http://localhost:${process.env.PORT || '3001'}`;
  const url = `${baseUrl}/uploads/${req.file.filename}`;
  res.json({ url });
});

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', model: MODEL, local: true });
});

// ── AI Formatting System Prompt ────────────────────────────────────────────
const SYSTEM_PROMPT = `
You are an expert book editor. Convert raw, messy text into a structured Markdown manuscript.
CRITICAL RULES:
1. ONLY create a new chapter when you see explicit chapter headings like "Chapter 1", "CHAPTER ONE".
2. Do NOT create chapters from sub-headings.
3. METADATA: Extract title and author.
4. CHAPTERS: Use "# Chapter N: Title" format.
5. SECTIONS: Use "##" for sections within a chapter.
6. CLEANUP: Merge broken paragraphs, remove URL-encoding artifacts, fix OCR errors.
7. MARKDOWN: Use **bold**, *italics*, - bullet lists, > blockquotes.
Return ONLY valid JSON. No markdown fences, no explanatory text.
JSON FORMAT:
{
  "metadata": { "title": "Book Title", "author": "Author" },
  "chapters": [ { "title": "Chapter 1: Title", "content": "Markdown body..." } ]
}
`.trim();

const CONTINUATION_PROMPT = `
You are continuing to format additional text for a book. The previous section ended with the chapter titled "$LAST_CHAPTER".
Output ONLY a JSON object with a "chapters" array. No markdown fences.
{
  "chapters": [ { "title": "Chapter N: Title", "content": "The chapter body in markdown..." } ]
}
`.trim();

// ── Lenient JSON Parser ────────────────────────────────────────────────────
function parseLenientJSON(text: string): any {
  try { return JSON.parse(text); } catch {}

  const structuralEnds: number[] = [];
  let inString = false;
  let escape = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; }
    if (!inString && (ch === '}' || ch === ']')) structuralEnds.push(i);
  }

  for (let p = structuralEnds.length - 1; p >= 0; p--) {
    try {
      return JSON.parse(text.slice(0, structuralEnds[p] + 1));
    } catch { continue; }
  }

  const match = text.match(/\{.*\}/s);
  if (match) {
    try { return JSON.parse(match[0]); } catch {}
  }
  throw new Error('Could not extract valid JSON from model response');
}

// ── Text Chunking ──────────────────────────────────────────────────────────
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
      for (let i = 0; i < para.length; i += CHUNK_SIZE) {
        chunks.push(para.slice(i, i + CHUNK_SIZE));
      }
      current = '';
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

async function callModel(system: string, userText: string): Promise<any> {
  if (!openai) throw new Error('OpenAI client not initialized - check your API key');
  const completion = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: userText },
    ],
    response_format: { type: 'json_object' },
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error('Empty response from model');
  return parseLenientJSON(content);
}

// ── API: Format Book (SSE Stream) ──────────────────────────────────────────
app.post('/api/format-book', async (req: Request, res: Response) => {
  const { rawText } = req.body as { rawText?: string };

  if (!rawText || rawText.trim().length < 100) {
    res.status(400).json({ error: 'Text is too short. Please paste at least 100 characters.' });
    return;
  }

  try {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    function sendSSE(event: string, data: any) {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    }

    const chunks = chunkText(rawText);
    const total = chunks.length;
    sendSSE('meta', { total });

    let bookData: any = null;

    for (let i = 0; i < total; i++) {
      const isFirst = i === 0;
      const chunk = chunks[i];

      sendSSE('progress', { current: i + 1, total, chaptersSoFar: bookData?.chapters?.length ?? 0 });

      const lastChapterTitle = !isFirst && bookData?.chapters?.length
        ? bookData.chapters[bookData.chapters.length - 1].title : '';

      const systemPrompt = isFirst ? SYSTEM_PROMPT : CONTINUATION_PROMPT.replace('$LAST_CHAPTER', lastChapterTitle);
      const userMessage = isFirst ? `Format this raw text:\n\n${chunk}` : `Continue formatting:\n\n${chunk}`;

      const result = await callModel(systemPrompt, userMessage);

      if (isFirst) {
        if (!result.metadata) result.metadata = { title: 'Untitled Document', author: 'Unknown' };
        if (!Array.isArray(result.chapters)) result.chapters = [];
        for (const ch of result.chapters) { if (!ch.content) ch.content = ''; }
        bookData = result;
      } else {
        if (Array.isArray(result.chapters)) {
          bookData.chapters.push(...result.chapters);
        }
      }
    }

    sendSSE('complete', bookData);
    res.end();
  } catch (error: any) {
    if (res.headersSent) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: error?.message || 'Unknown error' })}\n\n`);
      res.end();
      return;
    }
    res.status(500).json({ error: 'Failed to format book.', details: error.message });
  }
});

// ── API: Generate PDF (Bridges to Python WeasyPrint) ───────────────────────
app.post('/api/generate-pdf', async (req: Request, res: Response) => {
  const manuscriptData = req.body;

  if (!manuscriptData || !manuscriptData.chapters || !Array.isArray(manuscriptData.chapters)) {
    res.status(400).json({ error: 'Invalid manuscript data' });
    return;
  }

  try {
    const typesetScriptPath = path.join(__dirname, '..', 'typesetting', 'typeset.py');
    const pythonProcess = spawn('python', [typesetScriptPath]);

    let errorData = '';
    pythonProcess.stderr.on('data', (data) => {
      errorData += data.toString();
    });

    pythonProcess.on('close', (code) => {
      if (code !== 0 && !res.headersSent) {
        console.error('Python typesetting failed:', errorData);
        res.status(500).json({ error: 'PDF generation failed in Python engine.', details: errorData });
      }
    });

    pythonProcess.stdin.write(JSON.stringify(manuscriptData));
    pythonProcess.stdin.end();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="print_ready_book.pdf"');

    pythonProcess.stdout.pipe(res);
  } catch (err: any) {
    console.error('PDF generation error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'PDF generation failed.', details: err.message });
    }
  }
});

// ── Start Server ───────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3001', 10);
app.listen(PORT, () => {
  console.log(`🚀 Local server: http://localhost:${PORT}`);
  if (!process.env.OPENAI_API_KEY) {
    console.warn('⚠️  OPENAI_API_KEY is not set — AI requests will fail!');
  }
});