'use client';

import { useEffect, useMemo, useState } from 'react';

type UpcomingEvent = { id: number; name: string; date: string; guests: number; status: string };
type Progress = { done: number; total: number };

interface MepTopBarProps {
  events: UpcomingEvent[];
  selectedEventId: number | null;
  onEventChange: (eventId: number) => void;
  progress: Progress;
  onReset: () => void | Promise<void>;
  resetting?: boolean;
}

function formatEventLabel(event: UpcomingEvent, fmt: Intl.DateTimeFormat): string {
  const d = event.date ? new Date(`${event.date}T00:00:00`) : null;
  const datum = d && !Number.isNaN(d.getTime()) ? fmt.format(d) : 'onbekend';
  return `${event.name} — ${datum} — ${event.guests} pers`;
}

export default function MepTopBar({
  events,
  selectedEventId,
  onEventChange,
  progress,
  onReset,
  resetting = false,
}: MepTopBarProps) {
  const [bevestig, setBevestig] = useState(false);
  const fmt = useMemo(() => new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short' }), []);

  useEffect(() => {
    if (!bevestig) return;
    const t = window.setTimeout(() => setBevestig(false), 3000);
    return () => window.clearTimeout(t);
  }, [bevestig]);

  const handleResetClick = () => {
    if (resetting) return;
    if (!bevestig) { setBevestig(true); return; }
    void onReset();
    setBevestig(false);
  };

  return (
    <header className="border-b border-gray-800 bg-gray-900 px-3 py-3">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-800 text-sm font-bold tracking-widest text-white">
            MEP
          </div>
          <div>
            <p className="text-xs text-gray-400">Keuken</p>
            <p className="text-sm font-medium text-gray-200">Mise en place</p>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <label htmlFor="mep-event-select" className="sr-only">Selecteer event</label>
          <select
            id="mep-event-select"
            value={selectedEventId ?? ''}
            onChange={e => { const v = Number(e.target.value); if (Number.isInteger(v) && v > 0) onEventChange(v); }}
            disabled={events.length === 0}
            className="h-12 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 text-sm text-white outline-none disabled:opacity-50"
          >
            {events.length === 0 ? <option value="">Geen events</option> : null}
            {events.map(e => (
              <option key={e.id} value={e.id}>{formatEventLabel(e, fmt)}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-gray-800 px-3 py-2 text-sm font-medium text-gray-100">
            {progress.done}/{progress.total} klaar
          </div>
          <button
            type="button"
            onClick={handleResetClick}
            disabled={resetting}
            className={`h-12 rounded-lg px-4 text-sm font-semibold disabled:opacity-60 ${bevestig ? 'bg-red-700 text-white' : 'bg-gray-700 text-gray-100'}`}
          >
            {resetting ? 'Resetten...' : bevestig ? 'Weet je het zeker?' : 'Reset'}
          </button>
        </div>
      </div>
    </header>
  );
}
