'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Circle, Play, Square, UserPlus } from 'lucide-react';
import type { DbEvent, Personeel, TimeLog } from '@/types';
import { fmtDuration, fmtTimeNL, calcHoursMs } from '@/lib/uren-format';

const IBA_JAARNORM = 1225;

interface Props {
  me: Personeel | null;
  myActiveLog: TimeLog | undefined;
  events: DbEvent[];
  myYearTotalHours: number;
  onPunchIn: (eventId: number | null) => Promise<void>;
  onPunchOut: () => Promise<void>;
}

export default function PunchPanel({ me, myActiveLog, events, myYearTotalHours, onPunchIn, onPunchOut }: Props) {
  const [now, setNow] = useState(Date.now());
  const [eventId, setEventId] = useState<number | ''>('');
  const [busy, setBusy] = useState(false);

  useEffect(function () {
    const id = setInterval(function () { setNow(Date.now()); }, 1000);
    return function () { clearInterval(id); };
  }, []);

  const isActive = !!myActiveLog;
  const elapsedMs = isActive ? Math.max(0, now - new Date(myActiveLog!.start_time).getTime()) : 0;
  const activeEvent = isActive && myActiveLog?.event_id
    ? events.find(function (e) { return e.id === myActiveLog.event_id; })
    : null;

  const upcomingEvents = useMemo(function () {
    return events
      .slice()
      .sort(function (a, b) { return (a.date || '').localeCompare(b.date || ''); })
      .slice(0, 25);
  }, [events]);

  function handlePunchIn() {
    if (!me || busy) return;
    setBusy(true);
    onPunchIn(typeof eventId === 'number' ? eventId : null)
      .finally(function () { setBusy(false); });
  }

  function handlePunchOut() {
    if (busy) return;
    setBusy(true);
    onPunchOut().finally(function () { setBusy(false); });
  }

  if (!me) {
    return (
      <div style={{
        padding: '32px 24px',
        borderRadius: 16,
        background: 'var(--panel)',
        border: '1px dashed var(--border)',
        textAlign: 'center',
      }}>
        <UserPlus size={32} style={{ color: 'var(--brand-gold)', marginBottom: 12 }} />
        <h3 style={{ margin: '0 0 8px', fontSize: 16 }}>Geen crew-record voor jou</h3>
        <p style={{ margin: '0 0 16px', color: 'var(--muted)', fontSize: 13 }}>
          Voeg jezelf toe als crew-lid om te kunnen klokken.
        </p>
        <Link href="/uren/personeel" className="btn btn-brand" style={{ minHeight: 44 }}>
          <UserPlus size={14} /> Naar personeel
        </Link>
      </div>
    );
  }

  return (
    <div
      style={{
        padding: '24px 28px',
        borderRadius: 16,
        background: isActive
          ? 'linear-gradient(135deg, rgba(34,197,94,.10), rgba(196,163,90,.04))'
          : 'var(--panel)',
        border: '1px solid ' + (isActive ? 'rgba(34,197,94,.35)' : 'var(--border)'),
        display: 'grid',
        gridTemplateColumns: 'auto 1fr auto',
        gap: 24,
        alignItems: 'center',
      }}
    >
      {/* Big punch button */}
      <button
        onClick={isActive ? handlePunchOut : handlePunchIn}
        disabled={busy}
        aria-label={isActive ? 'Stop dienst' : 'Start dienst'}
        style={{
          width: 96,
          height: 96,
          borderRadius: '50%',
          border: 'none',
          cursor: busy ? 'wait' : 'pointer',
          background: isActive
            ? 'linear-gradient(135deg, #ef4444, #b91c1c)'
            : 'linear-gradient(135deg, #FFBF00, #c4a35a)',
          color: isActive ? '#fff' : '#0a0a0c',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: isActive
            ? '0 4px 24px rgba(239,68,68,.4)'
            : '0 4px 24px rgba(255,191,0,.4), inset 0 1px 0 rgba(255,255,255,.2)',
          transition: 'transform .15s ease, box-shadow .2s ease',
        }}
        onMouseDown={function (e) { e.currentTarget.style.transform = 'scale(.95)'; }}
        onMouseUp={function (e) { e.currentTarget.style.transform = 'scale(1)'; }}
      >
        {isActive ? <Square size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" style={{ marginLeft: 4 }} />}
      </button>

      {/* Status & timer */}
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '.2em',
          textTransform: 'uppercase',
          color: isActive ? 'var(--green)' : 'var(--muted)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: 6,
        }}>
          <Circle size={8} fill="currentColor" style={{ animation: isActive ? 'pulse 1.5s infinite' : 'none' }} />
          {isActive ? 'Aan het werk' : 'Niet ingeklokt'}
        </div>
        {isActive ? (
          <>
            <div style={{
              fontFamily: 'var(--font-display)',
              fontSize: 40,
              fontWeight: 200,
              fontVariantNumeric: 'tabular-nums',
              lineHeight: 1.1,
            }}>
              {fmtDuration(calcHoursMs(elapsedMs))}
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
              <strong style={{ color: 'var(--text)', fontWeight: 600 }}>{me.naam}</strong>
              {' · sinds '}
              <span style={{ color: 'var(--brand-gold)' }}>{fmtTimeNL(myActiveLog!.start_time)}</span>
              {activeEvent && <> · op <em style={{ color: 'var(--text)', fontStyle: 'italic' }}>{activeEvent.name}</em></>}
            </div>
          </>
        ) : (
          <>
            <div style={{
              fontFamily: 'var(--font-display)',
              fontSize: 32,
              fontWeight: 200,
              lineHeight: 1.1,
            }}>
              <span>Klaar voor service, </span>
              <em style={{ color: 'var(--brand-gold)', fontStyle: 'italic', fontFamily: 'var(--font-artisan, var(--font-display))' }}>
                {me.naam.split(' ')[0]}
              </em>
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
              {me.functie} · druk op de knop om je dienst te starten
            </div>
          </>
        )}
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8, opacity: .8 }}>
          Jouw IBA: <strong style={{ color: 'var(--text)' }}>{Math.round(myYearTotalHours)}/{IBA_JAARNORM}u</strong>
          {' · '}{Math.max(0, IBA_JAARNORM - Math.round(myYearTotalHours))}u te gaan
        </div>
      </div>

      {/* Right: event-select OR stop-btn */}
      <div style={{ minWidth: 220 }}>
        {!isActive ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--muted)' }}>
              Op event
            </label>
            <select
              className="input"
              value={eventId}
              onChange={function (e) { setEventId(e.target.value ? parseInt(e.target.value, 10) : ''); }}
              style={{ minHeight: 40 }}
            >
              <option value="">— Geen event (algemene uren) —</option>
              {upcomingEvents.map(function (ev) {
                return <option key={ev.id} value={ev.id}>{ev.date} · {ev.name || 'Naamloos'}</option>;
              })}
            </select>
          </div>
        ) : (
          <button
            onClick={handlePunchOut}
            disabled={busy}
            className="btn btn-red"
            style={{ minHeight: 44, width: '100%' }}
          >
            <Square size={14} fill="currentColor" /> Eindig dienst
          </button>
        )}
      </div>
    </div>
  );
}
