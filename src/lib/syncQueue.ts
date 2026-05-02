/**
 * Sync orchestrator voor offline-event-mode.
 *
 * Bij "Eindig event" of bij reconnect-event als active-offline bestaat:
 *  1. readQueue(eventId) → ophalen alle pending writes (FIFO via queuedAt)
 *  2. Per entry: vuur naar Supabase (insert/update/delete) met `.select()` zodat
 *     we de server-row terugkrijgen voor conflict-detect.
 *  3. Conflict-detect: als server-row een nieuwere `updated_at` heeft dan onze
 *     queue-entry's snapshot, registreren we het als conflict — last-write-wins
 *     is hier al toegepast (Supabase heeft onze write geaccepteerd) maar de
 *     eerdere collega-edit is overschreven; we tonen toast "Jouw wijziging op X
 *     is geüpload (collega had iets aangepast)".
 *  4. Op success: removeQueueEntry, op failure: laat staan voor retry.
 *  5. Aan het eind: clearEventSnapshot indien volledige sync gelukt; anders
 *     houd snapshot 24u als rollback-buffer.
 */

import { supabase } from '@/lib/supabase';
import {
  readQueue,
  removeQueueEntry,
  clearEventSnapshot,
  type QueuedWrite,
} from './offlineStorage';

export interface SyncResult {
  total: number;
  succeeded: number;
  failed: number;
  conflicts: SyncConflict[];
}

export interface SyncConflict {
  table: string;
  rowId: number | null;
  localQueuedAt: string;
  serverUpdatedAt: string | null;
  message: string;
}

interface SyncProgressEvent {
  current: number;
  total: number;
  table: string;
  message: string;
}

function emit(name: string, detail?: unknown) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }
}

async function flushOne(entry: QueuedWrite): Promise<{ ok: boolean; conflict?: SyncConflict }> {
  if (!supabase) return { ok: false };

  const { table, op, row, rowId, queuedAt } = entry;

  try {
    if (op === 'insert') {
      // Strip eventueel temp-id uit payload — Supabase genereert echte id.
      const payload = { ...row };
      if (payload.id !== undefined && typeof payload.id === 'number' && payload.id < 0) {
        delete payload.id;
      }
      const { error } = await supabase.from(table).insert(payload);
      if (error) {
        console.warn('[sync] insert error', table, error.message);
        return { ok: false };
      }
      return { ok: true };
    }

    if (op === 'update' && rowId !== null) {
      // Conflict-check: pak server updated_at vóór update — als server-versie
      // newer is dan onze snapshot, registreer conflict (we overschrijven evengoed).
      let conflict: SyncConflict | undefined;
      const before = await supabase.from(table).select('updated_at').eq('id', rowId).maybeSingle();
      if (before.data && (before.data as { updated_at?: string }).updated_at) {
        const serverUpdated = (before.data as { updated_at: string }).updated_at;
        if (serverUpdated > queuedAt) {
          conflict = {
            table,
            rowId,
            localQueuedAt: queuedAt,
            serverUpdatedAt: serverUpdated,
            message: `Collega heeft ${table} #${rowId} aangepast om ${new Date(serverUpdated).toLocaleTimeString('nl-NL')}; jouw versie is geüpload.`,
          };
        }
      }
      const { error } = await supabase.from(table).update(row).eq('id', rowId);
      if (error) {
        console.warn('[sync] update error', table, error.message);
        return { ok: false };
      }
      return { ok: true, conflict };
    }

    if (op === 'delete' && rowId !== null) {
      const { error } = await supabase.from(table).delete().eq('id', rowId);
      if (error) {
        console.warn('[sync] delete error', table, error.message);
        return { ok: false };
      }
      return { ok: true };
    }

    return { ok: false };
  } catch (e) {
    console.warn('[sync] unexpected error', table, e);
    return { ok: false };
  }
}

/**
 * Synchroniseer alle pending queue-entries voor een event naar Supabase.
 * Roept SyncProgressEvent's via window.dispatchEvent zodat UI-componenten
 * voortgang kunnen tonen zonder polling.
 *
 * @param eventId Het event waarvoor de queue gesynced moet worden
 * @param options.cleanupOnSuccess Of we IndexedDB snapshot moeten clearen bij 100% success
 */
export async function syncEventQueue(
  eventId: number,
  options: { cleanupOnSuccess?: boolean } = {},
): Promise<SyncResult> {
  emit('bbq-sync-start');

  const queue = await readQueue(eventId);
  const result: SyncResult = {
    total: queue.length,
    succeeded: 0,
    failed: 0,
    conflicts: [],
  };

  for (let i = 0; i < queue.length; i++) {
    const entry = queue[i];
    const progressDetail: SyncProgressEvent = {
      current: i + 1,
      total: queue.length,
      table: entry.table,
      message: `Synchroniseer ${entry.table} (${i + 1}/${queue.length})`,
    };
    emit('bbq-sync-progress', progressDetail);

    const { ok, conflict } = await flushOne(entry);
    if (ok) {
      result.succeeded++;
      if (conflict) result.conflicts.push(conflict);
      if (entry.id !== undefined) {
        try { await removeQueueEntry(entry.id); } catch { /* ignore */ }
      }
    } else {
      result.failed++;
    }
  }

  if (result.failed === 0 && options.cleanupOnSuccess) {
    try { await clearEventSnapshot(eventId); } catch { /* ignore */ }
  }

  emit('bbq-sync-end', result);
  return result;
}

/**
 * Auto-sync trigger — wordt aangeroepen bij `online` event als er een active
 * offline event is. Throttle om dubbele triggers te voorkomen.
 */
let lastAutoSyncAt = 0;

export async function triggerAutoSyncIfActive(): Promise<SyncResult | null> {
  if (typeof navigator === 'undefined' || !navigator.onLine) return null;

  // Lazy import om circulaire dep te vermijden
  const { getActiveOfflineEvent } = await import('./offlineStorage');
  const active = getActiveOfflineEvent();
  if (!active) return null;

  const now = Date.now();
  if (now - lastAutoSyncAt < 5000) return null; // throttle 5s
  lastAutoSyncAt = now;

  return syncEventQueue(active.eventId, { cleanupOnSuccess: false });
}
