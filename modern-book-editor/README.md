 Yes — I checked the whole codebase. It is a strong prototype, but it is **not product-ready yet**. The biggest immediate blocker is that `modern-book-editor/src/components/Sidebar.tsx` is a binary/invalid file, so the frontend cannot compile cleanly. There are also several runtime and production issues:

- Autosave uses stale state and can save old data.
- AI SSE parsing is fragile.
- Server AI endpoint has almost no error handling and can hang.
- PDF export in `server/index.ts` is a basic `pdf-lib` exporter, not the print-ready WeasyPrint pipeline described in the README.
- Hardcoded `http://localhost:3001` calls.
- Dark mode is not wired correctly for Tailwind.
- Upload directory may not exist.
- No validation, rate limiting, security headers, or graceful API errors.
- Some exposed UI features are incomplete, e.g. DOCX export.
- Root has junk files: `$null`, `void`.

Below is a **production-oriented patch set**. Apply these changes and the app should be much closer to a runnable, deployable product.

---

# 1. Delete junk files

Remove these accidental files from the repository root:

```bash
rm -f "$null" void
```

On Windows PowerShell:

```powershell
Remove-Item '$null' -ErrorAction SilentlyContinue
Remove-Item 'void' -ErrorAction SilentlyContinue
```

---

# 2. Fix Tailwind dark mode

## `modern-book-editor/tailwind.config.js`

Replace with:

```js
import typography from '@tailwindcss/typography';

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [typography],
};
```

---

## `modern-book-editor/src/App.tsx`

Replace with:

```tsx
import { Routes, Route } from 'react-router-dom';
import { Dashboard } from './components/Dashboard';
import { EditorLayout } from './components/EditorLayout';
import { SettingsPage } from './components/SettingsPage';
import { ExportPage } from './components/ExportPage';
import { CoverDesigner } from './components/CoverDesigner';
import { useBookStore } from './store/useBookStore';

function App() {
  const { theme } = useBookStore();

  const themeClasses = {
    light: 'bg-zinc-50 text-zinc-900',
    dark: 'dark bg-zinc-900 text-zinc-100',
    sepia: 'bg-[#fdf9f0] text-amber-950',
  };

  return (
    <div
      className={`h-screen w-screen overflow-hidden font-sans transition-colors duration-300 ${themeClasses[theme]}`}
    >
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/editor/:manuscriptId?" element={<EditorLayout />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/export" element={<ExportPage />} />
        <Route path="/cover" element={<CoverDesigner />} />
      </Routes>
    </div>
  );
}

export default App;
```

---

# 3. Add frontend API configuration

Create:

```txt
modern-book-editor/src/lib/api.ts
```

With:

```ts
export const API_BASE_URL =
  import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}
```

Create:

```txt
modern-book-editor/.env.example
```

With:

```env
VITE_API_URL=http://localhost:3001
```

For local development, copy it:

```bash
cp .env.example .env
```

---

# 4. Replace the broken `Sidebar.tsx`

Delete the binary file:

```bash
rm modern-book-editor/src/components/Sidebar.tsx
```

Create a new text file:

```txt
modern-book-editor/src/components/Sidebar.tsx
```

Replace with:

```tsx
import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useBookStore } from '../store/useBookStore';
import { AIFormatModal } from './AIFormatModal';
import { countWords } from '../utils/wordCounter';
import {
  BookOpen,
  Plus,
  Trash2,
  Sparkles,
  Download,
  PanelLeftClose,
  Eye,
  Search,
  Image as ImageIcon,
  Columns3,
  Maximize2,
  EyeOff,
} from 'lucide-react';

interface SidebarProps {
  manuscriptId?: string;
}

export const Sidebar: React.FC<SidebarProps> = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isAIOpen, setAIOpen] = useState(false);

  const {
    chapters,
    activeChapterId,
    setActiveChapter,
    addChapter,
    deleteChapter,
    updateChapterTitle,
    bookTitle,
    setBookTitle,
    author,
    setAuthor,
    searchQuery,
    setSearchQuery,
    setSidebarOpen,
    previewMode,
    setPreviewMode,
  } = useBookStore();

  useEffect(() => {
    if (searchParams.get('ai') === '1') {
      setAIOpen(true);
      searchParams.delete('ai');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const filteredChapters = chapters.filter((chapter) =>
    chapter.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const cyclePreview = () => {
    if (previewMode === 'off') setPreviewMode('split');
    else if (previewMode === 'split') setPreviewMode('fullscreen');
    else setPreviewMode('off');
  };

  const previewIcon =
    previewMode === 'off' ? (
      <EyeOff className="w-4 h-4" />
    ) : previewMode === 'split' ? (
      <Columns3 className="w-4 h-4" />
    ) : (
      <Maximize2 className="w-4 h-4" />
    );

  return (
    <aside className="w-80 h-full bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 flex flex-col">
      <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 font-bold text-zinc-900 dark:text-zinc-100"
          >
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-white" />
            </div>
            Mashimi
          </button>

          <button
            onClick={() => setSidebarOpen(false)}
            className="p-2 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            title="Hide sidebar"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-4 space-y-2">
          <input
            value={bookTitle}
            onChange={(e) => setBookTitle(e.target.value)}
            placeholder="Book title"
            className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm font-semibold"
          />
          <input
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="Author"
            className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="p-3 border-b border-zinc-200 dark:border-zinc-800 grid grid-cols-2 gap-2">
        <button
          onClick={() => setAIOpen(true)}
          className="col-span-2 flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 px-3 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          <Sparkles className="w-4 h-4" />
          AI Format Book
        </button>

        <button
          onClick={() => navigate('/export')}
          className="flex items-center justify-center gap-2 rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          <Download className="w-4 h-4" />
          Export
        </button>

        <button
          onClick={() => navigate('/cover')}
          className="flex items-center justify-center gap-2 rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          <ImageIcon className="w-4 h-4" />
          Cover
        </button>

        <button
          onClick={addChapter}
          className="flex items-center justify-center gap-2 rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          <Plus className="w-4 h-4" />
          Chapter
        </button>

        <button
          onClick={cyclePreview}
          className="flex items-center justify-center gap-2 rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
          title={`Preview mode: ${previewMode}`}
        >
          {previewIcon}
          Preview
        </button>
      </div>

      <div className="p-3 border-b border-zinc-200 dark:border-zinc-800">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search chapters"
            className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent py-2 pl-9 pr-3 text-sm"
          />
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-2 space-y-1">
        {filteredChapters.length === 0 && (
          <p className="px-3 py-6 text-center text-sm text-zinc-500">
            No chapters found.
          </p>
        )}

        {filteredChapters.map((chapter) => {
          const isActive = chapter.id === activeChapterId;
          const words = countWords(chapter.content);

          return (
            <div
              key={chapter.id}
              onClick={() => setActiveChapter(chapter.id)}
              className={`group rounded-lg border px-3 py-2 cursor-pointer transition-colors ${
                isActive
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <input
                  value={chapter.title}
                  onClick={(e) => e.stopPropagation()}
                  onFocus={() => setActiveChapter(chapter.id)}
                  onChange={(e) =>
                    updateChapterTitle(chapter.id, e.target.value)
                  }
                  className="w-full bg-transparent text-sm font-medium focus:outline-none"
                />

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (chapters.length <= 1) return;
                    if (confirm('Delete this chapter?')) {
                      deleteChapter(chapter.id);
                    }
                  }}
                  disabled={chapters.length <= 1}
                  className="opacity-0 group-hover:opacity-100 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded p-1 disabled:opacity-20"
                  title="Delete chapter"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <p className="mt-1 text-xs text-zinc-500">
                {words.toLocaleString()} words
              </p>
            </div>
          );
        })}
      </nav>

      <div className="p-3 border-t border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500">
        {chapters.length} chapters
      </div>

      <AIFormatModal isOpen={isAIOpen} onClose={() => setAIOpen(false)} />
    </aside>
  );
};
```

---

# 5. Fix Dashboard AI flow

The Dashboard currently sends the AI button to `/editor` without creating a manuscript. That means AI imports may not persist.

In `modern-book-editor/src/components/Dashboard.tsx`, add this handler inside the component:

```tsx
const handleAIProject = async () => {
  const id = await createManuscript('AI Formatted Book');
  navigate(`/editor/${id}?ai=1`);
};
```

Then replace this block:

```tsx
<div onClick={() => navigate('/editor')} className="cursor-pointer group bg-gradient-to-br from-purple-600 to-blue-600 text-white rounded-xl p-6 hover:opacity-90 transition-all">
```

With:

```tsx
<div onClick={handleAIProject} className="cursor-pointer group bg-gradient-to-br from-purple-600 to-blue-600 text-white rounded-xl p-6 hover:opacity-90 transition-all">
```

---

# 6. Fix stale autosave in `useLocalSync.ts`

Replace:

```txt
modern-book-editor/src/hooks/useLocalSync.ts
```

With:

```ts
import { useEffect, useMemo, useRef } from 'react';
import { useBookStore } from '../store/useBookStore';
import { saveManuscript, getManuscript } from '../db/localDb';
import { debounce } from '../utils/debounce';

export function useLocalSync(manuscriptId: string | undefined) {
  const loadManuscript = useBookStore((state) => state.loadManuscript);

  const chapters = useBookStore((state) => state.chapters);
  const bookTitle = useBookStore((state) => state.bookTitle);
  const author = useBookStore((state) => state.author);
  const theme = useBookStore((state) => state.theme);

  const isLoading = useRef(false);

  useEffect(() => {
    if (!manuscriptId) return;

    let cancelled = false;
    isLoading.current = true;

    getManuscript(manuscriptId)
      .then((data) => {
        if (cancelled) return;

        if (data) {
          loadManuscript({
            chapters: data.chapters,
            bookTitle: data.title,
            author: data.author,
            theme: data.metadata?.theme || 'light',
          });
        }
      })
      .finally(() => {
        if (!cancelled) isLoading.current = false;
      });

    return () => {
      cancelled = true;
    };
  }, [manuscriptId, loadManuscript]);

  const debouncedSave = useMemo(
    () =>
      debounce(async (id: string) => {
        if (isLoading.current) return;

        const currentState = useBookStore.getState();

        await saveManuscript(id, {
          title: currentState.bookTitle,
          author: currentState.author,
          chapters: currentState.chapters,
          metadata: {
            theme: currentState.theme,
            updatedAt: Date.now(),
          } as any,
        });
      }, 1000),
    []
  );

  useEffect(() => {
    if (!manuscriptId || isLoading.current) return;
    debouncedSave(manuscriptId);
  }, [
    manuscriptId,
    chapters,
    bookTitle,
    author,
    theme,
    debouncedSave,
  ]);

  return { isSynced: true };
}
```

---

# 7. Improve local DB typing

Replace `saveManuscript` in:

```txt
modern-book-editor/src/db/localDb.ts
```

With:

```ts
export async function saveManuscript(
  id: string,
  data: Partial<Omit<DBSchema['manuscripts'], 'metadata'>> & {
    metadata?: Partial<DBSchema['manuscripts']['metadata']>;
  }
): Promise<void> {
  const existing = await getManuscript(id);
  if (!existing) throw new Error('Manuscript not found');

  const updated = {
    ...existing,
    ...data,
    metadata: {
      ...existing.metadata,
      ...(data.metadata || {}),
      updatedAt: Date.now(),
    },
  };

  const store = await getStore('manuscripts', 'readwrite');

  await new Promise<void>((resolve, reject) => {
    const req = store.put(updated);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
```

---

# 8. Replace `AIFormatModal.tsx`

Replace:

```txt
modern-book-editor/src/components/AIFormatModal.tsx
```

With:

```tsx
import React, { useRef, useState } from 'react';
import { marked } from 'marked';
import { useBookStore } from '../store/useBookStore';
import { apiUrl } from '../lib/api';
import { FileText, Loader2, Upload, ClipboardPaste } from 'lucide-react';

interface AIFormatModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AIFormatModal: React.FC<AIFormatModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [mode, setMode] = useState<'upload' | 'paste'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [rawText, setRawText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, chapters: 0 });
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState('');

  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { importFromAI } = useBookStore();

  if (!isOpen) return null;

  const resetState = () => {
    setFile(null);
    setRawText('');
    setError('');
    setProgress({ current: 0, total: 0, chapters: 0 });
    setStatusText('');
  };

  const handleClose = () => {
    if (isProcessing) {
      abortRef.current?.abort();
    }
    resetState();
    onClose();
  };

  const extractTextFromFile = async (selectedFile: File): Promise<string> => {
    const lowerName = selectedFile.name.toLowerCase();

    if (lowerName.endsWith('.docx')) {
      setStatusText('Parsing Word document...');
      const formData = new FormData();
      formData.append('document', selectedFile);

      const parseRes = await fetch(apiUrl('/api/parse-docx'), {
        method: 'POST',
        body: formData,
      });

      if (!parseRes.ok) {
        const err = await parseRes.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to parse document');
      }

      const parseData = await parseRes.json();
      return parseData.text || '';
    }

    if (lowerName.endsWith('.txt') || lowerName.endsWith('.md') || lowerName.endsWith('.markdown')) {
      setStatusText('Reading text file...');
      return await selectedFile.text();
    }

    throw new Error('Unsupported file type. Use .docx, .txt, or .md');
  };

  const processSseBlock = (block: string, onBookData: (data: any) => void) => {
    let eventName = 'message';
    const dataLines: string[] = [];

    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trim());
      }
    }

    if (!dataLines.length) return;

    let data: any;
    try {
      data = JSON.parse(dataLines.join('\n'));
    } catch {
      return;
    }

    if (eventName === 'meta') {
      setProgress((p) => ({ ...p, total: data.total || 0 }));
    } else if (eventName === 'progress') {
      setProgress({
        current: data.current || 0,
        total: data.total || 0,
        chapters: data.chaptersSoFar || 0,
      });
      setStatusText(`Processing chunk ${data.current} of ${data.total}...`);
    } else if (eventName === 'complete') {
      onBookData(data);
    } else if (eventName === 'error') {
      throw new Error(data.error || 'Server error');
    }
  };

  const streamFormat = async (text: string) => {
    setIsProcessing(true);
    setError('');
    setProgress({ current: 0, total: 0, chapters: 0 });
    setStatusText('AI is formatting your book...');

    const controller = new AbortController();
    abortRef.current = controller;

    const response = await fetch(apiUrl('/api/format-book'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rawText: text }),
      signal: controller.signal,
    });

    if (!response.ok || !response.body) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `AI formatting request failed (${response.status})`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let bookData: any = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() || '';

      for (const block of blocks) {
        processSseBlock(block, (data) => {
          bookData = data;
        });
      }
    }

    if (buffer.trim()) {
      processSseBlock(buffer, (data) => {
        bookData = data;
      });
    }

    if (!bookData) {
      throw new Error('No completion event received');
    }

    const formattedChapters = (bookData.chapters || []).map(
      (ch: { title: string; content: string }) => ({
        title: ch.title,
        htmlContent: String(marked.parse(ch.content || '')),
      })
    );

    importFromAI(
      bookData.metadata?.title || 'AI Formatted Book',
      formattedChapters
    );

    resetState();
    onClose();
  };

  const handleFormat = async () => {
    setError('');

    try {
      let text = '';

      if (mode === 'paste') {
        text = rawText.trim();
      } else {
        if (!file) {
          throw new Error('Please choose a file first.');
        }
        text = (await extractTextFromFile(file)).trim();
      }

      if (text.length < 100) {
        throw new Error(
          'Content is too short. Please provide at least 100 characters.'
        );
      }

      await streamFormat(text);
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        console.error(err);
        setError(err?.message || 'Failed to format document');
      }
    } finally {
      setIsProcessing(false);
      abortRef.current = null;
      setStatusText('');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-2xl w-full max-w-2xl p-6 flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-800 dark:text-zinc-100">
            ✨ AI Book Formatter
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-500 hover:text-gray-800 dark:hover:text-zinc-200 text-2xl"
          >
            &times;
          </button>
        </div>

        <p className="text-sm text-gray-600 dark:text-zinc-400 mb-4">
          Upload a Word document, plain text file, or paste raw text. The AI will
          structure it into chapters and import it into the editor.
        </p>

        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setMode('upload')}
            className={`px-4 py-2 rounded-lg text-sm font-medium border ${
              mode === 'upload'
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                : 'border-zinc-300 dark:border-zinc-700'
            }`}
          >
            <Upload className="w-4 h-4 inline mr-2" />
            Upload
          </button>

          <button
            onClick={() => setMode('paste')}
            className={`px-4 py-2 rounded-lg text-sm font-medium border ${
              mode === 'paste'
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                : 'border-zinc-300 dark:border-zinc-700'
            }`}
          >
            <ClipboardPaste className="w-4 h-4 inline mr-2" />
            Paste Text
          </button>
        </div>

        {mode === 'upload' ? (
          <div
            onClick={() => !isProcessing && fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              file
                ? 'border-green-400 bg-green-50 dark:bg-green-900/10'
                : 'border-gray-300 dark:border-zinc-700 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/10'
            } ${isProcessing ? 'pointer-events-none opacity-60' : ''}`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".docx,.txt,.md,.markdown"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="hidden"
              disabled={isProcessing}
            />

            {file ? (
              <div className="flex items-center justify-center gap-3">
                <FileText className="w-8 h-8 text-green-600" />
                <div className="text-left">
                  <p className="font-medium text-gray-800 dark:text-zinc-100">
                    {file.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {(file.size / 1024).toFixed(1)} KB
                  </p>
                </div>
              </div>
            ) : (
              <div>
                <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-600 dark:text-zinc-300 font-medium">
                  Click to select a document
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  .docx, .txt, or .md files only
                </p>
              </div>
            )}
          </div>
        ) : (
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder="Paste your raw book text here..."
            className="w-full h-56 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent p-3 text-sm"
            disabled={isProcessing}
          />
        )}

        {error && (
          <div className="mt-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {isProcessing && (
          <div className="mt-4 space-y-2">
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-zinc-300">
              <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
              <span>{statusText}</span>
            </div>

            {progress.total > 0 && (
              <div>
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>
                    Chunk {progress.current} of {progress.total}
                  </span>
                  <span>{progress.chapters} chapter(s) found</span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-zinc-700 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-blue-500 to-purple-600 h-2 rounded-full transition-all duration-300"
                    style={{
                      width: `${(progress.current / progress.total) * 100}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-md"
            disabled={isProcessing}
          >
            Cancel
          </button>

          <button
            onClick={handleFormat}
            className="px-6 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-md hover:opacity-90 flex items-center gap-2 disabled:opacity-50"
            disabled={isProcessing || (mode === 'upload' ? !file : !rawText.trim())}
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Processing...
              </>
            ) : (
              '✨ Format My Book'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
```

---

# 9. Fix image insertion in `BookEditor.tsx`

In `modern-book-editor/src/components/BookEditor.tsx`, replace the `CustomImage` definition with this:

```tsx
const CustomImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      caption: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-caption'),
        renderHTML: (attributes: any) => {
          if (!attributes.caption) return {};
          return { 'data-caption': attributes.caption };
        },
      },
      class: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('class'),
        renderHTML: (attributes: any) => {
          if (!attributes.class) return {};
          return { class: attributes.class };
        },
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageComponent);
  },
});
```

Also replace the editor content sync effect with this safer version:

```tsx
useEffect(() => {
  if (!editor) return;

  const chapter = useBookStore
    .getState()
    .chapters.find((c) => c.id === activeChapterId);

  if (!chapter) return;

  if (chapter.pendingHtml) {
    editor.commands.setContent(chapter.pendingHtml);
    applyPendingHtml(chapter.id, editor.getJSON());
    return;
  }

  const currentContent = JSON.stringify(editor.getJSON());
  const newContent = JSON.stringify(chapter.content || '');

  if (currentContent !== newContent) {
    editor.commands.setContent(chapter.content || '');
  }
}, [editor, activeChapterId, chapters, applyPendingHtml]);
```

Make sure `chapters` is already destructured from `useBookStore()` in `BookEditor.tsx`. If not, add it:

```tsx
const {
  activeChapterId,
  chapters,
  updateChapterContent,
  applyPendingHtml,
  theme,
  setTheme,
  fontFamily,
  setFontFamily,
  fontSize,
  setFontSize,
  focusMode,
  setFocusMode,
  sidebarOpen,
  setSidebarOpen,
} = useBookStore();
```

---

# 10. Replace `ImageUploadModal.tsx`

Replace:

```txt
modern-book-editor/src/components/ImageUploadModal.tsx
```

With:

```tsx
import React, { useState, useRef } from 'react';
import { apiUrl } from '../lib/api';

interface ImageUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  editor: any;
}

