// ─── Offline Storage (IndexedDB) ─────────────────────────────────────────────
// Wrapper for offline HACCP records, sync queue management, and status tracking.
// Uses the same DB as the service worker to share data.

const DB_NAME = 'bbq-architect-offline';
const DB_VERSION = 1;

interface HaccpOfflineRecord {
  localId?: number;
  event_id?: string;
  offerte_id?: string;
  datum: string;
  tijd: string;
  wat: string;
  temp: number;
  type: string;
  check_type?: string;
  chef: string;
  notitie: string;
  synced: boolean;
  created_at: string;
}

interface QueuedRecord {
  id?: number;
  event_id?: string;
  offerte_id?: string;
  datum: string;
  tijd: string;
  wat: string;
  temp: number;
  type: string;
  check_type?: string;
  chef: string;
  notitie: string;
  queued_at: string;
}

interface SyncStatus {
  isOnline: boolean;
  pendingCount: number;
  lastSyncAt: string | null;
}

// ─── DB connection ───────────────────────────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
  return new Promise(function (resolve, reject) {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = function (event) {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('haccp_queue')) {
        db.createObjectStore('haccp_queue', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('haccp_records')) {
        const store = db.createObjectStore('haccp_records', { keyPath: 'localId', autoIncrement: true });
        store.createIndex('synced', 'synced', { unique: false });
        store.createIndex('event_id', 'event_id', { unique: false });
      }
    };

    request.onsuccess = function () {
      resolve(request.result);
    };

    request.onerror = function () {
      reject(request.error);
    };
  });
}

// ─── HACCP Records (local storage) ───────────────────────────────────────────

/**
 * Save a HACCP record to local IndexedDB.
 * Marks it as unsynced so it will be picked up by background sync.
 */
export async function saveHaccpRecord(record: Omit<HaccpOfflineRecord, 'localId' | 'synced' | 'created_at'>): Promise<number> {
  const db = await openDB();
  return new Promise(function (resolve, reject) {
    const tx = db.transaction('haccp_records', 'readwrite');
    const store = tx.objectStore('haccp_records');
    const fullRecord: HaccpOfflineRecord = {
      ...record,
      synced: false,
      created_at: new Date().toISOString(),
    };
    const request = store.add(fullRecord);
    request.onsuccess = function () { resolve(request.result as number); };
    request.onerror = function () { reject(request.error); };
  });
}

/**
 * Get all locally stored HACCP records.
 */
export async function getAllHaccpRecords(): Promise<HaccpOfflineRecord[]> {
  const db = await openDB();
  return new Promise(function (resolve, reject) {
    const tx = db.transaction('haccp_records', 'readonly');
    const store = tx.objectStore('haccp_records');
    const request = store.getAll();
    request.onsuccess = function () { resolve(request.result); };
    request.onerror = function () { reject(request.error); };
  });
}

/**
 * Get only unsynced HACCP records.
 */
export async function getUnsyncedRecords(): Promise<HaccpOfflineRecord[]> {
  const db = await openDB();
  return new Promise(function (resolve, reject) {
    const tx = db.transaction('haccp_records', 'readonly');
    const store = tx.objectStore('haccp_records');
    const index = store.index('synced');
    // IDBKeyRange for boolean index: 0 matches false in IndexedDB
    const request = index.getAll(IDBKeyRange.only(0));
    request.onsuccess = function () { resolve(request.result); };
    request.onerror = function () { reject(request.error); };
  });
}

/**
 * Mark a local record as synced.
 */
export async function markRecordSynced(localId: number): Promise<void> {
  const db = await openDB();
  return new Promise(function (resolve, reject) {
    const tx = db.transaction('haccp_records', 'readwrite');
    const store = tx.objectStore('haccp_records');
    const getReq = store.get(localId);
    getReq.onsuccess = function () {
      const record = getReq.result;
      if (record) {
        record.synced = true;
        const putReq = store.put(record);
        putReq.onsuccess = function () { resolve(); };
        putReq.onerror = function () { reject(putReq.error); };
      } else {
        resolve();
      }
    };
    getReq.onerror = function () { reject(getReq.error); };
  });
}

