import { PriceBook, PriceBookCategory } from '../types';
import {
  STORE_PRICE_BOOKS,
  idbDelete,
  idbDeleteMany,
  idbGet,
  idbGetAllByIndex,
  idbPut,
} from './idb';

/**
 * I prezzari piccoli restano dentro il progetto (IndexedDB/Firestore).
 * Quelli grandi (es. prezzari regionali) vengono salvati in IndexedDB e nel
 * progetto resta solo un riferimento leggero.
 */
const LARGE_BOOK_THRESHOLD = 300;

type StoredBook = PriceBook & { projectId: string };

const countItems = (book: PriceBook): number => {
  let count = 0;
  const walk = (node: PriceBookCategory) => {
    count += node.items.length;
    node.children.forEach(walk);
  };
  walk(book.rootCategory);
  return count;
};

const emptyRoot = (bookId: string): PriceBookCategory => ({
  id: `root_${bookId}`,
  code: '',
  name: 'Root',
  items: [],
  children: [],
});

const makeId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? `pb_${crypto.randomUUID()}`
    : `pb_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

export async function externalizePriceBooks(projectId: string, books: PriceBook[]): Promise<PriceBook[]> {
  const metadata: PriceBook[] = [];

  for (const book of books) {
    const itemCount = countItems(book);

    if (book.external) {
      if (itemCount > 0) {
        await idbPut<StoredBook>(STORE_PRICE_BOOKS, {
          ...book,
          projectId,
          external: false,
        });
        metadata.push({
          ...book,
          rootCategory: emptyRoot(book.id),
          external: true,
          itemCount,
        });
      } else {
        metadata.push({
          ...book,
          external: true,
          itemCount: book.itemCount || 0,
        });
      }
      continue;
    }

    if (itemCount > LARGE_BOOK_THRESHOLD) {
      await idbPut<StoredBook>(STORE_PRICE_BOOKS, {
        ...book,
        projectId,
        external: false,
      });
      metadata.push({
        ...book,
        rootCategory: emptyRoot(book.id),
        external: true,
        itemCount,
      });
    } else {
      await idbDelete(STORE_PRICE_BOOKS, book.id);
      metadata.push({ ...book, external: false, itemCount });
    }
  }

  // Rimuove eventuali prezzari esterni non più presenti nel progetto.
  const keepIds = new Set(books.map(book => book.id));
  const stored = await idbGetAllByIndex<StoredBook>(STORE_PRICE_BOOKS, 'projectId', projectId);
  const orphans = stored.filter(book => !keepIds.has(book.id)).map(book => book.id);
  if (orphans.length > 0) {
    await idbDeleteMany(STORE_PRICE_BOOKS, orphans);
  }

  return metadata;
}

export async function hydratePriceBooks(_projectId: string, books: PriceBook[]): Promise<PriceBook[]> {
  return Promise.all(books.map(async book => {
    if (!book.external) return book;

    const stored = await idbGet<StoredBook>(STORE_PRICE_BOOKS, book.id);
    if (!stored) return book;

    const { projectId: _projectId, ...rest } = stored;
    return {
      ...rest,
      external: true,
      itemCount: book.itemCount ?? countItems(rest as PriceBook),
    };
  }));
}

export async function deleteProjectPriceBooks(projectId: string): Promise<void> {
  const stored = await idbGetAllByIndex<StoredBook>(STORE_PRICE_BOOKS, 'projectId', projectId);
  await idbDeleteMany(STORE_PRICE_BOOKS, stored.map(book => book.id));
}

export async function duplicateProjectPriceBooks(
  _sourceProjectId: string,
  targetProjectId: string,
  books: PriceBook[]
): Promise<PriceBook[]> {
  const result: PriceBook[] = [];

  for (const book of books) {
    if (!book.external) {
      result.push(book);
      continue;
    }

    const stored = await idbGet<StoredBook>(STORE_PRICE_BOOKS, book.id);
    if (!stored) {
      result.push({ ...book });
      continue;
    }

    const newId = makeId();
    const { projectId: _source, external: _external, ...bookData } = stored;
    await idbPut<StoredBook>(STORE_PRICE_BOOKS, {
      ...bookData,
      id: newId,
      projectId: targetProjectId,
      external: false,
    });

    result.push({
      ...book,
      id: newId,
      rootCategory: emptyRoot(newId),
      external: true,
      itemCount: book.itemCount,
    });
  }

  return result;
}