export const ImageUploadModal: React.FC<ImageUploadModalProps> = ({
  isOpen,
  onClose,
  editor,
}) => {
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [isBleed, setIsBleed] = useState(false);
  const [dpiWarning, setDpiWarning] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const reset = () => {
    setPreview(null);
    setCaption('');
    setIsBleed(false);
    setDpiWarning('');
    setError('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError('');

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('Image is too large. Maximum size is 10 MB.');
      return;
    }

    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('image', file);

      const res = await fetch(apiUrl('/api/upload-image'), {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Upload failed');
      }

      const data = await res.json();
      setPreview(data.url);

      const img = new Image();
      img.onload = () => {
        const minWidth = isBleed ? 1950 : 1500;
        setDpiWarning(
          img.width < minWidth
            ? `⚠️ Image is ${img.width}px wide. For print quality aim for ${minWidth}px+ at 300 DPI.`
            : ''
        );
      };
      img.src = data.url;
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Image upload failed. Check the backend.');
    } finally {
      setUploading(false);
    }
  };

  const handleInsert = () => {
    if (!preview || !editor) return;

    editor
      .chain()
      .focus()
      .insertContent({
        type: 'image',
        attrs: {
          src: preview,
          alt: caption || 'Book image',
          caption: caption || null,
          class: isBleed ? 'full-bleed' : null,
        },
      })
      .run();

    handleClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-2xl w-full max-w-2xl p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-800 dark:text-zinc-100">
            🖼️ Insert Image
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-500 hover:text-gray-800 dark:hover:text-zinc-200 text-2xl"
          >
            &times;
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">
              Image File PNG / JPG / WebP
            </label>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleFileSelect}
              disabled={uploading}
              className="w-full border border-gray-300 dark:border-zinc-700 rounded p-2 text-sm bg-transparent"
            />
          </div>

          {uploading && (
            <p className="text-sm text-blue-600 dark:text-blue-400 text-center">
              Uploading…
            </p>
          )}

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400 text-center">
              {error}
            </p>
          )}

          {preview && (
            <div className="border border-gray-200 dark:border-zinc-700 rounded p-4 bg-gray-50 dark:bg-zinc-800">
              <img
                src={preview}
                alt="Preview"
                className="max-h-64 mx-auto object-contain"
              />
              {dpiWarning && (
                <p className="text-yellow-700 dark:text-yellow-400 text-sm mt-2 text-center">
                  {dpiWarning}
                </p>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">
              Caption optional
            </label>
            <input
              type="text"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Figure 1: Description…"
              className="w-full border border-gray-300 dark:border-zinc-700 rounded p-2 text-sm bg-transparent"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="bleed"
              checked={isBleed}
              onChange={(e) => setIsBleed(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="bleed" className="text-sm text-gray-700 dark:text-zinc-300">
              Full Bleed
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-md"
          >
            Cancel
          </button>
          <button
            onClick={handleInsert}
            disabled={!preview || uploading}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-300"
          >
            Insert Image
          </button>
        </div>
      </div>
    </div>
  );
};
```

---

# 11. Replace `ExportPage.tsx`

The current export page exposes DOCX export that is not implemented. For product readiness, remove unfinished UI and make PDF export reliable.

Replace:

```txt
modern-book-editor/src/components/ExportPage.tsx
```

With:

```tsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBookStore } from '../store/useBookStore';
import { apiUrl } from '../lib/api';
import { countWords } from '../utils/wordCounter';
import { ArrowLeft, Download } from 'lucide-react';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function inlineToMarkdown(node: any): string {
  if (!node) return '';

  if (node.type === 'text') {
    let text = node.text || '';

    if (node.marks) {
      for (const mark of node.marks) {
        if (mark.type === 'bold') text = `**${text}**`;
        else if (mark.type === 'italic') text = `*${text}*`;
        else if (mark.type === 'code') text = `\`${text}\``;
        else if (mark.type === 'strike') text = `~~${text}~~`;
      }
    }

    return text;
  }

  if (node.type === 'hardBreak') {
    return '  \n';
  }

  if (node.type === 'image') {
    const src = String(node.attrs?.src || '').replace(/"/g, '%22');
    const caption = String(node.attrs?.caption || node.attrs?.alt || '');
    const isFullBleed = String(node.attrs?.class || '').includes('full-bleed');
    const safeCaption = escapeHtml(caption);

    return `\n<div class="image-wrapper"><img src="${src}" alt="${safeCaption}"${
      isFullBleed ? ' class="full-bleed"' : ''
    } />${caption ? `<p class="image-caption">${safeCaption}</p>` : ''}</div>\n`;
  }

  return (node.content || []).map(inlineToMarkdown).join('');
}

function blockToMarkdown(node: any, depth = 0): string {
  if (!node) return '';

  switch (node.type) {
    case 'doc':
      return (node.content || []).map((child: any) =>
        blockToMarkdown(child, depth)
      ).join('');

    case 'paragraph':
      return `${inlineToMarkdown(node).trim()}\n\n`;

    case 'heading': {
      const level = node.attrs?.level || 1;
      return `${'#'.repeat(level)} ${inlineToMarkdown(node).trim()}\n\n`;
    }

    case 'bulletList':
      return (
        (node.content || [])
          .map((listItem: any) => {
            const content = blockToMarkdown(listItem, depth).trim();
            return `${'  '.repeat(depth)}- ${content}\n`;
          })
          .join('') + '\n'
      );

    case 'orderedList':
      return (
        (node.content || [])
          .map((listItem: any) => {
            const content = blockToMarkdown(listItem, depth).trim();
            return `${'  '.repeat(depth)}1. ${content}\n`;
          })
          .join('') + '\n'
      );

    case 'listItem':
      return (node.content || [])
        .map((child: any) => {
          if (child.type === 'paragraph') {
            return inlineToMarkdown(child);
          }
          if (child.type === 'bulletList' || child.type === 'orderedList') {
            return `\n${blockToMarkdown(child, depth + 1)}`;
          }
          return blockToMarkdown(child, depth);
        })
        .join('');

    case 'blockquote': {
      const inner = (node.content || [])
        .map((child: any) => blockToMarkdown(child, depth))
        .join('')
        .trim();

      return `${inner
        .split('\n')
        .map((line: string) => `> ${line}`)
        .join('\n')}\n\n`;
    }

    case 'codeBlock': {
      const code = (node.content || [])
        .map((child: any) => child.text || '')
        .join('');

      return `\`\`\`\n${code}\n\`\`\`\n\n`;
    }

    case 'horizontalRule':
      return `\n---\n\n`;

    default:
      return inlineToMarkdown(node);
  }
}

function jsonToMarkdown(json: any): string {
  if (!json) return '';
  return blockToMarkdown(json).replace(/\n{3,}/g, '\n\n').trim();
}

export const ExportPage: React.FC = () => {
  const navigate = useNavigate();
  const { chapters, bookTitle, author } = useBookStore();
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  const totalWords = chapters.reduce(
    (sum, chapter) => sum + countWords(chapter.content),
    0
  );

  const handleExportPDF = async () => {
    setError('');

    if (chapters.length === 0) {
      setError('Add at least one chapter before exporting.');
      return;
    }

    setExporting(true);

    try {
      const payload = {
        metadata: {
          title: bookTitle || 'My Book',
          author: author || 'Anonymous',
          trimSize: '6x9in',
        },
        chapters: chapters.map((chapter) => ({
          title: chapter.title,
          content: chapter.content ? jsonToMarkdown(chapter.content) : '',
        })),
      };

      const response = await fetch(apiUrl('/api/generate-pdf'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || err.details || 'PDF export failed');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `${(bookTitle || 'manuscript').replace(/[^\w\- ]+/g, '').trim() || 'manuscript'}.pdf`;
      a.click();

      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-8 overflow-y-auto">
      <div className="max-w-3xl mx-auto">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 mb-6"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </button>

        <h1 className="text-3xl font-bold font-serif text-zinc-900 dark:text-zinc-100 mb-8">
          Export Manuscript
        </h1>

        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 space-y-6">
          <div>
            <h2 className="font-semibold text-zinc-800 dark:text-zinc-200 mb-2">
              Summary
            </h2>
            <p className="text-sm text-zinc-500">
              {chapters.length} chapters &middot; {totalWords.toLocaleString()} words
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-zinc-800 dark:text-zinc-200 mb-2">
              Print PDF
            </h2>
            <p className="text-sm text-zinc-500">
              Generates a 6×9 print-ready PDF using the Python WeasyPrint
              typesetting engine.
            </p>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          <button
            onClick={handleExportPDF}
            disabled={exporting || chapters.length === 0}
            className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-blue-300 flex items-center justify-center gap-2"
          >
            {exporting ? (
              <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            {exporting ? 'Exporting...' : 'Export Print PDF'}
          </button>
        </div>
      </div>
    </div>
  );
};
```

---

# 12. Harden and fix the backend

Replace:

```txt
server/index.ts
```

With this production-oriented version:

```ts
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { spawn } from 'child_process';
import { OpenAI } from 'openai';
import dotenv from 'dotenv';
import mammoth from 'mammoth';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();

const PORT = parseInt(process.env.PORT || '3001', 10);
const MODEL = process.env.MODEL || 'deepseek-chat';
const CHUNK_SIZE = Math.max(
  1000,
  parseInt(process.env.AI_CHUNK_SIZE || '8000', 10)
);
const AI_MAX_TOKENS = parseInt(process.env.AI_MAX_TOKENS || '4096', 10);
const PUBLIC_SERVER_URL =
  process.env.PUBLIC_SERVER_URL || `http://localhost:${PORT}`;

if (process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', 1);
}

const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim());

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

app.use(
  cors({
    origin: allowedOrigins,
  })
);

app.use(express.json({ limit: '20mb' }));

// ---------------------------------------------------------------------------
// Uploads
// ---------------------------------------------------------------------------

const uploadDir = path.resolve(
  process.env.UPLOAD_DIR || path.join(__dirname, '..', 'public', 'uploads')
);

fs.mkdirSync(uploadDir, { recursive: true });

app.use(
  '/uploads',
  express.static(uploadDir, {
    maxAge: '7d',
    immutable: true,
  })
);

const imageFileFilter = (_req: any, file: any, cb: any) => {
  if (/^image\/(jpeg|png|webp)$/.test(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPEG, PNG, and WebP images are allowed'));
  }
};

const docFileFilter = (_req: any, file: any, cb: any) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (['.docx', '.txt', '.md', '.markdown'].includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Only .docx, .txt, and .md files are supported'));
  }
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: imageFileFilter,
});

const docUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: docFileFilter,
});

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

const limiterBase = {
  windowMs: 15 * 60 * 1000,
  standardHeaders: true,
  legacyHeaders: false,
};

const aiLimiter = rateLimit({
  ...limiterBase,
  max: 20,
  message: { error: 'Too many AI requests. Please try again later.' },
});

const pdfLimiter = rateLimit({
  ...limiterBase,
  max: 10,
  message: { error: 'Too many PDF requests. Please try again later.' },
});

// ---------------------------------------------------------------------------
// DeepSeek / OpenAI-compatible client
// ---------------------------------------------------------------------------

function getOpenAI(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  return new OpenAI({
    baseURL: process.env.OPENAI_BASE_URL || 'https://api.deepseek.com',
    apiKey,
  });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function callModel(messages: any[]) {
  const client = getOpenAI();
  let lastError: any;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const params: any = {
        model: MODEL,
        messages,
        temperature: 0.2,
        max_tokens: AI_MAX_TOKENS,
      };

      if (MODEL.includes('chat')) {
        params.response_format = { type: 'json_object' };
      }

      return await client.chat.completions.create(params);
    } catch (err: any) {
      lastError = err;

      const status = err?.status || err?.response?.status;

      // Do not retry obvious client errors except rate limits.
      if (status && status >= 400 && status < 500 && status !== 429) {
        throw err;
      }

      await sleep(1000 * (attempt + 1));
    }
  }

  throw lastError;
}

// ---------------------------------------------------------------------------
// AI formatting helpers
// ---------------------------------------------------------------------------

const AI_SYSTEM_PROMPT = `
You are an expert book editor. Convert raw text into a structured Markdown manuscript.

Rules:
1. Preserve meaning and sequence. Do not summarize unless the input is obviously notes.
2. Only create a new chapter when there is an explicit chapter heading, part heading, or very clear section break.
3. If this chunk continues the previous chapter, return the same chapter title and continue the content.
4. Use Markdown for bold, italics, lists, blockquotes, and headings inside chapters.
5. Return ONLY valid JSON. No Markdown fences. No comments.

JSON shape:
{
  "metadata": { "title": "Book Title", "author": "Author" },
  "chapters": [
    { "title": "Chapter 1: Title", "content": "Markdown body..." }
  ]
}
`.trim();

function parseLenientJSON(input: string): any {
  let text = input.trim();

  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');

  try {
    return JSON.parse(text);
  } catch {}

  const start = text.indexOf('{');
  if (start === -1) {
    throw new Error('No JSON object found');
  }

  let slice = text.slice(start);
  const end = slice.lastIndexOf('}');

  if (end !== -1) {
    slice = slice.slice(0, end + 1);
  }

  try {
    return JSON.parse(slice);
  } catch {}

  let out = slice;
  let inString = false;
  let escaped = false;
  const stack: string[] = [];

  for (const ch of out) {
    if (escaped) {
      escaped = false;
      continue;
    }

    if (ch === '\\') {
      escaped = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === '{' || ch === '[') {
      stack.push(ch);
    }

    if (ch === '}' || ch === ']') {
      stack.pop();
    }
  }

  if (inString) {
    out += '"';
  }

  out = out.replace(/,\s*$/, '');

  while (stack.length) {
    const open = stack.pop();
    out += open === '{' ? '}' : ']';
  }

  out = out.replace(/,\s*([}\]])/g, '$1');

  return JSON.parse(out);
}

const ChapterSchema = z.object({
  title: z.string().min(1).max(400),
  content: z.string(),
});

const AiResponseSchema = z.object({
  metadata: z
    .object({
      title: z.string().min(1).max(400),
      author: z.string().max(300).optional(),
    })
    .optional(),
  chapters: z.array(ChapterSchema).default([]),
});

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, ' ');
}

function mergeChapters(
  target: Array<{ title: string; content: string }>,
  incoming: Array<{ title: string; content: string }>
) {
  for (const chapter of incoming) {
    const last = target[target.length - 1];

    if (last && normalizeTitle(last.title) === normalizeTitle(chapter.title)) {
      last.content = `${last.content}\n\n${chapter.content}`.trim();
    } else {
      target.push(chapter);
    }
  }
}

function chunkText(text: string): string[] {
  if (text.length <= CHUNK_SIZE) return [text];

  const paragraphs = text.split(/\r?\n+/u);
  const chunks: string[] = [];
  let current = '';

  for (const paragraph of paragraphs) {
    if (paragraph.length > CHUNK_SIZE) {
      if (current) {
        chunks.push(current);
        current = '';
      }

      for (let i = 0; i < paragraph.length; i += CHUNK_SIZE) {
        chunks.push(paragraph.slice(i, i + CHUNK_SIZE));
      }

      continue;
    }

    const candidate = current ? `${current}\n${paragraph}` : paragraph;

    if (candidate.length > CHUNK_SIZE) {
      chunks.push(current);
      current = paragraph;
    } else {
      current = candidate;
    }
  }

  if (current) chunks.push(current);

  return chunks;
}

async function formatChunk(
  chunk: string,
  index: number,
  total: number,
  previousTitle?: string
) {
  const userPrompt = `
Chunk ${index + 1} of ${total}.
${
  previousTitle
    ? `Previous chapter title: "${previousTitle}". If this chunk continues that chapter, use the same title.`
    : 'This is the first chunk.'
}

Format this text:

${chunk}
`.trim();

  const messages = [
    { role: 'system', content: AI_SYSTEM_PROMPT },
    { role: 'user', content: userPrompt },
  ];

  const completion = await callModel(messages);
  const raw = completion.choices[0]?.message?.content || '{}';

  try {
    const parsed = parseLenientJSON(raw);
    return AiResponseSchema.parse(parsed);
  } catch (firstError) {
    const retryMessages = [
      ...messages,
      {
        role: 'user',
        content:
          'Your previous response could not be parsed as valid JSON. Return ONLY a valid JSON object matching the required schema. No Markdown fences.',
      },
    ];

    const retryCompletion = await callModel(retryMessages);
    const retryRaw = retryCompletion.choices[0]?.message?.content || '{}';
    const parsed = parseLenientJSON(retryRaw);
    return AiResponseSchema.parse(parsed);
  }
}

// ---------------------------------------------------------------------------
// API: Health
// ---------------------------------------------------------------------------

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    ok: true,
    model: MODEL,
    pdfEngine: 'weasyprint',
    hasApiKey: Boolean(process.env.OPENAI_API_KEY),
  });
});

// ---------------------------------------------------------------------------
// API: Parse document
// ---------------------------------------------------------------------------

app.post(
  '/api/parse-docx',
  docUpload.single('document'),
  async (req: Request & { file?: any }, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const ext = path.extname(req.file.originalname).toLowerCase();
      let text = '';

      if (ext === '.docx') {
        const result = await mammoth.extractRawText({
          buffer: req.file.buffer,
        });
        text = result.value;
      } else {
        text = req.file.buffer.toString('utf8');
      }

      text = text.replace(/\r\n/g, '\n').trim();

      const title =
        path
          .basename(req.file.originalname, path.extname(req.file.originalname))
          .replace(/[_-]+/g, ' ')
          .trim() || 'Untitled Document';

      if (text.length < 100) {
        return res.status(422).json({
          error: 'Document is too short. Please provide at least 100 characters.',
        });
      }

      res.json({ text, title });
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// API: Upload image
// ---------------------------------------------------------------------------

app.post(
  '/api/upload-image',
  upload.single('image'),
  (req: Request & { file?: any }, res: Response) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    res.json({
      url: `${PUBLIC_SERVER_URL}/uploads/${req.file.filename}`,
    });
  }
);

// ---------------------------------------------------------------------------
// API: AI format book
// ---------------------------------------------------------------------------

app.post('/api/format-book', aiLimiter, async (req: Request, res: Response) => {
  const rawText =
    typeof req.body?.rawText === 'string' ? req.body.rawText.trim() : '';

  if (!rawText || rawText.length < 100) {
    return res.status(400).json({
      error: 'Text too short. Please provide at least 100 characters.',
    });
  }

  if (rawText.length > 2_000_000) {
    return res.status(413).json({
      error: 'Text too large. Maximum size is 2,000,000 characters.',
    });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({
      error: 'OPENAI_API_KEY is not configured on the server.',
    });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  let closed = false;

  req.on('close', () => {
    closed = true;
  });

  const heartbeat = setInterval(() => {
    if (!closed && !res.writableEnded) {
      res.write(': ping\n\n');
    }
  }, 15000);

  const send = (event: string, data: any) => {
    if (closed || res.writableEnded) return;
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const chunks = chunkText(rawText);

    send('meta', { total: chunks.length });

    let bookData: {
      metadata: { title: string; author?: string };
      chapters: Array<{ title: string; content: string }>;
    } | null = null;

    for (let i = 0; i < chunks.length; i++) {
      if (closed) break;

      send('progress', {
        current: i + 1,
        total: chunks.length,
        chaptersSoFar: bookData?.chapters?.length ?? 0,
      });

      const previousTitle =
        bookData?.chapters?.[bookData.chapters.length - 1]?.title;

      const parsed = await formatChunk(chunks[i], i, chunks.length, previousTitle);

      if (i === 0) {
        bookData = {
          metadata: parsed.metadata ?? {
            title: 'Untitled',
            author: 'Unknown',
          },
          chapters: parsed.chapters,
        };
      } else if (bookData) {
        mergeChapters(bookData.chapters, parsed.chapters);
      }

      send('progress', {
        current: i + 1,
        total: chunks.length,
        chaptersSoFar: bookData?.chapters?.length ?? 0,
      });
    }

    if (!closed && !res.writableEnded) {
      if (!bookData || bookData.chapters.length === 0) {
        send('error', {
          error: 'AI did not return any chapters. Please try again.',
        });
      } else {
        send('complete', bookData);
      }

      res.end();
    }
  } catch (error: any) {
    console.error('AI format error:', error);

    if (!closed && !res.writableEnded) {
      send('error', {
        error: error?.message || 'AI formatting failed',
      });
      res.end();
    }
  } finally {
    clearInterval(heartbeat);
  }
});

// ---------------------------------------------------------------------------
// API: Generate PDF via Python WeasyPrint
// ---------------------------------------------------------------------------

const PdfChapterSchema = z.object({
  title: z.string().min(1).max(400),
  content: z.string(),
});

const PdfPayloadSchema = z.object({
  metadata: z
    .object({
      title: z.string().min(1).max(400),
      author: z.string().max(300).optional(),
      trimSize: z.string().max(100).optional(),
    })
    .passthrough(),
  chapters: z.array(PdfChapterSchema).min(1),
});

function safeFilename(title: string): string {
  return (
    title
      .replace(/[^\w\- ]+/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 80) || 'book'
  );
}

app.post('/api/generate-pdf', pdfLimiter, async (req: Request, res: Response) => {
  const parsed = PdfPayloadSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid PDF payload',
      details: parsed.error.issues,
    });
  }

  const typesetPath = path.resolve(
    path.join(__dirname, '..', 'typesetting', 'typeset.py')
  );

  if (!fs.existsSync(typesetPath)) {
    return res.status(500).json({
      error: 'Typesetting script not found',
      details: `Expected at ${typesetPath}`,
    });
  }

  const pythonCmd =
    process.env.PYTHON_CMD ||
    (process.platform === 'win32' ? 'python' : 'python3');

  const uploadsFileBase = pathToFileURL(uploadDir + path.sep).toString();

  const payload = {
    ...parsed.data,
    chapters: parsed.data.chapters.map((chapter) => ({
      ...chapter,
      content: chapter.content.replace(
        /https?:\/\/[^/]+\/uploads\//gi,
        uploadsFileBase
      ),
    })),
  };

  const child = spawn(pythonCmd, [typesetPath], {
    env: process.env,
  });

  let stderr = '';
  let responded = false;

  child.stderr.on('data', (data) => {
    stderr += data.toString();
  });

  child.stdout.on('data', (chunk) => {
    if (!responded) {
      responded = true;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${safeFilename(payload.metadata.title)}.pdf"`
      );
      res.status(200);
    }

    res.write(chunk);
  });

  child.on('error', (err) => {
    console.error('PDF engine error:', err);

    if (!responded) {
      res.status(500).json({
        error: 'Failed to start PDF engine',
        details:
          'Make sure Python 3.9+, WeasyPrint, and markdown are installed. ' +
          err.message,
      });
    } else {
      res.end();
    }
  });

  child.on('close', (code) => {
    if (code === 0) {
      if (!responded) {
        res.status(500).json({
          error: 'PDF engine produced no output',
        });
      } else {
        res.end();
      }
      return;
    }

    console.error('PDF generation failed:', stderr);

    if (!responded) {
      res.status(500).json({
        error: 'PDF generation failed',
        details: stderr.slice(-4000),
      });
    } else {
      res.end();
    }
  });

  child.stdin.write(JSON.stringify(payload));
  child.stdin.end();
});

// ---------------------------------------------------------------------------
// 404 + error handling
// ---------------------------------------------------------------------------

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

app.use(
  (
    err: any,
    _req: Request,
    res: Response,
    _next: NextFunction
  ) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({
        error: 'Upload error',
        details: err.message,
      });
    }

    console.error(err);

    res.status(err?.status || 500).json({
      error: err?.message || 'Internal server error',
    });
  }
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log(`📁 Upload directory: ${uploadDir}`);

  if (!process.env.OPENAI_API_KEY) {
    console.warn('⚠️ OPENAI_API_KEY is missing. AI formatting will fail.');
  }
});
```

---

# 13. Install new backend dependencies

In the `server` folder:

```bash
npm install helmet express-rate-limit
```

Full backend install:

```bash
cd server
npm install
npm install helmet express-rate-limit
```

---

# 14. Update `server/.env.example`

Replace:

```txt
server/.env.example
```

With:

```env
# DeepSeek / OpenAI-compatible API
OPENAI_API_KEY=
OPENAI_BASE_URL=https://api.deepseek.com
MODEL=deepseek-chat

# Server
PORT=3001
PUBLIC_SERVER_URL=http://localhost:3001

# CORS
ALLOWED_ORIGINS=http://localhost:5173

# AI chunking
AI_CHUNK_SIZE=8000
AI_MAX_TOKENS=4096

# Python PDF engine
PYTHON_CMD=

# Optional custom upload directory
UPLOAD_DIR=

# Set true if running behind a reverse proxy
TRUST_PROXY=false
```

Copy it:

```bash
cp .env.example .env
```

Then edit `.env` and set:

```env
OPENAI_API_KEY=your-deepseek-key
```

---

# 15. Improve Python typesetting script

Replace:

```txt
typesetting/typeset.py
```

With:

```python
#!/usr/bin/env python3
"""typesetting/typeset.py — Python typesetting engine."""

import sys
import json
import re
import html
from pathlib import Path
from io import BytesIO

try:
    import markdown
    from weasyprint import HTML
except ImportError as exc:
    sys.stderr.write(
        f"Missing Python dependency: {exc}\n"
        "Run: pip install weasyprint markdown\n"
    )
    sys.exit(1)


SCRIPT_DIR = Path(__file__).resolve().parent
CSS_PATH = SCRIPT_DIR / "book.css"


def slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[-\s]+", "-", text)
    return text[:80]


def strip_duplicate_title(content: str, title: str) -> str:
    lines = content.splitlines()

    if not lines:
        return content

    first_line = lines[0].strip()

    if first_line.startswith("# "):
        first_title = first_line[2:].strip().lower()
        if first_title == title.strip().lower():
            return "\n".join(lines[1:]).strip()

    return content


