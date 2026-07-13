import React, { useEffect, useState, useRef } from 'react';
import { useEditor, EditorContent, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Image from '@tiptap/extension-image';
import { useBookStore } from '../store/useBookStore';
import { countWords, countCharacters } from '../utils/wordCounter';
import { ImageUploadModal } from './ImageUploadModal';

// ── Custom Image NodeView (shows caption in the editor) ─────────────────────
const ImageComponent = ({ node }: any) => {
  return (
    <NodeViewWrapper className="image-node">
      <div className="image-wrapper" style={{ margin: '2em auto', textAlign: 'center' }}>
        <img
          src={node.attrs.src}
          alt={node.attrs.alt}
          style={{ maxWidth: '100%', height: 'auto', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}
          draggable={false}
        />
        {node.attrs.caption && (
          <p style={{ fontSize: '9pt', fontStyle: 'italic', color: '#666', marginTop: '0.5em', textAlign: 'center' }}>
            {node.attrs.caption}
          </p>
        )}
      </div>
    </NodeViewWrapper>
  );
};

// ── Extended Image with caption support ─────────────────────────────────────
const CustomImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      caption: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-caption'),
        renderHTML: (attributes: any) => {
          if (!attributes.caption) return {};
          return { 'data-caption': attributes.caption };
        },
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(ImageComponent);
  },
});

