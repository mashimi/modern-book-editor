import React, { useState, useRef, useEffect } from 'react';
import { useBookStore } from '../store/useBookStore';
import { markdownToProseMirror } from '../utils/wordCounter';
import { Upload, FileText, Loader2, Clipboard, X } from 'lucide-react';

interface AIFormatModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  initialFile?: File | null;
  initialMode?: 'upload' | 'paste';
}

const API = 'http://localhost:3001';

export const AIFormatModal: React.FC<AIFormatModalProps> = ({
  isOpen, onClose, onSuccess, initialFile = null, initialMode = 'upload',
}) => {
  const [mode, setMode] = useState<'upload' | 'paste'>(initialMode);
  const [file, setFile] = useState<File | null>(initialFile);
  const [rawText, setRawText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, chapters: 0 });
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { importFromAI } = useBookStore();

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setFile(initialFile);
      setRawText('');
      setError('');
      setProgress({ current: 0, total: 0, chapters: 0 });
      setStatusText('');
    }
  }, [isOpen, initialFile, initialMode]);

  if (!isOpen) return null;

  const handleClose = () => {
    if (isProcessing) abortRef.current?.abort();
    onClose();
  };

  const readSourceText = async (): Promise<string> => {
    if (mode === 'paste') {
      const t = rawText.trim();
      if (t.length < 50) throw new Error('Please paste at least a few lines of text.');
      return t;
    }
    if (!file) throw new Error('Choose a file first.');
    const lower = file.name.toLowerCase();
    if (lower.endsWith('.txt') || lower.endsWith('.md') || lower.endsWith('.markdown')) {
      setStatusText('Reading text file...');
      const t = (await file.text()).trim();
      if (t.length < 50) throw new Error('The file is almost empty.');
      return t;
    }
    setStatusText('Extracting text from your document...');
    const formData = new FormData();
    formData.append('document', file);
    const parseRes = await fetch(`${API}/api/parse-docx`, { method: 'POST', body: formData });
    if (!parseRes.ok) {
      const err = await parseRes.json().catch(() => ({}));
      throw new Error(err.error || 'Could not read the document.');
    }
    const data = await parseRes.json();
    const t = String(data.text || '').trim();
    if (t.length < 50) throw new Error('The document extracted almost no text.');
    return t;
  };

  const streamFormat = async (text: string) => {
    const controller = new AbortController();
    abortRef.current = controller;
    const response = await fetch(`${API}/api/format-book`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rawText: text }),
      signal: controller.signal,
    });
    if (!response.ok || !response.body) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `Server error (${response.status}).`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let bookData: any = null;

    const handleBlock = (block: string) => {
      let event = 'message';
      const dataLines: string[] = [];
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
      }
      if (!dataLines.length) return;
      let data: any;
      try { data = JSON.parse(dataLines.join('\n')); } catch { return; }
      if (event === 'meta') setProgress((p) => ({ ...p, total: data.total || 0 }));
      else if (event === 'progress') {
        setProgress({ current: data.current || 0, total: data.total || 0, chapters: data.chaptersSoFar || 0 });
        setStatusText(`Editing chunk ${data.current || 0} of ${data.total || 0}...`);
      } else if (event === 'complete') bookData = data;
      else if (event === 'error') throw new Error(data.error || 'The AI could not finish.');
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
    if (!bookData) throw new Error('The AI finished but returned no book. Check the server console.');
    return bookData;
  };

  const handleFormat = async () => {
    setError('');
    setIsProcessing(true);
    setStatusText('Preparing your document...');
    try {
      const text = await readSourceText();
      setStatusText('The AI editor is cleaning and structuring your book...');
      const bookData = await streamFormat(text);

      const chapters = (bookData.chapters || []).map((ch: any) => ({
        title: String(ch.title || 'Untitled').trim(),
        content: markdownToProseMirror(String(ch.content || '')),
      }));
      if (!chapters.length) throw new Error('The AI returned no chapters.');

      importFromAI(bookData.metadata?.title || 'Formatted Book', chapters);
      if (bookData.metadata?.author) useBookStore.getState().setAuthor(bookData.metadata.author);

      setFile(null);
      onSuccess?.();
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

  const canFormat = !isProcessing && (mode === 'upload' ? !!file : rawText.trim().length >= 50);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-xl p-6 flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-xl font-bold text-gray-800">✨ AI Book Editor</h2>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-700"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-sm text-gray-600 mb-4">
          Drop in your manuscript. The AI detects the chapters, deletes the table of contents,
          fixes line-wraps and paragraphs, and builds a clean book for you.
        </p>

        <div className="flex gap-0 mb-4 border border-gray-200 rounded-lg overflow-hidden">
          <button onClick={() => setMode('upload')} disabled={isProcessing}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${mode === 'upload' ? 'bg-blue-600 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}>
            <Upload className="w-4 h-4 inline mr-1.5" /> Upload file
          </button>
          <button onClick={() => setMode('paste')} disabled={isProcessing}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${mode === 'paste' ? 'bg-blue-600 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}>
            <Clipboard className="w-4 h-4 inline mr-1.5" /> Paste text
          </button>
        </div>

        {mode === 'upload' ? (
          <div onClick={() => !isProcessing && fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${file ? 'border-green-400 bg-green-50' : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50'} ${isProcessing ? 'pointer-events-none opacity-60' : ''}`}>
            <input ref={fileInputRef} type="file" accept=".docx,.doc,.txt,.md,.markdown"
              onChange={(e) => setFile(e.target.files?.[0] || null)} className="hidden" disabled={isProcessing} />
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
                <p className="text-gray-600 font-medium">Click to select your manuscript</p>
                <p className="text-xs text-gray-400 mt-1">.docx, .txt or .md</p>
              </div>
            )}
          </div>
        ) : (
          <textarea value={rawText} onChange={(e) => setRawText(e.target.value)} disabled={isProcessing}
            placeholder="Paste the full raw text of your book here..."
            className="w-full h-48 border border-gray-300 rounded-lg p-4 text-sm resize-y focus:ring-2 focus:ring-blue-500 disabled:opacity-50" />
        )}

        {error && <div className="mt-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}

        {isProcessing && (
          <div className="mt-4 space-y-2">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Loader2 className="w-4 h-4 animate-spin text-blue-600" /><span>{statusText}</span>
            </div>
            {progress.total > 0 && (
              <div>
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Chunk {progress.current} of {progress.total}</span>
                  <span>{progress.chapters} chapter(s) so far</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                  <div className="bg-gradient-to-r from-blue-500 to-purple-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${(progress.current / progress.total) * 100}%` }} />
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-3 mt-6">
          <button onClick={handleClose} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md" disabled={isProcessing}>Cancel</button>
          <button onClick={handleFormat} disabled={!canFormat}
            className="px-6 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-md hover:opacity-90 flex items-center gap-2 disabled:opacity-50">
            {isProcessing ? <><Loader2 className="w-4 h-4 animate-spin" /> Editing...</> : '✨ Format my book'}
          </button>
        </div>
      </div>
    </div>
  );
};