def generate_pdf(json_data: dict) -> None:
    metadata = json_data.get("metadata", {})
    chapters = json_data.get("chapters", [])

    if not chapters:
        raise ValueError("No chapters provided")

    title = html.escape(metadata.get("title", "Untitled"))
    author = html.escape(metadata.get("author", "Anonymous"))

    html_body = f"""
<section class="frontmatter" id="titlepage">
  <div style="text-align: center; margin-top: 4in; page-break-before: right;">
    <h1 style="font-size: 32pt; border: none; margin: 0; page-break-before: auto;">{title}</h1>
    <p style="font-size: 16pt; margin-top: 1in; text-indent: 0;">{author}</p>
  </div>
</section>
"""

    toc_items = ""

    for index, chapter in enumerate(chapters):
        chapter_title = html.escape(chapter.get("title", f"Chapter {index + 1}"))
        chapter_id = slugify(chapter_title)

        toc_items += f"""
<li>
  <a href="#{chapter_id}">
    <span class="toc-title">{chapter_title}</span>
    <span class="toc-dots"></span>
  </a>
</li>
"""

    html_body += f"""
<nav id="toc" class="frontmatter">
  <h1 style="page-break-before: right; margin-top: 2in; text-align: center;">Contents</h1>
  <ul style="list-style: none; padding: 0; margin-top: 1in;">
    {toc_items}
  </ul>
</nav>
"""

    html_body += '<section class="bodymatter">'

    for index, chapter in enumerate(chapters):
        chapter_title_raw = chapter.get("title", f"Chapter {index + 1}")
        chapter_title = html.escape(chapter_title_raw)
        chapter_id = slugify(chapter_title_raw)

        content_md = chapter.get("content", "")
        content_md = strip_duplicate_title(content_md, chapter_title_raw)

        content_html = markdown.markdown(
            content_md,
            extensions=[
                "tables",
                "fenced_code",
                "md_in_html",
                "sane_lists",
                "attr_list",
            ],
        )

        html_body += f"""
<h1 id="{chapter_id}" class="chapter-title">{chapter_title}</h1>
{content_html}
"""

    html_body += "</section>"

    css_content = ""

    if CSS_PATH.exists():
        with open(CSS_PATH, "r", encoding="utf-8") as css_file:
            css_content = css_file.read()
    else:
        sys.stderr.write(f"Warning: CSS file not found at {CSS_PATH}\n")

    toc_css = """
#toc a[href]::after {
  content: target-counter(attr(href url), page);
  margin-left: auto;
  padding-left: 0.3em;
}

#toc a {
  display: flex;
  align-items: baseline;
  text-decoration: none;
  color: #000;
}

#toc a .toc-dots {
  border-bottom: 1px dotted #555;
  flex: 1 1 auto;
  margin: 0 0.3em;
  min-width: 1em;
  position: relative;
  top: -2pt;
}
"""

    full_html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<style>
{css_content}
{toc_css}
</style>
</head>
<body>
{html_body}
</body>
</html>
"""

    buffer = BytesIO()

    HTML(string=full_html, base_url=str(SCRIPT_DIR)).write_pdf(
        buffer,
        presentational_hints=True,
    )

    sys.stdout.buffer.write(buffer.getvalue())


if __name__ == "__main__":
    try:
        raw = sys.stdin.read()
        data = json.loads(raw)
        generate_pdf(data)
    except Exception as exc:
        sys.stderr.write(f"Typesetting failed: {exc}\n")
        sys.exit(1)
```

---

# 16. Add small CSS improvements

Append to:

```txt
typesetting/book.css
```

```css
figure {
  margin: 2em 0;
  text-align: center;
  page-break-inside: avoid;
}

figcaption,
.image-caption {
  font-size: 9pt;
  font-style: italic;
  color: #444;
  text-align: center;
  margin-top: 0.5em;
  page-break-inside: avoid;
}
```

---

# 17. Fix frontend batch file

Replace:

```txt
modern-book-editor/install.bat
```

With:

```bat
@echo off
cd /d "%~dp0"
npm install
pause
```

---

# 18. Add root `.gitignore`

Create or update:

```txt
.gitignore
```

With:

```gitignore
node_modules/
dist/
build/
.env
.env.local
*.log

public/uploads/*
!public/uploads/.gitkeep

.DS_Store
```

Create the uploads placeholder:

```bash
mkdir -p public/uploads
touch public/uploads/.gitkeep
```

On Windows PowerShell:

```powershell
New-Item -ItemType Directory -Force -Path public\uploads
New-Item -ItemType File -Force -Path public\uploads\.gitkeep
```

---

# 19. Install Python dependencies

The PDF engine requires Python and WeasyPrint.

```bash
python3 -m pip install --upgrade weasyprint markdown
```

On Windows, WeasyPrint is often easiest through WSL or Docker. If using Windows native Python, you may need GTK/MSYS2 dependencies.

---

# 20. Run the app

Terminal 1 — backend:

```bash
cd server
cp .env.example .env
# edit .env and set OPENAI_API_KEY
npm install
npm run dev
```

Terminal 2 — frontend:

```bash
cd modern-book-editor
cp .env.example .env
npm install
npm run dev
```

Then open:

```txt
http://localhost:5173
```

Backend health check:

```txt
http://localhost:3001/api/health
```

Expected JSON:

```json
{
  "ok": true,
  "model": "deepseek-chat",
  "pdfEngine": "weasyprint",
  "hasApiKey": true
}
```

---

# 21. Product readiness checklist

The patches above make the app much more stable, but for a real production deployment you should also add:

## Authentication and multi-tenancy

Right now the app is local-first and single-user. For production:

- Add user authentication.
- Associate manuscripts with users.
- Prevent cross-user access to manuscripts and uploads.
- Replace `userId: 'local-user'` with real user IDs.

## Storage

For production, do not rely only on browser IndexedDB.

- Persist manuscripts in Postgres, SQLite, MongoDB, or another server database.
- Store uploaded images in S3, R2, Azure Blob, or a managed file service.
- Add backup and restore.

## Security

Already improved with:

- CORS allowlist.
- Helmet.
- Rate limiting.
- File type validation.
- Payload validation.

Still recommended:

- Add request logging.
- Add abuse monitoring.
- Sanitize AI output before rendering if you allow arbitrary HTML.
- Add CSRF protection if you move to cookie auth.
- Add secret management via environment or vault.
- Do not expose server logs with raw API keys.

## Reliability

- Add queue for AI formatting jobs.
- Add queue for PDF generation.
- Add retries with exponential backoff.
- Add timeout for AI and PDF jobs.
- Add health checks for Python PDF engine.
- Add Sentry or similar error tracking.

## Testing

Recommended:

- Unit tests for TipTap JSON to Markdown conversion.
- API tests for `/api/format-book`, `/api/parse-docx`, `/api/generate-pdf`.
- End-to-end tests with Playwright:
  - Create manuscript.
  - Add chapter.
  - Import AI text.
  - Export PDF.
  - Upload image.

## Deployment

Recommended production topology:

```txt
Frontend: Vite build served by CDN/Nginx/Vercel/Netlify
Backend: Node.js service behind Nginx/Fly.io/Render/Railway/Docker
PDF engine: Python WeasyPrint worker or sidecar
Database: Postgres
File storage: S3-compatible storage
```

For Docker, the Python PDF dependencies should be baked into the backend image or a separate worker image.

---

# 22. What should work after these changes

After applying the patches:

- Frontend compiles because `Sidebar.tsx` is no longer binary.
- Dark mode works with Tailwind class strategy.
- Dashboard AI button creates a manuscript and opens AI modal.
- AI modal supports:
  - `.docx`
  - `.txt`
  - `.md`
  - pasted raw text
- AI SSE progress works more reliably.
- Server returns proper AI errors instead of hanging.
- Autosave no longer uses stale state.
- Image upload creates the upload directory automatically.
- Images insert with caption and full-bleed class.
- Export page no longer shows fake DOCX export.
- PDF export uses the actual WeasyPrint typesetting pipeline.
- Backend has:
  - validation
  - rate limits
  - security headers
  - graceful errors
  - configurable CORS
  - configurable API base URL

---

 I can help generate the updated codebase, but first an important security note:

> **Do not use the DeepSeek key you pasted here.**  
> You shared it in a chat, so it should be considered compromised.  
> **Rotate/revoke it immediately** in your DeepSeek dashboard and create a new key.

For security, I will **not hard-code the API key** into the source files. The correct production-ready approach is:

```env
OPENAI_API_KEY=your-new-rotated-deepseek-key
```

Below is a **full updated commercial-grade codebase scaffold** based on your existing Mashimi / Modern Book Editor project.

This includes:

1. User accounts
2. PostgreSQL persistence
3. Cloud/S3 file storage
4. Background job queue
5. Automated tests
6. Docker deployment
7. Font embedding support
8. PDF/X conversion script support
9. Real DOCX export
10. Admin monitoring and usage limits

---

# 1. Root Files

## `.gitignore`

```gitignore
node_modules/
dist/
build/
coverage/

.env
.env.local
.env.production

*.log
.DS_Store

public/uploads/*
!public/uploads/.gitkeep

postgres_data/
redis_data/
minio_data/

typesetting/fonts/*.ttf
!typesetting/fonts/.gitkeep
```

---

## `.env.example`

Create this in the repository root.

```env
# DeepSeek / OpenAI-compatible API key
# PASTE YOUR NEW ROTATED KEY HERE, NOT IN SOURCE CODE
OPENAI_API_KEY=
MODEL=deepseek-chat

# Auth secrets
JWT_ACCESS_SECRET=change-me-access-secret
JWT_REFRESH_SECRET=change-me-refresh-secret

# Admin seed
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=ChangeMe123!

# S3 / MinIO
S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
S3_BUCKET=mashimi-assets
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_PUBLIC_URL=http://localhost:9000/mashimi-assets
S3_FORCE_PATH_STYLE=true
```

Copy it:

```bash
cp .env.example .env
```

Then edit `.env` and add your **new rotated DeepSeek key**.

---

## `docker-compose.yml`

```yaml
version: '3.9'

services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: mashimi
      POSTGRES_PASSWORD: mashimi
      POSTGRES_DB: mashimi
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - '5432:5432'
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U mashimi']
      interval: 5s
      timeout: 5s
      retries: 10

  redis:
    image: redis:7
    ports:
      - '6379:6379'
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 5s
      timeout: 5s
      retries: 10

  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    volumes:
      - minio_data:/data
    ports:
      - '9000:9000'
      - '9001:9001'

  createbuckets:
    image: minio/mc
    depends_on:
      - minio
    entrypoint: >
      /bin/sh -c "
      sleep 5;
      /usr/bin/mc alias set local http://minio:9000 minioadmin minioadmin;
      /usr/bin/mc mb --ignore-existing local/mashimi-assets;
      /usr/bin/mc anonymous set download local/mashimi-assets;
      exit 0;
      "

  api:
    build:
      context: .
      dockerfile: server/Dockerfile
    command: npm run start
    environment:
      DATABASE_URL: postgresql://mashimi:mashimi@postgres:5432/mashimi?schema=public
      REDIS_URL: redis://redis:6379
      PORT: 3001
      NODE_ENV: production
      PUBLIC_SERVER_URL: http://localhost:3001
      COOKIE_DOMAIN: localhost
      ALLOWED_ORIGINS: http://localhost:5173,http://localhost

      OPENAI_API_KEY: ${OPENAI_API_KEY}
      MODEL: ${MODEL:-deepseek-chat}

      JWT_ACCESS_SECRET: ${JWT_ACCESS_SECRET}
      JWT_REFRESH_SECRET: ${JWT_REFRESH_SECRET}

      S3_ENDPOINT: http://minio:9000
      S3_REGION: ${S3_REGION:-us-east-1}
      S3_BUCKET: ${S3_BUCKET:-mashimi-assets}
      S3_ACCESS_KEY: ${S3_ACCESS_KEY:-minioadmin}
      S3_SECRET_KEY: ${S3_SECRET_KEY:-minioadmin}
      S3_PUBLIC_URL: ${S3_PUBLIC_URL:-http://localhost:9000/mashimi-assets}
      S3_FORCE_PATH_STYLE: 'true'

      PYTHON_CMD: python3
      TYPESET_SCRIPT_PATH: /app/typesetting/typeset.py
      PANDOC_CMD: pandoc

      PDFX_ENABLED: 'false'
      PDFX_PROFILE_PATH: /usr/share/color/icc/ISOcoated_v2_300_bas.icc
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      createbuckets:
        condition: service_completed_successfully
    ports:
      - '3001:3001'

  worker:
    build:
      context: .
      dockerfile: server/Dockerfile
    command: npm run worker
    environment:
      DATABASE_URL: postgresql://mashimi:mashimi@postgres:5432/mashimi?schema=public
      REDIS_URL: redis://redis:6379
      NODE_ENV: production

      OPENAI_API_KEY: ${OPENAI_API_KEY}
      MODEL: ${MODEL:-deepseek-chat}

      S3_ENDPOINT: http://minio:9000
      S3_REGION: ${S3_REGION:-us-east-1}
      S3_BUCKET: ${S3_BUCKET:-mashimi-assets}
      S3_ACCESS_KEY: ${S3_ACCESS_KEY:-minioadmin}
      S3_SECRET_KEY: ${S3_SECRET_KEY:-minioadmin}
      S3_PUBLIC_URL: ${S3_PUBLIC_URL:-http://localhost:9000/mashimi-assets}
      S3_FORCE_PATH_STYLE: 'true'

      PYTHON_CMD: python3
      TYPESET_SCRIPT_PATH: /app/typesetting/typeset.py
      PANDOC_CMD: pandoc

      PDFX_ENABLED: 'false'
      PDFX_PROFILE_PATH: /usr/share/color/icc/ISOcoated_v2_300_bas.icc
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      createbuckets:
        condition: service_completed_successfully

  web:
    build:
      context: .
      dockerfile: modern-book-editor/Dockerfile
    depends_on:
      - api
    ports:
      - '80:80'

volumes:
  postgres_data:
  minio_data:
```

---

# 2. Backend

Replace/create the following files inside `server/`.

---

## `server/package.json`

```json
{
  "name": "mashimi-server",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "worker:dev": "tsx watch src/worker.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/src/server.js",
    "worker": "node dist/src/worker.js",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev",
    "prisma:deploy": "prisma migrate deploy",
    "seed:admin": "tsx scripts/seed_admin.ts",
    "test": "vitest run"
  },
  "dependencies": {
    "@aws-sdk/client-s3": "^3.600.0",
    "@aws-sdk/s3-request-presigner": "^3.600.0",
    "@prisma/client": "^5.16.0",
    "bcryptjs": "^2.4.3",
    "bullmq": "^5.8.0",
    "cookie-parser": "^1.4.6",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "express-rate-limit": "^7.3.1",
    "helmet": "^7.1.0",
    "ioredis": "^5.4.1",
    "jsonwebtoken": "^9.0.2",
    "mammoth": "^1.7.0",
    "multer": "^1.4.5-lts.1",
    "openai": "^4.47.1",
    "prom-client": "^15.1.2",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/bcryptjs": "^2.4.6",
    "@types/cookie-parser": "^1.4.7",
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/jsonwebtoken": "^9.0.6",
    "@types/multer": "^1.4.11",
    "@types/node": "^20.14.2",
    "@types/supertest": "^6.0.2",
    "prisma": "^5.16.0",
    "supertest": "^7.0.0",
    "tsx": "^4.11.0",
    "typescript": "^5.4.5",
    "vitest": "^1.6.0"
  }
}
```

---

## `server/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*.ts", "scripts/**/*.ts", "test/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

---

## `server/.env.example`

```env
DATABASE_URL=postgresql://mashimi:mashimi@localhost:5432/mashimi?schema=public
REDIS_URL=redis://localhost:6379

PORT=3001
NODE_ENV=development
PUBLIC_SERVER_URL=http://localhost:3001
COOKIE_DOMAIN=localhost

ALLOWED_ORIGINS=http://localhost:5173

JWT_ACCESS_SECRET=change-me-access-secret
JWT_REFRESH_SECRET=change-me-refresh-secret
ACCESS_TOKEN_TTL=15m
REFRESH_TOKEN_TTL_DAYS=30

OPENAI_API_KEY=
OPENAI_BASE_URL=https://api.deepseek.com
MODEL=deepseek-chat
AI_CHUNK_SIZE=8000
AI_MAX_TOKENS=4096

S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
S3_BUCKET=mashimi-assets
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_PUBLIC_URL=http://localhost:9000/mashimi-assets
S3_FORCE_PATH_STYLE=true

PYTHON_CMD=python3
TYPESET_SCRIPT_PATH=../typesetting/typeset.py
PANDOC_CMD=pandoc

PDFX_ENABLED=false
PDFX_PROFILE_PATH=/usr/share/color/icc/ISOcoated_v2_300_bas.icc

ADMIN_EMAIL=admin@example.com
```

Copy:

```bash
cd server
cp .env.example .env
```

Then put your **new rotated DeepSeek key** in:

```env
OPENAI_API_KEY=
```

---

## `server/prisma/schema.prisma`

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role {
  USER
  ADMIN
}

enum JobType {
  FORMAT
  PDF
  DOCX
}

enum JobStatus {
  PENDING
  RUNNING
  COMPLETED
  FAILED
  CANCELED
}

enum UsageType {
  AI_CHARS
  PDF_EXPORT
  DOCX_EXPORT
  IMAGE_UPLOAD
}

model User {
  id                 String         @id @default(cuid())
  email              String         @unique
  passwordHash       String
  role               Role           @default(USER)
  isActive           Boolean        @default(true)

  aiCharsPerDay      Int            @default(500000)
  pdfExportsPerDay   Int            @default(10)
  docxExportsPerDay  Int            @default(10)
  imageUploadsPerDay Int            @default(50)

  createdAt          DateTime       @default(now())
  updatedAt          DateTime       @updatedAt

  refreshTokens      RefreshToken[]
  manuscripts        Manuscript[]
  assets             Asset[]
  jobs               Job[]
  usageEvents        UsageEvent[]

  @@index([email])
}

model RefreshToken {
  id        String    @id @default(cuid())
  tokenHash String    @unique
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  userId    String
  expiresAt DateTime
  revokedAt DateTime?
  createdAt DateTime  @default(now())

  @@index([userId])
}

model Manuscript {
  id         String    @id @default(cuid())
  user       User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  userId     String

  title      String    @default("Untitled Book")
  author     String    @default("")
  theme      String    @default("light")
  fontFamily String    @default("serif")
  fontSize   String    @default("lg")
  trimSize   String    @default("6x9in")

  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt

  chapters   Chapter[]

  @@index([userId, updatedAt])
}

model Chapter {
  id           String     @id @default(cuid())
  manuscript   Manuscript @relation(fields: [manuscriptId], references: [id], onDelete: Cascade)
  manuscriptId String

  position     Int
  title        String
  content      Json?
  markdown     String?

  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt

  @@index([manuscriptId, position])
}

model Asset {
  id          String   @id @default(cuid())
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  userId      String

  bucket      String
  key         String
  contentType String
  size        Int
  width       Int?
  height      Int?
  caption     String?
  publicUrl   String?

  createdAt   DateTime @default(now())

  @@index([userId])
  @@index([key])
}

model Job {
  id           String       @id @default(cuid())
  user         User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  userId       String

  type         JobType
  status       JobStatus    @default(PENDING)
  progress     Int          @default(0)
  progressMeta Json?

  input        Json
  result       Json?
  error        String?

  createdAt    DateTime     @default(now())
  updatedAt    DateTime     @updatedAt

  usageEvents  UsageEvent[]

  @@index([userId, createdAt])
  @@index([status])
}

model UsageEvent {
  id        String     @id @default(cuid())
  user      User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  userId    String

  job       Job?       @relation(fields: [jobId], references: [id], onDelete: SetNull)
  jobId     String?

  type      UsageType
  quantity  Int

  createdAt DateTime   @default(now())

  @@index([userId, type, createdAt])
  @@index([createdAt])
}
```

---

## `server/src/db.ts`

```ts
import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

export const prisma =
  global.prisma ||
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}
```

---

## `server/src/auth.ts`

```ts
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { prisma } from './db';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: 'USER' | 'ADMIN';
      };
    }
  }
}

export const ACCESS_COOKIE = 'access_token';
export const REFRESH_COOKIE = 'refresh_token';

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function signAccessToken(user: {
  id: string;
  email: string;
  role: 'USER' | 'ADMIN';
}): string {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
    },
    process.env.JWT_ACCESS_SECRET || 'change-me-access-secret',
    {
      expiresIn: process.env.ACCESS_TOKEN_TTL || '15m',
    }
  );
}

export function signRefreshToken(userId: string): string {
  return jwt.sign(
    {
      sub: userId,
      type: 'refresh',
    },
    process.env.JWT_REFRESH_SECRET || 'change-me-refresh-secret',
    {
      expiresIn: `${process.env.REFRESH_TOKEN_TTL_DAYS || 30}d`,
    }
  );
}

export function verifyAccessToken(token: string): any {
  return jwt.verify(
    token,
    process.env.JWT_ACCESS_SECRET || 'change-me-access-secret'
  );
}

export function verifyRefreshToken(token: string): any {
  return jwt.verify(
    token,
    process.env.JWT_REFRESH_SECRET || 'change-me-refresh-secret'
  );
}

export function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    domain: process.env.COOKIE_DOMAIN || undefined,
    path: '/',
  };
}

export async function createRefreshTokenRecord(userId: string) {
  const rawToken = signRefreshToken(userId);
  const tokenHash = hashToken(rawToken);

  const expiresAt = new Date();
  expiresAt.setDate(
    expiresAt.getDate() + Number(process.env.REFRESH_TOKEN_TTL_DAYS || 30)
  );

  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
    },
  });

  return rawToken;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.[ACCESS_COOKIE];

    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const payload = verifyAccessToken(token);

    req.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
    };

    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  return next();
}
```

---

## `server/src/s3.ts`

```ts
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION || 'us-east-1',
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY || '',
    secretAccessKey: process.env.S3_SECRET_KEY || '',
  },
});

export const S3_BUCKET = process.env.S3_BUCKET || 'mashimi-assets';

export async function createPresignedUploadUrl(
  key: string,
  contentType: string,
  expiresIn = 900
) {
  const command = new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    ContentType: contentType,
  });

  return getSignedUrl(s3, command, { expiresIn });
}

export async function createPresignedDownloadUrl(
  key: string,
  expiresIn = 900
) {
  const command = new GetObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
  });

  return getSignedUrl(s3, command, { expiresIn });
}

export function publicAssetUrl(key: string) {
  const base = process.env.S3_PUBLIC_URL;

  if (!base) {
    return `/api/assets/signed-url?key=${encodeURIComponent(key)}`;
  }

  return `${base.replace(/\/$/, '')}/${key}`;
}
```

---

## `server/src/queues.ts`

```ts
import IORedis from 'ioredis';
import { Queue } from 'bullmq';

export const queueConnection = new IORedis(
  process.env.REDIS_URL || 'redis://localhost:6379',
  {
    maxRetriesPerRequest: null,
  }
);

export const formatQueue = new Queue('format', {
  connection: queueConnection,
});

export const pdfQueue = new Queue('pdf', {
  connection: queueConnection,
});

export const docxQueue = new Queue('docx', {
  connection: queueConnection,
});
```

---

## `server/src/usage.ts`

```ts
import IORedis from 'ioredis';
import { prisma } from './db';
import type { UsageType } from '@prisma/client';

const redis = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

interface RecordUsageInput {
  userId: string;
  jobId?: string;
  type: UsageType;
  quantity: number;
}

export async function recordUsage(input: RecordUsageInput) {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
  });

  if (!user) {
    throw new Error('User not found');
  }

  const day = new Date().toISOString().slice(0, 10);
  const key = `quota:${input.userId}:${input.type}:${day}`;

  const used = await redis.incrby(key, input.quantity);

  if (used === input.quantity) {
    await redis.expire(key, 60 * 60 * 24);
  }

  const limits: Record<UsageType, number> = {
    AI_CHARS: user.aiCharsPerDay,
    PDF_EXPORT: user.pdfExportsPerDay,
    DOCX_EXPORT: user.docxExportsPerDay,
    IMAGE_UPLOAD: user.imageUploadsPerDay,
  };

  if (used > limits[input.type]) {
    await redis.decrby(key, input.quantity);

    throw new Error(
      `Daily quota exceeded for ${input.type}. Limit: ${limits[input.type]}.`
    );
  }

  await prisma.usageEvent.create({
    data: {
      userId: input.userId,
      jobId: input.jobId,
      type: input.type,
      quantity: input.quantity,
    },
  });
}
```

---

## `server/src/metrics.ts`

```ts
import client from 'prom-client';
import type { NextFunction, Request, Response } from 'express';

const register = new client.Registry();

client.collectDefaultMetrics({ register });

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.05, 0.1, 0.3, 0.5, 1, 2, 5],
});

register.registerMetric(httpRequestDuration);

export function metricsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const end = httpRequestDuration.startTimer();

  res.on('finish', () => {
    end({
      method: req.method,
      route: req.route?.path || req.path,
      status: res.statusCode,
    });
  });

  next();
}

export async function metricsHandler(_req: Request, res: Response) {
  res.setHeader('Content-Type', register.contentType);
  res.send(await register.metrics());
}
```

---

## `server/src/utils/ai.ts`

```ts
import { OpenAI } from 'openai';
import { z } from 'zod';

const MODEL = process.env.MODEL || 'deepseek-chat';
const CHUNK_SIZE = Number(process.env.AI_CHUNK_SIZE || 8000);
const AI_MAX_TOKENS = Number(process.env.AI_MAX_TOKENS || 4096);

export function getOpenAI(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  return new OpenAI({
    baseURL: process.env.OPENAI_BASE_URL || 'https://api.deepseek.com',
    apiKey,
  });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function callModel(messages: any[]) {
  const client = getOpenAI();
  let lastError: any;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const params: any = {
        model: MODEL,
        messages,
        temperature: 0.2,
        max_tokens: AI_MAX_TOKENS,
      };

      if (MODEL.includes('chat')) {
        params.response_format = { type: 'json_object' };
      }

      return await client.chat.completions.create(params);
    } catch (error: any) {
      lastError = error;

      const status = error?.status || error?.response?.status;

      if (status && status >= 400 && status < 500 && status !== 429) {
        throw error;
      }

      await sleep(1000 * (attempt + 1));
    }
  }

  throw lastError;
}

export function chunkText(text: string): string[] {
  if (text.length <= CHUNK_SIZE) return [text];

  const paragraphs = text.split(/\r?\n+/u);
  const chunks: string[] = [];
  let current = '';

  for (const paragraph of paragraphs) {
    if (paragraph.length > CHUNK_SIZE) {
      if (current) {
        chunks.push(current);
        current = '';
      }

      for (let i = 0; i < paragraph.length; i += CHUNK_SIZE) {
        chunks.push(paragraph.slice(i, i + CHUNK_SIZE));
      }

      continue;
    }

    const candidate = current ? `${current}\n${paragraph}` : paragraph;

    if (candidate.length > CHUNK_SIZE) {
      chunks.push(current);
      current = paragraph;
    } else {
      current = candidate;
    }
  }

  if (current) chunks.push(current);

  return chunks;
}

export function parseLenientJSON(input: string): any {
  let text = input.trim();

  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');

  try {
    return JSON.parse(text);
  } catch {}

  const start = text.indexOf('{');
  if (start === -1) {
    throw new Error('No JSON object found');
  }

  let slice = text.slice(start);
  const end = slice.lastIndexOf('}');

  if (end !== -1) {
    slice = slice.slice(0, end + 1);
  }

  try {
    return JSON.parse(slice);
  } catch {}

  let out = slice;
  let inString = false;
  let escaped = false;
  const stack: string[] = [];

  for (const ch of out) {
    if (escaped) {
      escaped = false;
      continue;
    }

    if (ch === '\\') {
      escaped = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === '{' || ch === '[') {
      stack.push(ch);
    }

    if (ch === '}' || ch === ']') {
      stack.pop();
    }
  }

  if (inString) {
    out += '"';
  }

  out = out.replace(/,\s*$/, '');

  while (stack.length) {
    const open = stack.pop();
    out += open === '{' ? '}' : ']';
  }

  out = out.replace(/,\s*([}\]])/g, '$1');

  return JSON.parse(out);
}

export const ChapterSchema = z.object({
  title: z.string().min(1).max(500),
  content: z.string(),
});

export const AiResponseSchema = z.object({
  metadata: z
    .object({
      title: z.string().min(1).max(500),
      author: z.string().max(300).optional(),
    })
    .optional(),
  chapters: z.array(ChapterSchema).default([]),
});

export function normalizeTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function mergeChapters(
  target: Array<{ title: string; content: string }>,
  incoming: Array<{ title: string; content: string }>
) {
  for (const chapter of incoming) {
    const last = target[target.length - 1];

    if (last && normalizeTitle(last.title) === normalizeTitle(chapter.title)) {
      last.content = `${last.content}\n\n${chapter.content}`.trim();
    } else {
      target.push(chapter);
    }
  }
}
```

---

## `server/src/utils/pdfx.ts`

```ts
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';

export async function convertToPdfX(inputBuffer: Buffer): Promise<Buffer> {
  if (process.env.PDFX_ENABLED !== 'true') {
    return inputBuffer;
  }

  const profilePath = process.env.PDFX_PROFILE_PATH;

  if (!profilePath) {
    throw new Error('PDFX_PROFILE_PATH is not configured');
  }

  await fs.access(profilePath).catch(() => {
    throw new Error(
      `PDF/X ICC profile not found at ${profilePath}. Provide a licensed CMYK profile.`
    );
  });

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mashimi-pdfx-'));
  const inputPath = path.join(tempDir, 'input.pdf');
  const outputPath = path.join(tempDir, 'output.pdf');

  await fs.writeFile(inputPath, inputBuffer);

  await new Promise<void>((resolve, reject) => {
    const child = spawn('gs', [
      '-dNOPAUSE',
      '-dBATCH',
      '-sDEVICE=pdfwrite',
      '-dPDFX',
      '-sColorConversionStrategy=CMYK',
      '-dProcessColorModel=/DeviceCMYK',
      '-dUseCIEColor',
      `-sOutputIntentProfile=${profilePath}`,
      '-dCompatibilityLevel=1.4',
      `-sOutputFile=${outputPath}`,
      inputPath,
    ]);

    let stderr = '';

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);

    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr || `Ghostscript exited with code ${code}`));
    });
  });

  const outputBuffer = await fs.readFile(outputPath);

  await fs.rm(tempDir, { recursive: true, force: true });

  return outputBuffer;
}
```

---

## `server/src/routes/auth.routes.ts`

```ts
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  cookieOptions,
  createRefreshTokenRecord,
  hashPassword,
  hashToken,
  signAccessToken,
  verifyAccessToken,
  verifyPassword,
  verifyRefreshToken,
} from '../auth';

export const authRouter = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid registration data',
      details: parsed.error.issues,
    });
  }

  const { email, password } = parsed.data;

  const existing = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (existing) {
    return res.status(409).json({ error: 'Email already registered' });
  }

  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      passwordHash,
      role: 'USER',
    },
  });

  const accessToken = signAccessToken({
    id: user.id,
    email: user.email,
    role: user.role,
  });

  const refreshToken = await createRefreshTokenRecord(user.id);

  res.cookie(ACCESS_COOKIE, accessToken, {
    ...cookieOptions(),
    maxAge: 15 * 60 * 1000,
  });

  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...cookieOptions(),
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });

  return res.status(201).json({
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
    },
  });
});

authRouter.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid login data' });
  }

  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (!user || !user.isActive) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const valid = await verifyPassword(password, user.passwordHash);

  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const accessToken = signAccessToken({
    id: user.id,
    email: user.email,
    role: user.role,
  });

  const refreshToken = await createRefreshTokenRecord(user.id);

  res.cookie(ACCESS_COOKIE, accessToken, {
    ...cookieOptions(),
    maxAge: 15 * 60 * 1000,
  });

  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...cookieOptions(),
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });

  return res.json({
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
    },
  });
});

authRouter.post('/refresh', async (req, res) => {
  const rawRefreshToken = req.cookies?.[REFRESH_COOKIE];

  if (!rawRefreshToken) {
    return res.status(401).json({ error: 'Missing refresh token' });
  }

  try {
    const tokenHash = hashToken(rawRefreshToken);

    const stored = await prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    verifyRefreshToken(rawRefreshToken);

    const accessToken = signAccessToken({
      id: stored.user.id,
      email: stored.user.email,
      role: stored.user.role,
    });

    res.cookie(ACCESS_COOKIE, accessToken, {
      ...cookieOptions(),
      maxAge: 15 * 60 * 1000,
    });

    return res.json({
      user: {
        id: stored.user.id,
        email: stored.user.email,
        role: stored.user.role,
      },
    });
  } catch {
    return res.status(401).json({ error: 'Invalid refresh token' });
  }
});

authRouter.post('/logout', async (req, res) => {
  const rawRefreshToken = req.cookies?.[REFRESH_COOKIE];

  if (rawRefreshToken) {
    const tokenHash = hashToken(rawRefreshToken);

    await prisma.refreshToken.updateMany({
      where: { tokenHash },
      data: { revokedAt: new Date() },
    });
  }

  res.clearCookie(ACCESS_COOKIE, cookieOptions());
  res.clearCookie(REFRESH_COOKIE, cookieOptions());

  return res.json({ ok: true });
});

authRouter.get('/me', async (req, res) => {
  const token = req.cookies?.[ACCESS_COOKIE];

  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const payload = verifyAccessToken(token);

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    return res.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    });
  } catch {
    return res.status(401).json({ error: 'Invalid session' });
  }
});
```

---

## `server/src/routes/document.routes.ts`

```ts
import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import mammoth from 'mammoth';
import { requireAuth } from '../auth';

export const documentRouter = Router();

const docUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();

    if (['.docx', '.txt', '.md', '.markdown'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only .docx, .txt, and .md files are supported'));
    }
  },
});

documentRouter.use(requireAuth);

documentRouter.post(
  '/parse',
  docUpload.single('document'),
  async (req: any, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const ext = path.extname(req.file.originalname).toLowerCase();
    let text = '';

    if (ext === '.docx') {
      const result = await mammoth.extractRawText({
        buffer: req.file.buffer,
      });
      text = result.value;
    } else {
      text = req.file.buffer.toString('utf8');
    }

    text = text.replace(/\r\n/g, '\n').trim();

    const title =
      path
        .basename(req.file.originalname, path.extname(req.file.originalname))
        .replace(/[_-]+/g, ' ')
        .trim() || 'Untitled Document';

    if (text.length < 100) {
      return res.status(422).json({
        error: 'Document is too short. Provide at least 100 characters.',
      });
    }

    res.json({ text, title });
  }
);
```

---

## `server/src/routes/manuscript.routes.ts`

```ts
import { Router } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAuth } from '../auth';

export const manuscriptRouter = Router();

manuscriptRouter.use(requireAuth);

const chapterSchema = z.object({
  id: z.string().min(1).max(100).optional(),
  position: z.number().int().min(0),
  title: z.string().min(1).max(500),
  content: z.any().optional().nullable(),
  markdown: z.string().optional().nullable(),
});

const updateManuscriptSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  author: z.string().max(300).optional(),
  theme: z.string().max(50).optional(),
  fontFamily: z.string().max(50).optional(),
  fontSize: z.string().max(20).optional(),
  trimSize: z.string().max(50).optional(),
  chapters: z.array(chapterSchema).optional(),
});

async function getOwnedManuscript(userId: string, manuscriptId: string) {
  return prisma.manuscript.findFirst({
    where: {
      id: manuscriptId,
      userId,
    },
    include: {
      chapters: {
        orderBy: {
          position: 'asc',
        },
      },
    },
  });
}

manuscriptRouter.get('/', async (req, res) => {
  const manuscripts = await prisma.manuscript.findMany({
    where: { userId: req.user!.id },
    orderBy: { updatedAt: 'desc' },
    include: {
      chapters: {
        orderBy: { position: 'asc' },
        select: {
          id: true,
          title: true,
          position: true,
          updatedAt: true,
        },
      },
    },
  });

  res.json({ manuscripts });
});

manuscriptRouter.post('/', async (req, res) => {
  const manuscript = await prisma.manuscript.create({
    data: {
      userId: req.user!.id,
      title: req.body?.title || 'Untitled Book',
      author: req.body?.author || '',
      chapters: {
        create: [
          {
            id: crypto.randomUUID(),
            position: 0,
            title: 'Chapter 1',
            content: {
              type: 'doc',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'Start writing...' }],
                },
              ],
            },
            markdown: 'Start writing...',
          },
        ],
      },
    },
    include: {
      chapters: {
        orderBy: { position: 'asc' },
      },
    },
  });

  res.status(201).json({ manuscript });
});

manuscriptRouter.get('/:id', async (req, res) => {
  const manuscript = await getOwnedManuscript(req.user!.id, req.params.id);

  if (!manuscript) {
    return res.status(404).json({ error: 'Manuscript not found' });
  }

  res.json({ manuscript });
});

manuscriptRouter.patch('/:id', async (req, res) => {
  const parsed = updateManuscriptSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid manuscript payload',
      details: parsed.error.issues,
    });
  }

  const existing = await getOwnedManuscript(req.user!.id, req.params.id);

  if (!existing) {
    return res.status(404).json({ error: 'Manuscript not found' });
  }

  const { chapters, ...metadata } = parsed.data;

  const updated = await prisma.$transaction(async (tx) => {
    await tx.manuscript.update({
      where: { id: existing.id },
      data: metadata,
    });

    if (chapters) {
      await tx.chapter.deleteMany({
        where: { manuscriptId: existing.id },
      });

      await tx.chapter.createMany({
        data: chapters.map((chapter) => ({
          id: chapter.id || crypto.randomUUID(),
          manuscriptId: existing.id,
          position: chapter.position,
          title: chapter.title,
          content: chapter.content ?? undefined,
          markdown: chapter.markdown ?? undefined,
        })),
      });
    }

    return tx.manuscript.findUnique({
      where: { id: existing.id },
      include: {
        chapters: {
          orderBy: { position: 'asc' },
        },
      },
    });
  });

  res.json({ manuscript: updated });
});

manuscriptRouter.delete('/:id', async (req, res) => {
  const existing = await getOwnedManuscript(req.user!.id, req.params.id);

  if (!existing) {
    return res.status(404).json({ error: 'Manuscript not found' });
  }

  await prisma.manuscript.delete({
    where: { id: existing.id },
  });

  res.json({ ok: true });
});
```

---

## `server/src/routes/asset.routes.ts`

```ts
import { Router } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAuth } from '../auth';
import {
  S3_BUCKET,
  createPresignedDownloadUrl,
  createPresignedUploadUrl,
  publicAssetUrl,
} from '../s3';
import { recordUsage } from '../usage';

export const assetRouter = Router();

assetRouter.use(requireAuth);

const presignSchema = z.object({
  contentType: z
    .string()
    .refine((value) => /^image\/(jpeg|png|webp)$/.test(value), {
      message: 'Only JPEG, PNG, and WebP images are allowed',
    }),
  fileSize: z.number().int().positive().max(10 * 1024 * 1024),
  caption: z.string().max(500).optional(),
});

assetRouter.post('/presign', async (req, res) => {
  const parsed = presignSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid asset request',
      details: parsed.error.issues,
    });
  }

  const { contentType, fileSize } = parsed.data;

  await recordUsage({
    userId: req.user!.id,
    type: 'IMAGE_UPLOAD',
    quantity: 1,
  });

  const ext = contentType.split('/')[1];
  const key = `users/${req.user!.id}/assets/${crypto.randomUUID()}.${ext}`;

  const uploadUrl = await createPresignedUploadUrl(key, contentType);

  res.json({
    uploadUrl,
    key,
    bucket: S3_BUCKET,
    publicUrl: publicAssetUrl(key),
  });
});

assetRouter.post('/complete', async (req, res) => {
  const schema = z.object({
    key: z.string().min(1),
    contentType: z.string().min(1),
    size: z.number().int().positive(),
    width: z.number().int().optional(),
    height: z.number().int().optional(),
    caption: z.string().max(500).optional(),
  });

  const parsed = schema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid asset completion',
      details: parsed.error.issues,
    });
  }

  if (!parsed.data.key.startsWith(`users/${req.user!.id}/assets/`)) {
    return res.status(403).json({ error: 'Invalid asset key' });
  }

  const asset = await prisma.asset.create({
    data: {
      userId: req.user!.id,
      bucket: S3_BUCKET,
      key: parsed.data.key,
      contentType: parsed.data.contentType,
      size: parsed.data.size,
      width: parsed.data.width,
      height: parsed.data.height,
      caption: parsed.data.caption,
      publicUrl: publicAssetUrl(parsed.data.key),
    },
  });

  res.status(201).json({ asset });
});

assetRouter.get('/signed-url', async (req, res) => {
  const key = String(req.query.key || '');

  if (!key) {
    return res.status(400).json({ error: 'Missing key' });
  }

  const asset = await prisma.asset.findFirst({
    where: {
      key,
      userId: req.user!.id,
    },
  });

  if (!asset) {
    return res.status(404).json({ error: 'Asset not found' });
  }

  const url = await createPresignedDownloadUrl(asset.key);

  res.json({ url });
});
```

---

## `server/src/routes/job.routes.ts`

```ts
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAuth } from '../auth';
import { formatQueue, pdfQueue, docxQueue } from '../queues';
import { recordUsage } from '../usage';

export const jobRouter = Router();

jobRouter.use(requireAuth);

const formatSchema = z.object({
  manuscriptId: z.string().min(1),
  rawText: z.string().min(100).max(2_000_000),
});

const exportSchema = z.object({
  manuscriptId: z.string().min(1),
  options: z
    .object({
      trimSize: z.string().optional(),
      includeToc: z.boolean().optional(),
      pdfx: z.boolean().optional(),
    })
    .optional(),
});

jobRouter.post('/format', async (req, res) => {
  const parsed = formatSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid format request',
      details: parsed.error.issues,
    });
  }

  const { manuscriptId, rawText } = parsed.data;

  const manuscript = await prisma.manuscript.findFirst({
    where: {
      id: manuscriptId,
      userId: req.user!.id,
    },
  });

  if (!manuscript) {
    return res.status(404).json({ error: 'Manuscript not found' });
  }

  await recordUsage({
    userId: req.user!.id,
    type: 'AI_CHARS',
    quantity: rawText.length,
  });

  const job = await prisma.job.create({
    data: {
      userId: req.user!.id,
      type: 'FORMAT',
      status: 'PENDING',
      input: {
        manuscriptId,
        rawText,
      },
    },
  });

  await formatQueue.add(
    'format',
    { jobId: job.id },
    {
      jobId: job.id,
      removeOnComplete: 1000,
      removeOnFail: 5000,
      attempts: 2,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
    }
  );

  res.status(202).json({ jobId: job.id });
});

jobRouter.post('/pdf', async (req, res) => {
  const parsed = exportSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid PDF request',
      details: parsed.error.issues,
    });
  }

  const manuscript = await prisma.manuscript.findFirst({
    where: {
      id: parsed.data.manuscriptId,
      userId: req.user!.id,
    },
  });

  if (!manuscript) {
    return res.status(404).json({ error: 'Manuscript not found' });
  }

  await recordUsage({
    userId: req.user!.id,
    type: 'PDF_EXPORT',
    quantity: 1,
  });

  const job = await prisma.job.create({
    data: {
      userId: req.user!.id,
      type: 'PDF',
      status: 'PENDING',
      input: parsed.data,
    },
  });

  await pdfQueue.add(
    'pdf',
    { jobId: job.id },
    {
      jobId: job.id,
      removeOnComplete: 1000,
      removeOnFail: 5000,
      attempts: 2,
    }
  );

  res.status(202).json({ jobId: job.id });
});

jobRouter.post('/docx', async (req, res) => {
  const parsed = exportSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid DOCX request',
      details: parsed.error.issues,
    });
  }

  const manuscript = await prisma.manuscript.findFirst({
    where: {
      id: parsed.data.manuscriptId,
      userId: req.user!.id,
    },
  });

  if (!manuscript) {
    return res.status(404).json({ error: 'Manuscript not found' });
  }

  await recordUsage({
    userId: req.user!.id,
    type: 'DOCX_EXPORT',
    quantity: 1,
  });

  const job = await prisma.job.create({
    data: {
      userId: req.user!.id,
      type: 'DOCX',
      status: 'PENDING',
      input: parsed.data,
    },
  });

  await docxQueue.add(
    'docx',
    { jobId: job.id },
    {
      jobId: job.id,
      removeOnComplete: 1000,
      removeOnFail: 5000,
      attempts: 2,
    }
  );

  res.status(202).json({ jobId: job.id });
});

jobRouter.get('/:id', async (req, res) => {
  const job = await prisma.job.findFirst({
    where: {
      id: req.params.id,
      userId: req.user!.id,
    },
  });

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  res.json({ job });
});
```

---

## `server/src/routes/admin.routes.ts`

```ts
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAdmin, requireAuth } from '../auth';

export const adminRouter = Router();

adminRouter.use(requireAuth, requireAdmin);

adminRouter.get('/users', async (_req, res) => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      email: true,
      role: true,
      isActive: true,
      aiCharsPerDay: true,
      pdfExportsPerDay: true,
      docxExportsPerDay: true,
      imageUploadsPerDay: true,
      createdAt: true,
      _count: {
        select: {
          manuscripts: true,
          jobs: true,
          assets: true,
        },
      },
    },
  });

  res.json({ users });
});

adminRouter.patch('/users/:id/quota', async (req, res) => {
  const schema = z.object({
    aiCharsPerDay: z.number().int().min(0).optional(),
    pdfExportsPerDay: z.number().int().min(0).optional(),
    docxExportsPerDay: z.number().int().min(0).optional(),
    imageUploadsPerDay: z.number().int().min(0).optional(),
    isActive: z.boolean().optional(),
    role: z.enum(['USER', 'ADMIN']).optional(),
  });

  const parsed = schema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid payload',
      details: parsed.error.issues,
    });
  }

  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: parsed.data,
    select: {
      id: true,
      email: true,
      role: true,
      isActive: true,
      aiCharsPerDay: true,
      pdfExportsPerDay: true,
      docxExportsPerDay: true,
      imageUploadsPerDay: true,
    },
  });

  res.json({ user });
});

adminRouter.get('/usage', async (req, res) => {
  const days = Number(req.query.days || 7);

  const since = new Date();
  since.setDate(since.getDate() - days);

  const usage = await prisma.usageEvent.groupBy({
    by: ['type', 'userId'],
    where: {
      createdAt: {
        gte: since,
      },
    },
    _sum: {
      quantity: true,
    },
  });

  res.json({ usage });
});

adminRouter.get('/jobs', async (_req, res) => {
  const jobs = await prisma.job.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      user: {
        select: {
          email: true,
        },
      },
    },
  });

  res.json({ jobs });
});
```

---

## `server/src/workers/format.worker.ts`

```ts
import { Worker, Job } from 'bullmq';
import { prisma } from '../db';
import { queueConnection } from '../queues';
import {
  AiResponseSchema,
  callModel,
  chunkText,
  mergeChapters,
  parseLenientJSON,
} from '../utils/ai';

const SYSTEM_PROMPT = `
You are an expert book editor. Convert raw text into a structured Markdown manuscript.

Rules:
1. Preserve meaning and sequence.
2. Only create a new chapter when there is an explicit chapter heading or clear section break.
3. If this chunk continues the previous chapter, return the same chapter title.
4. Use Markdown formatting.
5. Return ONLY valid JSON.

JSON shape:
{
  "metadata": { "title": "Book Title", "author": "Author" },
  "chapters": [
    { "title": "Chapter 1: Title", "content": "Markdown body..." }
  ]
}
`.trim();

async function formatChunk(
  chunk: string,
  index: number,
  total: number,
  previousTitle?: string
) {
  const userPrompt = `
Chunk ${index + 1} of ${total}.
${
  previousTitle
    ? `Previous chapter title: "${previousTitle}". If this chunk continues that chapter, use the same title.`
    : 'This is the first chunk.'
}

Format this text:

${chunk}
`.trim();

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userPrompt },
  ];

  const completion = await callModel(messages);
  const raw = completion.choices[0]?.message?.content || '{}';

  try {
    const parsed = parseLenientJSON(raw);
    return AiResponseSchema.parse(parsed);
  } catch {
    const retry = await callModel([
      ...messages,
      {
        role: 'user',
        content:
          'Your previous response was not valid JSON. Return ONLY valid JSON matching the schema.',
      },
    ]);

    const parsed = parseLenientJSON(
      retry.choices[0]?.message?.content || '{}'
    );

    return AiResponseSchema.parse(parsed);
  }
}

export function startFormatWorker() {
  new Worker(
    'format',
    async (job: Job) => {
      const { jobId } = job.data as { jobId: string };

      const dbJob = await prisma.job.findUnique({
        where: { id: jobId },
      });

      if (!dbJob) {
        throw new Error('Job not found');
      }

      await prisma.job.update({
        where: { id: jobId },
        data: {
          status: 'RUNNING',
          progress: 0,
        },
      });

      const input = dbJob.input as any;
      const rawText: string = input.rawText;
      const manuscriptId: string = input.manuscriptId;

      const manuscript = await prisma.manuscript.findFirst({
        where: {
          id: manuscriptId,
          userId: dbJob.userId,
        },
      });

      if (!manuscript) {
        throw new Error('Manuscript not found');
      }

      const chunks = chunkText(rawText);

      let bookData: {
        metadata?: { title?: string; author?: string };
        chapters: Array<{ title: string; content: string }>;
      } = {
        chapters: [],
      };

      for (let i = 0; i < chunks.length; i++) {
        await job.updateProgress(
          Math.round(((i + 1) / chunks.length) * 100)
        );

        const previousTitle =
          bookData.chapters[bookData.chapters.length - 1]?.title;

        const parsed = await formatChunk(
          chunks[i],
          i,
          chunks.length,
          previousTitle
        );

        if (i === 0) {
          bookData.metadata = parsed.metadata;
          bookData.chapters = parsed.chapters;
        } else {
          mergeChapters(bookData.chapters, parsed.chapters);
        }

        await prisma.job.update({
          where: { id: jobId },
          data: {
            progress: Math.round(((i + 1) / chunks.length) * 100),
            progressMeta: {
              current: i + 1,
              total: chunks.length,
              chaptersSoFar: bookData.chapters.length,
            },
          },
        });
      }

      if (!bookData.chapters.length) {
        throw new Error('AI did not return any chapters');
      }

      await prisma.$transaction(async (tx) => {
        await tx.chapter.deleteMany({
          where: { manuscriptId },
        });

        await tx.chapter.createMany({
          data: bookData.chapters.map((chapter, index) => ({
            manuscriptId,
            position: index,
            title: chapter.title,
            markdown: chapter.content,
            content: null,
          })),
        });

        await tx.manuscript.update({
          where: { id: manuscriptId },
          data: {
            title: bookData.metadata?.title || manuscript.title,
            author: bookData.metadata?.author || manuscript.author,
          },
        });
      });

      await prisma.job.update({
        where: { id: jobId },
        data: {
          status: 'COMPLETED',
          progress: 100,
          result: {
            manuscriptId,
            chapters: bookData.chapters.length,
          },
        },
      });

      return { manuscriptId };
    },
    {
      connection: queueConnection,
      concurrency: 2,
    }
  );
}
```

---

## `server/src/workers/pdf.worker.ts`

```ts
import { Worker, Job } from 'bullmq';
import { spawn } from 'child_process';
import path from 'path';
import crypto from 'crypto';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { prisma } from '../db';
import { queueConnection } from '../queues';
import { s3, S3_BUCKET, publicAssetUrl } from '../s3';
import { convertToPdfX } from '../utils/pdfx';

async function runPythonTypesetter(jsonPayload: any): Promise<Buffer> {
  const scriptPath = path.resolve(
    process.env.TYPESET_SCRIPT_PATH || '../typesetting/typeset.py'
  );

  const pythonCmd = process.env.PYTHON_CMD || 'python3';

  return new Promise((resolve, reject) => {
    const child = spawn(pythonCmd, [scriptPath], {
      env: process.env,
    });

    const chunks: Buffer[] = [];
    let stderr = '';

    child.stdout.on('data', (chunk) => chunks.push(Buffer.from(chunk)));

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);

    child.on('close', (code) => {
      if (code === 0) {
        resolve(Buffer.concat(chunks));
      } else {
        reject(new Error(stderr || `Typesetter exited with code ${code}`));
      }
    });

    child.stdin.write(JSON.stringify(jsonPayload));
    child.stdin.end();
  });
}

export function startPdfWorker() {
  new Worker(
    'pdf',
    async (job: Job) => {
      const { jobId } = job.data as { jobId: string };

      const dbJob = await prisma.job.findUnique({
        where: { id: jobId },
      });

      if (!dbJob) {
        throw new Error('Job not found');
      }

      await prisma.job.update({
        where: { id: jobId },
        data: {
          status: 'RUNNING',
          progress: 10,
        },
      });

      const input = dbJob.input as any;

      const manuscript = await prisma.manuscript.findFirst({
        where: {
          id: input.manuscriptId,
          userId: dbJob.userId,
        },
        include: {
          chapters: {
            orderBy: { position: 'asc' },
          },
        },
      });

      if (!manuscript) {
        throw new Error('Manuscript not found');
      }

      const payload = {
        metadata: {
          title: manuscript.title,
          author: manuscript.author,
          trimSize: manuscript.trimSize,
        },
        chapters: manuscript.chapters.map((chapter) => ({
          title: chapter.title,
          content: chapter.markdown || '',
        })),
      };

      await job.updateProgress(30);

      let pdfBuffer = await runPythonTypesetter(payload);

      await job.updateProgress(60);

      if (input.options?.pdfx || process.env.PDFX_ENABLED === 'true') {
        pdfBuffer = await convertToPdfX(pdfBuffer);
      }

      await job.updateProgress(80);

      const key = `users/${dbJob.userId}/exports/${crypto.randomUUID()}.pdf`;

      await s3.send(
        new PutObjectCommand({
          Bucket: S3_BUCKET,
          Key: key,
          Body: pdfBuffer,
          ContentType: 'application/pdf',
        })
      );

      const asset = await prisma.asset.create({
        data: {
          userId: dbJob.userId,
          bucket: S3_BUCKET,
          key,
          contentType: 'application/pdf',
          size: pdfBuffer.length,
          publicUrl: publicAssetUrl(key),
        },
      });

      await prisma.job.update({
        where: { id: jobId },
        data: {
          status: 'COMPLETED',
          progress: 100,
          result: {
            assetId: asset.id,
            downloadUrl: asset.publicUrl,
          },
        },
      });

      return { assetId: asset.id };
    },
    {
      connection: queueConnection,
      concurrency: 2,
    }
  );
}
```

---

## `server/src/workers/docx.worker.ts`

```ts
import { Worker, Job } from 'bullmq';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { prisma } from '../db';
import { queueConnection } from '../queues';
import { s3, S3_BUCKET, publicAssetUrl } from '../s3';

async function markdownToDocx(markdown: string): Promise<Buffer> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mashimi-docx-'));
  const inputPath = path.join(tempDir, 'input.md');
  const outputPath = path.join(tempDir, 'output.docx');

  await fs.writeFile(inputPath, markdown, 'utf8');

  const pandocCmd = process.env.PANDOC_CMD || 'pandoc';

  await new Promise<void>((resolve, reject) => {
    const child = spawn(pandocCmd, [
      inputPath,
      '-f',
      'markdown-raw_html',
      '-o',
      outputPath,
    ]);

    let stderr = '';

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);

    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr || `Pandoc exited with ${code}`));
    });
  });

  const buffer = await fs.readFile(outputPath);

  await fs.rm(tempDir, { recursive: true, force: true });

  return buffer;
}

export function startDocxWorker() {
  new Worker(
    'docx',
    async (job: Job) => {
      const { jobId } = job.data as { jobId: string };

      const dbJob = await prisma.job.findUnique({
        where: { id: jobId },
      });

      if (!dbJob) {
        throw new Error('Job not found');
      }

      await prisma.job.update({
        where: { id: jobId },
        data: {
          status: 'RUNNING',
          progress: 10,
        },
      });

      const input = dbJob.input as any;

      const manuscript = await prisma.manuscript.findFirst({
        where: {
          id: input.manuscriptId,
          userId: dbJob.userId,
        },
        include: {
          chapters: {
            orderBy: { position: 'asc' },
          },
        },
      });

      if (!manuscript) {
        throw new Error('Manuscript not found');
      }

      const markdown = [
        `# ${manuscript.title}`,
        '',
        `By ${manuscript.author || 'Anonymous'}`,
        '',
        ...manuscript.chapters.flatMap((chapter) => [
          `# ${chapter.title}`,
          '',
          chapter.markdown || '',
          '',
        ]),
      ].join('\n');

      await job.updateProgress(40);

      const docxBuffer = await markdownToDocx(markdown);

      await job.updateProgress(70);

      const key = `users/${dbJob.userId}/exports/${crypto.randomUUID()}.docx`;

      await s3.send(
        new PutObjectCommand({
          Bucket: S3_BUCKET,
          Key: key,
          Body: docxBuffer,
          ContentType:
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        })
      );

      const asset = await prisma.asset.create({
        data: {
          userId: dbJob.userId,
          bucket: S3_BUCKET,
          key,
          contentType:
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          size: docxBuffer.length,
          publicUrl: publicAssetUrl(key),
        },
      });

      await prisma.job.update({
        where: { id: jobId },
        data: {
          status: 'COMPLETED',
          progress: 100,
          result: {
            assetId: asset.id,
            downloadUrl: asset.publicUrl,
          },
        },
      });

      return { assetId: asset.id };
    },
    {
      connection: queueConnection,
      concurrency: 2,
    }
  );
}
```

---

## `server/src/worker.ts`

```ts
import 'dotenv/config';
import { startFormatWorker } from './workers/format.worker';
import { startPdfWorker } from './workers/pdf.worker';
import { startDocxWorker } from './workers/docx.worker';

startFormatWorker();
startPdfWorker();
startDocxWorker();

console.log('🧠 Workers started: format, pdf, docx');
```

---

## `server/src/app.ts`

```ts
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';

import { authRouter } from './routes/auth.routes';
import { manuscriptRouter } from './routes/manuscript.routes';
import { assetRouter } from './routes/asset.routes';
import { jobRouter } from './routes/job.routes';
import { adminRouter } from './routes/admin.routes';
import { documentRouter } from './routes/document.routes';
import { metricsMiddleware, metricsHandler } from './metrics';
import { requireAdmin } from './auth';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );

  app.use(
    cors({
      origin: (process.env.ALLOWED_ORIGINS || 'http://localhost:5173')
        .split(',')
        .map((value) => value.trim()),
      credentials: true,
    })
  );

  app.use(express.json({ limit: '25mb' }));
  app.use(cookieParser());
  app.use(metricsMiddleware);

  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 300,
      standardHeaders: true,
      legacyHeaders: false,
    })
  );

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/admin/metrics', requireAdmin, metricsHandler);

  app.use('/api/auth', authRouter);
  app.use('/api/documents', documentRouter);
  app.use('/api/manuscripts', manuscriptRouter);
  app.use('/api/assets', assetRouter);
  app.use('/api/jobs', jobRouter);
  app.use('/api/admin', adminRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use((err: any, _req: express.Request, res: express.Response) => {
    console.error(err);

    res.status(err?.status || 500).json({
      error: err?.message || 'Internal server error',
    });
  });

  return app;
}
```

---

## `server/src/server.ts`

```ts
import 'dotenv/config';
import { createApp } from './app';

const app = createApp();

const PORT = Number(process.env.PORT || 3001);

app.listen(PORT, () => {
  console.log(`🚀 API running on http://localhost:${PORT}`);
});
```

---

## `server/scripts/seed_admin.ts`

```ts
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { prisma } from '../src/db';

async function main() {
  const email = process.env.ADMIN_EMAIL || 'admin@example.com';
  const password = process.env.ADMIN_PASSWORD || 'ChangeMe123!';

  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.user.upsert({
    where: { email },
    update: {
      role: 'ADMIN',
      isActive: true,
    },
    create: {
      email,
      passwordHash,
      role: 'ADMIN',
      isActive: true,
    },
  });

  console.log(`Admin ready: ${admin.email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

---

## `server/test/app.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

const app = createApp();

describe('API', () => {
  it('health check works', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('requires auth for manuscripts', async () => {
    const res = await request(app).get('/api/manuscripts');
    expect(res.status).toBe(401);
  });
});
```

---

## `server/Dockerfile`

```dockerfile
FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    pandoc \
    ghostscript \
    fonts-liberation \
    fonts-dejavu \
    fontconfig \
    curl \
    && rm -rf /var/lib/apt/lists/*

RUN python3 -m pip install --break-system-packages --upgrade \
    weasyprint \
    markdown

WORKDIR /app

COPY server/package*.json ./
COPY server/prisma ./prisma

RUN npm install

COPY server/ ./
COPY typesetting/ /app/typesetting
COPY scripts/ /app/scripts

RUN npx prisma generate

COPY server/docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

EXPOSE 3001

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["npm", "run", "start"]
```

---

## `server/docker-entrypoint.sh`

```sh
#!/bin/sh
set -e

npx prisma migrate deploy

exec "$@"
```

---

# 3. Frontend

Replace/create these frontend files.

---

## `modern-book-editor/.env.example`

```env
VITE_API_BASE=/api
```

Copy:

```bash
cd modern-book-editor
cp .env.example .env
```

---

## `modern-book-editor/vite.config.ts`

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
```

---

## `modern-book-editor/src/lib/apiClient.ts`

```ts
const API_BASE = import.meta.env.VITE_API_BASE || '/api';

async function refreshSession() {
  await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  });
}

export async function apiFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const url = `${API_BASE}${path}`;

  let response = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      ...(options.body instanceof FormData
        ? {}
        : { 'Content-Type': 'application/json' }),
      ...(options.headers || {}),
    },
  });

  if (response.status === 401 && !path.includes('/auth/')) {
    await refreshSession();

    response = await fetch(url, {
      ...options,
      credentials: 'include',
      headers: {
        ...(options.body instanceof FormData
          ? {}
          : { 'Content-Type': 'application/json' }),
        ...(options.headers || {}),
      },
    });
  }

  return response;
}

export async function apiJson<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await apiFetch(path, options);

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${response.status}`);
  }

  return response.json();
}
```

---

## `modern-book-editor/src/lib/auth.ts`

```ts
import { apiJson } from './apiClient';

export interface CurrentUser {
  id: string;
  email: string;
  role: 'USER' | 'ADMIN';
}

export async function login(email: string, password: string) {
  return apiJson<{ user: CurrentUser }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function register(email: string, password: string) {
  return apiJson<{ user: CurrentUser }>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function logout() {
  return apiJson('/auth/logout', { method: 'POST' });
}

export async function getCurrentUser() {
  return apiJson<{ user: CurrentUser }>('/auth/me');
}
```

---

## `modern-book-editor/src/lib/jobs.ts`

```ts
import { apiJson } from './apiClient';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function waitForJob(
  jobId: string,
  onProgress?: (progress: number, meta: any) => void
) {
  while (true) {
    const { job } = await apiJson(`/jobs/${jobId}`);

    if (job.status === 'COMPLETED') {
      return job;
    }

    if (job.status === 'FAILED') {
      throw new Error(job.error || 'Job failed');
    }

    onProgress?.(job.progress, job.progressMeta);

    await sleep(1500);
  }
}
```

---

## `modern-book-editor/src/lib/uploads.ts`

```ts
import { apiJson } from './apiClient';

export async function uploadImage(file: File) {
  const presign = await apiJson('/assets/presign', {
    method: 'POST',
    body: JSON.stringify({
      contentType: file.type,
      fileSize: file.size,
    }),
  });

  await fetch(presign.uploadUrl, {
    method: 'PUT',
    body: file,
    headers: {
      'Content-Type': file.type,
    },
  });

  const complete = await apiJson('/assets/complete', {
    method: 'POST',
    body: JSON.stringify({
      key: presign.key,
      contentType: file.type,
      size: file.size,
    }),
  });

  return complete.asset.publicUrl as string;
}
```

---

## `modern-book-editor/src/lib/tiptapToMarkdown.ts`

```ts
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function inlineToMarkdown(node: any): string {
  if (!node) return '';

  if (node.type === 'text') {
    let text = node.text || '';

    if (node.marks) {
      for (const mark of node.marks) {
        if (mark.type === 'bold') text = `**${text}**`;
        else if (mark.type === 'italic') text = `*${text}*`;
        else if (mark.type === 'code') text = `\`${text}\``;
        else if (mark.type === 'strike') text = `~~${text}~~`;
      }
    }

    return text;
  }

  if (node.type === 'hardBreak') {
    return '  \n';
  }

  if (node.type === 'image') {
    const src = String(node.attrs?.src || '').replace(/"/g, '%22');
    const caption = String(node.attrs?.caption || node.attrs?.alt || '');
    const isFullBleed = String(node.attrs?.class || '').includes('full-bleed');
    const safeCaption = escapeHtml(caption);

    return `\n<div class="image-wrapper"><img src="${src}" alt="${safeCaption}"${
      isFullBleed ? ' class="full-bleed"' : ''
    } />${caption ? `<p class="image-caption">${safeCaption}</p>` : ''}</div>\n`;
  }

  return (node.content || []).map(inlineToMarkdown).join('');
}

function blockToMarkdown(node: any, depth = 0): string {
  if (!node) return '';

  switch (node.type) {
    case 'doc':
      return (node.content || [])
        .map((child: any) => blockToMarkdown(child, depth))
        .join('');

    case 'paragraph':
      return `${inlineToMarkdown(node).trim()}\n\n`;

    case 'heading': {
      const level = node.attrs?.level || 1;
      return `${'#'.repeat(level)} ${inlineToMarkdown(node).trim()}\n\n`;
    }

    case 'bulletList':
      return (
        (node.content || [])
          .map((listItem: any) => {
            const content = blockToMarkdown(listItem, depth).trim();
            return `${'  '.repeat(depth)}- ${content}\n`;
          })
          .join('') + '\n'
      );

    case 'orderedList':
      return (
        (node.content || [])
          .map((listItem: any) => {
            const content = blockToMarkdown(listItem, depth).trim();
            return `${'  '.repeat(depth)}1. ${content}\n`;
          })
          .join('') + '\n'
      );

    case 'listItem':
      return (node.content || [])
        .map((child: any) => {
          if (child.type === 'paragraph') {
            return inlineToMarkdown(child);
          }

          if (child.type === 'bulletList' || child.type === 'orderedList') {
            return `\n${blockToMarkdown(child, depth + 1)}`;
          }

          return blockToMarkdown(child, depth);
        })
        .join('');

    case 'blockquote': {
      const inner = (node.content || [])
        .map((child: any) => blockToMarkdown(child, depth))
        .join('')
        .trim();

      return `${inner
        .split('\n')
        .map((line: string) => `> ${line}`)
        .join('\n')}\n\n`;
    }

    case 'codeBlock': {
      const code = (node.content || [])
        .map((child: any) => child.text || '')
        .join('');

      return `\`\`\`\n${code}\n\`\`\`\n\n`;
    }

    case 'horizontalRule':
      return `\n---\n\n`;

    default:
      return inlineToMarkdown(node);
  }
}

export function tiptapToMarkdown(json: any): string {
  if (!json) return '';
  return blockToMarkdown(json).replace(/\n{3,}/g, '\n\n').trim();
}
```

---

## `modern-book-editor/src/hooks/useAuth.tsx`

```tsx
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
} from 'react';
import {
  CurrentUser,
  getCurrentUser,
  login as apiLogin,
  logout as apiLogout,
  register as apiRegister,
} from '../lib/auth';

interface AuthContextValue {
  user: CurrentUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCurrentUser()
      .then((data) => setUser(data.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const data = await apiLogin(email, password);
    setUser(data.user);
  };

  const register = async (email: string, password: string) => {
    const data = await apiRegister(email, password);
    setUser(data.user);
  };

  const logout = async () => {
    await apiLogout();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);

  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }

  return ctx;
}
```

---

## `modern-book-editor/src/store/useBookStore.ts`

Replace your existing store with this updated version.

```ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { JSONContent } from '@tiptap/react';

export interface Chapter {
  id: string;
  title: string;
  content: JSONContent | null;
  pendingHtml?: string;
}

function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

interface BookStore {
  activeManuscriptId: string | null;
  chapters: Chapter[];
  activeChapterId: string;
  bookTitle: string;
  author: string;
  theme: 'light' | 'dark' | 'sepia';
  fontFamily: 'serif' | 'sans';
  fontSize: 'sm' | 'base' | 'lg' | 'xl';
  focusMode: boolean;
  sidebarOpen: boolean;
  searchQuery: string;
  previewMode: 'off' | 'split' | 'fullscreen';

  addChapter: () => void;
  deleteChapter: (id: string) => void;
  setActiveChapter: (id: string) => void;
  updateChapterContent: (id: string, content: JSONContent) => void;
  applyPendingHtml: (id: string, content: JSONContent) => void;
  importFromAI: (
    title: string,
    chapters: { title: string; htmlContent: string }[]
  ) => void;
  updateChapterTitle: (id: string, title: string) => void;
  setBookTitle: (title: string) => void;
  setAuthor: (author: string) => void;
  setTheme: (theme: 'light' | 'dark' | 'sepia') => void;
  setFontFamily: (fontFamily: 'serif' | 'sans') => void;
  setFontSize: (fontSize: 'sm' | 'base' | 'lg' | 'xl') => void;
  setFocusMode: (focusMode: boolean) => void;
  setSidebarOpen: (sidebarOpen: boolean) => void;
  setSearchQuery: (searchQuery: string) => void;
  setPreviewMode: (mode: 'off' | 'split' | 'fullscreen') => void;
  loadManuscript: (data: {
    id?: string;
    chapters: Chapter[];
    bookTitle: string;
    author: string;
    theme: string;
  }) => void;
}

export const useBookStore = create<BookStore>()(
  persist(
    (set) => ({
      activeManuscriptId: null,

      chapters: [
        {
          id: createId(),
          title: 'Chapter 1',
          content: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Start writing...' }],
              },
            ],
          },
        },
      ],

      activeChapterId: '',
      bookTitle: 'My Book',
      author: 'Author Name',
      theme: 'light',
      fontFamily: 'serif',
      fontSize: 'lg',
      focusMode: false,
      sidebarOpen: true,
      searchQuery: '',
      previewMode: 'off',

      addChapter: () =>
        set((state) => {
          const newId = createId();

          return {
            chapters: [
              ...state.chapters,
              {
                id: newId,
                title: `Chapter ${state.chapters.length + 1}`,
                content: null,
              },
            ],
            activeChapterId: newId,
          };
        }),

      deleteChapter: (id) =>
        set((state) => {
          if (state.chapters.length <= 1) return state;

          const filtered = state.chapters.filter((c) => c.id !== id);
          const newActive =
            state.activeChapterId === id ? filtered[0].id : state.activeChapterId;

          return {
            chapters: filtered,
            activeChapterId: newActive,
          };
        }),

      setActiveChapter: (id) => set({ activeChapterId: id }),

      updateChapterContent: (id, content) =>
        set((state) => ({
          chapters: state.chapters.map((c) =>
            c.id === id ? { ...c, content } : c
          ),
        })),

      applyPendingHtml: (id, content) =>
        set((state) => ({
          chapters: state.chapters.map((c) =>
            c.id === id ? { ...c, content, pendingHtml: undefined } : c
          ),
        })),

      importFromAI: (_title, chapters) => {
        const newChapters: Chapter[] = chapters.map((ch, index) => ({
          id: createId(),
          title: ch.title,
          content: null,
          pendingHtml: ch.htmlContent,
        }));

        return {
          chapters: newChapters,
          activeChapterId: newChapters[0]?.id || '',
          bookTitle: _title,
        };
      },

      updateChapterTitle: (id, title) =>
        set((state) => ({
          chapters: state.chapters.map((c) =>
            c.id === id ? { ...c, title } : c
          ),
        })),

      setBookTitle: (bookTitle) => set({ bookTitle }),
      setAuthor: (author) => set({ author }),
      setTheme: (theme) => set({ theme }),
      setFontFamily: (fontFamily) => set({ fontFamily }),
      setFontSize: (fontSize) => set({ fontSize }),
      setFocusMode: (focusMode) => set({ focusMode }),
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      setSearchQuery: (searchQuery) => set({ searchQuery }),
      setPreviewMode: (previewMode) => set({ previewMode }),

      loadManuscript: (data) =>
        set({
          activeManuscriptId: data.id || null,
          chapters: data.chapters,
          bookTitle: data.bookTitle,
          author: data.author,
          theme: data.theme as 'light' | 'dark' | 'sepia',
          activeChapterId: data.chapters[0]?.id || '',
        }),
    }),
    {
      name: 'modern-book-editor-storage',
      partialize: (state) => ({
        activeManuscriptId: state.activeManuscriptId,
        chapters: state.chapters,
        activeChapterId: state.activeChapterId,
        bookTitle: state.bookTitle,
        author: state.author,
        theme: state.theme,
        fontFamily: state.fontFamily,
        fontSize: state.fontSize,
        focusMode: state.focusMode,
        sidebarOpen: state.sidebarOpen,
      }),
    }
  )
);
```

---

## `modern-book-editor/src/hooks/useServerManuscript.ts`

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { marked } from 'marked';
import { apiJson } from '../lib/apiClient';
import { useBookStore } from '../store/useBookStore';

export function useServerManuscript(manuscriptId: string | undefined) {
  const loadManuscript = useBookStore((state) => state.loadManuscript);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const loadingRef = useRef(true);

  const reload = useCallback(async () => {
    if (!manuscriptId) return;

    loadingRef.current = true;
    setLoading(true);
    setError('');

    try {
      const { manuscript } = await apiJson(`/manuscripts/${manuscriptId}`);

      const chapters = manuscript.chapters.map((chapter: any) => ({
        id: chapter.id,
        title: chapter.title,
        content: chapter.content,
        pendingHtml:
          !chapter.content && chapter.markdown
            ? String(marked.parse(chapter.markdown))
            : undefined,
      }));

      loadManuscript({
        id: manuscript.id,
        chapters,
        bookTitle: manuscript.title,
        author: manuscript.author,
        theme: manuscript.theme,
      });
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Failed to load manuscript');
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [manuscriptId, loadManuscript]);

  useEffect(() => {
    reload();
  }, [reload]);

  return {
    loading,
    error,
    reload,
    loadingRef,
  };
}
```

---

## `modern-book-editor/src/hooks/useServerSync.ts`

```ts
import { useEffect, useMemo } from 'react';
import { useBookStore } from '../store/useBookStore';
import { apiJson } from '../lib/apiClient';
import { debounce } from '../utils/debounce';
import { tiptapToMarkdown } from '../lib/tiptapToMarkdown';

export function useServerSync(
  manuscriptId: string | undefined,
  loadingRef: React.MutableRefObject<boolean>
) {
  const chapters = useBookStore((state) => state.chapters);
  const bookTitle = useBookStore((state) => state.bookTitle);
  const author = useBookStore((state) => state.author);
  const theme = useBookStore((state) => state.theme);
  const fontFamily = useBookStore((state) => state.fontFamily);
  const fontSize = useBookStore((state) => state.fontSize);

  const debouncedSave = useMemo(
    () =>
      debounce(async (id: string) => {
        if (loadingRef.current) return;

        const state = useBookStore.getState();

        await apiJson(`/manuscripts/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            title: state.bookTitle,
            author: state.author,
            theme: state.theme,
            fontFamily: state.fontFamily,
            fontSize: state.fontSize,
            chapters: state.chapters.map((chapter, index) => ({
              id: chapter.id,
              position: index,
              title: chapter.title,
              content: chapter.content,
              markdown: chapter.content
                ? tiptapToMarkdown(chapter.content)
                : undefined,
            })),
          }),
        });
      }, 1500),
    [loadingRef]
  );

  useEffect(() => {
    if (!manuscriptId || loadingRef.current) return;
    debouncedSave(manuscriptId);
  }, [
    manuscriptId,
    chapters,
    bookTitle,
    author,
    theme,
    fontFamily,
    fontSize,
    debouncedSave,
    loadingRef,
  ]);
}
```

---

## `modern-book-editor/src/pages/LoginPage.tsx`

```tsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
      navigate('/');
    } catch (err: any) {
      setError(err?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-8 space-y-4"
      >
        <h1 className="text-2xl font-bold">Sign in</h1>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2"
          required
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2"
          required
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-blue-600 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Signing in...' : 'Sign in'}
        </button>

        <button
          type="button"
          onClick={() => navigate('/register')}
          className="w-full text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
        >
          Need an account? Register
        </button>
      </form>
    </div>
  );
};
```

---

## `modern-book-editor/src/pages/RegisterPage.tsx`

```tsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const { register } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await register(email, password);
      navigate('/');
    } catch (err: any) {
      setError(err?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-8 space-y-4"
      >
        <h1 className="text-2xl font-bold">Create account</h1>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2"
          required
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2"
          minLength={8}
          required
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-blue-600 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Creating account...' : 'Register'}
        </button>

        <button
          type="button"
          onClick={() => navigate('/login')}
          className="w-full text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
        >
          Already have an account? Sign in
        </button>
      </form>
    </div>
  );
};
```

---

## `modern-book-editor/src/main.tsx`

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './App.tsx';
import { AuthProvider } from './hooks/useAuth.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);
```

---

## `modern-book-editor/src/App.tsx`

```tsx
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Dashboard } from './components/Dashboard';
import { EditorLayout } from './components/EditorLayout';
import { SettingsPage } from './components/SettingsPage';
import { ExportPage } from './components/ExportPage';
import { CoverDesigner } from './components/CoverDesigner';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { useBookStore } from './store/useBookStore';
import { useAuth } from './hooks/useAuth';

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function App() {
  const { theme } = useBookStore();

  const themeClasses = {
    light: 'bg-zinc-50 text-zinc-900',
    dark: 'dark bg-zinc-900 text-zinc-100',
    sepia: 'bg-[#fdf9f0] text-amber-950',
  };

  return (
    <div
      className={`h-screen w-screen overflow-hidden font-sans transition-colors duration-300 ${themeClasses[theme]}`}
    >
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        <Route
          path="/"
          element={
            <Protected>
              <Dashboard />
            </Protected>
          }
        />

        <Route
          path="/editor/:manuscriptId?"
          element={
            <Protected>
              <EditorLayout />
            </Protected>
          }
        />

        <Route
          path="/settings"
          element={
            <Protected>
              <SettingsPage />
            </Protected>
          }
        />

        <Route
          path="/export"
          element={
            <Protected>
              <ExportPage />
            </Protected>
          }
        />

        <Route
          path="/cover"
          element={
            <Protected>
              <CoverDesigner />
            </Protected>
          }
        />
      </Routes>
    </div>
  );
}

export default App;
```

---

## `modern-book-editor/src/components/Dashboard.tsx`

Replace with server-backed dashboard.

```tsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiJson } from '../lib/apiClient';
import { useAuth } from '../hooks/useAuth';
import {
  BookOpen,
  Plus,
  Trash2,
  Sparkles,
  FileText,
  Settings,
  Download,
  PenLine,
  Clock,
  LogOut,
} from 'lucide-react';

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const [manuscripts, setManuscripts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    setLoading(true);

    try {
      const data = await apiJson('/manuscripts');
      setManuscripts(data.manuscripts || []);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleNewProject = async () => {
    const { manuscript } = await apiJson('/manuscripts', {
      method: 'POST',
      body: JSON.stringify({ title: 'Untitled Book' }),
    });

    navigate(`/editor/${manuscript.id}`);
  };

  const handleAIProject = async () => {
    const { manuscript } = await apiJson('/manuscripts', {
      method: 'POST',
      body: JSON.stringify({ title: 'AI Formatted Book' }),
    });

    navigate(`/editor/${manuscript.id}?ai=1`);
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();

    if (!confirm('Delete this manuscript permanently?')) return;

    await apiJson(`/manuscripts/${id}`, {
      method: 'DELETE',
    });

    await loadProjects();
  };

  return (
    <div className="flex h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-sans">
      <aside className="w-64 bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 flex flex-col p-6">
        <div className="flex items-center gap-2 mb-10">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-xl font-bold">Mashimi</h1>
        </div>

        <nav className="flex flex-col gap-2 flex-1">
          <button
            onClick={handleNewProject}
            className="flex items-center gap-3 px-4 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" /> New Project
          </button>

          <button
            onClick={() => navigate('/settings')}
            className="flex items-center gap-3 px-4 py-2.5 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <Settings className="w-4 h-4" /> Typography
          </button>

          <button
            onClick={async () => {
              await logout();
              navigate('/login');
            }}
            className="flex items-center gap-3 px-4 py-2.5 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" /> Logout
          </button>
        </nav>

        <div className="mt-auto pt-6 border-t border-zinc-200 dark:border-zinc-800">
          <p className="text-xs text-zinc-400">Signed in as</p>
          <p className="text-sm font-medium">{user?.email}</p>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <header className="p-8 border-b border-zinc-200 dark:border-zinc-800">
          <h2 className="text-3xl font-bold mb-2">Welcome back</h2>
          <p className="text-zinc-500 dark:text-zinc-400">
            Start a new manuscript, or let AI format your raw text into a print-ready book.
          </p>
        </header>

        <div className="p-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div
            onClick={handleNewProject}
            className="cursor-pointer group bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 hover:border-blue-500 transition-all"
          >
            <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center mb-4">
              <PenLine className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <h3 className="font-bold text-lg mb-1">Quick Write</h3>
            <p className="text-sm text-zinc-500">
              Jump straight into a blank document and start writing.
            </p>
          </div>

          <div
            onClick={handleAIProject}
            className="cursor-pointer group bg-gradient-to-br from-purple-600 to-blue-600 text-white rounded-xl p-6 hover:opacity-90 transition-all"
          >
            <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center mb-4">
              <Sparkles className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-lg mb-1">AI Book Formatter</h3>
            <p className="text-sm text-white/80">
              Upload a Word doc or paste raw text. AI structures it into chapters.
            </p>
          </div>

          <div
            onClick={() => navigate('/export')}
            className="cursor-pointer group bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 hover:border-emerald-500 transition-all"
          >
            <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg flex items-center justify-center mb-4">
              <Download className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h3 className="font-bold text-lg mb-1">Export</h3>
            <p className="text-sm text-zinc-500">
              Generate print-ready PDF or DOCX files.
            </p>
          </div>
        </div>

        <div className="px-8 pb-12">
          <h3 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4" /> Recent Projects
          </h3>

          {loading ? (
            <div className="flex justify-center py-10">
              <div className="animate-spin h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full" />
            </div>
          ) : manuscripts.length === 0 ? (
            <div className="text-center py-10 bg-zinc-100 dark:bg-zinc-900/50 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700">
              <p className="text-zinc-500 mb-4">No projects yet.</p>
              <button
                onClick={handleNewProject}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
              >
                Create Your First Book
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {manuscripts.map((m) => (
                <div
                  key={m.id}
                  onClick={() => navigate(`/editor/${m.id}`)}
                  className="relative bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 hover:shadow-lg transition-all cursor-pointer group"
                >
                  <button
                    onClick={(e) => handleDelete(e, m.id)}
                    className="absolute top-3 right-3 p-1.5 opacity-0 group-hover:opacity-100 hover:bg-red-50 text-red-500 rounded transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>

                  <div className="w-8 h-10 bg-gradient-to-br from-zinc-700 to-zinc-900 rounded mb-4 flex items-center justify-center text-white text-[10px] font-serif">
                    {m.title.slice(0, 2).toUpperCase()}
                  </div>

                  <h4 className="font-semibold truncate pr-6">{m.title}</h4>

                  <div className="flex items-center gap-3 mt-2 text-xs text-zinc-400">
                    <span className="flex items-center gap-1">
                      <FileText className="w-3 h-3" /> {m.chapters.length} Ch
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
```

---

## `modern-book-editor/src/components/EditorLayout.tsx`

Replace with server-backed layout.

```tsx
import React from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { BookEditor } from './BookEditor';
import { PreviewPanel } from './PreviewPanel';
import { useBookStore } from '../store/useBookStore';
import { useServerManuscript } from '../hooks/useServerManuscript';
import { useServerSync } from '../hooks/useServerSync';

export const EditorLayout: React.FC = () => {
  const { manuscriptId } = useParams();
  const { focusMode, sidebarOpen, previewMode } = useBookStore();

  const { loading, error, reload, loadingRef } =
    useServerManuscript(manuscriptId);

  useServerSync(manuscriptId, loadingRef);

  if (!manuscriptId) {
    return <Navigate to="/" replace />;
  }

  if (loading) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full w-full flex items-center justify-center text-red-600">
        {error}
      </div>
    );
  }

  const showPreview = previewMode !== 'off';
  const isSplit = previewMode === 'split';

  return (
    <div className="flex h-full w-full">
      {!focusMode && sidebarOpen && (
        <Sidebar manuscriptId={manuscriptId} onImported={reload} />
      )}

      <div className="flex-1 flex h-full overflow-hidden">
        <div
          className={`${
            isSplit && showPreview ? 'w-1/2' : 'w-full'
          } h-full overflow-hidden transition-all`}
        >
          <BookEditor manuscriptId={manuscriptId} />
        </div>

        {showPreview && (
          <div
            className={`${
              isSplit
                ? 'w-1/2 border-l border-zinc-200 dark:border-zinc-800'
                : 'fixed inset-0 z-40 bg-black/50 backdrop-blur-sm'
            } h-full`}
          >
            {previewMode === 'fullscreen' && (
              <button
                onClick={() =>
                  useBookStore.getState().setPreviewMode('off')
                }
                className="absolute top-4 right-4 z-50 px-4 py-2 bg-zinc-900 text-white rounded-lg text-sm font-medium shadow-lg hover:bg-zinc-800"
              >
                Close Preview
              </button>
            )}

            <div className={`h-full ${previewMode === 'fullscreen' ? 'p-8' : ''}`}>
              <PreviewPanel />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
```

---

## `modern-book-editor/src/components/Sidebar.tsx`

Replace with this server-aware version.

```tsx
import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useBookStore } from '../store/useBookStore';
import { AIFormatModal } from './AIFormatModal';
import { countWords } from '../utils/wordCounter';
import {
  BookOpen,
  Plus,
  Trash2,
  Sparkles,
  Download,
  PanelLeftClose,
  Search,
  Image as ImageIcon,
  Columns3,
  Maximize2,
  EyeOff,
} from 'lucide-react';

interface SidebarProps {
  manuscriptId?: string;
  onImported?: () => Promise<void>;
}

export const Sidebar: React.FC<SidebarProps> = ({
  manuscriptId,
  onImported,
}) => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isAIOpen, setAIOpen] = useState(false);

  const {
    chapters,
    activeChapterId,
    setActiveChapter,
    addChapter,
    deleteChapter,
    updateChapterTitle,
    bookTitle,
    setBookTitle,
    author,
    setAuthor,
    searchQuery,
    setSearchQuery,
    setSidebarOpen,
    previewMode,
    setPreviewMode,
  } = useBookStore();

  useEffect(() => {
    if (searchParams.get('ai') === '1') {
      setAIOpen(true);
      searchParams.delete('ai');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const filteredChapters = chapters.filter((chapter) =>
    chapter.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const cyclePreview = () => {
    if (previewMode === 'off') setPreviewMode('split');
    else if (previewMode === 'split') setPreviewMode('fullscreen');
    else setPreviewMode('off');
  };

  const previewIcon =
    previewMode === 'off' ? (
      <EyeOff className="w-4 h-4" />
    ) : previewMode === 'split' ? (
      <Columns3 className="w-4 h-4" />
    ) : (
      <Maximize2 className="w-4 h-4" />
    );

  return (
    <aside className="w-80 h-full bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 flex flex-col">
      <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 font-bold text-zinc-900 dark:text-zinc-100"
          >
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-white" />
            </div>
            Mashimi
          </button>

          <button
            onClick={() => setSidebarOpen(false)}
            className="p-2 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            title="Hide sidebar"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-4 space-y-2">
          <input
            value={bookTitle}
            onChange={(e) => setBookTitle(e.target.value)}
            placeholder="Book title"
            className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm font-semibold"
          />
          <input
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="Author"
            className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="p-3 border-b border-zinc-200 dark:border-zinc-800 grid grid-cols-2 gap-2">
        <button
          onClick={() => setAIOpen(true)}
          disabled={!manuscriptId}
          className="col-span-2 flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          <Sparkles className="w-4 h-4" />
          AI Format
        </button>

        <button
          onClick={() => navigate('/export')}
          className="flex items-center justify-center gap-2 rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          <Download className="w-4 h-4" />
          Export
        </button>

        <button
          onClick={() => navigate('/cover')}
          className="flex items-center justify-center gap-2 rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          <ImageIcon className="w-4 h-4" />
          Cover
        </button>

        <button
          onClick={addChapter}
          className="flex items-center justify-center gap-2 rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          <Plus className="w-4 h-4" />
          Chapter
        </button>

        <button
          onClick={cyclePreview}
          className="flex items-center justify-center gap-2 rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
          title={`Preview mode: ${previewMode}`}
        >
          {previewIcon}
          Preview
        </button>
      </div>

      <div className="p-3 border-b border-zinc-200 dark:border-zinc-800">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search chapters"
            className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent py-2 pl-9 pr-3 text-sm"
          />
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-2 space-y-1">
        {filteredChapters.length === 0 && (
          <p className="px-3 py-6 text-center text-sm text-zinc-500">
            No chapters found.
          </p>
        )}

        {filteredChapters.map((chapter) => {
          const isActive = chapter.id === activeChapterId;
          const words = countWords(chapter.content);

          return (
            <div
              key={chapter.id}
              onClick={() => setActiveChapter(chapter.id)}
              className={`group rounded-lg border px-3 py-2 cursor-pointer transition-colors ${
                isActive
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <input
                  value={chapter.title}
                  onClick={(e) => e.stopPropagation()}
                  onFocus={() => setActiveChapter(chapter.id)}
                  onChange={(e) =>
                    updateChapterTitle(chapter.id, e.target.value)
                  }
                  className="w-full bg-transparent text-sm font-medium focus:outline-none"
                />

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (chapters.length <= 1) return;
                    if (confirm('Delete this chapter?')) {
                      deleteChapter(chapter.id);
                    }
                  }}
                  disabled={chapters.length <= 1}
                  className="opacity-0 group-hover:opacity-100 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded p-1 disabled:opacity-20"
                  title="Delete chapter"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <p className="mt-1 text-xs text-zinc-500">
                {words.toLocaleString()} words
              </p>
            </div>
          );
        })}
      </nav>

      <div className="p-3 border-t border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500">
        {chapters.length} chapters
      </div>

      <AIFormatModal
        isOpen={isAIOpen}
        onClose={() => setAIOpen(false)}
        manuscriptId={manuscriptId}
        onImported={onImported}
      />
    </aside>
  );
};
```

---

## `modern-book-editor/src/components/AIFormatModal.tsx`

Replace with job-queue version.

```tsx
import React, { useRef, useState } from 'react';
import { apiJson } from '../lib/apiClient';
import { waitForJob } from '../lib/jobs';
import { FileText, Loader2, Upload, ClipboardPaste } from 'lucide-react';

interface AIFormatModalProps {
  isOpen: boolean;
  onClose: () => void;
  manuscriptId?: string;
  onImported?: () => Promise<void>;
}

export const AIFormatModal: React.FC<AIFormatModalProps> = ({
  isOpen,
  onClose,
  manuscriptId,
  onImported,
}) => {
  const [mode, setMode] = useState<'upload' | 'paste'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [rawText, setRawText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const resetState = () => {
    setFile(null);
    setRawText('');
    setError('');
    setProgress(0);
    setStatusText('');
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const extractTextFromFile = async (selectedFile: File): Promise<string> => {
    const lowerName = selectedFile.name.toLowerCase();

    if (lowerName.endsWith('.docx')) {
      setStatusText('Parsing Word document...');

      const formData = new FormData();
      formData.append('document', selectedFile);

      const parseRes = await fetch('/api/documents/parse', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      if (!parseRes.ok) {
        const err = await parseRes.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to parse document');
      }

      const parseData = await parseRes.json();
      return parseData.text || '';
    }

    if (
      lowerName.endsWith('.txt') ||
      lowerName.endsWith('.md') ||
      lowerName.endsWith('.markdown')
    ) {
      setStatusText('Reading text file...');
      return await selectedFile.text();
    }

    throw new Error('Unsupported file type. Use .docx, .txt, or .md');
  };

  const handleFormat = async () => {
    setError('');

    try {
      if (!manuscriptId) {
        throw new Error('Open a manuscript before using AI formatting.');
      }

      let text = '';

      if (mode === 'paste') {
        text = rawText.trim();
      } else {
        if (!file) {
          throw new Error('Please choose a file first.');
        }

        text = (await extractTextFromFile(file)).trim();
      }

      if (text.length < 100) {
        throw new Error(
          'Content is too short. Please provide at least 100 characters.'
        );
      }

      setIsProcessing(true);
      setStatusText('Starting AI formatting job...');

      const { jobId } = await apiJson('/jobs/format', {
        method: 'POST',
        body: JSON.stringify({
          manuscriptId,
          rawText: text,
        }),
      });

      await waitForJob(jobId, (jobProgress, meta) => {
        setProgress(jobProgress);
        setStatusText(
          meta
            ? `Processing chunk ${meta.current || 0} of ${meta.total || 0}`
            : 'AI is formatting your book...'
        );
      });

      setStatusText('Importing formatted manuscript...');

      if (onImported) {
        await onImported();
      }

      handleClose();
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Failed to format document');
    } finally {
      setIsProcessing(false);
      setStatusText('');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-2xl w-full max-w-2xl p-6 flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-800 dark:text-zinc-100">
            ✨ AI Book Formatter
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-500 hover:text-gray-800 dark:hover:text-zinc-200 text-2xl"
          >
            &times;
          </button>
        </div>

        <p className="text-sm text-gray-600 dark:text-zinc-400 mb-4">
          Upload a Word document, plain text file, or paste raw text. The AI will
          structure it into chapters and update this manuscript.
        </p>

        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setMode('upload')}
            className={`px-4 py-2 rounded-lg text-sm font-medium border ${
              mode === 'upload'
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                : 'border-zinc-300 dark:border-zinc-700'
            }`}
          >
            <Upload className="w-4 h-4 inline mr-2" />
            Upload
          </button>

          <button
            onClick={() => setMode('paste')}
            className={`px-4 py-2 rounded-lg text-sm font-medium border ${
              mode === 'paste'
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                : 'border-zinc-300 dark:border-zinc-700'
            }`}
          >
            <ClipboardPaste className="w-4 h-4 inline mr-2" />
            Paste Text
          </button>
        </div>

        {mode === 'upload' ? (
          <div
            onClick={() => !isProcessing && fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              file
                ? 'border-green-400 bg-green-50 dark:bg-green-900/10'
                : 'border-gray-300 dark:border-zinc-700 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/10'
            } ${isProcessing ? 'pointer-events-none opacity-60' : ''}`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".docx,.txt,.md,.markdown"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="hidden"
              disabled={isProcessing}
            />

            {file ? (
              <div className="flex items-center justify-center gap-3">
                <FileText className="w-8 h-8 text-green-600" />
                <div className="text-left">
                  <p className="font-medium text-gray-800 dark:text-zinc-100">
                    {file.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {(file.size / 1024).toFixed(1)} KB
                  </p>
                </div>
              </div>
            ) : (
              <div>
                <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-600 dark:text-zinc-300 font-medium">
                  Click to select a document
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  .docx, .txt, or .md files only
                </p>
              </div>
            )}
          </div>
        ) : (
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder="Paste your raw book text here..."
            className="w-full h-56 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent p-3 text-sm"
            disabled={isProcessing}
          />
        )}

        {error && (
          <div className="mt-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {isProcessing && (
          <div className="mt-4 space-y-2">
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-zinc-300">
              <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
              <span>{statusText}</span>
            </div>

            <div className="w-full bg-gray-200 dark:bg-zinc-700 rounded-full h-2 overflow-hidden">
              <div
                className="bg-gradient-to-r from-blue-500 to-purple-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-md"
            disabled={isProcessing}
          >
            Cancel
          </button>

          <button
            onClick={handleFormat}
            className="px-6 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-md hover:opacity-90 flex items-center gap-2 disabled:opacity-50"
            disabled={
              isProcessing || (mode === 'upload' ? !file : !rawText.trim())
            }
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Processing...
              </>
            ) : (
              '✨ Format My Book'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
```

---

## `modern-book-editor/src/components/ImageUploadModal.tsx`

Replace with S3 presigned upload version.

```tsx
import React, { useState, useRef } from 'react';
import { uploadImage } from '../lib/uploads';

interface ImageUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  editor: any;
}

export const ImageUploadModal: React.FC<ImageUploadModalProps> = ({
  isOpen,
  onClose,
  editor,
}) => {
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [isBleed, setIsBleed] = useState(false);
  const [dpiWarning, setDpiWarning] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const reset = () => {
    setPreview(null);
    setCaption('');
    setIsBleed(false);
    setDpiWarning('');
    setError('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError('');

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('Image is too large. Maximum size is 10 MB.');
      return;
    }

    setUploading(true);

    try {
      const publicUrl = await uploadImage(file);
      setPreview(publicUrl);

      const img = new Image();
      img.onload = () => {
        const minWidth = isBleed ? 1950 : 1500;
        setDpiWarning(
          img.width < minWidth
            ? `⚠️ Image is ${img.width}px wide. For print quality aim for ${minWidth}px+ at 300 DPI.`
            : ''
        );
      };
      img.src = publicUrl;
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Image upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const handleInsert = () => {
    if (!preview || !editor) return;

    editor
      .chain()
      .focus()
      .insertContent({
        type: 'image',
        attrs: {
          src: preview,
          alt: caption || 'Book image',
          caption: caption || null,
          class: isBleed ? 'full-bleed' : null,
        },
      })
      .run();

    handleClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-2xl w-full max-w-2xl p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-800 dark:text-zinc-100">
            🖼️ Insert Image
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-500 hover:text-gray-800 dark:hover:text-zinc-200 text-2xl"
          >
            &times;
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">
              Image File PNG / JPG / WebP
            </label>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleFileSelect}
              disabled={uploading}
              className="w-full border border-gray-300 dark:border-zinc-700 rounded p-2 text-sm bg-transparent"
            />
          </div>

          {uploading && (
            <p className="text-sm text-blue-600 dark:text-blue-400 text-center">
              Uploading…
            </p>
          )}

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400 text-center">
              {error}
            </p>
          )}

          {preview && (
            <div className="border border-gray-200 dark:border-zinc-700 rounded p-4 bg-gray-50 dark:bg-zinc-800">
              <img
                src={preview}
                alt="Preview"
                className="max-h-64 mx-auto object-contain"
              />
              {dpiWarning && (
                <p className="text-yellow-700 dark:text-yellow-400 text-sm mt-2 text-center">
                  {dpiWarning}
                </p>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">
              Caption optional
            </label>
            <input
              type="text"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Figure 1: Description…"
              className="w-full border border-gray-300 dark:border-zinc-700 rounded p-2 text-sm bg-transparent"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="bleed"
              checked={isBleed}
              onChange={(e) => setIsBleed(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="bleed" className="text-sm text-gray-700 dark:text-zinc-300">
              Full Bleed
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-md"
          >
            Cancel
          </button>
          <button
            onClick={handleInsert}
            disabled={!preview || uploading}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-300"
          >
            Insert Image
          </button>
        </div>
      </div>
    </div>
  );
};
```

---

## `modern-book-editor/src/components/ExportPage.tsx`

Replace with job-based PDF/DOCX export.

```tsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBookStore } from '../store/useBookStore';
import { apiJson } from '../lib/apiClient';
import { waitForJob } from '../lib/jobs';
import { ArrowLeft, Download, FileText } from 'lucide-react';

export const ExportPage: React.FC = () => {
  const navigate = useNavigate();

  const activeManuscriptId = useBookStore(
    (state) => state.activeManuscriptId
  );
  const chapters = useBookStore((state) => state.chapters);
  const bookTitle = useBookStore((state) => state.bookTitle);

  const [exporting, setExporting] = useState(false);
  const [format, setFormat] = useState<'pdf' | 'docx'>('pdf');
  const [error, setError] = useState('');

  const handleExport = async () => {
    setError('');

    if (!activeManuscriptId) {
      setError('Open a manuscript before exporting.');
      return;
    }

    setExporting(true);

    try {
      const { jobId } = await apiJson(`/jobs/${format}`, {
        method: 'POST',
        body: JSON.stringify({
          manuscriptId: activeManuscriptId,
          options: {},
        }),
      });

      const job = await waitForJob(jobId);

      const downloadUrl = job.result?.downloadUrl;

      if (!downloadUrl) {
        throw new Error('Export completed but no download URL was returned.');
      }

      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `${bookTitle || 'manuscript'}.${format}`;
      a.click();
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-8 overflow-y-auto">
      <div className="max-w-3xl mx-auto">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-zinc-600 hover:text-zinc-900 mb-6"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </button>

        <h1 className="text-3xl font-bold font-serif text-zinc-900 dark:text-zinc-100 mb-8">
          Export Manuscript
        </h1>

        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 space-y-6">
          <div>
            <h2 className="font-semibold text-zinc-800 dark:text-zinc-200 mb-2">
              Summary
            </h2>
            <p className="text-sm text-zinc-500">
              {chapters.length} chapters
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-zinc-800 dark:text-zinc-200 mb-2">
              Format
            </h2>
            <div className="flex gap-3">
              {(['pdf', 'docx'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFormat(f)}
                  className={`px-4 py-2 rounded-lg border text-sm ${
                    format === f
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700'
                      : 'border-zinc-300 dark:border-zinc-700'
                  }`}
                >
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          <button
            onClick={handleExport}
            disabled={exporting || !activeManuscriptId}
            className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-blue-300 flex items-center justify-center gap-2"
          >
            {exporting ? (
              <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            {exporting ? 'Exporting...' : `Export as ${format.toUpperCase()}`}
          </button>
        </div>
      </div>
    </div>
  );
};
```

---

# 4. Typesetting

Replace:

```txt
typesetting/typeset.py
```

```python
#!/usr/bin/env python3
"""typesetting/typeset.py — Python typesetting engine."""

import sys
import json
import re
import html
from pathlib import Path
from io import BytesIO

try:
    import markdown
    from weasyprint import HTML
except ImportError as exc:
    sys.stderr.write(
        f"Missing Python dependency: {exc}\n"
        "Run: pip install weasyprint markdown\n"
    )
    sys.exit(1)


SCRIPT_DIR = Path(__file__).resolve().parent
CSS_PATH = SCRIPT_DIR / "book.css"


def slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[-\s]+", "-", text)
    return text[:80]


def strip_duplicate_title(content: str, title: str) -> str:
    lines = content.splitlines()

    if not lines:
        return content

    first_line = lines[0].strip()

    if first_line.startswith("# "):
        first_title = first_line[2:].strip().lower()
        if first_title == title.strip().lower():
            return "\n".join(lines[1:]).strip()

    return content


def generate_pdf(json_data: dict) -> None:
    metadata = json_data.get("metadata", {})
    chapters = json_data.get("chapters", [])

    if not chapters:
        raise ValueError("No chapters provided")

    title = html.escape(metadata.get("title", "Untitled"))
    author = html.escape(metadata.get("author", "Anonymous"))

    html_body = f"""