export const BookEditor: React.FC<{ manuscriptId?: string }> = ({ manuscriptId }) => {
  const { 
    activeChapterId, 
    chapters, 
    updateChapterContent,
    applyPendingHtml,
    theme,
    setTheme,
    fontFamily,
    setFontFamily,
    fontSize,
    setFontSize,
    focusMode,
    setFocusMode,
    sidebarOpen,
    setSidebarOpen
  } = useBookStore();

  const activeChapter = chapters.find(c => c.id === activeChapterId);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved');
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep a ref to the activeChapterId to avoid stale closure in TipTap's onUpdate
  const activeChapterIdRef = useRef(activeChapterId);
  useEffect(() => {
    activeChapterIdRef.current = activeChapterId;
  }, [activeChapterId]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: 'Begin writing your chapter...',
      }),
      CustomImage.configure({
        HTMLAttributes: { class: 'my-custom-image' },
      }),
    ],
    content: activeChapter?.content || '',
    editorProps: {
      attributes: {
        class: 'focus:outline-none min-h-[75vh] w-full',
      },
    },
    onUpdate: ({ editor }) => {
      // Trigger saving state visual feedback
      setSaveStatus('saving');
      
      // Update state in Zustand
      updateChapterContent(activeChapterIdRef.current, editor.getJSON());

      // Debounce the save status text transition back to 'saved'
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        setSaveStatus('saved');
      }, 1000);
    },
  });

  // Sync editor content when active chapter changes
  useEffect(() => {
    if (editor && activeChapter) {
      // If the AI importer left pending HTML for this chapter, load it into the editor
      // and then persist the parsed JSON back to the store (clearing pendingHtml).
      if (activeChapter.pendingHtml) {
        editor.commands.setContent(activeChapter.pendingHtml);
        applyPendingHtml(activeChapter.id, editor.getJSON());
        return;
      }

      const currentContent = editor.getJSON();
      const newContent = activeChapter.content;
      
      // Only update if the content is actually different to prevent cursor jumping
      if (JSON.stringify(currentContent) !== JSON.stringify(newContent)) {
        editor.commands.setContent(newContent || '');
      }
    }
  }, [activeChapterId, activeChapter, editor]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  // Escape key to exit Focus Mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && focusMode) {
        setFocusMode(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusMode, setFocusMode]);

  if (!editor || !activeChapter) return null;

  // Real-time statistics
  const wordCount = countWords(activeChapter.content);
  const charCount = countCharacters(activeChapter.content);

  // Theme-specific styles
  const mainWrapperStyles = {
    light: 'bg-zinc-100 text-zinc-900',
    dark: 'bg-zinc-950 text-zinc-100',
    sepia: 'bg-[#f4efe2] text-[#433422]'
  };

  const paperStyles = {
    light: 'bg-white border border-zinc-200/50 shadow-xl',
    dark: 'bg-zinc-900 border border-zinc-800 shadow-2xl shadow-black/80',
    sepia: 'bg-[#fcfaf2] border border-[#ebdcb9] shadow-md'
  };

  const toolbarBorderStyles = {
    light: 'border-zinc-200 bg-white/95 backdrop-blur-md',
    dark: 'border-zinc-800 bg-zinc-900/95 backdrop-blur-md',
    sepia: 'border-[#ebdcb9] bg-[#fcfaf2]/95 backdrop-blur-md'
  };

  const controlStyles = {
    light: 'hover:bg-zinc-200 text-zinc-650',
    dark: 'hover:bg-zinc-800 text-zinc-300',
    sepia: 'hover:bg-[#ede9dc] text-[#5c4a37]'
  };

  const activeControlStyles = {
    light: 'bg-zinc-200 text-zinc-900 font-medium',
    dark: 'bg-zinc-800 text-white font-medium',
    sepia: 'bg-[#ebdcb9] text-[#2c1a04] font-medium'
  };

  const editorWordSizeClass = {
    sm: 'prose-sm',
    base: 'prose-base',
    lg: 'prose-lg',
    xl: 'prose-xl'
  }[fontSize];

  return (
    <main className={`flex-1 h-screen overflow-y-auto flex flex-col items-center transition-colors duration-300 select-text ${mainWrapperStyles[theme]} ${focusMode ? 'p-0' : 'p-6'}`}>
      
      {/* Top Navbar: Preferences & Utilities (Hidden in Focus Mode) */}
      {!focusMode && (
        <div className="w-full max-w-4xl flex flex-wrap gap-4 items-center justify-between py-3 px-6 mb-4 rounded-xl border border-zinc-200/20 bg-white/20 dark:bg-black/10 backdrop-blur-md shadow-sm transition-all duration-300 select-none">
          <div className="flex items-center gap-2">
            {!sidebarOpen && (
              <button 
                onClick={() => setSidebarOpen(true)}
                className={`p-2 rounded-lg transition-colors flex items-center gap-1.5 text-xs font-semibold ${controlStyles[theme]}`}
                title="Show Sidebar"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 4.5l7.5 7.5-7.5 7.5m-6-15l7.5 7.5-7.5 7.5" />
                </svg>
                Sidebar
              </button>
            )}
            
            {/* Auto-save status */}
            <div className="flex items-center gap-1.5 text-xs opacity-60 ml-2">
              {saveStatus === 'saving' ? (
                <>
                  <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <svg className="h-3.5 w-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                  <span>Saved</span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-5">
            {/* Theme Toggle */}
            <div className="flex bg-black/5 dark:bg-white/5 p-0.5 rounded-lg text-xs gap-0.5">
              {(['light', 'sepia', 'dark'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  className={`px-3 py-1 rounded-md capitalize transition-all duration-200 ${theme === t ? activeControlStyles[theme] : controlStyles[theme]}`}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* Font Family Toggle */}
            <div className="flex bg-black/5 dark:bg-white/5 p-0.5 rounded-lg text-xs gap-0.5">
              {(['serif', 'sans'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFontFamily(f)}
                  className={`px-3 py-1 rounded-md capitalize transition-all duration-200 ${fontFamily === f ? activeControlStyles[theme] : controlStyles[theme]}`}
                >
                  {f}
                </button>
              ))}
            </div>

            {/* Font Size Toggle */}
            <div className="flex bg-black/5 dark:bg-white/5 p-0.5 rounded-lg text-xs gap-0.5">
              {(['sm', 'base', 'lg', 'xl'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setFontSize(s)}
                  className={`px-2.5 py-1 rounded-md uppercase transition-all duration-200 ${fontSize === s ? activeControlStyles[theme] : controlStyles[theme]}`}
                >
                  {s}
                </button>
              ))}
            </div>

            {/* Focus Mode Button */}
            <button
              onClick={() => setFocusMode(true)}
              className={`p-2 rounded-lg transition-all flex items-center gap-1.5 text-xs font-semibold ${controlStyles[theme]}`}
              title="Focus Mode (Esc to exit)"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Focus
            </button>
          </div>
        </div>
      )}

      {/* The "Paper" Container */}
      <div className={`w-full max-w-3xl transition-all duration-300 relative flex flex-col ${
        focusMode 
          ? 'min-h-screen my-0 rounded-none shadow-none border-none' 
          : `rounded-md min-h-[1100px] my-6 ${paperStyles[theme]}`
      }`}>
        
        {/* Editor Toolbar (Hidden in Focus Mode, Sticky inside the Paper) */}
        {!focusMode && (
          <div className={`sticky top-0 border-b p-2 flex flex-wrap gap-1.5 z-10 rounded-t-md shadow-sm transition-colors duration-300 ${toolbarBorderStyles[theme]}`}>
            <button
              onClick={() => editor.chain().focus().toggleBold().run()}
              className={`p-2 rounded transition-colors ${editor.isActive('bold') ? activeControlStyles[theme] : controlStyles[theme]}`}
              title="Bold"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3.75h6.25a3.75 3.75 0 013.75 3.75v0a3.75 3.75 0 01-3.75 3.75H6.75V3.75zM6.75 11.25h7.5A3.75 3.75 0 0118 15v0a3.75 3.75 0 01-3.75 3.75H6.75v-7.5z" />
              </svg>
            </button>
            <button
              onClick={() => editor.chain().focus().toggleItalic().run()}
              className={`p-2 rounded transition-colors ${editor.isActive('italic') ? activeControlStyles[theme] : controlStyles[theme]}`}
              title="Italic"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.25 3.75h6M7.75 20.25h6M13.25 3.75l-4.5 16.5" />
              </svg>
            </button>
            <button
              onClick={() => editor.chain().focus().toggleStrike().run()}
              className={`p-2 rounded transition-colors ${editor.isActive('strike') ? activeControlStyles[theme] : controlStyles[theme]}`}
              title="Strike-through"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h18M5.25 5.25h13.5v0a4.5 4.5 0 01-4.5 4.5H9.75a4.5 4.5 0 01-4.5-4.5v0zM5.25 14.25h13.5v0a4.5 4.5 0 01-4.5 4.5H9.75a4.5 4.5 0 01-4.5-4.5v0z" />
              </svg>
            </button>

            <div className="w-px bg-zinc-200 dark:bg-zinc-800 mx-1.5 self-stretch"></div>
            
            <button
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
              className={`px-2.5 py-1 rounded transition-colors ${editor.isActive('heading', { level: 2 }) ? activeControlStyles[theme] : controlStyles[theme]}`}
              title="Heading 2"
            >
              <span className="text-xs font-bold font-sans">H2</span>
            </button>
            <button
              onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
              className={`px-2.5 py-1 rounded transition-colors ${editor.isActive('heading', { level: 3 }) ? activeControlStyles[theme] : controlStyles[theme]}`}
              title="Heading 3"
            >
              <span className="text-xs font-bold font-sans">H3</span>
            </button>

            <div className="w-px bg-zinc-200 dark:bg-zinc-800 mx-1.5 self-stretch"></div>

            <button
              onClick={() => editor.chain().focus().toggleBulletList().run()}
              className={`p-2 rounded transition-colors ${editor.isActive('bulletList') ? activeControlStyles[theme] : controlStyles[theme]}`}
              title="Bullet List"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.007 5.25H3.75v.008h.008V12zm0 5.25H3.75v.008h.008v-.008z" />
              </svg>
            </button>
            <button
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
              className={`p-2 rounded transition-colors ${editor.isActive('orderedList') ? activeControlStyles[theme] : controlStyles[theme]}`}
              title="Numbered List"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 5.25l1.5-1.5v6M3.75 16.5H5.5a1.5 1.5 0 011.5 1.5v0A1.5 1.5 0 015.5 19.5H3.75v-3z" />
              </svg>
            </button>
            <button
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
              className={`p-2 rounded transition-colors ${editor.isActive('blockquote') ? activeControlStyles[theme] : controlStyles[theme]}`}
              title="Blockquote"
            >
              <svg className="w-4.5 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-4.795 2.638-4.795 6.275h4.8v9.575h-10zm-12 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-4.796 2.638-4.796 6.275h4.8v9.575h-10z"/>
              </svg>
            </button>
            <button
              onClick={() => editor.chain().focus().toggleCodeBlock().run()}
              className={`p-2 rounded transition-colors ${editor.isActive('codeBlock') ? activeControlStyles[theme] : controlStyles[theme]}`}
              title="Code Block"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
              </svg>
            </button>

            <button
              onClick={() => setIsImageModalOpen(true)}
              className={`p-2 rounded transition-colors ${controlStyles[theme]}`}
              title="Insert Image"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.41a2.25 2.25 0 013.182 0l2.909 2.91m-18 5.25h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
              </svg>
            </button>

            <div className="w-px bg-zinc-200 dark:bg-zinc-800 mx-1.5 self-stretch"></div>

            <button
              onClick={() => editor.chain().focus().undo().run()}
              disabled={!editor.can().undo()}
              className={`p-2 rounded transition-colors ${controlStyles[theme]} disabled:opacity-30`}
              title="Undo"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
              </svg>
            </button>
            <button
              onClick={() => editor.chain().focus().redo().run()}
              disabled={!editor.can().redo()}
              className={`p-2 rounded transition-colors ${controlStyles[theme]} disabled:opacity-30`}
              title="Redo"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 15l6-6m0 0l-6-6m6 6H9a6 6 0 000 12h3" />
              </svg>
            </button>
          </div>
        )}

        {/* Chapter Title Header */}
        <div className={`pt-10 pb-6 border-b transition-colors duration-300 ${
          focusMode ? 'px-16 border-transparent' : 'px-16 border-zinc-100 dark:border-zinc-800/40'
        }`}>
          <h1 className={`text-4xl font-bold font-serif ${
            theme === 'dark' ? 'text-zinc-100' : theme === 'sepia' ? 'text-[#2c1a04]' : 'text-zinc-800'
          }`}>
            {activeChapter.title}
          </h1>
        </div>

        {/* Editor Content Area */}
        <div className={`flex-1 transition-all duration-300 ${
          focusMode ? 'px-16 py-6' : 'px-4 py-2'
        }`}>
          <div className={`prose max-w-none transition-all duration-300 ${editorWordSizeClass} ${
            fontFamily === 'serif' ? 'font-serif' : 'font-sans'
          } ${
            theme === 'dark' ? 'prose-invert prose-zinc' : theme === 'sepia' ? 'theme-sepia' : 'prose-zinc'
          }`}>
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>

      {/* Floating Statistics HUD */}
      <div className={`fixed bottom-6 right-6 px-4 py-2 rounded-lg shadow-lg border text-xs flex gap-4 transition-all duration-300 select-none z-20 ${
        focusMode 
          ? 'opacity-20 hover:opacity-100 bg-black/60 text-white border-zinc-700' 
          : `${theme === 'dark' ? 'bg-zinc-800 text-zinc-300 border-zinc-700' : theme === 'sepia' ? 'bg-[#fcfaf2] text-[#5c4a37] border-[#ebdcb9]' : 'bg-white text-zinc-650 border-zinc-200'}`
      }`}>
        <div className="flex gap-1.5">
          <span className="opacity-60">Words:</span>
          <span className="font-semibold">{wordCount.toLocaleString()}</span>
        </div>
        <div className="w-px bg-black/10 dark:bg-white/10 self-stretch"></div>
        <div className="flex gap-1.5">
          <span className="opacity-60">Characters:</span>
          <span className="font-semibold">{charCount.toLocaleString()}</span>
        </div>
        {focusMode && (
          <>
            <div className="w-px bg-white/10 self-stretch"></div>
            <button 
              onClick={() => setFocusMode(false)}
              className="text-emerald-400 hover:text-emerald-300 font-semibold"
              title="Esc to exit"
            >
              Exit Focus
            </button>
          </>
        )}
      </div>

      <ImageUploadModal
        isOpen={isImageModalOpen}
        onClose={() => setIsImageModalOpen(false)}
        editor={editor}
      />
    </main>
  );
};