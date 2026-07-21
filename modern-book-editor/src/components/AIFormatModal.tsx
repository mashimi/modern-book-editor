import React, { useState, useRef, useMemo } from 'react';
import { marked } from 'marked';
import { useBookStore } from '../store/useBookStore';
import { extractTextFromJSON } from '../utils/wordCounter';
import { Upload, FileText, Loader2, PenLine, Type } from 'lucide-react';

interface AIFormatModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Mode = 'current' | 'upload' | 'paste';

const API = 'http://localhost:3001';

export const AIFormatModal: React.FC<AIFormatModalProps> = ({ isOpen, onClose }) => {
  const [mode, setMode] = useState<Mode>('current');
  const [file, setFile] = useState<File | null>(null);
  const [rawText, setRawText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, chapters: 0 });
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { importFromAI, chapters } = useBookStore();

  // The document that is CURRENTLY open in the editor.
  const currentDoc = useMemo(() => {
    const text = chapters
      .map((c) => `# ${c.title}\n\n${extractTextFromJSON(c.content).trim()}`)
      .join('\n\n')
      .trim();
    const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
    return { text, words };
  }, [chapters]);

  if (!isOpen) return null;

  const reset = () => {
    setFile(null);
    setRawText('');
    setError('');
    setProgress({ current: 0, total: 0, chapters: 0 });
    setStatusText('');
  };

  const handleClose = () => {
    if (isProcessing) abortRef.current?.abort();
    reset();
    setMode('current');
    onClose();
  };

  const parseDoc = async (f: File): Promise<string> => {
    setStatusText('Reading your file...');
    const lower = f.name.toLowerCase();
    if (lower.endsWith('.txt') || lower.endsWith('.md') || lower.endsWith('.markdown')) {
      return (await f.text()).trim();
    }
    const formData = new FormData();
    formData.append('document', f);
    const res = await fetch(`${API}/api/parse-docx`, { method: 'POST', body: formData });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to read the file');
    }
    const data = await res.json();
    return String(data.text || '').trim();
  };

  const streamFormat = async (textToSend: string) => {
    const controller = new AbortController();
    abortRef.current = controller;

    const response = await fetch(`${API}/api/format-book`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rawText: textToSend }),
      signal: controller.signal,
    });

    if (!response.ok || !response.body) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `AI request failed (${response.status})`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let bookData: any = null;

    const handleBlock = (block: string) => {
      let event = 'message';
      const dataLines: string[] = [];
      for (const line of block.split(/\r?\n/)) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
      }
      if (!dataLines.length) return;
      let data: any;
      try {
        data = JSON.parse(dataLines.join('\n'));
      } catch {
        return;
      }
      if (event === 'meta') setProgress((p) => ({ ...p, total: data.total || 0 }));
      else if (event === 'progress') {
        setProgress({ current: data.current || 0, total: data.total || 0, chapters: data.chaptersSoFar || 0 });
        setStatusText(`Processing chunk ${data.current || 0} of ${data.total || 0}...`);
      } else if (event === 'complete') bookData = data;
      else if (event === 'error') throw new Error(data.error || 'Server error');
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() || '';
      for (const b of blocks) handleBlock(b);
    }
    if (buffer.trim()) handleBlock(buffer);

    if (!bookData) {
      throw new Error('The AI finished but returned no chapters. Check the backend console for errors.');
    }
    return bookData;
  };

  const handleFormat = async () => {
    setError('');
    try {
      let textToSend = '';
      if (mode === 'current') {
        textToSend = currentDoc.text;
        if (textToSend.length < 100) {
          throw new Error('Your editor is almost empty. Type or paste your text into the chapters first, or use the Upload / Paste tabs.');
        }
      } else if (mode === 'paste') {
        textToSend = rawText.trim();
        if (textToSend.length < 100) throw new Error('Pasted text is too short (need at least 100 characters).');
      } else {
        if (!file) throw new Error('Choose a file first.');
        textToSend = await parseDoc(file);
        if (textToSend.length < 100) throw new Error('The file has less than 100 characters of text.');
      }

      setIsProcessing(true);
      setStatusText('Sending your document to the AI...');
      const bookData = await streamFormat(textToSend);

      const formatted = (bookData.chapters || []).map((ch: any) => ({
        title: String(ch.title || 'Untitled'),
        htmlContent: marked.parse(String(ch.content || '')) as string,
      }));

      if (!formatted.length) throw new Error('The AI returned no chapters.');

      importFromAI(bookData.metadata?.title || 'Formatted Book', formatted);
      reset();
      onClose();
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        console.error(e);
        setError(e?.message || 'Formatting failed.');
      }
    } finally {
      setIsProcessing(false);
      abortRef.current = null;
      setStatusText('');
    }
  };

  const canFormat =
    !isProcessing &&
    (mode === 'current' ? currentDoc.words > 0 : mode === 'paste' ? rawText.trim().length > 0 : !!file);

  const tabs: { id: Mode; label: string; icon: any }[] = [
    { id: 'current', label: 'Current document', icon: PenLine },
    { id: 'upload', label: 'Upload file', icon: Upload },
    { id: 'paste', label: 'Paste text', icon: Type },
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-xl p-6 flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-xl font-bold text-gray-800">✨ AI Book Formatter</h2>
          <button onClick={handleClose} className="text-gray-500 hover:text-gray-800 text-2xl">&times;</button>
        </div>

        <p className="text-sm text-gray-600 mb-4">
          By default this formats the document you already have open in the editor
          ({currentDoc.words.toLocaleString()} words). Use the other tabs only to bring in a
          brand‑new file or pasted text.
        </p>

        <div className="flex gap-1 mb-4 bg-gray-100 p-1 rounded-lg">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = mode === t.id;
            return (
              <button
                key={t.id}
                onClick={() => {
                  setMode(t.id);
                  setError('');
                }}
                className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-md text-xs font-medium transition-colors ${
                  active ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Icon className="w-3.5 h-3.5" /> {t.label}
              </button>
            );
          })}
        </div>

        {mode === 'current' && (
          <div className="border rounded-lg p-4 bg-blue-50 border-blue-200">
            <div className="flex items-center gap-2 text-blue-800 font-medium text-sm">
              <PenLine className="w-4 h-4" /> Format what's in your editor right now
            </div>
            <p className="text-xs text-blue-700/80 mt-1">
              {currentDoc.words > 0
                ? `We'll send your ${chapters.length} chapter(s) / ${currentDoc.words.toLocaleString()} words to the AI and replace the editor with the cleaned‑up, structured result.`
                : 'Your editor is empty. Type or paste your text into the chapters first, or switch to Upload / Paste.'}
            </p>
          </div>
        )}

        {mode === 'upload' && (
          <div
            onClick={() => !isProcessing && fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              file ? 'border-green-400 bg-green-50' : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50'
            } ${isProcessing ? 'pointer-events-none opacity-60' : ''}`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".docx,.doc,.txt,.md,.markdown"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="hidden"
              disabled={isProcessing}
            />
            {file ? (
              <div className="flex items-center justify-center gap-3">
                <FileText className="w-8 h-8 text-green-600" />
                <div className="text-left">
                  <p className="font-medium text-gray-800">{file.name}</p>
                  <p className="text-xs text-gray-500">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
              </div>
            ) : (
              <div>
                <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-600 font-medium">Click to select a document</p>
                <p className="text-xs text-gray-400 mt-1">.docx, .txt or .md</p>
              </div>
            )}
          </div>
        )}

        {mode === 'paste' && (
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder="Paste your raw book text here..."
            className="w-full h-48 rounded-lg border border-gray-300 p-3 text-sm resize-none"
            disabled={isProcessing}
          />
        )}

        {error && (
          <div className="mt-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {isProcessing && (
          <div className="mt-4 space-y-2">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
              <span>{statusText}</span>
            </div>
            {progress.total > 0 && (
              <div>
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Chunk {progress.current} of {progress.total}</span>
                  <span>{progress.chapters} chapter(s)</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-blue-500 to-purple-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${(progress.current / progress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md"
            disabled={isProcessing}
          >
            Cancel
          </button>
          <button
            onClick={handleFormat}
            disabled={!canFormat}
            className="px-6 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-md hover:opacity-90 flex items-center gap-2 disabled:opacity-50"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Processing...
              </>
            ) : mode === 'current' ? (
              '✨ Format my current document'
            ) : (
              '✨ Format'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};