import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBookStore } from '../store/useBookStore';
import {
  createManuscript, getAllManuscripts, deleteManuscript,
  exportAllData, importAllData
} from '../db/localDb';
import { countWords } from '../utils/wordCounter';
import {
  BookOpen, FileText, Type, Settings, Download, Sparkles,
  Plus, Trash2, Palette, Upload, HardDrive
} from 'lucide-react';

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { loadManuscript } = useBookStore();
  const [manuscripts, setManuscripts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadManuscripts(); }, []);

  const loadManuscripts = async () => {
    const data = await getAllManuscripts();
    setManuscripts(data);
    setLoading(false);
  };

  const handleCreate = async () => {
    const id = await createManuscript('Untitled Manuscript');
    navigate(`/editor/${id}`);
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
    if (!confirm('Delete this manuscript?')) return;
    await deleteManuscript(id);
    await loadManuscripts();
  };

  const handleExport = async () => {
    const data = await exportAllData();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `book-editor-backup-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    await importAllData(text);
    await loadManuscripts();
    alert('Data imported successfully!');
  };

  const totalWords = (m: any) => m.chapters.reduce((sum: number, ch: any) => sum + countWords(ch.content), 0);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-8 overflow-y-auto">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold font-serif text-zinc-900 dark:text-zinc-100">
              Manuscript Dashboard
            </h1>
            <p className="text-zinc-500 dark:text-zinc-400 mt-1 flex items-center gap-2">
              <HardDrive className="w-4 h-4" /> Local Storage &bull; {manuscripts.length} project{manuscripts.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <label className="px-4 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer flex items-center gap-2">
              <Upload className="w-4 h-4" /> Import
              <input type="file" accept=".json" onChange={handleImport} className="hidden" />
            </label>
            <button onClick={handleExport} className="px-4 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2">
              <Download className="w-4 h-4" /> Backup
            </button>
            <button onClick={handleCreate} className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 flex items-center gap-2">
              <Plus className="w-4 h-4" /> New Manuscript
            </button>
          </div>
        </div>

        {/* Projects Grid */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
          </div>
        ) : manuscripts.length === 0 ? (
          <div className="text-center py-20 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
            <BookOpen className="w-12 h-12 text-zinc-300 mx-auto mb-4" />
            <p className="text-zinc-500 mb-4">No manuscripts yet.</p>
            <button onClick={handleCreate} className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium">
              Create Your First Manuscript
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-6">
            {manuscripts.map((m) => {
              const words = totalWords(m);
              const pages = Math.ceil(words / 300);
              const updated = new Date(m.metadata.updatedAt).toLocaleDateString();
              return (
                <div 
                  key={m.id}
                  onClick={() => handleOpen(m)}
                  className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 shadow-sm hover:shadow-md transition-all cursor-pointer group relative"
                >
                  <button 
                    onClick={(e) => handleDelete(e, m.id)}
                    className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-50 text-red-500 rounded transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <div className="w-12 h-16 bg-gradient-to-br from-zinc-700 to-zinc-900 rounded shadow-md flex items-center justify-center text-white text-xs font-serif mb-4">
                    {m.title.slice(0, 2).toUpperCase()}
                  </div>
                  <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-1 truncate pr-8">
                    {m.title}
                  </h3>
                  <p className="text-sm text-zinc-500 mb-4">{m.author || 'No author'}</p>
                  <div className="flex items-center gap-4 text-xs text-zinc-400">
                    <span className="flex items-center gap-1"><Type className="w-3 h-3" /> {words.toLocaleString()}</span>
                    <span className="flex items-center gap-1"><BookOpen className="w-3 h-3" /> {pages}p</span>
                    <span className="flex items-center gap-1"><FileText className="w-3 h-3" /> {m.chapters.length} ch</span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-3">Updated {updated}</p>
                </div>
              );
            })}
          </div>
        )}

        {/* Quick Actions */}
        <div className="mt-8 grid grid-cols-4 gap-4">
          <ActionCard icon={Sparkles} label="AI Format" desc="Upload & auto-format" onClick={() => navigate('/editor')} color="bg-purple-500" />
          <ActionCard icon={Palette} label="Cover Designer" desc="Design your book cover" onClick={() => navigate('/cover')} color="bg-pink-500" />
          <ActionCard icon={Settings} label="Typography" desc="Fonts & trim sizes" onClick={() => navigate('/settings')} color="bg-orange-500" />
          <ActionCard icon={Download} label="Export" desc="PDF with crop marks" onClick={() => navigate('/export')} color="bg-emerald-500" />
        </div>
      </div>
    </div>
  );
};

function ActionCard({ icon: Icon, label, desc, onClick, color }: any) {
  return (
    <button onClick={onClick} className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 text-left hover:shadow-md transition-all">
      <div className={`${color} w-10 h-10 rounded-lg flex items-center justify-center mb-3`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <p className="font-semibold text-zinc-900 dark:text-zinc-100">{label}</p>
      <p className="text-xs text-zinc-500 mt-1">{desc}</p>
    </button>
  );
}