// ─── Offline Storage (IndexedDB) ─────────────────────────────────────────────
// Wrapper for offline HACCP records (v1) + per-event offline-mode (v2).
// v2 voegt event-snapshot stores + generieke write-queue toe voor "Start event
// op locatie": snapshot-graph van 1 event in IndexedDB + queue van mutaties die
// bij Eindig event of reconnect synced wordt naar Supabase. SW deelt dezelfde DB.

const DB_NAME = 'bbq-architect-offline';
const DB_VERSION = 2;

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

      // v1 — HACCP-only stores
      if (!db.objectStoreNames.contains('haccp_queue')) {
        db.createObjectStore('haccp_queue', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('haccp_records')) {
        const store = db.createObjectStore('haccp_records', { keyPath: 'localId', autoIncrement: true });
        store.createIndex('synced', 'synced', { unique: false });
        store.createIndex('event_id', 'event_id', { unique: false });
      }

      // v2 — Per-event offline-mode stores
      // event_snapshots: bookkeeping per event (start/eind tijdstamp).
      if (!db.objectStoreNames.contains('event_snapshots')) {
        db.createObjectStore('event_snapshots', { keyPath: 'eventId' });
      }
      // event_queue: pending writes voor sync. Indexes per event en per
      // queued_at zodat we FIFO kunnen processen.
      if (!db.objectStoreNames.contains('event_queue')) {
        const queue = db.createObjectStore('event_queue', { keyPath: 'id', autoIncrement: true });
        queue.createIndex('eventId', 'eventId', { unique: false });
        queue.createIndex('queuedAt', 'queuedAt', { unique: false });
      }
      // Per-table _local stores: snapshot-data om uit te lezen tijdens event.
      // Alle event-scoped stores krijgen index op event_id zodat we per event
      // kunnen filteren wanneer de gebruiker een ander event start.
      const eventScopedStores = [
        'events_local',
        'courses_local',
        'event_allergies_local',
        'prep_tasks_local',
        'pack_lists_local',
        'time_logs_local',
        'service_state_local',
        'event_reflecties_local',
      ];
      eventScopedStores.forEach(function (storeName) {
        if (!db.objectStoreNames.contains(storeName)) {
          const store = db.createObjectStore(storeName, { keyPath: 'id' });
          // service_state_local heeft event_id ALS primaire key, geen extra index.
          if (storeName !== 'service_state_local') {
            store.createIndex('event_id', 'event_id', { unique: false });
          }
        }
      });
      // Stam-data stores: gerechten/klanten/settings/profiles — niet event-scoped
      // maar nodig voor offline render (bv. menu-namen, branding).
      ['gerechten_local', 'klanten_local'].forEach(function (storeName) {
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, { keyPath: 'id' });
        }
      });
      if (!db.objectStoreNames.contains('settings_local')) {
        db.createObjectStore('settings_local', { keyPath: 'organization_id' });
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

// ─── Per-event offline-mode (v2) ─────────────────────────────────────────────

const ACTIVE_OFFLINE_EVENT_KEY = 'bbq.activeOfflineEvent.v1';

/** Set van tabel-namen die per event gesnapshot/gequeued worden. */
export const EVENT_SCOPED_TABLES = [
  'events',
  'courses',
  'event_allergies',
  'prep_tasks',
  'pack_lists',
  'time_logs',
  'service_state',
  'event_reflecties',
] as const;

/** Stam-tabellen die elke offline-mode nodig heeft (org-niveau). */
export const STAM_TABLES = ['gerechten', 'klanten', 'settings'] as const;

export type EventScopedTable = (typeof EVENT_SCOPED_TABLES)[number];
export type StamTable = (typeof STAM_TABLES)[number];
export type OfflineTable = EventScopedTable | StamTable;

export interface ActiveOfflineEvent {
  eventId: number;
  startedAt: string;
  snapshotAt: string;
}

export interface EventSnapshotMeta {
  eventId: number;
  startedAt: string;
  snapshotAt: string;
  endedAt?: string;
}

export type WriteOp = 'insert' | 'update' | 'delete';

export interface QueuedWrite {
  id?: number;
  eventId: number;
  table: OfflineTable;
  op: WriteOp;
  /** De volledige rij (insert) of payload (update). Voor delete: alleen `rowId`. */
  row: Record<string, unknown>;
  /** ID van de target rij (voor update/delete). null voor insert (nog geen server-id). */
  rowId: number | null;
  /** Tijdelijke client-id voor optimistic insert (negative bij convention). */
  tempId?: number;
  queuedAt: string;
}

/** localStorage helpers — bewust geen Context-overhead, want SW kan ook lezen. */

export function getActiveOfflineEvent(): ActiveOfflineEvent | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(ACTIVE_OFFLINE_EVENT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ActiveOfflineEvent;
  } catch {
    return null;
  }
}

