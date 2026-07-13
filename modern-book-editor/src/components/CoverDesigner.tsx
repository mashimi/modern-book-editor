import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Download } from 'lucide-react';

export const CoverDesigner: React.FC = () => {
  const navigate = useNavigate();
  const [title, setTitle] = useState('My Book');
  const [author, setAuthor] = useState('Author Name');
  const [subtitle, setSubtitle] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#1e3a5f');
  const [accentColor, setAccentColor] = useState('#c9a84c');
  const [fontStyle, setFontStyle] = useState<'classic' | 'modern' | 'minimal'>('classic');
  const [bleed, setBleed] = useState(true);

  const fontClass = fontStyle === 'classic' ? 'font-serif' : fontStyle === 'modern' ? 'font-sans' : 'font-light tracking-wide';

  const handleDownload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = bleed ? 1650 : 1500;
    canvas.height = bleed ? 2550 : 2400;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = primaryColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(150, canvas.height / 2 - 60);
    ctx.lineTo(canvas.width - 150, canvas.height / 2 - 60);
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.font = `bold ${fontStyle === 'classic' ? 72 : 64}px ${fontStyle === 'classic' ? 'Georgia' : fontStyle === 'modern' ? 'Helvetica' : 'Helvetica Neue'}`;
    ctx.fillText(title, canvas.width / 2, canvas.height / 2 - 140);

    if (subtitle) {
      ctx.fillStyle = accentColor;
      ctx.font = '36px Georgia';
      ctx.fillText(subtitle, canvas.width / 2, canvas.height / 2 - 40);
    }

    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(250, canvas.height / 2 + 40);
    ctx.lineTo(canvas.width - 250, canvas.height / 2 + 40);
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = '40px Georgia';
    ctx.textAlign = 'center';
    ctx.fillText(author, canvas.width / 2, canvas.height / 2 + 140);

    const link = document.createElement('a');
    link.download = 'cover.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-8 overflow-y-auto">
      <div className="max-w-6xl mx-auto">
        <button onClick={() => navigate('/')} className="flex items-center gap-2 text-zinc-600 hover:text-zinc-900 mb-6">
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </button>

        <h1 className="text-3xl font-bold font-serif text-zinc-900 dark:text-zinc-100 mb-8">Cover Designer</h1>

        <div className="grid grid-cols-2 gap-8">
          {/* Controls */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Title</label>
              <input type="text" value={title} onChange={e => setTitle(e.target.value)} className="w-full border border-zinc-300 dark:border-zinc-700 rounded-lg px-3 py-2 bg-transparent" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Author</label>
              <input type="text" value={author} onChange={e => setAuthor(e.target.value)} className="w-full border border-zinc-300 dark:border-zinc-700 rounded-lg px-3 py-2 bg-transparent" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Subtitle (optional)</label>
              <input type="text" value={subtitle} onChange={e => setSubtitle(e.target.value)} className="w-full border border-zinc-300 dark:border-zinc-700 rounded-lg px-3 py-2 bg-transparent" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Primary Color</label>
              <input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} className="w-full h-10 rounded cursor-pointer" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Accent Color</label>
              <input type="color" value={accentColor} onChange={e => setAccentColor(e.target.value)} className="w-full h-10 rounded cursor-pointer" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Font Style</label>
              <select value={fontStyle} onChange={e => setFontStyle(e.target.value as any)} className="w-full border border-zinc-300 dark:border-zinc-700 rounded-lg px-3 py-2 bg-transparent">
                <option value="classic">Classic (Serif)</option>
                <option value="modern">Modern (Sans)</option>
                <option value="minimal">Minimal</option>
              </select>
            </div>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={bleed} onChange={e => setBleed(e.target.checked)} className="rounded" />
              <span className="text-sm text-zinc-600 dark:text-zinc-400">Include bleed (0.125in)</span>
            </label>
            <button onClick={handleDownload} className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 flex items-center justify-center gap-2">
              <Download className="w-4 h-4" /> Download Cover PNG
            </button>
          </div>

          {/* Preview */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 flex items-center justify-center">
            <div
              style={{ backgroundColor: primaryColor, width: 300, height: 450 }}
              className="rounded-lg shadow-xl flex flex-col items-center justify-center text-center p-8"
            >
              <div style={{ borderColor: accentColor }} className="w-3/4 border-t-2 mb-6" />
              <h2 className={`text-white text-2xl font-bold ${fontClass} mb-2`}>{title}</h2>
              {subtitle && <p style={{ color: accentColor }} className="text-sm mb-4">{subtitle}</p>}
              <div style={{ borderColor: accentColor }} className="w-1/2 border-t mb-6" />
              <p className="text-white text-lg">{author}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
