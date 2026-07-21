/**
 * Local-first database using IndexedDB.
 * Swap to Firebase later by implementing the same interface.
 */

const DB_NAME = 'modern-book-editor';
const DB_VERSION = 1;

export interface DBSchema {
  manuscripts: {
    id: string;
    userId: string;
    title: string;
    author: string;
    chapters: any[];
    metadata: {
      genre: string;
      trimSize: string;
      fontBody: string;
      fontHeading: string;
      theme: string;
      createdAt: number;
      updatedAt: number;
    };
  };
  formatJobs: {
    id: string;
    rawText: string;
    status: 'pending' | 'processing' | 'complete' | 'error';
    progress: { current: number; total: number; chaptersSoFar: number };
    result?: any;
    error?: string;
    createdAt: number;
    updatedAt: number;
  };
  settings: {
    key: string;
    value: any;
  };
}

let dbPromise: Promise<IDBDatabase> | null = null;

function getDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('manuscripts')) {
        db.createObjectStore('manuscripts', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('formatJobs')) {
        db.createObjectStore('formatJobs', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };
  });
  return dbPromise;
}

async function getStore(storeName: keyof DBSchema, mode: IDBTransactionMode = 'readonly') {
  const db = await getDb();
  return db.transaction(storeName, mode).objectStore(storeName);
}

// ── Manuscripts ─────────────────────────────────────────────────

export async function createManuscript(title: string = 'Untitled Manuscript'): Promise<string> {
  const id = `ms-${Date.now()}`;
  const manuscript: DBSchema['manuscripts'] = {
    id,
    userId: 'local-user',
    title,
    author: '',
    chapters: [{
      id: '1',
      title: 'Chapter 1',
      content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Start writing your masterpiece...' }] }]
      }
    }],
    metadata: {
      genre: 'fiction',
      trimSize: '6x9in',
      fontBody: 'EB Garamond',
      fontHeading: 'Lora',
      theme: 'light',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  };
  const store = await getStore('manuscripts', 'readwrite');
  await new Promise<void>((resolve, reject) => {
    const req = store.put(manuscript);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
  return id;
}

export async function getManuscript(id: string): Promise<DBSchema['manuscripts'] | null> {
  const store = await getStore('manuscripts');
  return new Promise((resolve, reject) => {
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllManuscripts(): Promise<DBSchema['manuscripts'][]> {
  const store = await getStore('manuscripts');
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result.sort((a, b) => b.metadata.updatedAt - a.metadata.updatedAt));
    req.onerror = () => reject(req.error);
  });
}

export async function saveManuscript(
  id: string,
  data: Partial<Omit<DBSchema['manuscripts'], 'metadata'>> & {
    metadata?: Partial<DBSchema['manuscripts']['metadata']>;
  }
): Promise<void> {
  const existing = await getManuscript(id);
  if (!existing) throw new Error('Manuscript not found');
  const updated = { ...existing, ...data, metadata: { ...existing.metadata, ...(data.metadata || {}), updatedAt: Date.now() } };
  const store = await getStore('manuscripts', 'readwrite');
  await new Promise<void>((resolve, reject) => {
    const req = store.put(updated);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function deleteManuscript(id: string): Promise<void> {
  const store = await getStore('manuscripts', 'readwrite');
  await new Promise<void>((resolve, reject) => {
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ── Format Jobs ────────────────────────────────────────────

export async function createFormatJob(rawText: string): Promise<string> {
  const id = `job-${Date.now()}`;
  const job: DBSchema['formatJobs'] = {
    id,
    rawText,
    status: 'pending',
    progress: { current: 0, total: 0, chaptersSoFar: 0 },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  const store = await getStore('formatJobs', 'readwrite');
  await new Promise<void>((resolve, reject) => {
    const req = store.put(job);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
  return id;
}

export async function getFormatJob(id: string): Promise<DBSchema['formatJobs'] | null> {
  const store = await getStore('formatJobs');
  return new Promise((resolve, reject) => {
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function updateFormatJob(id: string, updates: Partial<DBSchema['formatJobs']>): Promise<void> {
  const existing = await getFormatJob(id);
  if (!existing) throw new Error('Job not found');
  const updated = { ...existing, ...updates, updatedAt: Date.now() };
  const store = await getStore('formatJobs', 'readwrite');
  await new Promise<void>((resolve, reject) => {
    const req = store.put(updated);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ── Settings ───────────────────────────────────────────────

export async function getSetting(key: string): Promise<any> {
  const store = await getStore('settings');
  return new Promise((resolve, reject) => {
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result?.value);
    req.onerror = () => reject(req.error);
  });
}

export async function setSetting(key: string, value: any): Promise<void> {
  const store = await getStore('settings', 'readwrite');
  await new Promise<void>((resolve, reject) => {
    const req = store.put({ key, value });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ── Export / Import ─────────────────────────────────────────

export async function exportAllData(): Promise<string> {
  const manuscripts = await getAllManuscripts();
  const store = await getStore('settings');
  const settings = await new Promise<any[]>((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return JSON.stringify({ manuscripts, settings, exportedAt: Date.now() }, null, 2);
}

export async function importAllData(json: string): Promise<void> {
  const data = JSON.parse(json);
  const mStore = await getStore('manuscripts', 'readwrite');
  const sStore = await getStore('settings', 'readwrite');

  for (const ms of data.manuscripts || []) {
    await new Promise<void>((r, rej) => {
      const req = mStore.put(ms);
      req.onsuccess = () => r();
      req.onerror = () => rej(req.error);
    });
  }
  for (const s of data.settings || []) {
    await new Promise<void>((r, rej) => {
      const req = sStore.put(s);
      req.onsuccess = () => r();
      req.onerror = () => rej(req.error);
    });
  }
}