/** Custom event-naam die UI hooks luisteren om reactive op state-changes te zijn. */
export const OFFLINE_EVENT_CHANGE = 'bbq-offline-event-change';

function emitChange() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(OFFLINE_EVENT_CHANGE));
  }
}

export function setActiveOfflineEvent(eventId: number): ActiveOfflineEvent {
  const now = new Date().toISOString();
  const state: ActiveOfflineEvent = {
    eventId,
    startedAt: now,
    snapshotAt: now,
  };
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(ACTIVE_OFFLINE_EVENT_KEY, JSON.stringify(state));
  }
  emitChange();
  return state;
}

export function clearActiveOfflineEvent(): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(ACTIVE_OFFLINE_EVENT_KEY);
  }
  emitChange();
}

/** Helpers triggeren change-events ook bij queue-mutaties zodat UI-pills de
 * count meteen updaten zonder polling. */
export function emitQueueChange(): void {
  emitChange();
}

/** Per-event store-naam helper — `courses` → `courses_local`. */
function localStoreName(table: OfflineTable): string {
  return table + '_local';
}

/**
 * Bulk-insert een array rijen in de _local store van `table`. Wist eerst
 * bestaande rijen voor diezelfde event_id (bij event-scoped) of geheel
 * (bij stam-tabel) zodat snapshot een vers beeld is.
 */
async function writeLocalRows(
  table: OfflineTable,
  rows: Record<string, unknown>[],
  eventId?: number,
): Promise<void> {
  const db = await openDB();
  const storeName = localStoreName(table);
  return new Promise(function (resolve, reject) {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);

    // Stap 1: clear oude rijen voor dit event (event-scoped) of clear all (stam).
    let clearReq: IDBRequest | null = null;
    if (eventId !== undefined && store.indexNames.contains('event_id')) {
      const idx = store.index('event_id');
      const cursorReq = idx.openKeyCursor(IDBKeyRange.only(eventId));
      cursorReq.onsuccess = function () {
        const cursor = cursorReq.result;
        if (cursor) {
          store.delete(cursor.primaryKey);
          cursor.continue();
        }
      };
    } else if (eventId === undefined && table !== 'service_state' && table !== 'event_reflecties') {
      // Stam-tabel: clear hele store.
      clearReq = store.clear();
    }

    // Stap 2: na clear (of direct als geen clear nodig) → bulk add.
    const startAdd = function () {
      rows.forEach(function (row) {
        try {
          store.put(row);
        } catch (e) {
          console.warn('[offline] put failed for row', table, e);
        }
      });
    };
    if (clearReq) {
      clearReq.onsuccess = startAdd;
    } else {
      startAdd();
    }

    tx.oncomplete = function () { resolve(); };
    tx.onerror = function () { reject(tx.error); };
    tx.onabort = function () { reject(tx.error); };
  });
}

/**
 * Lees alle rijen voor een tabel uit IndexedDB. Bij event-scoped: filter op
 * event_id. Bij stam-tabel: alle rijen.
 */
export async function readLocal<T = Record<string, unknown>>(
  table: OfflineTable,
  eventId?: number,
): Promise<T[]> {
  const db = await openDB();
  const storeName = localStoreName(table);
  return new Promise(function (resolve, reject) {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    let request: IDBRequest;
    if (eventId !== undefined && store.indexNames.contains('event_id')) {
      request = store.index('event_id').getAll(IDBKeyRange.only(eventId));
    } else if (eventId !== undefined && storeName === 'service_state_local') {
      // service_state heeft event_id als primary key
      request = store.get(eventId);
    } else {
      request = store.getAll();
    }
    request.onsuccess = function () {
      const result = request.result;
      if (Array.isArray(result)) resolve(result as T[]);
      else if (result) resolve([result as T]);
      else resolve([]);
    };
    request.onerror = function () { reject(request.error); };
  });
}

/**
 * Past een client-side mutatie toe op de _local store — gebruikt door
 * useSupabase optimistic-update tijdens offline-mode zodat reads consistent
 * blijven met de queue.
 */
