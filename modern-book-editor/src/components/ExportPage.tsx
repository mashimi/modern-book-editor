import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBookStore } from '../store/useBookStore';
import { apiUrl } from '../lib/api';
import { countWords } from '../utils/wordCounter';
import { ArrowLeft, Download } from 'lucide-react';

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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
  if (node.type === 'hardBreak') return '  \n';
  if (node.type === 'image') {
    const src = String(node.attrs?.src || '').replace(/"/g, '%22');
    const caption = String(node.attrs?.caption || node.attrs?.alt || '');
    const isFullBleed = String(node.attrs?.class || '').includes('full-bleed');
    const safeCaption = escapeHtml(caption);
    return `\n<div class="image-wrapper"><img src="${src}" alt="${safeCaption}"${isFullBleed ? ' class="full-bleed"' : ''} />${caption ? '<p class="image-caption">' + safeCaption + '</p>' : ''}</div>\n`;
  }
  return (node.content || []).map(inlineToMarkdown).join('');
}


function blockToMarkdown(node: any, depth = 0): string {
  if (!node) return '';
  switch (node.type) {
    case 'doc': return (node.content || []).map((child: any) => blockToMarkdown(child, depth)).join('');
    case 'paragraph': return inlineToMarkdown(node).trim() + '\n\n';
    case 'heading': { const level = node.attrs?.level || 1; return '#'.repeat(level) + ' ' + inlineToMarkdown(node).trim() + '\n\n'; }
    case 'bulletList': return (node.content || []).map((li: any) => '  '.repeat(depth) + '- ' + blockToMarkdown(li, depth).trim() + '\n').join('') + '\n';
    case 'orderedList': return (node.content || []).map((li: any) => '  '.repeat(depth) + '1. ' + blockToMarkdown(li, depth).trim() + '\n').join('') + '\n';
    case 'listItem': return (node.content || []).map((child: any) => child.type === 'paragraph' ? inlineToMarkdown(child) : '\n' + blockToMarkdown(child, depth + 1)).join('');
    case 'blockquote': { const inner = (node.content || []).map((child: any) => blockToMarkdown(child, depth)).join('').trim(); return inner.split('\n').map((l: string) => '> ' + l).join('\n') + '\n\n'; }
    case 'codeBlock': { const code = (node.content || []).map((c: any) => c.text || '').join(''); return '```\n' + code + '\n```\n\n'; }
    case 'horizontalRule': return '\n---\n\n';
    default: return inlineToMarkdown(node);
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
  const totalWords = chapters.reduce((sum, chapter) => sum + countWords(chapter.content), 0);

  const handleExportPDF = async () => {
    setError('');
    if (chapters.length === 0) { setError('Add at least one chapter before exporting.'); return; }
    setExporting(true);
    try {
      const payload = {
        metadata: { title: bookTitle || 'My Book', author: author || 'Anonymous', trimSize: '6x9in' },
        chapters: chapters.map((chapter) => ({ title: chapter.title, content: chapter.content ? jsonToMarkdown(chapter.content) : '' })),
      };
      const response = await fetch(apiUrl('/api/generate-pdf'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      if (!response.ok) { const err = await response.json().catch(() => ({})); throw new Error(err.error || err.details || 'PDF export failed'); }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = (bookTitle || 'manuscript').replace(/[^\w\- ]+/g, '').trim() || 'manuscript' + '.pdf';
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err: any) { console.error(err); setError(err?.message || 'Export failed'); }
    finally { setExporting(false); }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-8 overflow-y-auto">
      <div className="max-w-3xl mx-auto">
        <button onClick={() => navigate('/')} className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 mb-6">
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </button>
        <h1 className="text-3xl font-bold font-serif text-zinc-900 dark:text-zinc-100 mb-8">Export Manuscript</h1>
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 space-y-6">
          <div>
            <h2 className="font-semibold text-zinc-800 dark:text-zinc-200 mb-2">Summary</h2>
            <p className="text-sm text-zinc-500">{chapters.length} chapters &middot; {totalWords.toLocaleString()} words</p>
          </div>
          <div>
            <h2 className="font-semibold text-zinc-800 dark:text-zinc-200 mb-2">Print PDF</h2>
            <p className="text-sm text-zinc-500">Generates a 6&times;9 print-ready PDF using the Python WeasyPrint typesetting engine.</p>
          </div>
          {error && <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-300">{error}</div>}
          <button onClick={handleExportPDF} disabled={exporting || chapters.length === 0} className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-blue-300 flex items-center justify-center gap-2">
            {exporting ? <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" /> : <Download className="w-4 h-4" />}
            {exporting ? 'Exporting...' : 'Export Print PDF'}
          </button>
        </div>
      </div>
    </div>
  );
};