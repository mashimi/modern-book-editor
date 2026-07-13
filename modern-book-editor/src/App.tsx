import { Routes, Route } from 'react-router-dom';
import { Dashboard } from './components/Dashboard';
import { EditorLayout } from './components/EditorLayout';
import { SettingsPage } from './components/SettingsPage';
import { ExportPage } from './components/ExportPage';
import { CoverDesigner } from './components/CoverDesigner';
import { useBookStore } from './store/useBookStore';

function App() {
  const { theme } = useBookStore();

  const themeClasses = {
    light: 'bg-zinc-50 text-zinc-900',
    dark: 'bg-zinc-900 text-zinc-100',
    sepia: 'bg-[#fdf9f0] text-amber-950'
  };

  return (
    <div className={`h-screen w-screen overflow-hidden font-sans transition-colors duration-300 ${themeClasses[theme]}`}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/editor/:manuscriptId?" element={<EditorLayout />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/export" element={<ExportPage />} />
        <Route path="/cover" element={<CoverDesigner />} />
      </Routes>
    </div>
  );
}

export default App;

