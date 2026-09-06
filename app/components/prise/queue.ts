/** File hors ligne (spec 8.4) : la prise est mise en file et envoyée au retour du réseau. IndexedDB, jamais l'original ailleurs. */

const DB = "spot-prises";
const STORE = "queue";

export interface QueuedPrise {
  id: string;
  createdAt: number;
  fields: Record<string, string>;
  frameA: Blob;
  frameB: Blob;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function enqueue(p: QueuedPrise): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(p);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function pending(): Promise<QueuedPrise[]> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE).objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as QueuedPrise[]);
    req.onerror = () => reject(req.error);
  });
}

export async function remove(id: string): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
  });
}
