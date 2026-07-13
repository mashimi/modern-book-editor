import React, { useState, useRef } from 'react';
import { marked } from 'marked';
import { useBookStore } from '../store/useBookStore';
import { Upload, FileText, Loader2 } from 'lucide-react';

interface AIFormatModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AIFormatModal: React.FC<AIFormatModalProps> = ({ isOpen, onClose }) => {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, chapters: 0 });
  const [statusText, setStatusText] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const { importFromAI } = useBookStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setFile(f);
  };

  const handleFormat = async () => {
    if (!file) return;
    setIsProcessing(true);
    setProgress({ current: 0, total: 0, chapters: 0 });
    setStatusText('Uploading document...');

    try {
      // Step 1: Upload the .docx file to parse it
      const formData = new FormData();
      formData.append('document', file);

      const parseRes = await fetch('http://localhost:3001/api/parse-docx', {
        method: 'POST',
        body: formData,
      });

      if (!parseRes.ok) {
        const err = await parseRes.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to parse document');
      }

      const parseData = await parseRes.json();
      const rawText = parseData.text;
      const docTitle = parseData.title || file.name.replace(/\.docx$/i, '');

      if (!rawText || rawText.trim().length < 100) {
        throw new Error('Document is too short. Please upload a document with at least 100 characters.');
      }

      setStatusText('AI is formatting your book...');

      // Step 2: Send extracted text to AI formatter
      const controller = new AbortController();
      abortRef.current = controller;

      const response = await fetch('http://localhost:3001/api/format-book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'AI formatting request failed');
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
            if (eventType === 'meta') {
              setProgress((p) => ({ ...p, total: data.total }));
            } else if (eventType === 'progress') {
              setProgress({ current: data.current, total: data.total, chapters: data.chaptersSoFar });
              setStatusText(`Processing chunk ${data.current} of ${data.total}...`);
            } else if (eventType === 'complete') {
              bookData = data;
            } else if (eventType === 'error') {
              throw new Error(data.error || 'Server error');
            }
          }
        }
      }

      if (!bookData) throw new Error('No completion event received');

      // Step 3: Import into the editor
      const formattedChapters = bookData.chapters.map((ch: { title: string; content: string }) => ({
        title: ch.title,
        htmlContent: marked.parse(ch.content) as string,
      }));

      importFromAI(bookData.metadata?.title || docTitle, formattedChapters);
      setFile(null);
      onClose();
    } catch (error: any) {
      if (error?.name !== 'AbortError') {
        console.error(error);
        alert('Failed to format document: ' + error.message);
      }
    } finally {
      setIsProcessing(false);
      abortRef.current = null;
      setStatusText('');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-xl p-6 flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-800">✨ AI Book Formatter</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800 text-2xl">&times;</button>
        </div>

        <p className="text-sm text-gray-600 mb-4">
          Upload a Word document (.docx) and the AI will extract the text, detect chapters, and format it for professional typesetting.
        </p>

        {/* File Upload Area */}
        <div
          onClick={() => !isProcessing && fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
            file
              ? 'border-green-400 bg-green-50'
              : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50'
          } ${isProcessing ? 'pointer-events-none opacity-60' : ''}`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".docx,.doc"
            onChange={handleFileSelect}
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
              <p className="text-gray-600 font-medium">Click to select a Word document</p>
              <p className="text-xs text-gray-400 mt-1">.docx files only</p>
            </div>
          )}
        </div>

        {/* Progress */}
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
                  <span>{progress.chapters} chapter(s) found</span>
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
            onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md"
            disabled={isProcessing}
          >
            Cancel
          </button>
          <button
            onClick={handleFormat}
            className="px-6 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-md hover:opacity-90 flex items-center gap-2 disabled:opacity-50"
            disabled={isProcessing || !file}
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