export async function applyLocalMutation(
  table: OfflineTable,
  op: WriteOp,
  row: Record<string, unknown>,
  rowId?: number | null,
): Promise<void> {
  const db = await openDB();
  const storeName = localStoreName(table);
  return new Promise(function (resolve, reject) {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    if (op === 'delete' && rowId !== null && rowId !== undefined) {
      store.delete(rowId);
    } else if (op === 'insert' || op === 'update') {
      // service_state: keyPath = event_id; gebruik dat als primary
      store.put(row);
    }
    tx.oncomplete = function () { resolve(); };
    tx.onerror = function () { reject(tx.error); };
  });
}

/** Push een mutatie naar de event_queue store voor latere sync. */
export async function enqueueWrite(entry: Omit<QueuedWrite, 'id' | 'queuedAt'>): Promise<number> {
  const db = await openDB();
  return new Promise(function (resolve, reject) {
    const tx = db.transaction('event_queue', 'readwrite');
    const store = tx.objectStore('event_queue');
    const queued: QueuedWrite = {
      ...entry,
      queuedAt: new Date().toISOString(),
    };
    const request = store.add(queued);
    request.onsuccess = function () { resolve(request.result as number); };
    request.onerror = function () { reject(request.error); };
  });
}

/** Lees alle pending queue-entries voor een event (FIFO via queuedAt index). */
export async function readQueue(eventId: number): Promise<QueuedWrite[]> {
  const db = await openDB();
  return new Promise(function (resolve, reject) {
    const tx = db.transaction('event_queue', 'readonly');
    const store = tx.objectStore('event_queue');
    const idx = store.index('eventId');
    const request = idx.getAll(IDBKeyRange.only(eventId));
    request.onsuccess = function () {
      const items = request.result as QueuedWrite[];
      items.sort(function (a, b) { return a.queuedAt < b.queuedAt ? -1 : 1; });
      resolve(items);
    };
    request.onerror = function () { reject(request.error); };
  });
}

/** Verwijder een specifieke queue-entry na succesvolle sync. */
export async function removeQueueEntry(id: number): Promise<void> {
  const db = await openDB();
  return new Promise(function (resolve, reject) {
    const tx = db.transaction('event_queue', 'readwrite');
    const store = tx.objectStore('event_queue');
    const request = store.delete(id);
    request.onsuccess = function () { resolve(); };
    request.onerror = function () { reject(request.error); };
  });
}

/** Aantal pending writes voor een event (voor UI-pill). */
export async function countQueueForEvent(eventId: number): Promise<number> {
  const db = await openDB();
  return new Promise(function (resolve, reject) {
    const tx = db.transaction('event_queue', 'readonly');
    const store = tx.objectStore('event_queue');
    const idx = store.index('eventId');
    const request = idx.count(IDBKeyRange.only(eventId));
    request.onsuccess = function () { resolve(request.result); };
    request.onerror = function () { reject(request.error); };
  });
}

/** Upsert event-snapshot bookkeeping. */
export async function writeEventSnapshotMeta(meta: EventSnapshotMeta): Promise<void> {
  const db = await openDB();
  return new Promise(function (resolve, reject) {
    const tx = db.transaction('event_snapshots', 'readwrite');
    const store = tx.objectStore('event_snapshots');
    const request = store.put(meta);
    request.onsuccess = function () { resolve(); };
    request.onerror = function () { reject(request.error); };
  });
}

export async function readEventSnapshotMeta(eventId: number): Promise<EventSnapshotMeta | null> {
  const db = await openDB();
  return new Promise(function (resolve, reject) {
    const tx = db.transaction('event_snapshots', 'readonly');
    const store = tx.objectStore('event_snapshots');
    const request = store.get(eventId);
    request.onsuccess = function () { resolve(request.result || null); };
    request.onerror = function () { reject(request.error); };
  });
}

/**
 * Cleanup: verwijder snapshot + queue voor een event nadat het volledig gesynced
 * is. Roep dit aan na succesvolle "Eindig event" + sync.
 */
