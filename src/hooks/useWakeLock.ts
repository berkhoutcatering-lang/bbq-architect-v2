'use client';

import { useEffect, useRef } from 'react';

/**
 * useWakeLock — voorkomt dat het scherm uitgaat tijdens live KDS-service.
 *
 * Browser Wake Lock API werkt op Chrome 84+, Safari 16.4+, alle moderne
 * tablets. Lock wordt automatisch losgelaten als tab naar achtergrond gaat;
 * we vragen 'm opnieuw aan bij visibilitychange.
 *
 * @param active — alleen lock aanvragen als true (bv. fullscreen-mode)
 */
export function useWakeLock(active: boolean): void {
  const lockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!active) {
      // Release lock when toggled off
      lockRef.current?.release().catch(() => { /* ignore */ });
      lockRef.current = null;
      return;
    }

    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) {
      // Not supported — silent fallback (Safari < 16.4, Firefox)
      return;
    }

    let cancelled = false;

    async function request() {
      try {
        const lock = await navigator.wakeLock.request('screen');
        if (cancelled) {
          lock.release();
          return;
        }
        lockRef.current = lock;
      } catch {
        // User denied or browser blocked — silent
      }
    }

    function handleVisibility() {
      if (document.visibilityState === 'visible' && active && !lockRef.current) {
        request();
      }
    }

    request();
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibility);
      lockRef.current?.release().catch(() => { /* ignore */ });
      lockRef.current = null;
    };
  }, [active]);
}
