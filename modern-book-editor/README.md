# Mashimi — Modern Book Editor

An AI-powered manuscript editor that converts raw documents into clean, print-ready books. Drop in a `.docx`, `.txt`, or `.md` file, and the AI detects chapters, removes the table of contents, fixes line-wraps and paragraphs, and builds a structured book — no manual setup required.

---

## Quick Start

### Prerequisites
- **Node.js** 18+ and **npm**
- A **DeepSeek API key** (set in `server/.env`)

### 1. Install dependencies

```bash
# Frontend
cd modern-book-editor
npm install

# Backend
cd ../server
npm install
```

### 2. Configure the API key

Create `server/.env` (or edit the existing one):

```env
OPENAI_API_KEY=sk-your-deepseek-api-key
MODEL=deepseek-chat
PORT=3001
CHUNK_SIZE=8000
```

### 3. Start both servers

**Terminal 1 — Backend:**
```bash
cd server
npm run dev
```

**Terminal 2 — Frontend:**
```bash
cd modern-book-editor
npm run dev
```

### 4. Open the app

Visit **http://localhost:5173**

---

## Architecture

```
modern-book-editor/
├── server/                  # Express backend (port 3001)
│   ├── index.ts             # API routes, AI formatting, PDF export
│   └── .env                 # DeepSeek API key & config
│
├── modern-book-editor/      # React frontend (Vite, port 5173)
│   ├── src/
│   │   ├── main.tsx         # Entry point (React root + BrowserRouter)
│   │   ├── App.tsx          # Routes: /, /editor, /settings, /export, /cover
│   │   ├── components/
│   │   │   ├── Dashboard.tsx      # Landing page with drop zone
│   │   │   ├── AIFormatModal.tsx  # Upload/paste → AI format dialog
│   │   │   ├── EditorLayout.tsx   # Editor shell (sidebar + editor + preview)
│   │   │   ├── Sidebar.tsx        # Chapter list, search, preview toggle
│   │   │   ├── BookEditor.tsx     # TipTap rich-text editor
│   │   │   ├── PreviewPanel.tsx   # Print preview sidebar
│   │   │   ├── ExportPage.tsx     # PDF export page
│   │   │   ├── SettingsPage.tsx   # Typography & theme settings
│   │   │   └── CoverDesigner.tsx  # Book cover designer
│   │   ├── store/
│   │   │   └── useBookStore.ts  # Zustand state (chapters, theme, settings)
│   │   ├── hooks/
│   │   │   └── useLocalSync.ts  # IndexedDB autosave
│   │   ├── db/
│   │   │   └── localDb.ts       # IndexedDB: manuscripts, jobs, settings
│   │   ├── lib/
│   │   │   └── api.ts           # API URL helper
│   │   └── utils/
│   │       └── wordCounter.ts   # Text extraction, word count, Markdown→ProseMirror
│   └── tailwind.config.js
│
└── typesetting/             # Python typesetting (optional)
    └── typeset.py

---

## Workflow

### 1. Dashboard — Drop your manuscript

The landing page is a **drag-and-drop zone**. You can:
- **Drop** a `.docx`, `.txt`, or `.md` file directly onto the zone
- **Click** "Choose file" to browse for a document
- **Click** "Paste text" to paste raw text
- **Click** "or start with a blank page" to open an empty editor

### 2. AI Formatting (the core feature)

The **AI Format Modal** opens when you upload/paste a file. It:

1. **Extracts** text from your document (mammoth for `.docx`, direct read for `.txt`/`.md`)
2. **Sends** the text to DeepSeek AI in chunks (5,000–8,000 characters each)
3. **Streams** progress updates via SSE (chunk counter, chapter count)
4. **Merges** chapters across chunk boundaries using continuation context
5. **Returns** structured JSON with detected chapters and cleaned body text

The AI prompt instructs the model to:
- **Preserve 100% of the body text** — never summarize or omit
- **Drop the table of contents** — don't turn TOC lines into chapters
- **Detect real headings** (Chapter 1, Part One, Introduction, etc.)
- **Clean the text** — join wrapped lines, remove page numbers, fix OCR glitches
- **Keep Markdown formatting** — lists, blockquotes, emphasis

### 3. Automatic save

After AI formatting completes:
1. The result is **imported** into the Zustand store
2. A **real manuscript is created** in IndexedDB
3. The book is **saved** immediately
4. You're **navigated** to the editor at `/editor/{id}`

The autosave runs every 800ms of inactivity and **always writes the live state** (never a stale snapshot).

### 4. Editor

The editor has three panels:

| Panel | Description |
|-------|-------------|
| **Sidebar** (left) | Book title/author, chapter list with search, add/delete/rename chapters, AI Format & Export buttons, preview mode toggle |
| **Editor** (center) | TipTap rich-text editor with full formatting toolbar (headings, bold, italic, lists, images, code blocks) |
| **Preview** (right) | Print preview with typography settings |

### 5. Export

The Export page converts your TipTap content to Markdown and generates a **print-ready PDF** via `pdf-lib` (no Python required).

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check, returns model & chunk size |
| `/api/parse-docx` | POST | Upload `.docx`/`.txt`/`.md`, returns extracted text |
| `/api/format-book` | POST | AI formatting via SSE stream (progress + result) |
| `/api/generate-pdf` | POST | Generate print-ready PDF from chapters |
| `/api/upload-image` | POST | Upload an image, returns public URL |

---

## Key Features

- **AI-powered formatting** — Drop any document and get clean, structured chapters
- **Local-first storage** — All data stored in IndexedDB (no cloud required)
- **Real-time progress** — SSE streaming shows AI progress chunk by chunk
- **Rich text editor** — TipTap with full formatting toolbar
- **Print preview** — See how your book will look before exporting
- **PDF export** — Pure Node.js PDF generation (no Python/WeasyPrint needed)
- **Dark mode** — Light, dark, and sepia themes
- **Chapter management** — Add, delete, rename, and search chapters
- **Drag-and-drop upload** — Drop files directly on the dashboard

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS |
| **Editor** | TipTap (ProseMirror) |
| **State** | Zustand (persisted to localStorage) |
| **Database** | IndexedDB (local-first) |
| **Backend** | Express, TypeScript (tsx) |
| **AI** | DeepSeek (OpenAI-compatible API) |
| **PDF** | pdf-lib + markdown-it (pure Node) |
| **DOCX** | mammoth (Word document parsing) |
| **Icons** | Lucide React |

---

## Environment Variables

### Frontend (`modern-book-editor/.env`)
| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_URL` | `http://localhost:3001` | Backend API base URL |

### Backend (`server/.env`)
| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_API_KEY` | — | DeepSeek API key (required) |
| `MODEL` | `deepseek-chat` | AI model name |
| `PORT` | `3001` | Server port |
| `CHUNK_SIZE` | `8000` | AI chunk size in characters |

---

## Production Build

```bash
cd modern-book-editor
npm run build
```

Output goes to `modern-book-editor/dist/`. Serve with any static file server.

```