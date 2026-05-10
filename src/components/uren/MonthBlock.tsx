'use client';

import { useMemo } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Printer } from 'lucide-react';
import type { Personeel, TimeLog } from '@/types';
import { fmtDuration, monthLabelNL, shiftDurationMs } from '@/lib/uren-format';

interface Props {
  month: string; // YYYY-MM
  setMonth: (m: string) => void;
  logs: TimeLog[];
  personeel: Personeel[];
}

export default function MonthBlock({ month, setMonth, logs, personeel }: Props) {
  const [y, m] = month.split('-').map(Number);

  const monthLogs = useMemo(function () {
    return logs.filter(function (l) {
      if (!l.end_time) return false; // alleen voltooide diensten
      const d = new Date(l.start_time);
      return d.getFullYear() === y && d.getMonth() === m - 1;
    });
  }, [logs, y, m]);

  const stats = useMemo(function () {
    let totalMs = 0;
    let totalCost = 0;
    monthLogs.forEach(function (l) {
      const dur = shiftDurationMs(l.start_time, l.end_time);
      const hours = dur / 3_600_000;
      totalMs += dur;
      const rate = l.uurtarief_snapshot ?? personeel.find(function (p) { return p.id === l.personeel_id; })?.uurtarief ?? 0;
      totalCost += hours * rate;
    });
    const activeCrewIds = new Set(monthLogs.map(function (l) { return l.personeel_id; }).filter(Boolean));
    return {
      totalHours: totalMs / 3_600_000,
      totalCost,
      diensten: monthLogs.length,
      crewActive: activeCrewIds.size,
    };
  }, [monthLogs, personeel]);

  const byCrew = useMemo(function () {
    const map = new Map<string, { personeel: Personeel | undefined; hours: number; cost: number; count: number }>();
    monthLogs.forEach(function (l) {
      const key = l.personeel_id || '__none__';
      const dur = shiftDurationMs(l.start_time, l.end_time);
      const hours = dur / 3_600_000;
      const p = personeel.find(function (x) { return x.id === l.personeel_id; });
      const rate = l.uurtarief_snapshot ?? p?.uurtarief ?? 0;
      const cost = hours * rate;
      const cur = map.get(key) || { personeel: p, hours: 0, cost: 0, count: 0 };
      cur.hours += hours;
      cur.cost += cost;
      cur.count += 1;
      map.set(key, cur);
    });
    return Array.from(map.values()).sort(function (a, b) { return b.hours - a.hours; });
  }, [monthLogs, personeel]);

  function prev() {
    const d = new Date(y, m - 1, 1);
    d.setMonth(d.getMonth() - 1);
    setMonth(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
  }
  function next() {
    const d = new Date(y, m - 1, 1);
    d.setMonth(d.getMonth() + 1);
    setMonth(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
  }

  const monthLabel = monthLabelNL(month);

  return (
    <div className="panel inv-glass uren-print-area" style={{ padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <CalendarDays size={14} style={{ color: 'var(--brand-gold)' }} />
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, letterSpacing: '.05em' }}>Maand-overzicht</h3>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }} className="no-print">
          <button onClick={prev} aria-label="Vorige maand" className="btn btn-ghost" style={{ minWidth: 36, minHeight: 36, padding: 8 }}>
            <ChevronLeft size={14} />
          </button>
          <span style={{
            minWidth: 140,
            textAlign: 'center',
            fontFamily: 'var(--font-display)',
            fontSize: 14,
            textTransform: 'capitalize',
          }}>
            {monthLabel}
          </span>
          <button onClick={next} aria-label="Volgende maand" className="btn btn-ghost" style={{ minWidth: 36, minHeight: 36, padding: 8 }}>
            <ChevronRight size={14} />
          </button>
          <button onClick={function () { window.print(); }} className="btn btn-ghost" style={{ minHeight: 36, marginLeft: 8 }}>
            <Printer size={12} /> Print PDF
          </button>
        </div>
        <div className="print-only" style={{ marginLeft: 'auto', fontSize: 14, fontWeight: 600 }}>
          {monthLabel}
        </div>
      </div>

      {/* Stats */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: 12,
        marginBottom: 18,
      }}>
        <Stat label="Totaal uren" value={stats.totalHours.toFixed(1)} unit="u" />
        <Stat label="Loonkost" value={'€' + stats.totalCost.toLocaleString('nl-NL', { maximumFractionDigits: 0 })} accent="var(--brand-gold)" />
        <Stat label="Diensten" value={String(stats.diensten)} />
        <Stat label="Crew actief" value={String(stats.crewActive)} />
      </div>

      {/* Tabel */}
      <div style={{ overflowX: 'auto' }}>
        <table className="tbl" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th style={{ width: 28 }}>#</th>
              <th>Naam</th>
              <th>Functie</th>
              <th style={{ textAlign: 'right' }}>Diensten</th>
              <th style={{ textAlign: 'right' }}>Uren</th>
              <th style={{ textAlign: 'right' }}>Tarief</th>
              <th style={{ textAlign: 'right' }}>Totaal</th>
            </tr>
          </thead>
          <tbody>
            {byCrew.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--muted)', fontStyle: 'italic' }}>
                Geen voltooide diensten in {monthLabel}
              </td></tr>
            ) : byCrew.map(function (r, i) {
              const avgRate = r.hours > 0 ? r.cost / r.hours : 0;
              return (
                <tr key={r.personeel?.id || ('row-' + i)}>
                  <td style={{ color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{String(i + 1).padStart(2, '0')}</td>
                  <td><strong>{r.personeel?.naam || 'Verwijderd lid'}</strong></td>
                  <td style={{ color: 'var(--muted)' }}>{r.personeel?.functie || '—'}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.count}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtDuration(r.hours)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>€{avgRate.toFixed(2)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--brand-gold)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                    €{r.cost.toLocaleString('nl-NL', { maximumFractionDigits: 0 })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 12, fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>
        Loonkost loopt automatisch door naar Financiën, gekoppeld per event.
      </div>
    </div>
  );
}

function Stat({ label, value, unit, accent }: { label: string; value: string; unit?: string; accent?: string }) {
  return (
    <div style={{
      padding: '12px 14px',
      borderRadius: 12,
      background: 'rgba(255,255,255,.02)',
      border: '1px solid var(--border)',
    }}>
      <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.18em', marginBottom: 4, fontWeight: 700 }}>
        {label}
      </div>
      <div style={{
        fontSize: 24,
        fontWeight: 200,
        fontFamily: 'var(--font-display)',
        color: accent || 'var(--text)',
        fontVariantNumeric: 'tabular-nums',
        lineHeight: 1.1,
      }}>
        {value}{unit && <span style={{ fontSize: 13, color: 'var(--muted)', marginLeft: 4 }}>{unit}</span>}
      </div>
    </div>
  );
}
