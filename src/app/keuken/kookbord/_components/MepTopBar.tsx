'use client';

import { useEffect, useMemo, useState } from 'react';
import { Flame, RotateCcw, ChevronDown } from 'lucide-react';
import { ACCENT } from './mep-ui';

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

export default function MepTopBar({ events, selectedEventId, onEventChange, progress, onReset, resetting = false }: MepTopBarProps) {
  const [bevestig, setBevestig] = useState(false);
  const fmt = useMemo(() => new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short' }), []);

  useEffect(() => {
    if (!bevestig) return;
    const t = window.setTimeout(() => setBevestig(false), 3000);
    return () => window.clearTimeout(t);
  }, [bevestig]);

  const huidig = events.find(e => e.id === selectedEventId) ?? null;
  const { done, total } = progress;
  const pct = total ? done / total : 0;
  const R = 15.5;
  const C = 2 * Math.PI * R;
  const ringColor = total > 0 && done === total ? '#22c55e' : ACCENT;

  const datum = (d: string) => {
    const dt = d ? new Date(`${d}T00:00:00`) : null;
    return dt && !Number.isNaN(dt.getTime()) ? fmt.format(dt) : '';
  };
  const splitNaam = (name: string) => {
    const i = name.indexOf(':');
    if (i > 0 && i < name.length - 1) return { pre: name.slice(0, i + 1), rest: name.slice(i + 1).trim() };
    return { pre: '', rest: name };
  };
  const naam = huidig ? splitNaam(huidig.name) : { pre: '', rest: '' };

  const handleReset = () => {
    if (resetting) return;
    if (!bevestig) { setBevestig(true); return; }
    void onReset();
    setBevestig(false);
  };

  return (
    <header style={{ flex: '0 0 auto', height: 68, display: 'flex', alignItems: 'center', gap: 20, padding: '0 22px', background: 'rgba(16,16,18,.82)', backdropFilter: 'blur(18px)', borderBottom: '1px solid rgba(130,130,130,.13)', zIndex: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 210 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(160deg,#22201b,#121214)', border: '1px solid rgba(196,163,90,.42)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 3px 12px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.04)' }}>
          <Flame size={18} color="#d8b863" strokeWidth={1.8} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.16 }}>
          <span style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 600, fontSize: 13.5, letterSpacing: '.03em', color: '#f3f3f3' }}>Hop &amp; Bites</span>
          <span style={{ fontSize: 9, letterSpacing: '.26em', textTransform: 'uppercase', color: '#8b8b8f', fontWeight: 700 }}>Mise · en · place</span>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
        <div style={{ position: 'relative' }}>
          <div className="mep-ghost" style={{ display: 'flex', alignItems: 'center', gap: 13, height: 46, padding: '0 8px 0 16px', borderRadius: 13, background: 'rgba(30,30,34,.66)', border: '1px solid rgba(130,130,130,.16)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.03)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {huidig ? (
                <>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#f3f3f3', letterSpacing: '.01em' }}>
                    {naam.pre && <span style={{ color: '#8b8b8f', fontWeight: 500 }}>{naam.pre} </span>}{naam.rest}
                  </span>
                  <span style={{ width: 4, height: 4, borderRadius: 999, background: '#5a5a5e' }} />
                  <span style={{ fontSize: 13, color: '#b9b9bd', fontWeight: 500 }}>{datum(huidig.date)}</span>
                  <span style={{ width: 4, height: 4, borderRadius: 999, background: '#5a5a5e' }} />
                  <span style={{ fontSize: 13, color: '#b9b9bd', fontWeight: 500 }}>{huidig.guests} pers</span>
                </>
              ) : (
                <span style={{ fontSize: 13, color: '#8b8b8f' }}>Geen events</span>
              )}
            </span>
            <span style={{ display: 'flex', width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', background: 'rgba(130,130,130,.1)', color: '#9aa0a8' }}>
              <ChevronDown size={16} color="#9aa0a8" strokeWidth={2} />
            </span>
          </div>
          <select
            aria-label="Selecteer event"
            value={selectedEventId ?? ''}
            onChange={e => { const v = Number(e.target.value); if (Number.isInteger(v) && v > 0) onEventChange(v); }}
            disabled={events.length === 0}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', border: 'none' }}
          >
            {events.length === 0 ? <option value="">Geen events</option> : null}
            {events.map(e => (
              <option key={e.id} value={e.id}>{e.name} — {datum(e.date)} — {e.guests} pers</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 210, justifyContent: 'flex-end' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          <svg width="42" height="42" viewBox="0 0 42 42" style={{ transform: 'rotate(-90deg)', flex: '0 0 auto' }}>
            <circle cx="21" cy="21" r={R} fill="none" stroke="rgba(130,130,130,.16)" strokeWidth="4" />
            <circle cx="21" cy="21" r={R} fill="none" stroke={ringColor} strokeWidth="4" strokeLinecap="round" strokeDasharray={C.toFixed(2)} strokeDashoffset={(C * (1 - pct)).toFixed(2)} style={{ transition: 'stroke-dashoffset .45s cubic-bezier(.16,1,.3,1)' }} />
          </svg>
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
            <span style={{ fontSize: 9, letterSpacing: '.2em', textTransform: 'uppercase', color: '#8b8b8f', fontWeight: 700 }}>Voortgang</span>
            <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: '#f3f3f3' }}>{done}/{total} klaar</span>
          </div>
        </div>
        <button
          type="button"
          onClick={handleReset}
          disabled={resetting}
          className="mep-ghost"
          style={{ display: 'flex', alignItems: 'center', gap: 7, height: 38, padding: '0 13px', borderRadius: 10, background: bevestig ? 'rgba(239,68,68,.16)' : 'rgba(130,130,130,.07)', border: `1px solid ${bevestig ? 'rgba(239,68,68,.5)' : 'rgba(130,130,130,.16)'}`, color: bevestig ? '#f8a3a3' : '#9aa0a8', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', opacity: resetting ? 0.6 : 1 }}
        >
          <RotateCcw size={14} color={bevestig ? '#f8a3a3' : '#9aa0a8'} strokeWidth={2} />
          <span>{resetting ? 'Resetten…' : bevestig ? 'Zeker?' : 'Reset'}</span>
        </button>
      </div>
    </header>
  );
}
