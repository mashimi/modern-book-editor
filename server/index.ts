import express, { Request, Response } from 'express';
import cors from 'cors';
import { spawn } from 'child_process';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { OpenAI } from 'openai';
import { z } from 'zod';
import dotenv from 'dotenv';
import { PDFDocument, StandardFonts, rgb, PageSizes } from 'pdf-lib';
import MarkdownIt from 'markdown-it';
import mammoth from 'mammoth';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
app.use(cors({ origin: ['http://localhost:5173', 'http://127.0.0.1:5173'] }));
app.use(express.json({ limit: '50mb' }));

// ── Image upload ───────────────────────────────────────────────────────────
const uploadDir = path.join(__dirname, '..', 'public', 'uploads');
app.use('/uploads', express.static(uploadDir));

const storage = multer.diskStorage({
  destination: (_req: any, _file: any, cb: any) => cb(null, uploadDir),
  filename: (_req: any, file: any, cb: any) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  },
});
const upload = multer({
  storage,
  fileFilter: (_req: any, file: any, cb: any) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

// Parse Word Documents
const docUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

app.post('/api/parse-docx', docUpload.single('document'), async (req: Request & { file?: any }, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }
  try {
    // Use convertToHtml to preserve heading structure, then extract structured text
    const htmlResult = await mammoth.convertToHtml({ buffer: req.file.buffer });
    let html = htmlResult.value;
    
    // Strip unwanted tags but keep heading markers
    // Replace h1/h2 with explicit "Chapter" markers for the AI
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
    html = html.replace(/&amp;/g, '&');
    html = html.replace(/&lt;/g, '<');
    html = html.replace(/&gt;/g, '>');
    html = html.replace(/&quot;/g, '"');
    html = html.replace(/&#39;/g, "'");
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
// ───────────────────────────────────────────────────────────────────────────

// DeepSeek provides an OpenAI-compatible API — we only swap the base URL & model.
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

// ---------------------------------------------------------------------------
// Zod Schema — we validate the model output against this shape after parsing
// ---------------------------------------------------------------------------
const BookSchema = z.object({
  metadata: z.object({
    title: z.string().describe('The main title of the book'),
    author: z.string().optional().describe("The author's name, if found"),
    subtitle: z.string().optional().describe('Optional subtitle'),
    genre: z.enum(['fiction', 'non-fiction', 'memoir', 'poetry', 'technical', 'academic']).default('fiction'),
    trimSize: z
      .enum(['5x8in', '5.5x8.5in', '6x9in', '7x10in', '8.5x11in'])
      .default('6x9in')
      .describe('Standard book trim size for typesetting'),
    fontRecommendation: z.object({
      body: z.enum(['Merriweather', 'Crimson Text', 'Charis SIL', 'Source Serif Pro', 'EB Garamond', 'Literata']).default('EB Garamond'),
      heading: z.enum(['Lora', 'Playfair Display', 'Cinzel', 'Alegreya', 'Libre Baskerville']).default('Lora'),
    }).optional(),
  }),
  frontMatter: z.array(z.object({
    type: z.enum(['half-title', 'title-page', 'copyright', 'dedication', 'epigraph', 'contents', 'foreword', 'preface', 'introduction']),
    title: z.string().optional(),
    content: z.string().optional(),
    attribution: z.string().optional(),
  })).optional(),
  chapters: z.array(
    z.object({
      title: z.string().describe("The chapter title, e.g. 'Chapter 1: The Beginning'"),
      subtitle: z.string().optional(),
      epigraph: z.object({ quote: z.string(), attribution: z.string() }).optional(),
      content: z.string().describe('The chapter body in clean Markdown (headings, bold, italics, lists, blockquotes)'),
      dropCap: z.boolean().default(true),
      sceneBreakStyle: z.enum(['asterism', 'line', 'whitespace', 'ornament']).default('asterism'),
    })
  ),
  backMatter: z.array(z.object({
    type: z.enum(['acknowledgments', 'about-author', 'appendix', 'notes', 'index']),
    title: z.string(),
    content: z.string(),
  })).optional(),
});

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `
You are an expert book editor and typesetter. Your task is to take raw, messy 
text — copied from PDFs, OCR scans, or Word documents — and convert it into a 
perfectly structured Markdown manuscript ready for professional typesetting.

CRITICAL RULE — PRESERVE ORIGINAL CHAPTER STRUCTURE:
- The author's document has a SPECIFIC number of chapters. You MUST preserve that count.
- ONLY create a new chapter when you see an explicit chapter heading like "Chapter 1", "CHAPTER ONE", "Chapter One", etc.
- Do NOT create chapters from sub-headings, section breaks, or paragraphs.
- Do NOT split a single chapter into multiple chapters.
- If you receive only part of a chapter (the middle/end), return it as a single chapter without splitting.

RULES:
1. METADATA — Extract the book title and author. If unclear, use the filename.
2. CHAPTERS — Use "# Chapter N: Title" format for each chapter heading.
3. SECTIONS — Use "##" for sections within a chapter only.
4. CLEANUP:
   - Merge broken paragraphs caused by hard line-breaks (common in PDFs/Word docs).
   - Remove URL-encoding artifacts (e.g. %20, %E2%80%99).
   - Fix obvious OCR errors (e.g. 'l' instead of '1', 'O' instead of '0' in numbers).
   - Do NOT rewrite the author's voice or change factual meaning.
5. MARKDOWN FORMATTING — Use **bold**, *italics*, - bullet lists, 1. numbered lists,
   > blockquotes where appropriate.
6. FRONT MATTER — If introductory text precedes Chapter 1, label it "Front Matter" or "Introduction".

Return ONLY the structured JSON object. Do NOT wrap it in markdown code fences, do NOT include any explanatory text before or after the JSON. The entire response must be a single valid JSON object: start with curly brace and end with curly brace with no trailing characters. Double-check that all strings are properly closed with double-quotes.
`.trim();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Attempt to parse a JSON string. Handles the common case where the LLM
 * response is truncated mid-output by finding the last structural `}` or `]`
 * that is NOT inside a string value.
 */
function parseLenientJSON(text: string): any {
  // 1 — strict parse
  try {
    return JSON.parse(text);
  } catch {
    // 2 — walk the text tracking string state; record every `}` / `]`
    //     that appears outside a string (real structural delimiters).
    const structuralEnds: number[] = [];
    let inString = false;
    let escape = false;
    let quoteCount = 0;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (escape) { escape = false; continue; }
      if (ch === '\\' && inString) { escape = true; continue; }
      if (ch === '"') { inString = !inString; quoteCount++; }
      if (!inString && (ch === '}' || ch === ']')) structuralEnds.push(i);
    }

    // 3 — try each structural delimiter from longest to shortest,
    //     optionally appending missing closing brackets.
    function tryParse(s: string): any {
      for (const close of ['', ']', ']}', '}]', ']}', ']}]', ']}}']) {
        try { return JSON.parse(s + close); } catch { /* next */ }
      }
      throw new Error('no valid parse');
    }

    for (let p = structuralEnds.length - 1; p >= 0; p--) {
      try {
        return tryParse(text.slice(0, structuralEnds[p] + 1));
      } catch {
        continue;
      }
    }

    // 4 — last resort: regex-extract anything that looks like a JSON object
    const match = text.match(/\{.*\}/s) ?? text.match(/\[.*\]/s);
    if (match) {
      try { return JSON.parse(match[0]); } catch { /* fall */ }
    }

    throw new Error('Could not extract valid JSON from model response');
  }
}

// System prompt for continuation chunks (no metadata, just chapters)
const CONTINUATION_PROMPT = `
You are continuing to format additional text for a book. The previous section ended with the chapter titled "$LAST_CHAPTER". Continue from where it left off.

RULES:
1. Output ONLY a JSON object with a "chapters" array.
2. Look for NATURAL chapter boundaries in the text (e.g. "Chapter X", "Part X", major heading changes). Group the text into the correct existing chapter or create a new one ONLY when the text clearly signals a new chapter.
3. Each chapter MUST be complete — do NOT leave any strings unterminated.
4. Use the same Markdown formatting rules as before.

OUTPUT FORMAT:
{
  "chapters": [
    { "title": "Chapter N: Title", "content": "The chapter body in markdown…" }
  ]
}
`.trim();

// ---------------------------------------------------------------------------
// Chunk size — DeepSeek supports 128K tokens, so we can send large chunks.
// 30K characters (~7,500 words) fits several chapters comfortably.
// ---------------------------------------------------------------------------
const CHUNK_SIZE = 30_000;

/**
 * Split long text into chunks of at most CHUNK_SIZE characters,
 * preferring to break at chapter boundaries first, then paragraphs.
 */
function chunkText(text: string): string[] {
  if (text.length <= CHUNK_SIZE) return [text];

  // Try to split at chapter boundaries first
  const chapterRegex = /(?:^|\n)(?:Chapter\s+\d+|CHAPTER\s+\d+|Chapter\s+[A-Z]|CHAPTER\s+[A-Z]|#\s+\d+\.|=== CHAPTER START ===)/gm;
  const chapterMatches = [...text.matchAll(chapterRegex)];

  if (chapterMatches.length > 1) {
    // We found clear chapter boundaries — split at those
    const chunks: string[] = [];
    let currentStart = 0;

    for (let i = 1; i < chapterMatches.length; i++) {
      const endPos = chapterMatches[i].index;
      const chunk = text.slice(currentStart, endPos).trim();
      if (chunk.length > 0) {
        if (chunk.length > CHUNK_SIZE) {
          // This chapter is too long — sub-split it
          chunks.push(...splitByParagraphs(chunk));
        } else {
          chunks.push(chunk);
        }
      }
      currentStart = endPos;
    }
    // Last chunk
    const lastChunk = text.slice(currentStart).trim();
    if (lastChunk.length > 0) {
      if (lastChunk.length > CHUNK_SIZE) {
        chunks.push(...splitByParagraphs(lastChunk));
      } else {
        chunks.push(lastChunk);
      }
    }
    return chunks;
  }

  // No clear chapter boundaries — fall back to paragraph splitting
  return splitByParagraphs(text);
}

/** Fallback: split by paragraphs when chapter boundaries aren't detected. */
function splitByParagraphs(text: string): string[] {
  const paragraphs = text.split(/\n\n+/u);
  const chunks: string[] = [];
  let current = '';

  for (const para of paragraphs) {
    const candidate = current ? `${current}\n\n${para}` : para;
    if (candidate.length > CHUNK_SIZE) {
      if (current) chunks.push(current);
      // Hard-split the over-long paragraph
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

/** Call DeepSeek with a given system prompt and user text, return JSON. */
async function callModel(
  system: string,
  userText: string
): Promise<any> {
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

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', model: MODEL, local: true });
});

app.post('/api/format-book', async (req: Request, res: Response) => {
  const { rawText } = req.body as { rawText?: string };

  if (!rawText || rawText.trim().length < 100) {
    res.status(400).json({
      error: 'Text is too short to format. Please paste at least 100 characters.',
    });
    return;
  }

  try {
    // ---------------------------------------------------------------
    // Stream progress events via SSE so the frontend can show a live
    // progress bar instead of a static "Formatting…" spinner.
    // ---------------------------------------------------------------
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering

    function sendSSE(event: string, data: any) {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    }

    const chunks = chunkText(rawText);
    const total = chunks.length;
    sendSSE('meta', { total });

    console.log(`📦 Splitting ${rawText.length} chars into ${total} chunk(s)`);

    let bookData: any = null;

    for (let i = 0; i < total; i++) {
      const isFirst = i === 0;
      const chunk = chunks[i];

      // Send progress BEFORE processing this chunk
      sendSSE('progress', { current: i + 1, total, chaptersSoFar: bookData?.chapters?.length ?? 0 });

      const label = isFirst ? '📝 Chunk 1 (with metadata)' : `📝 Chunk ${i + 1} (continuation)`;
      console.log(`   ${label}: ${chunk.length} chars`);

      // For continuation chunks, let the model know what chapter came before.
      const lastChapterTitle =
        !isFirst && bookData?.chapters?.length
          ? bookData.chapters[bookData.chapters.length - 1].title
          : '';

      const systemPrompt = isFirst
        ? SYSTEM_PROMPT
        : CONTINUATION_PROMPT.replace('$LAST_CHAPTER', lastChapterTitle);

      const userMessage = isFirst
        ? `Please format the following raw text into a structured book manuscript:\n\n${chunk}`
        : `Continue formatting — here is the next section of text:\n\n${chunk}`;

      const result = await callModel(systemPrompt, userMessage);

      if (isFirst) {
        if (!result.metadata) result.metadata = { title: 'Untitled Document', author: 'Unknown' };
        if (!Array.isArray(result.chapters)) result.chapters = [];
        for (const ch of result.chapters) {
          if (!ch.content) ch.content = '';
        }
        bookData = BookSchema.parse(result);
      } else {
        const contChapters = result.chapters;
        if (Array.isArray(contChapters)) {
          bookData.chapters.push(...contChapters);
        }
      }

      console.log(`   → Got ${bookData.chapters.length} chapter(s) so far`);
    }

    console.log(
      `✅ Formatted "${bookData.metadata.title}" — ${bookData.chapters.length} chapter(s) total`
    );
    sendSSE('complete', bookData);
    res.end();
  } catch (error: any) {
    // If SSE headers were already sent, send error as an SSE event instead.
    if (res.headersSent) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: error?.message || 'Unknown error' })}\n\n`);
      res.end();
      return;
    }
    console.error('DeepSeek error:', error);
    res.status(500).json({
      error: 'Failed to format book. Check the server console for details.',
    });
  }
});

// ---------------------------------------------------------------------------
// PDF Generation — pure Node.js (no Python, no GTK needed)
// ---------------------------------------------------------------------------

// ── Helper: split text into wrapped lines ──────────────────────────────
function wrapText(text: string, font: any, fontSize: number, maxWidth: number): string[] {
  const lines: string[] = [];
  const words = text.split(' ');
  let line = '';
  for (const word of words) {
    const testLine = line ? line + ' ' + word : word;
    const testWidth = font.widthOfTextAtSize(testLine, fontSize);
    if (testWidth > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = testLine;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// ── Helper: draw wrapped text, returns new y position ─────────────
function drawWrapped(
  page: any, text: string, font: any, fontSize: number,
  x: number, y: number, maxWidth: number, lineHeight: number,
  options?: { indent?: number; color?: any }
): number {
  const lines = wrapText(text, font, fontSize, maxWidth);
  let cy = y;
  const color = options?.color || rgb(0, 0, 0);
  for (const line of lines) {
    if (cy < 50) break;
    page.drawText(line, { x: options?.indent ? x + options.indent : x, y: cy, size: fontSize, font, color });
    cy -= lineHeight;
  }
  return cy;
}


// ── Helper: render markdown body text on a page ──────────────────
function drawBodyText(
  page: any, markdown: string,
  bodyFont: any, boldFont: any, italicFont: any,
  fontSize: number, x: number, y: number,
  maxWidth: number, lineHeight: number
): number {
  const md = new MarkdownIt();
  const tokens = md.parse(markdown, {});
  let cy = y;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (cy < 50) break;

    if (token.type === 'heading_open') {
      const level = parseInt(token.tag.slice(1), 10);
      const size = level === 1 ? 24 : level === 2 ? 14 : 12;
      const f = level === 1 ? boldFont : bodyFont;
      cy -= 12;
      const next = tokens[i + 1];
      if (next && next.type === 'inline' && next.content.trim()) {
        cy = drawWrapped(page, next.content, f, size, x, cy, maxWidth, size * 1.4);
      }
      cy -= 6;
    } else if (token.type === 'inline' && token.content.trim()) {
      const indent = 15;
      const lines = wrapText(token.content, bodyFont, fontSize, maxWidth);
      for (let j = 0; j < lines.length; j++) {
        if (cy < 50) break;
        page.drawText(lines[j], {
          x: j === 0 ? x + indent : x, y: cy,
          size: fontSize, font: bodyFont, color: rgb(0, 0, 0),
        });
        cy -= lineHeight;
      }
      cy -= 4;
    } else if (token.type === 'bullet_list_open') {
      cy -= 4;
    }
  }
  return cy;
}

// ── Core PDF generation function ─────────────────────────────────
async function generatePdfBuffer(manuscriptData: any): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const bodyFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const boldFont = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
  const italicFont = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);

  const PW = 432; // 6in * 72pt
  const PH = 648; // 9in * 72pt
  const MI = 63;  // inner margin
  const MO = 45;  // outer margin
  const FS = 11;  // font size
  const LH = 16.5;
  const MW = PW - MI - MO;

  const meta = manuscriptData.metadata || {};
  const title = meta.title || 'Untitled';
  const author = meta.author || 'Anonymous';
  const chapters = manuscriptData.chapters || [];

  // ── Title page
  let page = pdfDoc.addPage([PW, PH]);
  page.drawText(title, { x: MI, y: PH - 300, size: 32, font: boldFont, color: rgb(0, 0, 0), maxWidth: MW });
  page.drawText(`by ${author}`, { x: MI, y: PH - 360, size: 16, font: bodyFont, color: rgb(0.2, 0.2, 0.2) });

  // ── Table of Contents
  page = pdfDoc.addPage([PW, PH]);
  page.drawText('Contents', { x: MI, y: PH - 144, size: 24, font: boldFont, color: rgb(0, 0, 0) });
  let tocY = PH - 200;
  for (let i = 0; i < chapters.length; i++) {
    const chTitle = chapters[i].title || `Chapter ${i + 1}`;
    page.drawText(`${i + 1}. ${chTitle}`, { x: MI, y: tocY, size: 12, font: bodyFont, color: rgb(0, 0, 0) });
    tocY -= 24;
    if (tocY < 80) { page = pdfDoc.addPage([PW, PH]); tocY = PH - 60; }
  }

  // ── Chapters
  for (const ch of chapters) {
    const chTitle = ch.title || 'Chapter';
    const contentMd = ch.content || '';
    page = pdfDoc.addPage([PW, PH]);
    page.drawText(chTitle, { x: MI, y: PH - 144, size: 24, font: boldFont, color: rgb(0, 0, 0) });
    drawBodyText(page, contentMd, bodyFont, boldFont, italicFont, FS, MI, PH - 210, MW, LH);
  }

  // ── Page numbers (skip title page)
  const allPages = pdfDoc.getPages();
  for (let i = 1; i < allPages.length; i++) {
    allPages[i].drawText(String(i), { x: PW / 2 - 6, y: 36, size: 9, font: bodyFont, color: rgb(0.4, 0.4, 0.4) });
  }

  return Buffer.from(await pdfDoc.save());
}

// ── PDF Generation endpoint (Node.js only)
app.post('/api/generate-pdf', async (req: Request, res: Response) => {
  const manuscriptData = req.body;

  if (!manuscriptData || !manuscriptData.chapters || !Array.isArray(manuscriptData.chapters)) {
    res.status(400).json({ error: 'Invalid manuscript data' });
    return;
  }

  try {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="print_ready_book.pdf"');
    const pdfBuffer = await generatePdfBuffer(manuscriptData);
    res.send(pdfBuffer);
    console.log('PDF generated successfully (Node.js engine)');
  } catch (err: any) {
    console.error('PDF generation error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'PDF generation failed.', details: err.message });
    }
  }
});
// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
const PORT = parseInt(process.env.PORT || '3001', 10);
app.listen(PORT, () => {
  console.log(`🚀 Local server: http://localhost:${PORT}`);
  console.log(`   Model: ${MODEL}`);
  console.log(`   PDF Engine: pdf-lib (Node.js)`);
  console.log(`   Database: IndexedDB (browser) + Local files`);
  if (!process.env.OPENAI_API_KEY) {
    console.warn('⚠️  OPENAI_API_KEY is not set — requests will fail!');
  } else {
    console.log(`   Provider: DeepSeek (${process.env.OPENAI_API_KEY.slice(0, 12)}…)`);
  }
});