// ─── Sync Queue (for background sync via SW) ────────────────────────────────

/**
 * Add a HACCP record to the sync queue.
 * This queue is shared with the service worker.
 */
export async function addToSyncQueue(record: Omit<QueuedRecord, 'id' | 'queued_at'>): Promise<number> {
  const db = await openDB();
  return new Promise(function (resolve, reject) {
    const tx = db.transaction('haccp_queue', 'readwrite');
    const store = tx.objectStore('haccp_queue');
    const queueEntry: QueuedRecord = {
      ...record,
      queued_at: new Date().toISOString(),
    };
    const request = store.add(queueEntry);
    request.onsuccess = function () { resolve(request.result as number); };
    request.onerror = function () { reject(request.error); };
  });
}

/**
 * Get all items currently in the sync queue.
 */
export async function getSyncQueue(): Promise<QueuedRecord[]> {
  const db = await openDB();
  return new Promise(function (resolve, reject) {
    const tx = db.transaction('haccp_queue', 'readonly');
    const store = tx.objectStore('haccp_queue');
    const request = store.getAll();
    request.onsuccess = function () { resolve(request.result); };
    request.onerror = function () { reject(request.error); };
  });
}

/**
 * Remove a specific item from the sync queue (after successful sync).
 */
export async function removeFromSyncQueue(id: number): Promise<void> {
  const db = await openDB();
  return new Promise(function (resolve, reject) {
    const tx = db.transaction('haccp_queue', 'readwrite');
    const store = tx.objectStore('haccp_queue');
    const request = store.delete(id);
    request.onsuccess = function () { resolve(); };
    request.onerror = function () { reject(request.error); };
  });
}

/**
 * Clear the entire sync queue.
 */
export async function clearSyncQueue(): Promise<void> {
  const db = await openDB();
  return new Promise(function (resolve, reject) {
    const tx = db.transaction('haccp_queue', 'readwrite');
    const store = tx.objectStore('haccp_queue');
    const request = store.clear();
    request.onsuccess = function () { resolve(); };
    request.onerror = function () { reject(request.error); };
  });
}

/**
 * Get the count of pending sync items.
 */
export async function getPendingSyncCount(): Promise<number> {
  const db = await openDB();
  return new Promise(function (resolve, reject) {
    const tx = db.transaction('haccp_queue', 'readonly');
    const store = tx.objectStore('haccp_queue');
    const request = store.count();
    request.onsuccess = function () { resolve(request.result); };
    request.onerror = function () { reject(request.error); };
  });
}

// ─── Sync Status ─────────────────────────────────────────────────────────────

const LAST_SYNC_KEY = 'bbq-last-sync-at';

/**
 * Get the current sync status for UI display.
 */
export async function getSyncStatus(): Promise<SyncStatus> {
  const pendingCount = await getPendingSyncCount();
  const lastSyncAt = typeof localStorage !== 'undefined'
    ? localStorage.getItem(LAST_SYNC_KEY)
    : null;
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

  return { isOnline, pendingCount, lastSyncAt };
}

/**
 * Update the last sync timestamp.
 */
export function updateLastSyncTime(): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
  }
}

/**
 * Queue a HACCP record for offline sync and request background sync.
 * This is the main function to call from the HACCP page when saving a record.
 */
export async function queueHaccpForSync(record: Omit<QueuedRecord, 'id' | 'queued_at'>): Promise<void> {
  // Save locally
  await saveHaccpRecord(record);

  // Add to sync queue
  await addToSyncQueue(record);

  // Request background sync via service worker
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'QUEUE_HACCP_RECORD',
      record: record,
    });

    // Also try registering a background sync tag
    const registration = await navigator.serviceWorker.ready;
    if ('sync' in registration) {
      try {
        await (registration as ServiceWorkerRegistration & { sync: { register: (tag: string) => Promise<void> } }).sync.register('sync-haccp-records');
      } catch {
        // Background sync not supported, will sync on next online event
      }
    }
  }
}
