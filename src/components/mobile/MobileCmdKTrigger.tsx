'use client';

/**
 * MobileCmdKTrigger — floating action button (bottom-right) that opens the
 * CommandPalette on phones.
 *
 * Phones don't have a Cmd-K key, so without this FAB the palette is unreachable.
 * Tap → dispatches `open-command-palette` → CommandPalette mounts open.
 *
 * Position: bottom: 76px + safe-area-inset-bottom (above the BottomNav 60px).
 * Size: 56×56 (well above WCAG 2.2 SC 2.5.8 minimum 44×44).
 *
 * Hidden on tablet and desktop (Cmd-K via keyboard works there).
 *
 * Mounts inside AppShell — only renders when isPhone is true to keep the
 * desktop DOM clean.
 */

import * as React from 'react';
import { Search } from 'lucide-react';
import { useIsPhone } from '@/hooks/useIsMobile';

export default function MobileCmdKTrigger() {
  const isPhone = useIsPhone();

  if (!isPhone) return null;

  function handleClick() {
    window.dispatchEvent(new Event('open-command-palette'));
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="Zoek of navigeer (Command-palet openen)"
      style={{
        position: 'fixed',
        right: 16,
        bottom: 'calc(76px + env(safe-area-inset-bottom, 0px))',
        // Stack: Sidebar mobile overlay 60 > BottomNav 55 > FAB visually above BottomNav (76px gap).
        // z-45 keeps FAB hidden when Sidebar overlay or ChatPanel drawer is open.
        zIndex: 45,
        width: 56,
        height: 56,
        borderRadius: 9999,
        background: 'var(--brand, #c4a35a)',
        color: 'var(--bg, #0c0c0e)',
        border: 'none',
        boxShadow: '0 8px 24px rgba(0,0,0,0.45), 0 2px 6px rgba(0,0,0,0.35)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        touchAction: 'manipulation',
      }}
    >
      <Search size={22} strokeWidth={2.4} aria-hidden />
    </button>
  );
}