<section class="frontmatter" id="titlepage">
  <div style="text-align: center; margin-top: 4in; page-break-before: right;">
    <h1 style="font-size: 32pt; border: none; margin: 0; page-break-before: auto;">{title}</h1>
    <p style="font-size: 16pt; margin-top: 1in; text-indent: 0;">{author}</p>
  </div>
</section>
"""

    toc_items = ""

    for index, chapter in enumerate(chapters):
        chapter_title = html.escape(chapter.get("title", f"Chapter {index + 1}"))
        chapter_id = slugify(chapter_title)

        toc_items += f"""
<li>
  <a href="#{chapter_id}">
    <span class="toc-title">{chapter_title}</span>
    <span class="toc-dots"></span>
  </a>
</li>
"""

    html_body += f"""
<nav id="toc" class="frontmatter">
  <h1 style="page-break-before: right; margin-top: 2in; text-align: center;">Contents</h1>
  <ul style="list-style: none; padding: 0; margin-top: 1in;">
    {toc_items}
  </ul>
</nav>
"""

    html_body += '<section class="bodymatter">'

    for index, chapter in enumerate(chapters):
        chapter_title_raw = chapter.get("title", f"Chapter {index + 1}")
        chapter_title = html.escape(chapter_title_raw)
        chapter_id = slugify(chapter_title_raw)

        content_md = chapter.get("content", "")
        content_md = strip_duplicate_title(content_md, chapter_title_raw)

        content_html = markdown.markdown(
            content_md,
            extensions=[
                "tables",
                "fenced_code",
                "md_in_html",
                "sane_lists",
                "attr_list",
            ],
        )

        html_body += f"""
