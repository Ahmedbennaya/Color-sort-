const DATABASE_NAME = "fabric-swatch-sorter-db";
const DATABASE_VERSION = 1;
const STORE_NAME = "sample-files";

export interface StoredFileRecord {
  id: string;
  blob: Blob;
  name: string;
  type: string;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open IndexedDB."));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  runner: (store: IDBObjectStore, resolve: (value: T) => void, reject: (reason?: unknown) => void) => void,
): Promise<T> {
  const database = await openDatabase();

  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);

    transaction.oncomplete = () => database.close();
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error("IndexedDB transaction failed."));
    };

    runner(store, resolve, reject);
  });
}

export async function putStoredFile(id: string, file: File): Promise<void> {
  await withStore<void>("readwrite", (store, resolve, reject) => {
    const request = store.put({
      id,
      blob: file,
      name: file.name,
      type: file.type,
    } satisfies StoredFileRecord);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getStoredFile(id: string): Promise<StoredFileRecord | null> {
  return withStore<StoredFileRecord | null>("readonly", (store, resolve, reject) => {
    const request = store.get(id);

    request.onsuccess = () => resolve((request.result as StoredFileRecord | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
}

export async function getStoredFiles(ids: string[]): Promise<Map<string, StoredFileRecord>> {
  const records = await Promise.all(ids.map((id) => getStoredFile(id)));
  return new Map(
    records
      .filter((record): record is StoredFileRecord => Boolean(record))
      .map((record) => [record.id, record]),
  );
}

export async function deleteStoredFile(id: string): Promise<void> {
  await withStore<void>("readwrite", (store, resolve, reject) => {
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function clearStoredFiles(): Promise<void> {
  await withStore<void>("readwrite", (store, resolve, reject) => {
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
