'use client';

/* Categorie-iconen voor de arrangement-configurator. Dezelfde SVG-set als de
   publieke pagina (/arrangement/[slug]) zodat de admin-preview 1-op-1 toont wat
   de klant ziet. Onbekende naam → utensils (zelfde fallback als publiek). */

import type { ReactNode } from 'react';

export const CONFIG_ICONS: Record<string, ReactNode> = {
  sparkles: <><path d="M12 4l1.7 4.6L18 10l-4.3 1.4L12 16l-1.7-4.6L6 10l4.3-1.4L12 4Z" /><path d="M18.5 15.5l.7 1.9 1.8.6-1.8.6-.7 1.9-.7-1.9-1.8-.6 1.8-.6.7-1.9Z" /></>,
  flame: <path d="M12 3c.5 3-2.5 4-2.5 7a2.5 2.5 0 0 0 5 0c0-1-.5-1.7-.5-2.5 1.8 1 3 3 3 5.2a5.5 5.5 0 0 1-11 0C6 11 9.5 9 9.5 5.5 9.5 4.5 10.8 3.4 12 3Z" />,
  glass: <><path d="M7 3h10l-1.1 15.2A2 2 0 0 1 13.9 20h-3.8a2 2 0 0 1-2-1.8L7 3Z" /><path d="M7.5 8h9" /></>,
  cake: <><path d="M5 21h14M6 21v-7a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v7" /><path d="M5.5 15.5c1.2 0 1.2 1.2 2.4 1.2s1.2-1.2 2.4-1.2 1.2 1.2 2.4 1.2 1.2-1.2 2.4-1.2 1.2 1.2 2.4 1.2" /><path d="M12 5.5V8M12 5.5c-.7 0-1.2-.5-1.2-1.1 0-.7 1.2-1.9 1.2-1.9s1.2 1.2 1.2 1.9c0 .6-.5 1.1-1.2 1.1Z" /></>,
  utensils: <path d="M7 3v8a2 2 0 0 0 2 2h0v8M7 3v5M10 3v5M16.5 3c-1.5 0-2.5 2-2.5 5s1 4 2.5 4M16.5 3v18" />,
  leaf: <><path d="M5 19c0-7 5-13 14-13 0 9-6 14-13 14M5 19c2-3.5 4.5-5.5 8-7" /></>,
  star: <path d="M12 3.2l2.6 5.4 5.9.8-4.3 4.1 1.05 5.9L12 16.7 6.75 19.4l1.05-5.9L3.5 9.4l5.9-.8L12 3.2Z" />,
  users: <><path d="M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19" /><circle cx="10" cy="8" r="3.2" /><path d="M20 19v-1.4a3.5 3.5 0 0 0-2.6-3.4M15.6 5.2a3.2 3.2 0 0 1 0 5.6" /></>,
};

/** Iconen die de cateraar in de bouwer kan kiezen (allemaal publiek render-baar). */
export const CONFIG_ICON_CHOICES = ['sparkles', 'flame', 'glass', 'cake', 'utensils', 'leaf', 'star', 'users'] as const;

export function ConfigIcon({ name, size = 18, stroke = 1.7 }: { name: string; size?: number; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"
      style={{ flex: 'none', display: 'block' }} aria-hidden="true">
      {CONFIG_ICONS[name] ?? CONFIG_ICONS.utensils}
    </svg>
  );
}
