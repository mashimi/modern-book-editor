import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBookStore } from '../store/useBookStore';
import { ArrowLeft, Download, FileText } from 'lucide-react';

export const ExportPage: React.FC = () => {
  const navigate = useNavigate();
  const { chapters, bookTitle, author } = useBookStore();
  const [exporting, setExporting] = useState(false);
  const [format, setFormat] = useState<'pdf' | 'docx'>('pdf');
  const [includeToc, setIncludeToc] = useState(true);
  const [includePageNumbers, setIncludePageNumbers] = useState(true);

  const totalWords = chapters.reduce((sum, ch) => {
    if (!ch.content) return sum;
    let text = '';
    const extract = (node: any) => {
      if (node?.type === 'text') text += ' ' + node.text;
      if (node?.content) node.content.forEach(extract);
    };
    extract(ch.content);
    return sum + text.split(/\s+/).filter(Boolean).length;
  }, 0);

  const handleExportPDF = async () => {
    setExporting(true);
    try {
      const chaptersForExport = chapters.map(ch => {
        const tipTapToMarkdown = (node: any): string => {
          if (!node) return '';
          if (node.type === 'text') {
            let text = node.text || '';
            if (node.marks) {
              for (const mark of node.marks) {
                if (mark.type === 'bold') text = `**${text}**`;
                else if (mark.type === 'italic') text = `*${text}*`;
                else if (mark.type === 'code') text = `\`${text}\``;
              }
            }
            return text;
          }
          const children = (node.content || []).map(tipTapToMarkdown).join('');
          switch (node.type) {
            case 'paragraph': return children + '\n\n';
            case 'heading': {
              const level = node.attrs?.level || 1;
              return '#'.repeat(level) + ' ' + children + '\n\n';
            }
            case 'bulletList': return children + '\n';
            case 'orderedList': return children + '\n';
            case 'listItem': return '- ' + children.trim() + '\n';
            case 'blockquote': return '> ' + children.trim() + '\n\n';
            case 'codeBlock': return '```\n' + children + '\n```\n\n';
            case 'horizontalRule': return '\n---\n\n';
            default: return children;
          }
        };
        return {
          title: ch.title,
          content: ch.content ? tipTapToMarkdown(ch.content).trim() : '',
        };
      });

      const payload = {
        metadata: { title: bookTitle || 'My Book', author: author || 'Anonymous', trimSize: '6x9in' },
        chapters: chaptersForExport,
      };

      const response = await fetch('http://localhost:3001/api/generate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error('PDF export failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${bookTitle || 'manuscript'}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error(err);
      alert('Export failed: ' + err.message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-8 overflow-y-auto">
      <div className="max-w-3xl mx-auto">
        <button onClick={() => navigate('/')} className="flex items-center gap-2 text-zinc-600 hover:text-zinc-900 mb-6">
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </button>

        <h1 className="text-3xl font-bold font-serif text-zinc-900 dark:text-zinc-100 mb-8">Export Manuscript</h1>

        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 space-y-6">
          <div>
            <h2 className="font-semibold text-zinc-800 dark:text-zinc-200 mb-2">Summary</h2>
            <p className="text-sm text-zinc-500">{chapters.length} chapters &middot; {totalWords.toLocaleString()} words</p>
          </div>

          <div>
            <h2 className="font-semibold text-zinc-800 dark:text-zinc-200 mb-2">Format</h2>
            <div className="flex gap-3">
              {(['pdf', 'docx'] as const).map(f => (
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

          <div className="space-y-2">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={includeToc} onChange={e => setIncludeToc(e.target.checked)} className="rounded" />
              <span className="text-sm text-zinc-700 dark:text-zinc-300">Include Table of Contents</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={includePageNumbers} onChange={e => setIncludePageNumbers(e.target.checked)} className="rounded" />
              <span className="text-sm text-zinc-700 dark:text-zinc-300">Include Page Numbers</span>
            </label>
          </div>

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
            {exporting ? 'Exporting...' : `Export as ${format.toUpperCase()}`}
          </button>
        </div>
      </div>
    </div>
  );
};