<h1 id="{chapter_id}" class="chapter-title">{chapter_title}</h1>
{content_html}
"""

    html_body += "</section>"

    css_content = ""

    if CSS_PATH.exists():
        with open(CSS_PATH, "r", encoding="utf-8") as css_file:
            css_content = css_file.read()
    else:
        sys.stderr.write(f"Warning: CSS file not found at {CSS_PATH}\n")

    toc_css = """
#toc a[href]::after {
  content: target-counter(attr(href url), page);
  margin-left: auto;
  padding-left: 0.3em;
}

#toc a {
  display: flex;
  align-items: baseline;
  text-decoration: none;
  color: #000;
}

#toc a .toc-dots {
  border-bottom: 1px dotted #555;
  flex: 1 1 auto;
  margin: 0 0.3em;
  min-width: 1em;
  position: relative;
  top: -2pt;
}
"""

    full_html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<style>
{css_content}
{toc_css}
</style>
</head>
<body>
{html_body}
</body>
</html>
"""

    buffer = BytesIO()

    HTML(string=full_html, base_url=str(SCRIPT_DIR)).write_pdf(
        buffer,
        presentational_hints=True,
    )

    sys.stdout.buffer.write(buffer.getvalue())


if __name__ == "__main__":
    try:
        raw = sys.stdin.read()
        data = json.loads(raw)
        generate_pdf(data)
    except Exception as exc:
        sys.stderr.write(f"Typesetting failed: {exc}\n")
        sys.exit(1)
