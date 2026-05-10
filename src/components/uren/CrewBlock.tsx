'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Settings, Users } from 'lucide-react';
import type { DbEvent, Personeel, TimeLog } from '@/types';
import { fmtTimer, shiftDurationMs } from '@/lib/uren-format';

interface Props {
  personeel: Personeel[];
  activeLogsByPersoneelId: Record<string, TimeLog | undefined>;
  events: DbEvent[];
  onPunchIn: (personeelId: string, eventId: number | null) => Promise<void>;
  onPunchOut: (logId: number) => Promise<void>;
}

export default function CrewBlock({ personeel, activeLogsByPersoneelId, events, onPunchIn, onPunchOut }: Props) {
  const [now, setNow] = useState(Date.now());
  const [eventId, setEventId] = useState<number | ''>('');
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(function () {
    const id = setInterval(function () { setNow(Date.now()); }, 1000);
    return function () { clearInterval(id); };
  }, []);

  const upcomingEvents = useMemo(function () {
    return events
      .slice()
      .sort(function (a, b) { return (a.date || '').localeCompare(b.date || ''); })
      .slice(0, 25);
  }, [events]);

  const actief = useMemo(function () {
    return personeel.filter(function (p) { return p.actief; });
  }, [personeel]);

  function handleToggle(p: Personeel) {
    const active = activeLogsByPersoneelId[p.id];
    setBusyId(p.id);
    const action = active
      ? onPunchOut(active.id)
      : onPunchIn(p.id, typeof eventId === 'number' ? eventId : null);
    action.finally(function () { setBusyId(null); });
  }

  return (
    <div className="panel inv-glass" style={{ padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <Users size={14} style={{ color: 'var(--brand-gold)' }} />
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, letterSpacing: '.05em' }}>Crew klokken</h3>
        <Link
          href="/uren/personeel"
          style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}
        >
          <Settings size={11} /> Beheer crew
        </Link>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
          Inklok-event
        </label>
        <select
          className="input"
          value={eventId}
          onChange={function (e) { setEventId(e.target.value ? parseInt(e.target.value, 10) : ''); }}
          style={{ width: '100%', minHeight: 36 }}
        >
          <option value="">— Geen event (algemene uren) —</option>
          {upcomingEvents.map(function (ev) {
            return <option key={ev.id} value={ev.id}>{ev.date} · {ev.name || 'Naamloos'}</option>;
          })}
        </select>
      </div>

      {actief.length === 0 ? (
        <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
          Nog geen actieve crew.
          <div style={{ marginTop: 8 }}>
            <Link href="/uren/personeel" className="btn btn-brand" style={{ minHeight: 40 }}>
              <Users size={14} /> Voeg crew toe
            </Link>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {actief.map(function (p, i) {
            const active = activeLogsByPersoneelId[p.id];
            const elapsed = active ? shiftDurationMs(active.start_time, null, now) : 0;
            return (
              <div
                key={p.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '24px 1fr auto auto auto',
                  gap: 10,
                  alignItems: 'center',
                  padding: '8px 10px',
                  borderRadius: 8,
                  background: active ? 'rgba(34,197,94,.06)' : 'transparent',
                  borderBottom: '1px solid var(--border)',
                  minHeight: 44,
                }}
              >
                <span style={{ fontSize: 11, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{p.naam}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{p.functie}</div>
                </div>
                <div style={{
                  fontFamily: 'var(--font-mono, monospace)',
                  fontVariantNumeric: 'tabular-nums',
                  fontSize: 12,
                  color: active ? 'var(--green)' : 'var(--muted)',
                  minWidth: 70,
                  textAlign: 'right',
                }}>
                  {active ? fmtTimer(elapsed) : '—'}
                </div>
                <span style={{ fontSize: 11, color: 'var(--muted)', minWidth: 50, textAlign: 'right' }}>
                  €{p.uurtarief.toFixed(0)}/u
                </span>
                <button
                  onClick={function () { handleToggle(p); }}
                  disabled={busyId === p.id}
                  className={'btn ' + (active ? 'btn-red' : 'btn-brand')}
                  style={{ minHeight: 36, fontSize: 12, padding: '6px 12px' }}
                >
                  {active ? 'Stop' : 'Inklok'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
