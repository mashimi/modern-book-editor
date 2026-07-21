import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBookStore } from '../store/useBookStore';
import { createManuscript, getAllManuscripts, deleteManuscript, saveManuscript } from '../db/localDb';
import { countWords } from '../utils/wordCounter';
import { AIFormatModal } from './AIFormatModal';
import { BookOpen, Trash2, FileText, Settings, Download, Clock, Upload, Clipboard, PenLine } from 'lucide-react';

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [manuscripts, setManuscripts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'upload' | 'paste'>('upload');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const loadProjects = async () => {
    setLoading(true);
    setManuscripts(await getAllManuscripts());
    setLoading(false);
  };
  useEffect(() => { loadProjects(); }, []);

  const openUpload = () => { setModalMode('upload'); setPendingFile(null); setIsModalOpen(true); };
  const openPaste = () => { setModalMode('paste'); setPendingFile(null); setIsModalOpen(true); };

  const acceptDrop = (f: File | undefined) => {
    if (!f) return;
    if (!/\.(docx|doc|txt|md|markdown)$/i.test(f.name)) {
      alert('Please drop a .docx, .txt or .md file.');
      return;
    }
    setModalMode('upload');
    setPendingFile(f);
    setIsModalOpen(true);
  };

  const handleComplete = async () => {
    const s = useBookStore.getState();
    const title = s.bookTitle || 'Formatted Book';
    const { author, chapters, theme } = s;
    const id = await createManuscript(title);
    await saveManuscript(id, {
      title, author, chapters,
      metadata: { theme, updatedAt: Date.now() } as any,
    });
    await loadProjects();
    navigate(`/editor/${id}`);
  };

  const handleNewBlank = async () => {
    const id = await createManuscript('Untitled Book');
    navigate(`/editor/${id}`);
  };

  const handleOpen = (m: any) => {
    useBookStore.getState().loadManuscript({
      chapters: m.chapters, bookTitle: m.title, author: m.author, theme: m.metadata?.theme || 'light',
    });
    navigate(`/editor/${m.id}`);
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm('Delete this manuscript permanently?')) return;
    await deleteManuscript(id);
    await loadProjects();
  };

  return (
    <>
    <div className="flex h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-sans">
      <aside className="w-64 bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 flex flex-col p-6">
        <div className="flex items-center gap-2 mb-10">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-xl font-bold">Mashimi</h1>
        </div>
        <nav className="flex flex-col gap-2 flex-1">
          <button onClick={openUpload} className="flex items-center gap-3 px-4 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors">
            <Upload className="w-4 h-4" /> Upload a book
          </button>
          <button onClick={() => navigate('/settings')} className="flex items-center gap-3 px-4 py-2.5 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors">
            <Settings className="w-4 h-4" /> Typography
          </button>
          <button onClick={() => navigate('/export')} className="flex items-center gap-3 px-4 py-2.5 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors">
            <Download className="w-4 h-4" /> Export
          </button>
        </nav>
        <div className="mt-auto pt-6 border-t border-zinc-200 dark:border-zinc-800">
          <p className="text-xs text-zinc-400">Local Storage</p>
          <p className="text-sm font-medium">{manuscripts.length} Book(s)</p>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <header className="p-8 border-b border-zinc-200 dark:border-zinc-800">
          <h2 className="text-3xl font-bold mb-2">Turn a document into a finished book</h2>
          <p className="text-zinc-500 dark:text-zinc-400">
            Drop your manuscript below. The AI editor detects the chapters, removes the table of contents,
            fixes paragraphs and line-wraps, and builds a clean, print-ready book — no manual setup.
          </p>
        </header>

        <div className="p-8">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); acceptDrop(e.dataTransfer.files?.[0]); }}
            onClick={openUpload}
            className={`cursor-pointer rounded-2xl border-2 border-dashed p-12 text-center transition-colors ${
              dragOver ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-zinc-300 dark:border-zinc-700 hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-900/10'
            }`}
          >
            <Upload className="w-12 h-12 text-blue-500 mx-auto mb-4" />
            <p className="text-lg font-semibold mb-1">Drop your manuscript here</p>
            <p className="text-sm text-zinc-500 mb-5">.docx, .txt or .md — or click to browse</p>
            <div className="flex justify-center gap-3" onClick={(e) => e.stopPropagation()}>
              <button onClick={openUpload} className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg text-sm font-medium hover:opacity-90 flex items-center gap-2">
                <Upload className="w-4 h-4" /> Choose file
              </button>
              <button onClick={openPaste} className="px-5 py-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2">
                <Clipboard className="w-4 h-4" /> Paste text
              </button>
            </div>
            <button onClick={(e) => { e.stopPropagation(); handleNewBlank(); }} className="mt-5 inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
              <PenLine className="w-3.5 h-3.5" /> or start with a blank page
            </button>
          </div>
        </div>

        <div className="px-8 pb-12">
          <h3 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4" /> Your books
          </h3>
          {loading ? (
            <div className="flex justify-center py-10"><div className="animate-spin h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full" /></div>
          ) : manuscripts.length === 0 ? (
            <div className="text-center py-10 bg-zinc-100 dark:bg-zinc-900/50 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700">
              <p className="text-zinc-500">No books yet — drop one above to begin.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {manuscripts.map((m) => {
                const words = m.chapters.reduce((sum: number, ch: any) => sum + countWords(ch.content), 0);
                return (
                  <div key={m.id} onClick={() => handleOpen(m)} className="relative bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 hover:shadow-lg transition-all cursor-pointer group">
                    <button onClick={(e) => handleDelete(e, m.id)} className="absolute top-3 right-3 p-1.5 opacity-0 group-hover:opacity-100 hover:bg-red-50 text-red-500 rounded transition-all">
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <div className="w-8 h-10 bg-gradient-to-br from-zinc-700 to-zinc-900 rounded mb-4 flex items-center justify-center text-white text-[10px] font-serif">
                      {m.title.slice(0, 2).toUpperCase()}
                    </div>
                    <h4 className="font-semibold truncate pr-6">{m.title}</h4>
                    <div className="flex items-center gap-3 mt-2 text-xs text-zinc-400">
                      <span className="flex items-center gap-1"><FileText className="w-3 h-3" /> {m.chapters.length} Ch</span>
                      <span className="flex items-center gap-1"><PenLine className="w-3 h-3" /> {words.toLocaleString()} W</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>

    <AIFormatModal
      isOpen={isModalOpen}
      onClose={() => setIsModalOpen(false)}
      onSuccess={handleComplete}
      initialMode={modalMode}
      initialFile={pendingFile}
    />
    </>
  );
};