```

---

# 5. Frontend Docker

Create:

```txt
modern-book-editor/Dockerfile
```

```dockerfile
FROM node:22-alpine AS build

WORKDIR /app

COPY modern-book-editor/package*.json ./
RUN npm install

COPY modern-book-editor/ ./

RUN npm run build

FROM nginx:alpine

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

---

## `docker/nginx.conf`

```nginx
server {
  listen 80;
  server_name _;

  root /usr/share/nginx/html;
  index index.html;

  client_max_body_size 25m;

  location /api/ {
    proxy_pass http://api:3001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location / {
    try_files $uri $uri/ /index.html;
  }
}
```

---

# 6. Run Everything

## Option A: Docker

From the repository root:

```bash
cp .env.example .env
```

Edit `.env`:

```env
OPENAI_API_KEY=YOUR_NEW_ROTATED_DEEPSEEK_KEY
```

Then:

```bash
docker compose up --build
```

Services:

```txt
Frontend:  http://localhost
API:       http://localhost:3001
MinIO:     http://localhost:9001
Postgres:  localhost:5432
Redis:     localhost:6379
```

Seed admin:

```bash
docker compose exec api npm run seed:admin
```

---

## Option B: Local Development

### Backend

```bash
cd server
cp .env.example .env
npm install
npx prisma migrate dev
npm run seed:admin
npm run dev
```

