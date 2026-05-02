'use client';

import { useEffect, useState } from 'react';
import {
  getActiveOfflineEvent,
  countQueueForEvent,
  OFFLINE_EVENT_CHANGE,
  type ActiveOfflineEvent,
} from './offlineStorage';

export interface ActiveOfflineEventState {
  isActive: boolean;
  event: ActiveOfflineEvent | null;
  queuedCount: number;
  isOnline: boolean;
  isSyncing: boolean;
}

/**
 * Reactive state-hook voor offline-mode UI. Luistert op:
 *  - localStorage-driven state (start/eindig event triggert custom event)
 *  - queue-mutaties (insert/update/delete tijdens offline triggert emitQueueChange)
 *  - navigator.onLine voor verbinding-status
 *
 * Geen polling — UI updates zijn O(1) per change.
 */
export function useActiveOfflineEvent(): ActiveOfflineEventState {
  const [event, setEvent] = useState<ActiveOfflineEvent | null>(null);
  const [queuedCount, setQueuedCount] = useState(0);
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    function refresh() {
      const ev = getActiveOfflineEvent();
      setEvent(ev);
      if (ev) {
        countQueueForEvent(ev.eventId).then(setQueuedCount).catch(() => {});
      } else {
        setQueuedCount(0);
      }
    }

    function handleOnline() { setIsOnline(true); }
    function handleOffline() { setIsOnline(false); }
    function handleSyncStart() { setIsSyncing(true); }
    function handleSyncEnd() { setIsSyncing(false); refresh(); }

    refresh();
    setIsOnline(navigator.onLine);

    window.addEventListener(OFFLINE_EVENT_CHANGE, refresh);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('bbq-sync-start', handleSyncStart);
    window.addEventListener('bbq-sync-end', handleSyncEnd);

    return () => {
      window.removeEventListener(OFFLINE_EVENT_CHANGE, refresh);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('bbq-sync-start', handleSyncStart);
      window.removeEventListener('bbq-sync-end', handleSyncEnd);
    };
  }, []);

  return {
    isActive: event !== null,
    event,
    queuedCount,
    isOnline,
    isSyncing,
  };
}
