/**
 * Wrapper su IndexedDB usato come database locale dell'applicazione:
 * progetti, prezzari, allegati e snapshot delle versioni.
 */

export const APP_DB_NAME = 'stimia_files';
export const APP_DB_VERSION = 4;
export const STORE_ATTACHMENTS = 'attachments';
export const STORE_VERSIONS = 'versions';
export const STORE_PRICE_BOOKS = 'priceBooks';
export const STORE_PROJECTS = 'projects';
/** Coda delle modifiche da inviare a Supabase quando si torna online. */
export const STORE_SYNC_QUEUE = 'syncQueue';

/** Nome usato prima del rebrand: serve solo per migrare i dati esistenti. */
const LEGACY_DB_NAME = 'edilestimator_files';
const LEGACY_MIGRATION_FLAG = 'stimia_db_migrated_v1';

let dbPromise: Promise<IDBDatabase> | null = null;

function applySchema(db: IDBDatabase) {
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
}

function openDatabase(name: string, version?: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = version === undefined ? indexedDB.open(name) : indexedDB.open(name, version);

    request.onupgradeneeded = () => applySchema(request.result);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Impossibile aprire il database locale.'));
    request.onblocked = () => reject(new Error('Database locale bloccato da un’altra scheda.'));
  });
}

async function readAllStores(db: IDBDatabase): Promise<Record<string, any[]>> {
  const snapshot: Record<string, any[]> = {};

  for (const name of Array.from(db.objectStoreNames)) {
    snapshot[name] = await new Promise<any[]>((resolve, reject) => {
      const tx = db.transaction(name, 'readonly');
      const request = tx.objectStore(name).getAll();
      request.onsuccess = () => resolve(request.result as any[]);
      request.onerror = () => reject(request.error);
    });
  }

  return snapshot;
}

/** Copia una volta sola i dati dal vecchio database al nuovo nome. */
async function migrateLegacyDatabase(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;

  try {
    if (window.localStorage.getItem(LEGACY_MIGRATION_FLAG) === '1') return;
  } catch {
    /* localStorage non disponibile */
  }

  // Senza databases() non si può verificare l'esistenza senza creare il DB.
  if (typeof indexedDB.databases !== 'function') return;

  let legacyExists = false;
  try {
    const databases = await indexedDB.databases();
    legacyExists = databases.some(entry => entry.name === LEGACY_DB_NAME);
  } catch {
    return;
  }

  if (!legacyExists) {
    try {
      window.localStorage.setItem(LEGACY_MIGRATION_FLAG, '1');
    } catch {
      /* ignora */
    }
    return;
  }

  try {
    const legacy = await openDatabase(LEGACY_DB_NAME);
    const snapshot = await readAllStores(legacy);
    legacy.close();

    const target = await openDatabase(APP_DB_NAME, APP_DB_VERSION);
    for (const [storeName, values] of Object.entries(snapshot)) {
      if (!target.objectStoreNames.contains(storeName) || values.length === 0) continue;
      await new Promise<void>((resolve, reject) => {
        const tx = target.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        values.forEach(value => store.put(value));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    }
    target.close();

    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase(LEGACY_DB_NAME);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      request.onblocked = () => resolve();
    });

    try {
      window.localStorage.setItem(LEGACY_MIGRATION_FLAG, '1');
    } catch {
      /* ignora */
    }
  } catch (error) {
    console.warn('Migrazione del database locale non riuscita:', error);
  }
}

export function openAppDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB non disponibile in questo browser.'));
  }

  if (dbPromise) return dbPromise;

  dbPromise = (async () => {
    await migrateLegacyDatabase();
    return openDatabase(APP_DB_NAME, APP_DB_VERSION);
  })();

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
