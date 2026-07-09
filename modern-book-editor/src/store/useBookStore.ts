import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { JSONContent } from '@tiptap/react';

export interface Chapter {
  id: string;
  title: string;
  content: JSONContent | null;
  /**
   * Transient HTML produced by the AI importer. BookEditor consumes it once by
   * loading it into TipTap, then clears it via `applyPendingHtml`.
   */
  pendingHtml?: string;
}

interface BookStore {
  chapters: Chapter[];
  activeChapterId: string;
  bookTitle: string;
  author: string;
  theme: 'light' | 'dark' | 'sepia';
  fontFamily: 'serif' | 'sans';
  fontSize: 'sm' | 'base' | 'lg' | 'xl';
  focusMode: boolean;
  sidebarOpen: boolean;
  searchQuery: string;
  
  // Actions
  addChapter: () => void;
  deleteChapter: (id: string) => void;
  setActiveChapter: (id: string) => void;
  updateChapterContent: (id: string, content: JSONContent) => void;
  applyPendingHtml: (id: string, content: JSONContent) => void;
  importFromAI: (title: string, chapters: { title: string; htmlContent: string }[]) => void;
  updateChapterTitle: (id: string, title: string) => void;
  setBookTitle: (title: string) => void;
  setAuthor: (author: string) => void;
  setTheme: (theme: 'light' | 'dark' | 'sepia') => void;
  setFontFamily: (fontFamily: 'serif' | 'sans') => void;
  setFontSize: (fontSize: 'sm' | 'base' | 'lg' | 'xl') => void;
  setFocusMode: (focusMode: boolean) => void;
  setSidebarOpen: (sidebarOpen: boolean) => void;
  setSearchQuery: (searchQuery: string) => void;
}

export const useBookStore = create<BookStore>()(
  persist(
    (set) => ({
      // Initialize with one default chapter
      chapters: [
        { 
          id: '1', 
          title: 'Chapter 1', 
          content: { 
            type: 'doc', 
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Start writing your masterpiece...' }] }] 
          } 
        },
      ],
      activeChapterId: '1',
      bookTitle: 'My Book',
      author: 'Author Name',
      theme: 'light',
      fontFamily: 'serif',
      fontSize: 'lg',
      focusMode: false,
      sidebarOpen: true,
      searchQuery: '',

      addChapter: () => set((state) => {
        const newId = Date.now().toString();
        return {
          chapters: [...state.chapters, { id: newId, title: `Chapter ${state.chapters.length + 1}`, content: null }],
          activeChapterId: newId,
        };
      }),

      deleteChapter: (id) => set((state) => {
        if (state.chapters.length <= 1) return state; // Prevent deleting the last chapter
        const filtered = state.chapters.filter(c => c.id !== id);
        const newActive = state.activeChapterId === id ? filtered[0].id : state.activeChapterId;
        return { chapters: filtered, activeChapterId: newActive };
      }),

      setActiveChapter: (id) => set({ activeChapterId: id }),
      
      updateChapterContent: (id, content) => set((state) => ({
        chapters: state.chapters.map(c => c.id === id ? { ...c, content } : c)
      })),

      // Consume a chapter's pending HTML: store the parsed TipTap JSON and drop the temp field.
      applyPendingHtml: (id, content) => set((state) => ({
        chapters: state.chapters.map(c =>
          c.id === id ? { ...c, content, pendingHtml: undefined } : c
        ),
      })),

      // Replace the entire manuscript with the AI-formatted one.
      importFromAI: (_title, chapters) => {
        const newChapters: Chapter[] = chapters.map((ch, index) => ({
          id: `ai-${Date.now()}-${index}`,
          title: ch.title,
          content: null,
          pendingHtml: ch.htmlContent,
        }));
        return {
          chapters: newChapters,
          activeChapterId: newChapters[0]?.id || '',
          bookTitle: _title,
        };
      },

      updateChapterTitle: (id, title) => set((state) => ({
        chapters: state.chapters.map(c => c.id === id ? { ...c, title } : c)
      })),

      setBookTitle: (bookTitle) => set({ bookTitle }),
      setAuthor: (author) => set({ author }),
      setTheme: (theme) => set({ theme }),
      setFontFamily: (fontFamily) => set({ fontFamily }),
      setFontSize: (fontSize) => set({ fontSize }),
      setFocusMode: (focusMode) => set({ focusMode }),
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      setSearchQuery: (searchQuery) => set({ searchQuery }),
    }),
    {
      name: 'modern-book-editor-storage',
      partialize: (state) => ({
        chapters: state.chapters,
        activeChapterId: state.activeChapterId,
        bookTitle: state.bookTitle,
        author: state.author,
        theme: state.theme,
        fontFamily: state.fontFamily,
        fontSize: state.fontSize,
        focusMode: state.focusMode,
        sidebarOpen: state.sidebarOpen,
      }),
    }
  )
);