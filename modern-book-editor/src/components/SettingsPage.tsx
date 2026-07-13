import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useBookStore } from '../store/useBookStore';
import { ArrowLeft } from 'lucide-react';

export const SettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const { theme, setTheme, fontFamily, setFontFamily, fontSize, setFontSize } = useBookStore();

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-8 overflow-y-auto">
      <div className="max-w-3xl mx-auto">
        <button onClick={() => navigate('/')} className="flex items-center gap-2 text-zinc-600 hover:text-zinc-900 mb-6">
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </button>

        <h1 className="text-3xl font-bold font-serif text-zinc-900 dark:text-zinc-100 mb-8">Typography & Settings</h1>

        {/* Theme */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200 mb-3">Theme</h2>
          <div className="flex gap-3">
            {(['light', 'dark', 'sepia'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={`px-6 py-3 rounded-lg border-2 transition-all ${
                  theme === t
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                    : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300'
                }`}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </section>

        {/* Font Family */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200 mb-3">Font Family</h2>
          <div className="flex gap-3">
            {(['serif', 'sans'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFontFamily(f)}
                className={`px-6 py-3 rounded-lg border-2 transition-all ${
                  fontFamily === f
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                    : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300'
                }`}
              >
                <span className={f === 'serif' ? 'font-serif' : 'font-sans'}>
                  {f === 'serif' ? 'Serif (Merriweather)' : 'Sans-Serif (Inter)'}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* Font Size */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200 mb-3">Font Size</h2>
          <div className="flex gap-3">
            {(['sm', 'base', 'lg', 'xl'] as const).map(s => (
              <button
                key={s}
                onClick={() => setFontSize(s)}
                className={`px-6 py-3 rounded-lg border-2 transition-all ${
                  fontSize === s
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                    : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300'
                }`}
              >
                {s === 'sm' ? 'Small' : s === 'base' ? 'Medium' : s === 'lg' ? 'Large' : 'X-Large'}
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};
