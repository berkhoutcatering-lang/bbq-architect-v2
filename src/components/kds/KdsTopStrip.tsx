'use client';

import { X } from 'lucide-react';

interface Props {
  eventName: string;
  guests: number;
  serviceTime?: string;        // bv "19:00"
  startedAt?: string | null;   // ISO timestamp
  schedule: 'on_track' | 'delayed' | 'ahead';
  onExit: () => void;
}

/**
 * Top-strip voor full-screen KDS — 56px hoog.
 * Toont event-naam, gasten, klok, service-tijd, schedule-status, exit-knop.
 * Eén regel, compact, leesbaar van afstand.
 */
export default function KdsTopStrip({ eventName, guests, serviceTime, schedule, onExit }: Props) {
  const now = new Date();
  const klok = now.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });

  const scheduleColor =
    schedule === 'on_track' ? 'var(--green)' :
    schedule === 'ahead' ? 'var(--blue)' :
    'var(--red)';
  const scheduleLabel =
    schedule === 'on_track' ? 'Op schema' :
    schedule === 'ahead' ? 'Voorlopen' :
    'Vertraagd';

  return (
    <div className="kds-top-strip">
      <div className="kds-top-event">
        <span className="kds-top-event__name">{eventName}</span>
        <span className="kds-top-event__meta">
          {guests} gasten{serviceTime ? ` · uitgifte ${serviceTime}` : ''}
        </span>
      </div>
      <div className="kds-top-clock">
        <span className="kds-top-clock__time">{klok}</span>
        <span className="kds-top-clock__schedule" style={{ color: scheduleColor }}>
          <span className="kds-status-dot" style={{ background: scheduleColor }} />
          {scheduleLabel}
        </span>
      </div>
      <button onClick={onExit} className="kds-top-exit" aria-label="Service afsluiten" title="Service afsluiten (ESC)">
        <X size={20} />
      </button>
    </div>
  );
}
