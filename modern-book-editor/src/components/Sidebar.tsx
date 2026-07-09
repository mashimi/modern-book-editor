import React, { useState } from 'react';
import { useBookStore } from '../store/useBookStore';
import { countWords } from '../utils/wordCounter';
import { AIFormatModal } from './AIFormatModal';

export const Sidebar: React.FC = () => {
  const { 
    chapters, 
    activeChapterId, 
    setActiveChapter, 
    addChapter, 
    deleteChapter, 
    updateChapterTitle,
    bookTitle,
    author,
    theme,
    setSidebarOpen,
    searchQuery,
    setSearchQuery
  } = useBookStore();

  const [isModalOpen, setIsModalOpen] = useState(false);

  // Filter chapters based on search query
  const filteredChapters = chapters.filter(chapter => 
    chapter.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Compute total word count
  const totalWords = chapters.reduce((sum, ch) => sum + countWords(ch.content), 0);

  // ── TipTap JSON → Markdown helper ──────────────────────────────────────
  function tipTapToMarkdown(node: any): string {
    if (!node) return '';
    const { type, content, text, marks } = node;

    if (type === 'text' && text !== undefined) {
      let t = text;
      if (marks) {
        for (const m of marks) {
          if (m.type === 'bold') t = `**${t}**`;
          else if (m.type === 'italic') t = `*${t}*`;
          else if (m.type === 'code') t = `\`${t}\``;
          else if (m.type === 'strike') t = `~~${t}~~`;
          else if (m.type === 'link') t = `[${t}](${m.attrs?.href || ''})`;
        }
      }
      return t;
    }

    const children = (content || []).map(tipTapToMarkdown).join('');

    switch (type) {
      case 'paragraph':       return `${children}\n\n`;
      case 'heading': {
        const level = node.attrs?.level || 1;
        return `${'#'.repeat(level)} ${children}\n\n`;
      }
      case 'bulletList':      return `${children}\n`;
      case 'orderedList':     return `${children}\n`;
      case 'listItem':        return `- ${children}\n`;
      case 'blockquote':      return `> ${children}\n\n`;
      case 'codeBlock':       return '```\n' + children + '```\n\n';
      case 'horizontalRule':  return '---\n\n';
      case 'hardBreak':       return '\n';
      case 'image': {
        const { src, alt, caption } = node.attrs || {};
        let md = `![${alt || ''}](${src || ''})`;
        if (caption) md += `\n*${caption}*`;
        return md + '\n\n';
      }
      default:                return children;
    }
  }

  // ── Export handler ─────────────────────────────────────────────────────
  const handleExportPDF = async () => {
    const chaptersForExport = chapters.map((ch) => ({
      title: ch.title,
      content: ch.content ? tipTapToMarkdown(ch.content).trim() : '',
    }));

    const payload = {
      metadata: {
        title: bookTitle || 'My Book',
        author: author || 'Anonymous',
        trimSize: '6x9in',
      },
      chapters: chaptersForExport,
    };

    try {
      const response = await fetch('http://localhost:3001/api/generate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'PDF export failed');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'print_ready_book.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('PDF export error:', error);
      alert('Failed to generate PDF. Check the backend console for details.');
    }
  };

  // Theme-specific styles
  const sidebarStyles = {
    light: 'bg-zinc-50 border-zinc-200 text-zinc-800',
    dark: 'bg-zinc-900 border-zinc-800 text-zinc-100',
    sepia: 'bg-[#f7f3e8] border-[#e8dfc7] text-[#433422]'
  };

  const inputStyles = {
    light: 'bg-zinc-200/50 border-zinc-300 focus:bg-white focus:border-zinc-400 text-zinc-800 placeholder-zinc-400',
    dark: 'bg-zinc-800/70 border-zinc-700 focus:bg-zinc-800 focus:border-zinc-600 text-zinc-100 placeholder-zinc-500',
    sepia: 'bg-[#ebdcb9]/40 border-[#d9ccab] focus:bg-[#fcfaf5] focus:border-[#c5b591] text-[#36291a] placeholder-[#b8a98b]'
  };

  const itemStyles = (isActive: boolean) => {
    if (isActive) {
      return {
        light: 'bg-zinc-200/80 text-zinc-950 font-semibold border-l-4 border-zinc-800 shadow-sm',
        dark: 'bg-zinc-800 text-white font-semibold border-l-4 border-zinc-400 shadow-sm',
        sepia: 'bg-[#ebdcb9] text-[#2c1a04] font-semibold border-l-4 border-[#8c5820] shadow-sm'
      }[theme];
    }
    return {
      light: 'hover:bg-zinc-200/40 text-zinc-650',
      dark: 'hover:bg-zinc-800/40 text-zinc-405',
      sepia: 'hover:bg-[#ebdcb9]/30 text-[#5c4a37]'
    }[theme];
  };

  const headerBorderStyles = {
    light: 'border-zinc-200',
    dark: 'border-zinc-800',
    sepia: 'border-[#e8dfc7]'
  };

  return (
    <>
    <aside className={`w-72 border-r h-screen flex flex-col transition-all duration-300 ease-in-out select-none ${sidebarStyles[theme]}`}>
      {/* Sidebar Header */}
      <div className={`p-4 border-b flex justify-between items-center ${headerBorderStyles[theme]}`}>
        <div className="flex items-center gap-2">
          {/* Custom book feather icon */}
          <svg className="w-5 h-5 opacity-80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
          <h2 className="font-bold tracking-tight text-md">Manuscript</h2>
        </div>
        <div className="flex items-center gap-1">
          <button 
            onClick={addChapter}
            className="p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex items-center justify-center"
            title="Add Chapter"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </button>
          <button 
            onClick={() => setSidebarOpen(false)}
            className="p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex items-center justify-center md:flex"
            title="Collapse Sidebar"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="p-3">
        <div className="relative">
          <input 
            type="text" 
            placeholder="Search chapters..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`w-full text-xs pl-8 pr-3 py-1.5 rounded-md border outline-none transition-all ${inputStyles[theme]}`}
          />
          <svg className="w-3.5 h-3.5 absolute left-2.5 top-2.5 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>
      
      {/* AI Format Book */}
      <div className="p-4 border-b border-gray-200">
        <button 
          onClick={() => setIsModalOpen(true)}
          className="w-full py-2 px-4 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-md text-sm font-semibold hover:opacity-90 flex items-center justify-center gap-2 shadow-md transition-opacity"
        >
          ✨ AI Format Book
        </button>
      </div>

      {/* Export Print PDF */}
      <div className="px-4 pb-4 border-b border-gray-200">
        <button 
          onClick={handleExportPDF}
          className="w-full py-2 px-4 bg-green-600 text-white rounded-md text-sm font-semibold hover:bg-green-700 flex items-center justify-center gap-2 shadow-md transition-colors"
        >
          📄 Export Print PDF
        </button>
      </div>
      
      {/* Chapter List */}
      <nav className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">
        {filteredChapters.map((chapter, index) => {
          const isActive = activeChapterId === chapter.id;
          return (
            <div 
              key={chapter.id}
              onClick={() => setActiveChapter(chapter.id)}
              className={`group flex items-center px-3 py-2.5 rounded-md cursor-pointer transition-all duration-200 border-l-4 border-transparent ${itemStyles(isActive)}`}
            >
              <span className={`text-xs mr-2 transition-opacity ${isActive ? 'opacity-90' : 'opacity-40'}`}>
                {index + 1}.
              </span>
              <input 
                type="text" 
                value={chapter.title}
                onChange={(e) => updateChapterTitle(chapter.id, e.target.value)}
                onClick={(e) => e.stopPropagation()}
                className="bg-transparent border-none outline-none flex-1 text-xs font-medium focus:ring-0 focus:outline-none"
              />
              {chapters.length > 1 && (
                <button 
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    if (confirm(`Delete "${chapter.title}"?`)) {
                      deleteChapter(chapter.id); 
                    }
                  }}
                  className="opacity-0 group-hover:opacity-100 hover:text-red-500 p-1 rounded transition-all duration-200"
                  title="Delete Chapter"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
            </div>
          );
        })}
        {filteredChapters.length === 0 && (
          <div className="p-4 text-center text-xs opacity-40 italic">
            No chapters found
          </div>
        )}
      </nav>

      {/* Sidebar Footer Stats */}
      <div className={`p-4 border-t text-xs font-medium flex justify-between items-center ${headerBorderStyles[theme]}`}>
        <span className="opacity-60">Total Words:</span>
        <span className="font-semibold tracking-wide">{totalWords.toLocaleString()}</span>
      </div>
    </aside>

      <AIFormatModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  );
};