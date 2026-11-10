/**
 * Wrapper su IndexedDB usato come database locale dell'applicazione:
 * progetti, prezzari, allegati e snapshot delle versioni.
 */

// Il nome del database resta quello storico: cambiarlo renderebbe
// invisibili i progetti già salvati nel browser degli utenti.
export const APP_DB_NAME = 'edilestimator_files';
export const APP_DB_VERSION = 4;
export const STORE_ATTACHMENTS = 'attachments';
export const STORE_VERSIONS = 'versions';
export const STORE_PRICE_BOOKS = 'priceBooks';
export const STORE_PROJECTS = 'projects';
/** Coda delle modifiche da inviare a Supabase quando si torna online. */
export const STORE_SYNC_QUEUE = 'syncQueue';

let dbPromise: Promise<IDBDatabase> | null = null;

export function openAppDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB non disponibile in questo browser.'));
  }

  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(APP_DB_NAME, APP_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_ATTACHMENTS)) {
        const store = db.createObjectStore(STORE_ATTACHMENTS, { keyPath: 'id' });
        store.createIndex('projectId', 'projectId', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_VERSIONS)) {
        const store = db.createObjectStore(STORE_VERSIONS, { keyPath: 'id' });
        store.createIndex('projectId', 'projectId', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_PRICE_BOOKS)) {
        const store = db.createObjectStore(STORE_PRICE_BOOKS, { keyPath: 'id' });
        store.createIndex('projectId', 'projectId', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
        const store = db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
        store.createIndex('userId', 'userId', { unique: false });
        store.createIndex('lastModified', 'lastModified', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_SYNC_QUEUE)) {
        db.createObjectStore(STORE_SYNC_QUEUE, { keyPath: 'projectId' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Impossibile aprire il database locale.'));
  });

  return dbPromise;
}

function requestAsPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function idbPut<T>(storeName: string, value: T): Promise<void> {
  const db = await openAppDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function idbGet<T>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
  const db = await openAppDb();
  const tx = db.transaction(storeName, 'readonly');
  return requestAsPromise<T | undefined>(tx.objectStore(storeName).get(key) as IDBRequest<T | undefined>);
}

export async function idbDelete(storeName: string, key: IDBValidKey): Promise<void> {
  const db = await openAppDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function idbGetAll<T>(storeName: string): Promise<T[]> {
  const db = await openAppDb();
  const tx = db.transaction(storeName, 'readonly');
  return requestAsPromise<T[]>(tx.objectStore(storeName).getAll() as IDBRequest<T[]>);
}

export async function idbGetAllByIndex<T>(
  storeName: string,
  indexName: string,
  key: IDBValidKey
): Promise<T[]> {
  const db = await openAppDb();
  const tx = db.transaction(storeName, 'readonly');
  return requestAsPromise<T[]>(
    tx.objectStore(storeName).index(indexName).getAll(key) as IDBRequest<T[]>
  );
}

export async function idbDeleteMany(storeName: string, keys: IDBValidKey[]): Promise<void> {
  if (keys.length === 0) return;
  const db = await openAppDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    keys.forEach(key => store.delete(key));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
