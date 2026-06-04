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

  /* Slightly smaller (48 ipv 56) en met opaak/transparant-fade zodat hij minder
     opdringerig over content valt — touch-target blijft 48px (boven WCAG 44).
     Pages met een eigen sticky-bottom-CTA kunnen de FAB verbergen door class
     `has-sticky-cta` op body te zetten (zie CSS hieronder). */
  return (
    <button
      type="button"
      onClick={handleClick}
      className="mobile-cmdk-trigger"
      aria-label="Zoek of navigeer (Command-palet openen)"
      style={{
        position: 'fixed',
        right: 14,
        bottom: 'calc(72px + env(safe-area-inset-bottom, 0px))',
        // Stack: Sidebar mobile overlay 60 > BottomNav 55 > FAB visually above BottomNav.
        // z-45 keeps FAB hidden when Sidebar overlay or ChatPanel drawer is open.
        zIndex: 45,
        width: 48,
        height: 48,
        borderRadius: 9999,
        background: 'var(--brand, #c4a35a)',
        color: 'var(--bg, #0c0c0e)',
        border: 'none',
        boxShadow: '0 6px 18px rgba(0,0,0,0.35), 0 1px 3px rgba(0,0,0,0.3)',
        opacity: 0.78,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        touchAction: 'manipulation',
        transition: 'opacity .15s ease, transform .15s ease',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
      onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.78'; }}
      onFocus={(e) => { e.currentTarget.style.opacity = '1'; }}
      onBlur={(e) => { e.currentTarget.style.opacity = '0.78'; }}
      onTouchStart={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'scale(.94)'; }}
      onTouchEnd={(e) => { e.currentTarget.style.opacity = '0.78'; e.currentTarget.style.transform = 'scale(1)'; }}
    >
      <Search size={20} strokeWidth={2.4} aria-hidden />
    </button>
  );
}
