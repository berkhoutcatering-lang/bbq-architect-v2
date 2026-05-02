'use client';

import { useState, useEffect } from 'react';
import { getPendingSyncCount } from '@/lib/offlineStorage';
import { onSWMessage } from '@/lib/pushNotifications';
import { useActiveOfflineEvent } from '@/lib/useActiveOfflineEvent';
import { triggerAutoSyncIfActive } from '@/lib/syncQueue';

export default function OfflineIndicator() {
  const [isOffline, setIsOffline] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [showSyncComplete, setShowSyncComplete] = useState(false);
  const offlineEvent = useActiveOfflineEvent();

  useEffect(function () {
    // Set initial state
    setIsOffline(!navigator.onLine);

    function handleOnline() {
      setIsOffline(false);
      // Auto-sync trigger als er een active offline event is — throttled in syncQueue
      triggerAutoSyncIfActive().catch(function () {});
    }

    function handleOffline() {
      setIsOffline(true);
      // Check pending count when going offline
      getPendingSyncCount().then(setPendingCount).catch(function () {});
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Check pending count on mount
    getPendingSyncCount().then(setPendingCount).catch(function () {});

    // Listen for sync complete messages from SW
    const unsubscribe = onSWMessage(function (data) {
      if (data.type === 'HACCP_SYNC_COMPLETE') {
        setPendingCount(0);
        setShowSyncComplete(true);
        setTimeout(function () {
          setShowSyncComplete(false);
        }, 3000);
      }
      if (data.type === 'QUEUE_STATUS') {
        setPendingCount((data as { pendingCount: number }).pendingCount || 0);
      }
    });

    return function () {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubscribe();
    };
  }, []);

  // Active offline-event banner heeft hoogste prioriteit
  if (offlineEvent.isActive) {
    const queued = offlineEvent.queuedCount;
    return (
      <div
        role="status"
        aria-live="polite"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 9999,
          padding: '8px 16px',
          fontSize: 13,
          fontWeight: 500,
          textAlign: 'center',
          fontFamily: "'DM Sans', sans-serif",
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          background: offlineEvent.isSyncing
            ? 'rgba(245, 158, 11, 0.95)'
            : (isOffline ? 'rgba(239, 68, 68, 0.95)' : 'rgba(34, 197, 94, 0.95)'),
          color: '#fff',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
        }}
      >
        <span style={{ width: 8, height: 8, borderRadius: 4, background: '#fff' }} />
        {offlineEvent.isSyncing ? (
          <>Synchroniseren {queued > 0 ? `(${queued} pending)` : '...'}</>
        ) : isOffline ? (
          <>Offline-mode actief · event #{offlineEvent.event?.eventId} · {queued} {queued === 1 ? 'wijziging' : 'wijzigingen'} wachten</>
        ) : (
          <>Offline-mode actief · event #{offlineEvent.event?.eventId}{queued > 0 ? ` · ${queued} pending` : ''} · druk &quot;Eindig event&quot; om te syncen</>
        )}
      </div>
    );
  }

  // Don't render anything when online and no sync notification
  if (!isOffline && !showSyncComplete) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        padding: '8px 16px',
        fontSize: '13px',
        fontWeight: 500,
        textAlign: 'center',
        fontFamily: "'DM Sans', sans-serif",
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        background: showSyncComplete ? 'rgba(34, 197, 94, 0.95)' : 'rgba(245, 158, 11, 0.95)',
        color: showSyncComplete ? '#fff' : 'var(--sidebar-bg-hover)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
    >
      {showSyncComplete ? (
        <>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 8.5L6.5 12L13 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Metingen gesynchroniseerd
        </>
      ) : (
        <>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M1 1L15 15M12.5 12.5C11.3 13.5 9.7 14 8 14C4 14 1 11 1 8C1 6.3 1.5 4.7 2.5 3.5M13.5 12.5C14.5 11.3 15 9.7 15 8C15 5 12 2 8 2C6.3 2 4.7 2.5 3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          Je bent offline
          {pendingCount > 0
            ? ' \u2014 ' + pendingCount + ' meting' + (pendingCount !== 1 ? 'en' : '') + ' word' + (pendingCount !== 1 ? 'en' : 't') + ' gesynchroniseerd zodra je weer online bent'
            : ' \u2014 metingen worden opgeslagen en gesynchroniseerd'}
        </>
      )}
    </div>
  );
}
