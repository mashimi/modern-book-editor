import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useBookStore } from '../store/useBookStore';
import { AIFormatModal } from './AIFormatModal';
import { countWords } from '../utils/wordCounter';
import { BookOpen, Plus, Trash2, Sparkles, Download, PanelLeftClose, Search, Columns3, Maximize2, EyeOff } from 'lucide-react';

export const Sidebar: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isAIOpen, setAIOpen] = useState(false);

  const { chapters, activeChapterId, setActiveChapter, addChapter, deleteChapter, updateChapterTitle, bookTitle, setBookTitle, author, setAuthor, searchQuery, setSearchQuery, setSidebarOpen, previewMode, setPreviewMode } = useBookStore();

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

  const previewIcon = previewMode === 'off' ? <EyeOff className="w-4 h-4" /> : previewMode === 'split' ? <Columns3 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />;

  return (
    <aside className="w-80 h-full bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 flex flex-col">
      <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center justify-between gap-2">
          <button onClick={() => navigate('/')} className="flex items-center gap-2 font-bold text-zinc-900 dark:text-zinc-100">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-white" />
            </div>
            Mashimi
          </button>
          <button onClick={() => setSidebarOpen(false)} className="p-2 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800" title="Hide sidebar">
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>
        <div className="mt-4 space-y-2">
          <input value={bookTitle} onChange={(e) => setBookTitle(e.target.value)} placeholder="Book title" className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm font-semibold" />
          <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Author" className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm" />
        </div>
      </div>

      <div className="flex gap-2 p-3 border-b border-zinc-200 dark:border-zinc-800">
        <button onClick={() => setAIOpen(true)} className="flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 px-3 py-2 text-sm text-white font-semibold hover:opacity-90">
          <Sparkles className="w-4 h-4" />
          AI Format Book
        </button>
        <button onClick={() => navigate('/export')} className="flex items-center justify-center gap-2 rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800">
          <Download className="w-4 h-4" />
          Export
        </button>
      </div>

      <div className="flex items-center justify-between gap-2 p-3 border-b border-zinc-200 dark:border-zinc-800">
        <button onClick={() => addChapter()} className="flex items-center justify-center gap-2 rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800">
          <Plus className="w-4 h-4" />
          Chapter
        </button>
        <button onClick={cyclePreview} className="flex items-center justify-center gap-2 rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800" title={`Preview mode: ${previewMode}`}>
          {previewIcon}
          Preview
        </button>
      </div>

      <div className="p-3 border-b border-zinc-200 dark:border-zinc-800">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search chapters" className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent py-2 pl-9 pr-3 text-sm" />
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-2 space-y-1">
        {filteredChapters.length === 0 && (
          <p className="px-3 py-6 text-center text-sm text-zinc-500">No chapters found.</p>
        )}
        {filteredChapters.map((chapter) => {
          const isActive = chapter.id === activeChapterId;
          const words = countWords(chapter.content);
          return (
            <div key={chapter.id} onClick={() => setActiveChapter(chapter.id)} className={`group rounded-lg border px-3 py-2 cursor-pointer transition-colors ${isActive ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}>
              <div className="flex items-start justify-between gap-2">
                <input value={chapter.title} onClick={(e) => e.stopPropagation()} onFocus={() => setActiveChapter(chapter.id)} onChange={(e) => updateChapterTitle(chapter.id, e.target.value)} className="w-full bg-transparent text-sm font-medium focus:outline-none" />
                <button onClick={(e) => { e.stopPropagation(); if (chapters.length <= 1) return; if (confirm('Delete this chapter?')) { deleteChapter(chapter.id); } }} disabled={chapters.length <= 1} className="opacity-0 group-hover:opacity-100 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded p-1 disabled:opacity-20" title="Delete chapter">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="mt-1 text-xs text-zinc-500">{words.toLocaleString()} words</p>
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