In another terminal:

```bash
cd server
npm run worker:dev
```

### Frontend

```bash
cd modern-book-editor
cp .env.example .env
npm install
npm run dev
```

Frontend:

```txt
http://localhost:5173
```

API:

```txt
http://localhost:3001
```

---

# 7. Important API Key Handling

Do **not** commit this:

```env
OPENAI_API_KEY=sk-...
```

Instead:

1. Revoke the key you pasted.
2. Create a new DeepSeek key.
3. Put the new key only in:

```txt
server/.env
```

or root `.env` if using Docker.

Example:

```env
OPENAI_API_KEY=YOUR_NEW_KEY_HERE
```

---

# 8. What This Updated Codebase Now Includes

## User accounts

- Register
- Login
- Logout
- Refresh tokens
- HttpOnly cookies
- Admin role

## Server-side manuscript storage

- PostgreSQL
- Prisma ORM
- Manuscript ownership
- Chapter persistence
- Server autosync

## Cloud file storage

- S3-compatible presigned uploads
- Works with:
  - MinIO locally
  - AWS S3
  - Cloudflare R2
  - DigitalOcean Spaces

## Background jobs

- AI formatting queue
- PDF generation queue
- DOCX export queue
- Redis + BullMQ

## Automated tests

- Backend API tests with Vitest + Supertest

## Docker deployment

- Postgres
- Redis
- MinIO
- API
- Worker
- Frontend
- Nginx

## PDF font embedding

- Ready for OFL fonts in `typesetting/fonts/`
- CSS `@font-face` support

## PDF/X

- Optional Ghostscript PDF/X conversion
- Controlled by:

```env
PDFX_ENABLED=true
PDFX_PROFILE_PATH=/path/to/profile.icc
```

## DOCX export

- Pandoc-based DOCX generation
- Background job
- Stored in S3/MinIO

## Admin monitoring and usage limits

- Admin routes
- Usage events
- Daily quotas
- Prometheus metrics endpoint

---

# 9. Remaining Production Recommendations

Before taking real payments or accepting real users, add:

1. Email verification
2. Password reset
3. Stripe billing
4. Admin dashboard UI
5. Sentry error tracking
6. Log aggregation
7. Database backups
8. S3 lifecycle policies
9. Rate limiting per user
10. PDF/X vendor validation with a print vendor sample upload

---

 

```txt
BookEditor.tsx
PreviewPanel.tsx
SettingsPage.tsx
CoverDesigner.tsx
tailwind.config.js
index.css
```

so the entire frontend is fully replaced and consistent with this new backend.

Absolutely. Below is the **next full frontend bundle** to make the frontend fully consistent with the new backend.

This replaces/generates:

```txt
modern-book-editor/tailwind.config.js
modern-book-editor/src/index.css
modern-book-editor/src/components/BookEditor.tsx
modern-book-editor/src/components/PreviewPanel.tsx
modern-book-editor/src/components/SettingsPage.tsx
modern-book-editor/src/components/CoverDesigner.tsx
```

These files are compatible with the backend and frontend auth/storage/job system generated earlier.

> Security reminder: do **not** put your DeepSeek API key in the frontend.  
> Also, the key you pasted earlier should be considered compromised. Rotate it and put the new key only in `server/.env` or root `.env`.

---

# 1. `modern-book-editor/tailwind.config.js`

Replace with:

```js
import typography from '@tailwindcss/typography';

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        serif: ['Lora', 'Playfair Display', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [typography],
};
```

---

# 2. `modern-book-editor/src/index.css`

Replace with:

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:wght@400;700&family=Lora:ital,wght@0,400;0,500;0,600;1,400;1,500&display=swap');

@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  @apply font-sans antialiased;
}

.font-serif {
  font-family: 'Lora', 'Playfair Display', Georgia, serif;
}

/* ---------------------------------------------------------------------------
   Scrollbars
--------------------------------------------------------------------------- */

::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: rgba(156, 163, 175, 0.35);
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: rgba(156, 163, 175, 0.55);
}

.dark ::-webkit-scrollbar-thumb {
  background: rgba(75, 85, 99, 0.45);
}

.dark ::-webkit-scrollbar-thumb:hover {
  background: rgba(75, 85, 99, 0.65);
}

/* ---------------------------------------------------------------------------
   TipTap Editor
--------------------------------------------------------------------------- */

.ProseMirror {
  outline: none;
}

.ProseMirror p.is-empty::before {
  color: #a1a1aa;
  content: attr(data-placeholder);
  float: left;
  height: 0;
  pointer-events: none;
}

.dark .ProseMirror p.is-empty::before {
  color: #52525b;
}

.theme-sepia .ProseMirror p.is-empty::before {
  color: #bcaaa4;
}

/* ---------------------------------------------------------------------------
   Editor images
--------------------------------------------------------------------------- */

.image-node {
  margin: 2em auto;
  text-align: center;
}

.image-node img,
.ProseMirror img {
  max-width: 100%;
  height: auto;
  display: block;
  margin: 0 auto;
  border-radius: 4px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.08);
}

.image-node img.full-bleed,
.ProseMirror img.full-bleed {
  width: 110%;
  max-width: none;
  margin-left: -5%;
}

.image-node .image-caption,
.ProseMirror .image-caption {
  font-size: 9pt;
  font-style: italic;
  color: #666;
  margin-top: 0.5em;
  text-align: center;
}

.dark .image-node .image-caption,
.dark .ProseMirror .image-caption {
  color: #a1a1aa;
}

.theme-sepia .image-node .image-caption,
.theme-sepia .ProseMirror .image-caption {
  color: #7c6853;
}

/* ---------------------------------------------------------------------------
   Prose / Sepia Theme
--------------------------------------------------------------------------- */

.prose {
  line-height: 1.8;
}

.prose p {
  margin-top: 1.4em;
  margin-bottom: 1.4em;
}

.prose blockquote {
  font-style: italic;
  border-left-width: 4px;
  padding-left: 1.5em;
}

.theme-sepia .prose {
  --tw-prose-body: #433422;
  --tw-prose-headings: #2c1a04;
  --tw-prose-lead: #5c4a37;
  --tw-prose-links: #8c5820;
  --tw-prose-bold: #2c1a04;
  --tw-prose-counters: #7c6853;
  --tw-prose-bullets: #a1887f;
  --tw-prose-hr: #e0d5c1;
  --tw-prose-quotes: #5c4a37;
  --tw-prose-quote-borders: #d7ccc8;
  --tw-prose-captions: #7c6853;
  --tw-prose-code: #5d4037;
  --tw-prose-pre-code: #f5f2eb;
  --tw-prose-pre-bg: #4e342e;
  --tw-prose-th-borders: #d7ccc8;
  --tw-prose-td-borders: #e0d5c1;
}

/* ---------------------------------------------------------------------------
   Preview panel print-like images
--------------------------------------------------------------------------- */

.preview-content img {
  max-width: 100%;
  height: auto;
  display: block;
  margin: 2em auto;
  page-break-inside: avoid;
}

.preview-content img.full-bleed {
  width: 110%;
  max-width: none;
  margin-left: -5%;
}

.preview-content .image-wrapper {
  page-break-inside: avoid;
  margin: 2em 0;
}

.preview-content .image-caption {
  font-size: 9pt;
  font-style: italic;
  color: #555;
  text-align: center;
  margin-top: 0.5em;
}
```

---

# 3. `modern-book-editor/src/components/BookEditor.tsx`

Replace with:

```tsx
import React, { useEffect, useState, useRef } from 'react';
import {
  useEditor,
  EditorContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Image from '@tiptap/extension-image';
import { useBookStore } from '../store/useBookStore';
import { countWords, countCharacters } from '../utils/wordCounter';
import { ImageUploadModal } from './ImageUploadModal';

interface BookEditorProps {
  manuscriptId?: string;
}

const ImageComponent = ({ node }: any) => {
  const isFullBleed = String(node.attrs?.class || '').includes('full-bleed');

  return (
    <NodeViewWrapper className="image-node">
      <div className="image-wrapper">
        <img
          src={node.attrs.src}
          alt={node.attrs.alt || ''}
          className={isFullBleed ? 'full-bleed' : undefined}
          draggable={false}
        />

        {node.attrs.caption && (
          <p className="image-caption">{node.attrs.caption}</p>
        )}
      </div>
    </NodeViewWrapper>
  );
};

const CustomImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      caption: {
        default: null,
        parseHTML: (element: HTMLElement) =>
          element.getAttribute('data-caption') || element.getAttribute('alt'),
        renderHTML: (attributes: any) => {
          if (!attributes.caption) return {};

          return {
            'data-caption': attributes.caption,
            alt: attributes.caption,
          };
        },
      },
      class: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('class'),
        renderHTML: (attributes: any) => {
          if (!attributes.class) return {};

          return {
            class: attributes.class,
          };
        },
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageComponent);
  },
});

