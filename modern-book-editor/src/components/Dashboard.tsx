import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBookStore } from '../store/useBookStore';
import { createManuscript, getAllManuscripts, deleteManuscript } from '../db/localDb';
import { countWords } from '../utils/wordCounter';
import { AIFormatModal } from './AIFormatModal';
import {
  BookOpen, Plus, Trash2, Sparkles, FileText, Settings, 
  Download, PenLine, Clock, Upload
} from 'lucide-react';

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { loadManuscript } = useBookStore();
  const [manuscripts, setManuscripts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);

  useEffect(() => { loadProjects(); }, []);

  const loadProjects = async () => {
    setLoading(true);
    const data = await getAllManuscripts();
    setManuscripts(data);
    setLoading(false);
  };

  const handleNewProject = async () => {
    const id = await createManuscript('Untitled Book');
    navigate(`/editor/${id}`);
  };

  const handleAIProject = async () => {
    const id = await createManuscript('AI Formatted Book');
    navigate(`/editor/${id}?ai=1`);
  };

  const handleOpen = (m: any) => {
    loadManuscript({
      chapters: m.chapters,
      bookTitle: m.title,
      author: m.author,
      theme: m.metadata?.theme || 'light',
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
      
      {/* Left Sidebar */}
      <aside className="w-64 bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 flex flex-col p-6">
        <div className="flex items-center gap-2 mb-10">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-xl font-bold">Mashimi</h1>
        </div>

        <nav className="flex flex-col gap-2 flex-1">
          <button onClick={handleNewProject} className="flex items-center gap-3 px-4 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors">
            <Plus className="w-4 h-4" /> New Project
          </button>
          <button onClick={() => navigate('/settings')} className="flex items-center gap-3 px-4 py-2.5 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors">
            <Settings className="w-4 h-4" /> Typography
          </button>
        </nav>

        <div className="mt-auto pt-6 border-t border-zinc-200 dark:border-zinc-800">
          <p className="text-xs text-zinc-400">Local Storage</p>
          <p className="text-sm font-medium">{manuscripts.length} Project(s)</p>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <header className="p-8 border-b border-zinc-200 dark:border-zinc-800">
          <h2 className="text-3xl font-bold mb-2">Welcome back</h2>
          <p className="text-zinc-500 dark:text-zinc-400">Start a new manuscript, or let AI format your raw text into a print-ready book.</p>
        </header>

        <div className="p-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div onClick={handleNewProject} className="cursor-pointer group bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 hover:border-blue-500 transition-all">
            <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center mb-4">
              <PenLine className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <h3 className="font-bold text-lg mb-1">Quick Write</h3>
            <p className="text-sm text-zinc-500">Jump straight into a blank document and start writing.</p>
          </div>

          <div onClick={() => setIsAIModalOpen(true)} className="cursor-pointer group bg-gradient-to-br from-purple-600 to-blue-600 text-white rounded-xl p-6 hover:opacity-90 transition-all">
            <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center mb-4">
              <Sparkles className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-lg mb-1">AI Book Formatter</h3>
            <p className="text-sm text-white/80">Upload a Word doc or paste raw text. AI structures it into chapters.</p>
          </div>

          <div onClick={() => navigate('/export')} className="cursor-pointer group bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 hover:border-emerald-500 transition-all">
            <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg flex items-center justify-center mb-4">
              <Download className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h3 className="font-bold text-lg mb-1">Export PDF</h3>
            <p className="text-sm text-zinc-500">Generate a print-ready PDF with crop marks and margins.</p>
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
              <button onClick={handleNewProject} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">Create Your First Book</button>
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

    <AIFormatModal isOpen={isAIModalOpen} onClose={() => setIsAIModalOpen(false)} />
    </>
  );
};