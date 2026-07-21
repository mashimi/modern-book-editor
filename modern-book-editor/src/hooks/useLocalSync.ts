import { useEffect, useMemo, useRef } from 'react';
import { useBookStore } from '../store/useBookStore';
import { saveManuscript, getManuscript } from '../db/localDb';
import { debounce } from '../utils/debounce';

export function useLocalSync(manuscriptId: string | undefined) {
  const loadManuscript = useBookStore((s) => s.loadManuscript);
  const isLoadingRef = useRef(false);

  // Load manuscript once when the id changes.
  useEffect(() => {
    if (!manuscriptId) return;
    let cancelled = false;
    isLoadingRef.current = true;

    getManuscript(manuscriptId)
      .then((data) => {
        if (cancelled) return;
        if (data) {
          loadManuscript({
            chapters: data.chapters,
            bookTitle: data.title,
            author: data.author,
            theme: data.metadata?.theme || 'light',
          });
        }
      })
      .finally(() => {
        if (!cancelled) isLoadingRef.current = false;
      });

    return () => {
      cancelled = true;
    };
  }, [manuscriptId, loadManuscript]);

  // Autosave — ALWAYS reads the freshest state, never a stale closure.
  const debouncedSave = useMemo(
    () =>
      debounce((id: string) => {
        if (isLoadingRef.current) return;
        const s = useBookStore.getState();
        saveManuscript(id, {
          title: s.bookTitle,
          author: s.author,
          chapters: s.chapters,
          metadata: { theme: s.theme, updatedAt: Date.now() } as any,
        }).catch((err) => console.error('Autosave failed:', err));
      }, 800),
    []
  );

  const chapters = useBookStore((s) => s.chapters);
  const bookTitle = useBookStore((s) => s.bookTitle);
  const author = useBookStore((s) => s.author);
  const theme = useBookStore((s) => s.theme);

  useEffect(() => {
    if (!manuscriptId || isLoadingRef.current) return;
    debouncedSave(manuscriptId);
  }, [manuscriptId, chapters, bookTitle, author, theme, debouncedSave]);

  return { isSynced: true };
}
