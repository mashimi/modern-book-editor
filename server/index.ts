import express, { Request, Response } from 'express';
import cors from 'cors';
import { spawn } from 'child_process';
import path from 'path';
import { OpenAI } from 'openai';
import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// DeepSeek provides an OpenAI-compatible API — we only swap the base URL & model.
const openai = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.OPENAI_API_KEY,
});
const MODEL = process.env.MODEL || 'deepseek-chat';

// ---------------------------------------------------------------------------
// Zod Schema — we validate the model output against this shape after parsing
// ---------------------------------------------------------------------------
const BookSchema = z.object({
  metadata: z.object({
    title: z.string().describe('The main title of the book'),
    author: z.string().optional().describe("The author's name, if found"),
    trimSize: z
      .string()
      .default('6x9in')
      .describe('Standard book trim size for typesetting'),
  }),
  chapters: z.array(
    z.object({
      title: z
        .string()
        .describe("The chapter title, e.g. 'Chapter 1: The Beginning'"),
      content: z
        .string()
        .describe('The chapter body in clean Markdown (headings, bold, italics, lists, blockquotes)'),
    })
  ),
});

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `
You are an expert book editor and typesetter. Your task is to take raw, messy 
text — copied from PDFs, OCR scans, or brain dumps — and convert it into a 
perfectly structured Markdown manuscript ready for professional typesetting.

RULES:
1. METADATA — Extract the book title and author. If unclear, infer a logical title.
2. CHAPTERS — Split the text into logical chapters using clear boundaries 
   (chapter headings, scene breaks, topic shifts). Use "# Chapter N: Title" format.
3. SECTIONS — Use "##" for sections within a chapter, "###" for sub-sections.
4. CLEANUP:
   - Merge broken paragraphs caused by hard line-breaks (common in PDFs).
   - Remove URL-encoding artifacts (e.g. %20, %E2%80%99).
   - Fix obvious OCR errors (e.g. 'l' instead of '1', 'O' instead of '0' in numbers).
   - Do NOT rewrite the author's voice or change factual meaning.
5. MARKDOWN FORMATTING — Use **bold**, *italics*, - bullet lists, 1. numbered lists,
   > blockquotes, and | tables where appropriate.
6. FRONT MATTER — If introductory text precedes Chapter 1, label it "Front Matter" 
   or "Introduction".

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

// Chunk size — big enough for natural chapter groupings, small enough to
// stay well within DeepSeek's context window without truncation.
const CHUNK_SIZE = 8000;

/**
 * Split long text into chunks of at most CHUNK_SIZE characters,
 * preferring to break at paragraph boundaries.
 */
function chunkText(text: string): string[] {
  // If the whole text fits, return as-is.
  if (text.length <= CHUNK_SIZE) return [text];

  const chunks: string[] = [];
  // Split on double-newlines first (paragraphs).
  const paragraphs = text.split(/\n\n+/u);
  let current = '';

  for (const para of paragraphs) {
    const candidate = current ? `${current}\n\n${para}` : para;
    if (candidate.length > CHUNK_SIZE) {
      // If the current paragraph itself is too long, hard-split it.
      if (!current) {
        // This single paragraph exceeds CHUNK_SIZE — slice it.
        for (let i = 0; i < para.length; i += CHUNK_SIZE) {
          chunks.push(para.slice(i, i + CHUNK_SIZE));
        }
      } else {
        chunks.push(current);
        // Re-evaluate the current paragraph for further splitting.
        for (let i = 0; i < para.length; i += CHUNK_SIZE) {
          chunks.push(para.slice(i, i + CHUNK_SIZE));
        }
        current = '';
      }
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
  res.json({ status: 'ok', model: MODEL });
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
// PDF Generation — calls the Python typesetting engine
// ---------------------------------------------------------------------------

app.post('/api/generate-pdf', async (req: Request, res: Response) => {
  const manuscriptData = req.body;

  if (!manuscriptData || !manuscriptData.chapters || !Array.isArray(manuscriptData.chapters)) {
    res.status(400).json({ error: 'Invalid manuscript data — expected { chapters: […] }.' });
    return;
  }

  // Set headers for a PDF download
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="print_ready_book.pdf"');

  // Spawn the Python script (use 'python' on Windows, 'python3' on macOS/Linux)
  const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
  const scriptPath = path.join(__dirname, '..', 'typesetting', 'typeset.py');
  const pythonProcess = spawn(pythonCmd, [scriptPath]);

  // Pipe the manuscript JSON into the script's stdin
  pythonProcess.stdin.write(JSON.stringify(manuscriptData));
  pythonProcess.stdin.end();

  // Stream the resulting PDF binary back to the client
  pythonProcess.stdout.pipe(res);

  // Capture any stderr for debugging
  let stderr = '';
  pythonProcess.stderr.on('data', (data: Buffer) => {
    stderr += data.toString();
  });

  pythonProcess.on('close', (code: number | null) => {
    if (code !== 0) {
      console.error('Python typesetting error:', stderr);
      if (!res.headersSent) {
        res.status(500).json({ error: 'PDF generation failed.', details: stderr });
      }
    } else {
      console.log('✅ PDF generated and streamed to client');
    }
  });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
const PORT = parseInt(process.env.PORT || '3001', 10);
app.listen(PORT, () => {
  console.log(`🚀 Backend running on http://localhost:${PORT}`);
  console.log(`   Model: ${MODEL}`);
  if (!process.env.OPENAI_API_KEY) {
    console.warn('⚠️  OPENAI_API_KEY is not set — requests will fail!');
  } else {
    console.log(`   Provider: DeepSeek (${process.env.OPENAI_API_KEY.slice(0, 12)}…)`);
  }
});
