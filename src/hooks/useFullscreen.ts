'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * useFullscreen — beheert browser Fullscreen API voor KDS-mode.
 *
 * Activeer via enterFullscreen() (vereist user-gesture). exitFullscreen()
 * of ESC-key sluit fullscreen. State `isFullscreen` synced met browser-state.
 */
export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    function update() {
      setIsFullscreen(typeof document !== 'undefined' && !!document.fullscreenElement);
    }
    update();
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);

  const enterFullscreen = useCallback(async (target?: HTMLElement) => {
    const el = target ?? document.documentElement;
    if (!el.requestFullscreen) return false;
    try {
      await el.requestFullscreen();
      return true;
    } catch {
      return false;
    }
  }, []);

  const exitFullscreen = useCallback(async () => {
    if (!document.exitFullscreen || !document.fullscreenElement) return;
    try {
      await document.exitFullscreen();
    } catch { /* ignore */ }
  }, []);

  return { isFullscreen, enterFullscreen, exitFullscreen };
}
