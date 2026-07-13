# Modern Book Editor

An **AI-powered, print-ready book editor** — paste messy text, have an LLM structure it into clean Markdown chapters, and export a professional PDF with crop marks, running headers, and automatic Table of Contents.

Built with **React + TipTap** (frontend), **Node.js + Express + DeepSeek** (backend), and **Python + WeasyPrint** (PDF typesetting).

---

## Architecture

```
modern-book-editor/
├── modern-book-editor/     ← React + Vite + TipTap frontend
├── server/                 ← Node.js + Express + DeepSeek API backend
└── typesetting/            ← Python + WeasyPrint PDF engine
    ├── book.css            ← CSS Paged Media master stylesheet
    └── typeset.py          ← JSON → HTML → PDF pipeline
```

| Layer | Technology | Role |
|-------|-----------|------|
| **Frontend** | React 19, Vite, TipTap, Zustand, Tailwind CSS | Rich text editor with AI import modal and PDF export button |
| **Backend** | Node.js, Express, OpenAI SDK, Zod | Chunked DeepSeek API calls, JSON validation, PDF generation bridge |
| **Typesetting** | Python, WeasyPrint, Markdown | Converts manuscript JSON → print-ready PDF with crop marks, bleed, TOC |

---

## Prerequisites

### Frontend
- Node.js 18+
- npm

### Backend
- Node.js 18+
- A **DeepSeek API key** ([platform.deepseek.com](https://platform.deepseek.com))

### Typesetting (PDF generation)
- Python 3.9+
- [WeasyPrint](https://doc.courtbouillon.org/weasyprint/stable/first_steps.html) system dependencies:
  - **Mac:** `brew install pango libffi`
  - **Ubuntu/Debian:** `sudo apt-get install libpango-1.0-0 libpangoft2-1.0-0 libffi-dev`
  - **Windows:** Use WSL or follow the [official guide](https://doc.courtbouillon.org/weasyprint/stable/first_steps.html)
- Python packages: `pip install weasyprint markdown`

---

## Quick Start

### 1. Backend

```bash
cd server
cp .env.example .env
# Edit .env and set OPENAI_API_KEY=sk-your-deepseek-key-here
npx tsx index.ts
# → http://localhost:3001
```

### 2. Frontend

```bash
cd modern-book-editor
npm install
npm run dev
# → http://localhost:5173
```

### 3. Try it

1. Click **✨ AI Format Book** in the sidebar
2. Paste a large block of messy text (e.g. copied PDF, brain dump)
3. Watch the **progress bar** as DeepSeek processes it in chunks
4. The formatted chapters appear in your TipTap editor
5. Click **📄 Export Print PDF** to download a print-ready PDF

---

## Features

### AI Book Formatter
- **Chunked processing** — large texts (100k+ chars) are split into 8000-char chunks, each sent to DeepSeek with chapter context
- **Zod validation** — every model response is validated against a strict schema before reaching your editor
- **Live progress bar** — SSE event stream shows real-time chunk progress and chapter count in the modal
- **Resilient JSON parser** — `parseLenientJSON()` handles truncated responses by finding structural delimiters outside strings and auto-appending missing closing brackets
- **Last-chapter context** — continuation chunks are told what chapter title came before, so content appends naturally

### Rich Text Editor (TipTap)
- Paragraph, headings (H1–H3), bold, italic, code, blockquotes
- Bullet and ordered lists, horizontal rules
- **Image insertion** — upload images with caption and full-bleed toggle; DPI warning for print quality
- Undo/redo, word/character count, focus mode
- Dark, light, and sepia themes
- Search/filter chapters
- Font family and size controls

### Print-Ready PDF Export
- **6×9 trade paperback** format with crop marks and ⅛″ bleed
- **Cover page** — separate full-bleed cover section (add your own image)
- **Title page** — book title, author, trim size
- **Table of Contents** — auto-generated with `target-counter` page numbers and dot leaders
- **Roman numerals** (i, ii, iii…) on front matter, reset to **Arabic** (1, 2, 3…) at Chapter 1
- **Running headers** — chapter title at top-right of every right-hand page
- **Widows/orphans control** — minimum 3 lines at page breaks
- **Hyphenation** and **justified text**
- **Full-bleed images** — extend past text margins
- **Clickable hyperlinks** in the PDF

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check, returns active model name |
| `POST` | `/api/format-book` | Accepts `{ rawText }`, returns SSE stream of progress + final book JSON |
| `POST` | `/api/generate-pdf` | Accepts `{ metadata, chapters }`, streams a PDF file back |

---

## Configuration

### `server/.env`

```env
OPENAI_API_KEY=sk-...       # Your DeepSeek API key
MODEL=deepseek-chat          # Model name (deepseek-chat, deepseek-reasoner)
PORT=3001                    # Backend port
```

### Chunking

The `CHUNK_SIZE` constant in `server/index.ts` controls how many characters are sent per DeepSeek call. Default is **8000** — large enough for natural chapter grouping, small enough to avoid token limit truncation.

---

## Front Cover Image

To add a custom cover to your PDF:

1. In `typesetting/typeset.py`, find the `🖼️ FRONT COVER IMAGE` comment
2. Uncomment the `<img>` line and point it to your cover file:
   ```html
   <img src="file:///absolute/path/to/your/cover.jpg" class="full-bleed" />
   ```
3. For a 6×9 book, use an image at least **1950×2925 px** (300 DPI)

---

## Project Status

✅ **Week 1** — TipTap editor with chapters, themes, word count, focus mode  
✅ **Week 2** — DeepSeek integration with chunked AI formatting, Zod validation, SSE progress  
✅ **Week 3** — Print-ready PDF export with TOC, cover page, images, crop marks, running headers  

### Future ideas
- Embed custom fonts (`@font-face` for Merriweather/Lora)
- Table of Contents generation with CSS `target-counter`
- PDF/X compliance for IngramSpark/Direct-to-publisher upload
- Image optimization and server-side upload