export const BookEditor: React.FC<BookEditorProps> = ({ manuscriptId }) => {
  const {
    activeChapterId,
    chapters,
    updateChapterContent,
    applyPendingHtml,
    theme,
    setTheme,
    fontFamily,
    setFontFamily,
    fontSize,
    setFontSize,
    focusMode,
    setFocusMode,
    sidebarOpen,
    setSidebarOpen,
  } = useBookStore();

  const activeChapter = chapters.find((c) => c.id === activeChapterId);

  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved');
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeChapterIdRef = useRef(activeChapterId);

  useEffect(() => {
    activeChapterIdRef.current = activeChapterId;
  }, [activeChapterId]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: 'Begin writing your chapter...',
      }),
      CustomImage.configure({
        HTMLAttributes: {
          class: 'editor-image',
        },
      }),
    ],
    content: activeChapter?.content || '',
    editorProps: {
      attributes: {
        class: 'focus:outline-none min-h-[75vh] w-full',
      },
    },
    onUpdate: ({ editor }) => {
      setSaveStatus('saving');

      updateChapterContent(activeChapterIdRef.current, editor.getJSON());

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(() => {
        setSaveStatus('saved');
      }, 1000);
    },
  });

  useEffect(() => {
    if (!editor) return;

    const chapter = useBookStore
      .getState()
      .chapters.find((c) => c.id === activeChapterId);

    if (!chapter) return;

    if (chapter.pendingHtml) {
      editor.commands.setContent(chapter.pendingHtml);
      applyPendingHtml(chapter.id, editor.getJSON());
      return;
    }

    const currentContent = JSON.stringify(editor.getJSON());
    const nextContent = JSON.stringify(chapter.content || '');

    if (currentContent !== nextContent) {
      editor.commands.setContent(chapter.content || '');
    }
  }, [editor, activeChapterId, chapters, applyPendingHtml]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && focusMode) {
        setFocusMode(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusMode, setFocusMode]);

  if (!editor || !activeChapter) {
    return (
      <main className="flex-1 h-full flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
      </main>
    );
  }

  const wordCount = countWords(activeChapter.content);
  const charCount = countCharacters(activeChapter.content);

  const mainWrapperStyles = {
    light: 'bg-zinc-100 text-zinc-900',
    dark: 'bg-zinc-950 text-zinc-100',
    sepia: 'bg-[#f4efe2] text-[#433422]',
  };

  const paperStyles = {
    light: 'bg-white border border-zinc-200/50 shadow-xl',
    dark: 'bg-zinc-900 border border-zinc-800 shadow-2xl shadow-black/80',
    sepia: 'bg-[#fcfaf2] border border-[#ebdcb9] shadow-md',
  };

  const toolbarBorderStyles = {
    light: 'border-zinc-200 bg-white/95 backdrop-blur-md',
    dark: 'border-zinc-800 bg-zinc-900/95 backdrop-blur-md',
    sepia: 'border-[#ebdcb9] bg-[#fcfaf2]/95 backdrop-blur-md',
  };

  const controlStyles = {
    light: 'hover:bg-zinc-200 text-zinc-600',
    dark: 'hover:bg-zinc-800 text-zinc-300',
    sepia: 'hover:bg-[#ede9dc] text-[#5c4a37]',
  };

  const activeControlStyles = {
    light: 'bg-zinc-200 text-zinc-900 font-medium',
    dark: 'bg-zinc-800 text-white font-medium',
    sepia: 'bg-[#ebdcb9] text-[#2c1a04] font-medium',
  };

  const editorWordSizeClass = {
    sm: 'prose-sm',
    base: 'prose-base',
    lg: 'prose-lg',
    xl: 'prose-xl',
  }[fontSize];

  return (
    <main
      data-manuscript-id={manuscriptId || 'local'}
      className={`flex-1 h-screen overflow-y-auto flex flex-col items-center transition-colors duration-300 select-text ${
        mainWrapperStyles[theme]
      } ${focusMode ? 'p-0' : 'p-6'}`}
    >
      {!focusMode && (
        <div className="w-full max-w-4xl flex flex-wrap gap-4 items-center justify-between py-3 px-6 mb-4 rounded-xl border border-zinc-200/20 bg-white/20 dark:bg-black/10 backdrop-blur-md shadow-sm transition-all duration-300 select-none">
          <div className="flex items-center gap-2">
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                className={`p-2 rounded-lg transition-colors flex items-center gap-1.5 text-xs font-semibold ${controlStyles[theme]}`}
                title="Show Sidebar"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M11.25 4.5l7.5 7.5-7.5 7.5m-6-15l7.5 7.5-7.5 7.5"
                  />
                </svg>
                Sidebar
              </button>
            )}

            <div className="flex items-center gap-1.5 text-xs opacity-60 ml-2">
              {saveStatus === 'saving' ? (
                <>
                  <svg
                    className="animate-spin h-3.5 w-3.5"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <svg
                    className="h-3.5 w-3.5 text-emerald-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="3"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M4.5 12.75l6 6 9-13.5"
                    />
                  </svg>
                  <span>Saved</span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-5">
            <div className="flex bg-black/5 dark:bg-white/5 p-0.5 rounded-lg text-xs gap-0.5">
              {(['light', 'sepia', 'dark'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  className={`px-3 py-1 rounded-md capitalize transition-all duration-200 ${
                    theme === t
                      ? activeControlStyles[theme]
                      : controlStyles[theme]
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            <div className="flex bg-black/5 dark:bg-white/5 p-0.5 rounded-lg text-xs gap-0.5">
              {(['serif', 'sans'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFontFamily(f)}
                  className={`px-3 py-1 rounded-md capitalize transition-all duration-200 ${
                    fontFamily === f
                      ? activeControlStyles[theme]
                      : controlStyles[theme]
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>

            <div className="flex bg-black/5 dark:bg-white/5 p-0.5 rounded-lg text-xs gap-0.5">
              {(['sm', 'base', 'lg', 'xl'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setFontSize(s)}
                  className={`px-2.5 py-1 rounded-md uppercase transition-all duration-200 ${
                    fontSize === s
                      ? activeControlStyles[theme]
                      : controlStyles[theme]
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>

            <button
              onClick={() => setFocusMode(true)}
              className={`p-2 rounded-lg transition-all flex items-center gap-1.5 text-xs font-semibold ${controlStyles[theme]}`}
              title="Focus Mode"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2.2"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
              Focus
            </button>
          </div>
        </div>
      )}

      <div
        className={`w-full max-w-3xl transition-all duration-300 relative flex flex-col ${
          focusMode
            ? 'min-h-screen my-0 rounded-none shadow-none border-none'
            : `rounded-md min-h-[1100px] my-6 ${paperStyles[theme]}`
        }`}
      >
        {!focusMode && (
          <div
            className={`sticky top-0 border-b p-2 flex flex-wrap gap-1.5 z-10 rounded-t-md shadow-sm transition-colors duration-300 ${
              toolbarBorderStyles[theme]
            }`}
          >
            <button
              onClick={() => editor.chain().focus().toggleBold().run()}
              className={`p-2 rounded transition-colors ${
                editor.isActive('bold')
                  ? activeControlStyles[theme]
                  : controlStyles[theme]
              }`}
              title="Bold"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6.75 3.75h6.25a3.75 3.75 0 013.75 3.75v0a3.75 3.75 0 01-3.75 3.75H6.75V3.75zM6.75 11.25h7.5A3.75 3.75 0 0118 15v0a3.75 3.75 0 01-3.75 3.75H6.75v-7.5z"
                />
              </svg>
            </button>

            <button
              onClick={() => editor.chain().focus().toggleItalic().run()}
              className={`p-2 rounded transition-colors ${
                editor.isActive('italic')
                  ? activeControlStyles[theme]
                  : controlStyles[theme]
              }`}
              title="Italic"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10.25 3.75h6M7.75 20.25h6M13.25 3.75l-4.5 16.5"
                />
              </svg>
            </button>

            <button
              onClick={() => editor.chain().focus().toggleStrike().run()}
              className={`p-2 rounded transition-colors ${
                editor.isActive('strike')
                  ? activeControlStyles[theme]
                  : controlStyles[theme]
              }`}
              title="Strikethrough"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 12h18M5.25 5.25h13.5v0a4.5 4.5 0 01-4.5 4.5H9.75a4.5 4.5 0 01-4.5-4.5v0zM5.25 14.25h13.5v0a4.5 4.5 0 01-4.5 4.5H9.75a4.5 4.5 0 01-4.5-4.5v0z"
                />
              </svg>
            </button>

            <div className="w-px bg-zinc-200 dark:bg-zinc-800 mx-1.5 self-stretch" />

            <button
              onClick={() =>
                editor.chain().focus().toggleHeading({ level: 2 }).run()
              }
              className={`px-2.5 py-1 rounded transition-colors ${
                editor.isActive('heading', { level: 2 })
                  ? activeControlStyles[theme]
                  : controlStyles[theme]
              }`}
              title="Heading 2"
            >
              <span className="text-xs font-bold font-sans">H2</span>
            </button>

            <button
              onClick={() =>
                editor.chain().focus().toggleHeading({ level: 3 }).run()
              }
              className={`px-2.5 py-1 rounded transition-colors ${
                editor.isActive('heading', { level: 3 })
                  ? activeControlStyles[theme]
                  : controlStyles[theme]
              }`}
              title="Heading 3"
            >
              <span className="text-xs font-bold font-sans">H3</span>
            </button>

            <div className="w-px bg-zinc-200 dark:bg-zinc-800 mx-1.5 self-stretch" />

            <button
              onClick={() => editor.chain().focus().toggleBulletList().run()}
              className={`p-2 rounded transition-colors ${
                editor.isActive('bulletList')
                  ? activeControlStyles[theme]
                  : controlStyles[theme]
              }`}
              title="Bullet List"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.007 5.25H3.75v.008h.008V12zm0 5.25H3.75v.008h.008v-.008z"
                />
              </svg>
            </button>

            <button
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
              className={`p-2 rounded transition-colors ${
                editor.isActive('orderedList')
                  ? activeControlStyles[theme]
                  : controlStyles[theme]
              }`}
              title="Numbered List"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 5.25l1.5-1.5v6M3.75 16.5H5.5a1.5 1.5 0 011.5 1.5v0A1.5 1.5 0 015.5 19.5H3.75v-3z"
                />
              </svg>
            </button>

            <button
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
              className={`p-2 rounded transition-colors ${
                editor.isActive('blockquote')
                  ? activeControlStyles[theme]
                  : controlStyles[theme]
              }`}
              title="Blockquote"
            >
              <svg
                className="w-4 h-4"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-4.795 2.638-4.795 6.275h4.8v9.575h-10zm-12 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-4.796 2.638-4.796 6.275h4.8v9.575h-10z" />
              </svg>
            </button>

            <button
              onClick={() => editor.chain().focus().toggleCodeBlock().run()}
              className={`p-2 rounded transition-colors ${
                editor.isActive('codeBlock')
                  ? activeControlStyles[theme]
                  : controlStyles[theme]
              }`}
              title="Code Block"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5"
                />
              </svg>
            </button>

            <button
              onClick={() => setIsImageModalOpen(true)}
              className={`p-2 rounded transition-colors ${controlStyles[theme]}`}
              title="Insert Image"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.41a2.25 2.25 0 013.182 0l2.909 2.91m-18 5.25h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
                />
              </svg>
            </button>

            <div className="w-px bg-zinc-200 dark:bg-zinc-800 mx-1.5 self-stretch" />

            <button
              onClick={() => editor.chain().focus().undo().run()}
              disabled={!editor.can().undo()}
              className={`p-2 rounded transition-colors ${controlStyles[theme]} disabled:opacity-30`}
              title="Undo"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3"
                />
              </svg>
            </button>

            <button
              onClick={() => editor.chain().focus().redo().run()}
              disabled={!editor.can().redo()}
              className={`p-2 rounded transition-colors ${controlStyles[theme]} disabled:opacity-30`}
              title="Redo"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 15l6-6m0 0l-6-6m6 6H9a6 6 0 000 12h3"
                />
              </svg>
            </button>
          </div>
        )}

        <div
          className={`pt-10 pb-6 border-b transition-colors duration-300 ${
            focusMode
              ? 'px-16 border-transparent'
              : 'px-16 border-zinc-100 dark:border-zinc-800/40'
          }`}
        >
          <h1
            className={`text-4xl font-bold font-serif ${
              theme === 'dark'
                ? 'text-zinc-100'
                : theme === 'sepia'
                ? 'text-[#2c1a04]'
                : 'text-zinc-800'
            }`}
          >
            {activeChapter.title}
          </h1>
        </div>

        <div
          className={`flex-1 transition-all duration-300 ${
            focusMode ? 'px-16 py-6' : 'px-4 py-2'
          }`}
        >
          <div
            className={`prose max-w-none transition-all duration-300 ${editorWordSizeClass} ${
              fontFamily === 'serif' ? 'font-serif' : 'font-sans'
            } ${
              theme === 'dark'
                ? 'prose-invert prose-zinc'
                : theme === 'sepia'
                ? 'theme-sepia'
                : 'prose-zinc'
            }`}
          >
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>

      <div
        className={`fixed bottom-6 right-6 px-4 py-2 rounded-lg shadow-lg border text-xs flex gap-4 transition-all duration-300 select-none z-20 ${
          focusMode
            ? 'opacity-20 hover:opacity-100 bg-black/60 text-white border-zinc-700'
            : `${
                theme === 'dark'
                  ? 'bg-zinc-800 text-zinc-300 border-zinc-700'
                  : theme === 'sepia'
                  ? 'bg-[#fcfaf2] text-[#5c4a37] border-[#ebdcb9]'
                  : 'bg-white text-zinc-600 border-zinc-200'
              }`
        }`}
      >
        <div className="flex gap-1.5">
          <span className="opacity-60">Words:</span>
          <span className="font-semibold">{wordCount.toLocaleString()}</span>
        </div>

        <div className="w-px bg-black/10 dark:bg-white/10 self-stretch" />

        <div className="flex gap-1.5">
          <span className="opacity-60">Characters:</span>
          <span className="font-semibold">{charCount.toLocaleString()}</span>
        </div>

        {focusMode && (
          <>
            <div className="w-px bg-white/10 self-stretch" />
            <button
              onClick={() => setFocusMode(false)}
              className="text-emerald-400 hover:text-emerald-300 font-semibold"
              title="Esc to exit"
            >
              Exit Focus
            </button>
          </>
        )}
      </div>

      <ImageUploadModal
        isOpen={isImageModalOpen}
        onClose={() => setIsImageModalOpen(false)}
        editor={editor}
      />
    </main>
  );
};
```

---

# 4. `modern-book-editor/src/components/PreviewPanel.tsx`

Replace with:

```tsx
import React, { useMemo } from 'react';
import { useBookStore } from '../store/useBookStore';
import { countWords } from '../utils/wordCounter';

function escapeHtml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeUrl(value: string): string {
  const url = String(value || '').trim();

  if (!url) return '';

  if (/^javascript:/i.test(url)) {
    return '#';
  }

  return url.replace(/"/g, '%22');
}

export const PreviewPanel: React.FC = () => {
  const { chapters, activeChapterId, bookTitle, author, theme } =
    useBookStore();

  const activeChapter = chapters.find((c) => c.id === activeChapterId);

  const previewHtml = useMemo(() => {
    if (!activeChapter?.content) {
      return '<p style="color: #999;">No content to preview</p>';
    }

    const renderNode = (node: any): string => {
      if (!node) return '';

      if (node.type === 'text') {
        let text = escapeHtml(node.text || '');

        if (node.marks) {
          for (const mark of node.marks) {
            if (mark.type === 'bold') text = `<strong>${text}</strong>`;
            else if (mark.type === 'italic') text = `<em>${text}</em>`;
            else if (mark.type === 'code') text = `<code>${text}</code>`;
            else if (mark.type === 'strike') text = `<del>${text}</del>`;
          }
        }

        return text;
      }

      const children = (node.content || []).map(renderNode).join('');

      switch (node.type) {
        case 'doc':
          return children;

        case 'paragraph':
          return `<p>${children}</p>`;

        case 'heading': {
          const level = node.attrs?.level || 1;
          return `<h${level}>${children}</h${level}>`;
        }

        case 'bulletList':
          return `<ul>${children}</ul>`;

        case 'orderedList':
          return `<ol>${children}</ol>`;

        case 'listItem':
          return `<li>${children}</li>`;

        case 'blockquote':
          return `<blockquote>${children}</blockquote>`;

        case 'codeBlock':
          return `<pre><code>${children}</code></pre>`;

        case 'horizontalRule':
          return '<hr />';

        case 'hardBreak':
          return '<br />';

        case 'image': {
          const src = safeUrl(node.attrs?.src || '');
          const alt = escapeHtml(node.attrs?.alt || '');
          const caption = escapeHtml(node.attrs?.caption || '');
          const isFullBleed = String(node.attrs?.class || '').includes(
            'full-bleed'
          );

          return `
            <div class="image-wrapper">
              <img
                src="${src}"
                alt="${alt}"
                class="${isFullBleed ? 'full-bleed' : ''}"
                style="max-width: 100%; height: auto;"
              />
              ${caption ? `<p class="image-caption">${caption}</p>` : ''}
            </div>
          `;
        }

        default:
          return children;
      }
    };

    return renderNode(activeChapter.content);
  }, [activeChapter]);

  const bgClass =
    theme === 'dark'
      ? 'bg-zinc-900 text-zinc-200'
      : theme === 'sepia'
      ? 'bg-[#fdf9f0] text-amber-950'
      : 'bg-white text-zinc-800';

  return (
    <div className={`h-full overflow-y-auto ${bgClass}`}>
      <div className="max-w-2xl mx-auto py-12 px-8">
        {activeChapter ? (
          <>
            <h1 className="text-3xl font-bold font-serif mb-2">
              {activeChapter.title}
            </h1>

            <div className="text-sm opacity-60 mb-8 border-b pb-4">
              {bookTitle} &middot; {author || 'Unknown'} &middot;{' '}
              {countWords(activeChapter.content).toLocaleString()} words
            </div>

            <div
              className="preview-content prose prose-zinc max-w-none font-serif text-lg leading-relaxed"
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          </>
        ) : (
          <div className="text-center py-20 opacity-50">
            <p>Select a chapter to preview</p>
          </div>
        )}
      </div>
    </div>
  );
};
```

---

# 5. `modern-book-editor/src/components/SettingsPage.tsx`

Replace with:

```tsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useBookStore } from '../store/useBookStore';
import { useAuth } from '../hooks/useAuth';
import { ArrowLeft, LogOut } from 'lucide-react';

export const SettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const { theme, setTheme, fontFamily, setFontFamily, fontSize, setFontSize } =
    useBookStore();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-8 overflow-y-auto">
      <div className="max-w-3xl mx-auto">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 mb-6"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </button>

        <h1 className="text-3xl font-bold font-serif text-zinc-900 dark:text-zinc-100 mb-8">
          Settings
        </h1>

        <section className="mb-8 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200 mb-3">
            Account
          </h2>

          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-zinc-500">Signed in as</p>
              <p className="font-medium text-zinc-900 dark:text-zinc-100">
                {user?.email || 'Unknown user'}
              </p>
            </div>

            <button
              onClick={handleLogout}
              className="flex items-center gap-2 rounded-lg border border-zinc-300 dark:border-zinc-700 px-4 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </div>
        </section>

        <section className="mb-8 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200 mb-3">
            Theme
          </h2>

          <div className="flex gap-3">
            {(['light', 'dark', 'sepia'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={`px-6 py-3 rounded-lg border-2 transition-all ${
                  theme === t
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                    : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300'
                }`}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </section>

        <section className="mb-8 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200 mb-3">
            Font Family
          </h2>

          <div className="flex gap-3">
            {(['serif', 'sans'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFontFamily(f)}
                className={`px-6 py-3 rounded-lg border-2 transition-all ${
                  fontFamily === f
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                    : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300'
                }`}
              >
                <span className={f === 'serif' ? 'font-serif' : 'font-sans'}>
                  {f === 'serif' ? 'Serif' : 'Sans-Serif'}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="mb-8 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200 mb-3">
            Font Size
          </h2>

          <div className="flex gap-3">
            {(['sm', 'base', 'lg', 'xl'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFontSize(s)}
                className={`px-6 py-3 rounded-lg border-2 transition-all ${
                  fontSize === s
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                    : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300'
                }`}
              >
                {s === 'sm'
                  ? 'Small'
                  : s === 'base'
                  ? 'Medium'
                  : s === 'lg'
                  ? 'Large'
                  : 'X-Large'}
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};
```

---

# 6. `modern-book-editor/src/components/CoverDesigner.tsx`

Replace with:

```tsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, UploadCloud } from 'lucide-react';
import { uploadImage } from '../lib/uploads';

export const CoverDesigner: React.FC = () => {
  const navigate = useNavigate();

  const [title, setTitle] = useState('My Book');
  const [author, setAuthor] = useState('Author Name');
  const [subtitle, setSubtitle] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#1e3a5f');
  const [accentColor, setAccentColor] = useState('#c9a84c');
  const [fontStyle, setFontStyle] = useState<'classic' | 'modern' | 'minimal'>(
    'classic'
  );
  const [bleed, setBleed] = useState(true);

  const [uploading, setUploading] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState('');
  const [error, setError] = useState('');

  const fontClass =
    fontStyle === 'classic'
      ? 'font-serif'
      : fontStyle === 'modern'
      ? 'font-sans'
      : 'font-light tracking-wide';

  const buildCanvas = (): HTMLCanvasElement => {
    const canvas = document.createElement('canvas');

    canvas.width = bleed ? 1650 : 1500;
    canvas.height = bleed ? 2550 : 2400;

    const ctx = canvas.getContext('2d');

    if (!ctx) {
      return canvas;
    }

    ctx.fillStyle = primaryColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 6;

    ctx.beginPath();
    ctx.moveTo(150, canvas.height / 2 - 60);
    ctx.lineTo(canvas.width - 150, canvas.height / 2 - 60);
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';

    ctx.font = `bold ${
      fontStyle === 'classic' ? 72 : 64
    }px ${
      fontStyle === 'classic'
        ? 'Georgia'
        : fontStyle === 'modern'
        ? 'Helvetica'
        : 'Helvetica Neue'
    }`;

    ctx.fillText(title, canvas.width / 2, canvas.height / 2 - 140);

    if (subtitle) {
      ctx.fillStyle = accentColor;
      ctx.font = '36px Georgia';
      ctx.fillText(subtitle, canvas.width / 2, canvas.height / 2 - 40);
    }

    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 3;

    ctx.beginPath();
    ctx.moveTo(250, canvas.height / 2 + 40);
    ctx.lineTo(canvas.width - 250, canvas.height / 2 + 40);
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = '40px Georgia';
    ctx.fillText(author, canvas.width / 2, canvas.height / 2 + 140);

    return canvas;
  };

  const handleDownload = () => {
    const canvas = buildCanvas();

    const link = document.createElement('a');
    link.download = `${title.replace(/[^\w\- ]+/g, '').trim() || 'cover'}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const handleUpload = async () => {
    setError('');
    setUploadedUrl('');
    setUploading(true);

    try {
      const canvas = buildCanvas();

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/png')
      );

      if (!blob) {
        throw new Error('Failed to generate cover image.');
      }

      const file = new File([blob], 'cover.png', { type: 'image/png' });

      const publicUrl = await uploadImage(file);

      setUploadedUrl(publicUrl);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Failed to upload cover image.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-8 overflow-y-auto">
      <div className="max-w-6xl mx-auto">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 mb-6"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </button>

        <h1 className="text-3xl font-bold font-serif text-zinc-900 dark:text-zinc-100 mb-8">
          Cover Designer
        </h1>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full border border-zinc-300 dark:border-zinc-700 rounded-lg px-3 py-2 bg-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Author
              </label>
              <input
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                className="w-full border border-zinc-300 dark:border-zinc-700 rounded-lg px-3 py-2 bg-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Subtitle
              </label>
              <input
                type="text"
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
                className="w-full border border-zinc-300 dark:border-zinc-700 rounded-lg px-3 py-2 bg-transparent"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Primary Color
                </label>
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="w-full h-10 rounded cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Accent Color
                </label>
                <input
                  type="color"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="w-full h-10 rounded cursor-pointer"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Font Style
              </label>
              <select
                value={fontStyle}
                onChange={(e) => setFontStyle(e.target.value as any)}
                className="w-full border border-zinc-300 dark:border-zinc-700 rounded-lg px-3 py-2 bg-transparent"
              >
                <option value="classic">Classic Serif</option>
                <option value="modern">Modern Sans</option>
                <option value="minimal">Minimal</option>
              </select>
            </div>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={bleed}
                onChange={(e) => setBleed(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm text-zinc-600 dark:text-zinc-400">
                Include bleed
              </span>
            </label>

            {error && (
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            )}

            {uploadedUrl && (
              <div className="rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 p-3">
                <p className="text-sm text-emerald-800 dark:text-emerald-300 break-all">
                  Uploaded cover URL:
                </p>
                <p className="text-sm text-emerald-700 dark:text-emerald-400 break-all">
                  {uploadedUrl}
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleDownload}
                className="flex-1 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" /> Download PNG
              </button>

              <button
                onClick={handleUpload}
                disabled={uploading}
                className="flex-1 py-3 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <UploadCloud className="w-4 h-4" />
                {uploading ? 'Uploading...' : 'Upload to Cloud'}
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 flex items-center justify-center">
            <div
              style={{ backgroundColor: primaryColor, width: 300, height: 450 }}
              className="rounded-lg shadow-xl flex flex-col items-center justify-center text-center p-8"
            >
              <div
                style={{ borderColor: accentColor }}
                className="w-3/4 border-t-2 mb-6"
              />

              <h2
                className={`text-white text-2xl font-bold ${fontClass} mb-2`}
              >
                {title}
              </h2>

              {subtitle && (
                <p style={{ color: accentColor }} className="text-sm mb-4">
                  {subtitle}
                </p>
              )}

              <div
                style={{ borderColor: accentColor }}
                className="w-1/2 border-t mb-6"
              />

              <p className="text-white text-lg">{author}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
```

---

# 7. Rebuild Frontend

If you are running locally:

```bash
cd modern-book-editor
npm install
npm run dev
```

If you are using Docker:

```bash
docker compose up --build
```

---

# 8. What This Completes

With these files added, your frontend now has:

- Updated Tailwind dark mode support
- Updated global editor styles
- Full-bleed image support in editor and preview
- Safer preview rendering
- Account/logout settings page
- Cover designer with cloud upload support
- Compatibility with the new backend:
  - auth cookies
  - server manuscripts
  - S3 uploads
  - job-based AI formatting
  - job-based PDF/DOCX export

---

# 9. Final Recommended File Check

Make sure these files exist from the previous backend generation:

```txt
server/src/app.ts
server/src/server.ts
server/src/worker.ts
server/src/auth.ts
server/src/db.ts
server/src/s3.ts
server/src/queues.ts
server/src/usage.ts
server/src/metrics.ts
server/prisma/schema.prisma
server/src/routes/auth.routes.ts
server/src/routes/manuscript.routes.ts
server/src/routes/asset.routes.ts
server/src/routes/job.routes.ts
server/src/routes/admin.routes.ts
server/src/routes/document.routes.ts
server/src/workers/format.worker.ts
server/src/workers/pdf.worker.ts
server/src/workers/docx.worker.ts
```

And these frontend files:

```txt
modern-book-editor/src/lib/apiClient.ts
modern-book-editor/src/lib/auth.ts
modern-book-editor/src/lib/jobs.ts
modern-book-editor/src/lib/uploads.ts
modern-book-editor/src/lib/tiptapToMarkdown.ts
modern-book-editor/src/hooks/useAuth.tsx
modern-book-editor/src/hooks/useServerManuscript.ts
modern-book-editor/src/hooks/useServerSync.ts
modern-book-editor/src/pages/LoginPage.tsx
modern-book-editor/src/pages/RegisterPage.tsx
modern-book-editor/src/components/Dashboard.tsx
modern-book-editor/src/components/EditorLayout.tsx
modern-book-editor/src/components/Sidebar.tsx
modern-book-editor/src/components/AIFormatModal.tsx
modern-book-editor/src/components/ImageUploadModal.tsx
modern-book-editor/src/components/ExportPage.tsx
modern-book-editor/src/store/useBookStore.ts
modern-book-editor/src/main.tsx
modern-book-editor/src/App.tsx
```

---
 