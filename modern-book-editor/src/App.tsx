import { Sidebar } from './components/Sidebar';
import { BookEditor } from './components/BookEditor';
import { useBookStore } from './store/useBookStore';

function App() {
  const { theme, focusMode, sidebarOpen } = useBookStore();

  const themeClasses = {
    light: 'bg-zinc-50 text-zinc-900',
    dark: 'bg-zinc-900 text-zinc-100',
    sepia: 'bg-[#fdf9f0] text-amber-950'
  };

  const currentThemeClass = themeClasses[theme] || themeClasses.light;

  return (
    <div className={`flex h-screen w-screen overflow-hidden font-sans transition-colors duration-300 ${currentThemeClass}`}>
      {!focusMode && sidebarOpen && <Sidebar />}
      <BookEditor />
    </div>
  );
}

export default App;

