'use client';

import { useEffect, useState } from 'react';
import { Radio, Square } from 'lucide-react';
import type { DbEvent, Personeel, TimeLog } from '@/types';
import { fmtTimer, fmtTimeNL, shiftDurationMs } from '@/lib/uren-format';

interface Props {
  liveLogs: TimeLog[];
  personeel: Personeel[];
  events: DbEvent[];
  onStop: (logId: number) => Promise<void>;
}

export default function LiveRow({ liveLogs, personeel, events, onStop }: Props) {
  const [now, setNow] = useState(Date.now());

  useEffect(function () {
    const id = setInterval(function () { setNow(Date.now()); }, 1000);
    return function () { clearInterval(id); };
  }, []);

  return (
    <div className="panel inv-glass" style={{ padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <Radio size={14} style={{ color: liveLogs.length > 0 ? 'var(--green)' : 'var(--muted)' }} />
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, letterSpacing: '.05em' }}>Aan het werk</h3>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>· {liveLogs.length} live</span>
      </div>

      {liveLogs.length === 0 ? (
        <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 13, fontStyle: 'italic' }}>
          Niemand is op dit moment ingeklokt.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {liveLogs.map(function (log) {
            const p = personeel.find(function (x) { return x.id === log.personeel_id; });
            const ev = log.event_id ? events.find(function (x) { return x.id === log.event_id; }) : null;
            const elapsed = shiftDurationMs(log.start_time, null, now);
            return (
              <div
                key={log.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'auto 1fr auto auto',
                  gap: 12,
                  alignItems: 'center',
                  padding: '10px 12px',
                  borderRadius: 10,
                  background: 'rgba(34,197,94,.06)',
                  border: '1px solid rgba(34,197,94,.18)',
                }}
              >
                <Avatar naam={p?.naam || '?'} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{p?.naam || 'Onbekend'}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {ev ? ev.name : 'Algemene uren'} · sinds {fmtTimeNL(log.start_time)}
                  </div>
                </div>
                <div style={{
                  fontSize: 14,
                  fontVariantNumeric: 'tabular-nums',
                  fontWeight: 600,
                  color: 'var(--green)',
                  fontFamily: 'var(--font-mono, monospace)',
                }}>
                  {fmtTimer(elapsed)}
                </div>
                <button
                  onClick={function () { onStop(log.id); }}
                  aria-label={'Stop ' + (p?.naam || 'crew')}
                  className="btn btn-ghost"
                  style={{ minWidth: 36, minHeight: 36, padding: 8, color: 'var(--red)' }}
                  title="Klok deze persoon uit"
                >
                  <Square size={12} fill="currentColor" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Avatar({ naam }: { naam: string }) {
  const initials = naam
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(function (w) { return w[0]; })
    .join('')
    .toUpperCase();
  return (
    <div style={{
      width: 30,
      height: 30,
      borderRadius: '50%',
      background: 'linear-gradient(135deg, #c4a35a, #9e781c)',
      color: '#0a0a0c',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontWeight: 700,
      fontSize: 11,
      flexShrink: 0,
    }}>
      {initials || '?'}
    </div>
  );
}
