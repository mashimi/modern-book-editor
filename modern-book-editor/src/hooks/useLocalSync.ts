import { useEffect, useRef, useCallback } from 'react';
import { useBookStore } from '../store/useBookStore';
import { saveManuscript, getManuscript } from '../db/localDb';
import { debounce } from '../utils/debounce';

export function useLocalSync(manuscriptId: string | undefined) {
  const { chapters, bookTitle, author, theme, loadManuscript } = useBookStore();
  const isLoading = useRef(false);
  const lastSave = useRef<number>(0);

  // Load manuscript on mount
  useEffect(() => {
    if (!manuscriptId) return;
    isLoading.current = true;
    getManuscript(manuscriptId).then(data => {
      if (data) {
        loadManuscript({
          chapters: data.chapters,
          bookTitle: data.title,
          author: data.author,
          theme: data.metadata?.theme || 'light',
        });
      }
      isLoading.current = false;
    });
  }, [manuscriptId, loadManuscript]);

  // Auto-save to IndexedDB
  const debouncedSave = useRef(
    debounce(async (id: string) => {
      if (isLoading.current) return;
      lastSave.current = Date.now();
      await saveManuscript(id, {
        title: bookTitle,
        author,
        chapters,
        metadata: { theme, updatedAt: Date.now() },
      });
    }, 1000)
  ).current;

  useEffect(() => {
    if (!manuscriptId || isLoading.current) return;
    debouncedSave(manuscriptId);
  }, [chapters, bookTitle, author, theme, manuscriptId, debouncedSave]);

  return { isSynced: true };
}