export async function clearEventSnapshot(eventId: number): Promise<void> {
  const db = await openDB();
  // verwijder per-tabel rijen
  const eventScopedStores = EVENT_SCOPED_TABLES.map(localStoreName);
  return new Promise(function (resolve, reject) {
    const stores = [...eventScopedStores, 'event_snapshots', 'event_queue'];
    const tx = db.transaction(stores, 'readwrite');
    eventScopedStores.forEach(function (storeName) {
      const store = tx.objectStore(storeName);
      if (store.indexNames.contains('event_id')) {
        const idx = store.index('event_id');
        const cursorReq = idx.openKeyCursor(IDBKeyRange.only(eventId));
        cursorReq.onsuccess = function () {
          const cursor = cursorReq.result;
          if (cursor) {
            store.delete(cursor.primaryKey);
            cursor.continue();
          }
        };
      } else if (storeName === 'service_state_local') {
        store.delete(eventId);
      }
    });
    // Verwijder snapshot-meta + queue-entries
    tx.objectStore('event_snapshots').delete(eventId);
    const queueIdx = tx.objectStore('event_queue').index('eventId');
    const queueCursor = queueIdx.openKeyCursor(IDBKeyRange.only(eventId));
    queueCursor.onsuccess = function () {
      const cursor = queueCursor.result;
      if (cursor) {
        tx.objectStore('event_queue').delete(cursor.primaryKey);
        cursor.continue();
      }
    };
    tx.oncomplete = function () { resolve(); };
    tx.onerror = function () { reject(tx.error); };
  });
}

/**
 * Snapshot-orchestrator: pull één event volledig via Supabase REST en schrijft
 * alle data in IndexedDB. De caller (UI-knop) krijgt voortgangs-updates via
 * onProgress callback zodat de spinner concrete tabel-namen kan tonen.
 *
 * `client` is een minimale Supabase-achtige interface zodat we niet hard
 * koppelen aan @supabase/supabase-js — getest met de echte client + mock.
 */
export interface SnapshotProgress {
  table: string;
  rowsPulled: number;
  totalSteps: number;
  currentStep: number;
}

export interface SnapshotClient {
  from: (table: string) => {
    select: (cols?: string) => {
      eq: (col: string, val: unknown) => Promise<{ data: unknown[] | null; error: { message: string } | null }>;
    } & Promise<{ data: unknown[] | null; error: { message: string } | null }>;
  };
}

interface SnapshotSpec {
  table: OfflineTable;
  filterCol: 'event_id' | 'organization_id' | 'id' | null;
  filterValue?: number | string;
}

export async function snapshotEvent(
  eventId: number,
  organizationId: string,
  klantId: number | null,
  client: SnapshotClient,
  onProgress?: (p: SnapshotProgress) => void,
): Promise<void> {
  const specs: SnapshotSpec[] = [
    { table: 'events', filterCol: 'id', filterValue: eventId },
    { table: 'courses', filterCol: 'event_id', filterValue: eventId },
    { table: 'event_allergies', filterCol: 'event_id', filterValue: eventId },
    { table: 'prep_tasks', filterCol: 'event_id', filterValue: eventId },
    { table: 'pack_lists', filterCol: 'event_id', filterValue: eventId },
    { table: 'time_logs', filterCol: 'event_id', filterValue: eventId },
    { table: 'service_state', filterCol: 'event_id', filterValue: eventId },
    { table: 'event_reflecties', filterCol: 'event_id', filterValue: eventId },
    { table: 'gerechten', filterCol: 'organization_id', filterValue: organizationId },
    { table: 'settings', filterCol: 'organization_id', filterValue: organizationId },
    ...(klantId
      ? [{ table: 'klanten' as const, filterCol: 'id' as const, filterValue: klantId }]
      : []),
  ];

  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i];
    const table = spec.table;
    let rows: Record<string, unknown>[] = [];

    if (spec.filterCol && spec.filterValue !== undefined) {
      const result = await client
        .from(table)
        .select('*')
        .eq(spec.filterCol, spec.filterValue);
      if (result.error) {
        console.warn('[snapshot] error pulling', table, result.error.message);
        rows = [];
      } else {
        rows = (result.data as Record<string, unknown>[]) || [];
      }
    }

    // Voor event-scoped: pass eventId als clear-filter; stam: undefined → clear all.
    const eventScoped = (EVENT_SCOPED_TABLES as readonly string[]).includes(table);
    await writeLocalRows(table, rows, eventScoped ? eventId : undefined);

    onProgress?.({
      table,
      rowsPulled: rows.length,
      totalSteps: specs.length,
      currentStep: i + 1,
    });
  }

  // Schrijf snapshot-meta zodat we weten wanneer hij gemaakt is.
  await writeEventSnapshotMeta({
    eventId,
    startedAt: new Date().toISOString(),
    snapshotAt: new Date().toISOString(),
  });
}
