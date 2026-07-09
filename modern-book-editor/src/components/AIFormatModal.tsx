import React, { useState, useRef } from 'react';
import { marked } from 'marked';
import { useBookStore } from '../store/useBookStore';

interface AIFormatModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AIFormatModal: React.FC<AIFormatModalProps> = ({ isOpen, onClose }) => {
  const [rawText, setRawText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, chapters: 0 });
  const abortRef = useRef<AbortController | null>(null);
  const { importFromAI } = useBookStore();

  const handleFormat = async () => {
    if (!rawText.trim()) return;
    setIsProcessing(true);
    setProgress({ current: 0, total: 0, chapters: 0 });

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch('http://localhost:3001/api/format-book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'API request failed');
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let bookData: any = null;
      let pendingEvent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        // Keep the last (possibly incomplete) part in the buffer
        buffer = parts.pop() || '';

        for (const part of parts) {
          const lines = part.split('\n');
          let eventType = pendingEvent;
          pendingEvent = '';
          let dataStr = '';

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              eventType = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
              dataStr = line.slice(6);
            }
          }

          if (eventType && dataStr) {
            const data = JSON.parse(dataStr);
            console.log('[AIFormat] SSE event:', eventType, data);
            if (eventType === 'meta') {
              setProgress((p) => ({ ...p, total: data.total }));
            } else if (eventType === 'progress') {
              setProgress({ current: data.current, total: data.total, chapters: data.chaptersSoFar });
            } else if (eventType === 'complete') {
              bookData = data;
            } else if (eventType === 'error') {
              throw new Error(data.error || 'Server error');
            }
          }
        }
      }

      if (!bookData) throw new Error('No completion event received');
      console.log('[AIFormat] Complete! Chapters:', bookData.chapters?.length);

      const formattedChapters = bookData.chapters.map((ch: { title: string; content: string }) => ({
        title: ch.title,
        htmlContent: marked.parse(ch.content) as string,
      }));

      importFromAI(bookData.metadata.title, formattedChapters);
      setRawText('');
      onClose();
    } catch (error: any) {
      if (error?.name !== 'AbortError') {
        console.error(error);
        alert('Failed to format text. Check the backend console for details.');
      }
    } finally {
      setIsProcessing(false);
      abortRef.current = null;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-3xl p-6 flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-800">✨ AI Book Formatter</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800 text-2xl">&times;</button>
        </div>

        <p className="text-sm text-gray-600 mb-3">
          Paste your raw text, brain dump, or copied PDF content below. The AI will clean it up, extract chapters, and format it for professional typesetting.
        </p>

        <textarea
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          placeholder="Paste your messy manuscript text here..."
          className="flex-1 w-full p-4 border border-gray-300 rounded-md font-mono text-sm resize-none focus:ring-2 focus:ring-blue-500 outline-none"
          rows={15}
          disabled={isProcessing}
        />

        {/* Progress bar */}
        {isProcessing && progress.total > 0 && (
          <div className="mt-4 space-y-1">
            <div className="flex justify-between text-xs text-gray-600">
              <span>Processing chunk {progress.current} of {progress.total}</span>
              <span>{progress.chapters} chapter(s) found</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
              <div
                className="bg-gradient-to-r from-blue-500 to-purple-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3 mt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md"
            disabled={isProcessing}
          >
            Cancel
          </button>
          <button
            onClick={handleFormat}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center gap-2 disabled:bg-blue-300"
            disabled={isProcessing}
          >
            {isProcessing ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                {progress.total > 0 ? `${Math.round((progress.current / progress.total) * 100)}% — Chunk ${progress.current}/${progress.total}` : 'Formatting...'}
              </>
            ) : (
              '✨ Format as Book'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
