'use client';
import React from 'react';

// Universeel statuskleur-schema (Principe #7: Cor's Taal)
// groen  = bevestigd / betaald / ok / afgerond
// amber  = verzonden / nieuw / warn / in behandeling
// rood   = vervallen / danger / afwijking / geannuleerd / afgewezen
// blauw  = concept
// paars  = optie
// goud   = geaccepteerd / definitief / goedgekeurd

const STATUS_PILL_MAP: Record<string, string> = {
  // Events
  nieuw: 'pill-amber',
  pending: 'pill-amber',        // legacy
  bevestigd: 'pill-green',
  confirmed: 'pill-green',      // legacy
  afgerond: 'pill-purple',
  completed: 'pill-purple',     // legacy
  geannuleerd: 'pill-red',
  cancelled: 'pill-red',        // legacy
  optie: 'pill-optie',

  // Offertes
  concept: 'pill-blue',
  verzonden: 'pill-amber',
  geaccepteerd: 'pill-green',
  akkoord: 'pill-green',        // legacy → geaccepteerd
  goedgekeurd: 'pill-green',    // legacy → geaccepteerd
  definitief: 'pill-green',     // legacy → geaccepteerd
  afgewezen: 'pill-red',
  verlopen: 'pill-red',

  // Facturen
  betaald: 'pill-green',
  vervallen: 'pill-red',

  // HACCP
  ok: 'pill-green',
  warn: 'pill-amber',
  danger: 'pill-red',
  afwijking: 'pill-red',

  // Materieel
  onderhoud: 'pill-amber',
  defect: 'pill-red',

  // TimeLog
  active: 'pill-green',
  stopped: 'pill-amber',
  signed: 'pill-blue',
};

// Nederlandse weergavelabels
const STATUS_LABEL_MAP: Record<string, string> = {
  pending: 'Nieuw',
  confirmed: 'Bevestigd',
  completed: 'Afgerond',
  cancelled: 'Geannuleerd',
  ok: 'OK',
  warn: 'Let op',
  danger: 'Afwijking',
  active: 'Actief',
  stopped: 'Gestopt',
  signed: 'Getekend',
};

interface StatusBadgeProps {
  status: string;
  showLabel?: boolean;
  size?: 'sm' | 'md';
}

export default function StatusBadge({ status, showLabel = true, size = 'md' }: StatusBadgeProps) {
  const pillClass = STATUS_PILL_MAP[status] || 'pill-blue';
  const label = STATUS_LABEL_MAP[status] || status;

  return (
    <span className={`pill ${pillClass} ${size === 'sm' ? 'text-[10px] px-2 py-0.5' : ''}`}>
      {showLabel ? label : status}
    </span>
  );
}

// Animated dot variant (for dashboard/timeline)
export function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    bevestigd: 'bg-emerald-400',
    confirmed: 'bg-emerald-400',
    nieuw: 'bg-amber-400',
    pending: 'bg-amber-400',
    concept: 'bg-zinc-500',
    optie: 'bg-amber-400',
    geannuleerd: 'bg-red-400',
    cancelled: 'bg-red-400',
    afgerond: 'bg-[#3b82f6]',
    completed: 'bg-[#3b82f6]',
    ok: 'bg-emerald-400',
    warn: 'bg-amber-400',
    danger: 'bg-red-400',
    betaald: 'bg-emerald-400',
    verzonden: 'bg-amber-400',
    vervallen: 'bg-red-400',
  };

  return (
    <span className="relative flex h-2 w-2">
      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-40 ${colors[status] || 'bg-zinc-500'}`} />
      <span className={`relative inline-flex rounded-full h-2 w-2 ${colors[status] || 'bg-zinc-500'}`} />
    </span>
  );
}
