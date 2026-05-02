'use client';

import { useMemo } from 'react';
import {
  ShieldCheck, Thermometer, ClipboardList, AlertTriangle, Activity,
  MoreHorizontal, Check, AlertOctagon, Droplets, Truck, ChevronRight,
  Download, Plus,
} from 'lucide-react';
import './redesign.css';
import type { HaccpRecord } from '@/types';

type Tone = 'ok' | 'warn' | 'bad';

interface Props {
  records: HaccpRecord[];
  onNew?: () => void;
  onExport?: () => void;
}

/* Thresholds per HACCP type.
   These match the redesign's reference thresholds. Actual thresholds could be sensor-specific. */
const TYPE_CONFIG: Record<string, { label: string; sub: string; range: [number, number]; alertHigh: number; alertLow: number; unit: string }> = {
  kern:      { label: 'Kerntemperatuur',     sub: 'Bereiding · min 75°C',       range: [60, 90],  alertHigh: 90,  alertLow: 75,  unit: '°C' },
  opslag:    { label: 'Koeling / opslag',    sub: 'Setpoint 4°C · grens < 7°C', range: [0, 8],    alertHigh: 7,   alertLow: 0,   unit: '°C' },
  ontvangst: { label: 'Ontvangst',           sub: 'Bij leveranciers · < 7°C',   range: [0, 10],   alertHigh: 7,   alertLow: -5,  unit: '°C' },
  bereiding: { label: 'Bereiding',           sub: 'Cooking zone · 80-130°C',    range: [80, 130], alertHigh: 130, alertLow: 80,  unit: '°C' },
  uitgifte:  { label: 'Uitgifte / hot-hold', sub: 'Service · > 60°C',           range: [55, 75],  alertHigh: 75,  alertLow: 60,  unit: '°C' },
};

function Sparkline({ data, range, alertHigh, breached }: { data: number[]; range: [number, number]; alertHigh: number; breached: boolean }) {
  const w = 280, h = 42, pad = 3;
  if (data.length === 0) {
    return (
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" width="100%" height="100%">
        <text x={w/2} y={h/2+4} textAnchor="middle" fill="var(--muted)" fontSize="10">geen data</text>
      </svg>
    );
  }
  const min = Math.min(...data), max = Math.max(...data);
  const lo = Math.min(range[0], min), hi = Math.max(range[1], max);
  const step = (w - pad * 2) / Math.max(1, data.length - 1);
  const y = (v: number) => h - pad - ((v - lo) / (hi - lo)) * (h - pad * 2);
  const path = data.map((v, i) => (i === 0 ? 'M' : 'L') + (pad + i * step).toFixed(1) + ',' + y(v).toFixed(1)).join(' ');
  const yAlert = y(alertHigh);
  const lastX = pad + (data.length - 1) * step;
  const lastY = y(data[data.length - 1]);
  const color = breached ? 'var(--red)' : '#22c55e';
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" width="100%" height="100%">
      <line x1={pad} x2={w - pad} y1={yAlert} y2={yAlert} stroke="rgba(239,68,68,.25)" strokeWidth="1" strokeDasharray="2 3" />
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" />
      <circle cx={lastX} cy={lastY} r="3" fill={color} />
      <circle cx={lastX} cy={lastY} r="6" fill="none" stroke={color} strokeOpacity=".3" />
    </svg>
  );
}

function todayIso() { return new Date().toISOString().slice(0, 10); }

export default function HaccpControlCenter({ records, onNew, onExport }: Props) {
  const today = todayIso();

  /* Group by type — last 12 entries each */
  const sensors = useMemo(() => {
    const byType: Record<string, HaccpRecord[]> = {};
    for (const r of records) {
      const t = r.type || 'opslag';
      if (!byType[t]) byType[t] = [];
      byType[t].push(r);
    }
    return Object.entries(byType).map(([type, list]) => {
      const sorted = list.slice().sort((a, b) => (a.datum + (a.tijd || '')).localeCompare(b.datum + (b.tijd || '')));
      const last12 = sorted.slice(-12);
      const cfg = TYPE_CONFIG[type] ?? { label: type, sub: '', range: [0, 100] as [number, number], alertHigh: 100, alertLow: -Infinity, unit: '°C' };
      const lastTemp = last12[last12.length - 1]?.temp ?? null;
      let direction: 'high' | 'low' | null = null;
      let breached = false;
      if (lastTemp != null) {
        if (lastTemp > cfg.alertHigh) { breached = true; direction = 'high'; }
        else if (lastTemp < cfg.alertLow) { breached = true; direction = 'low'; }
      }
      let tone: Tone = 'ok';
      let label = 'Veilig';
      if (breached) {
        tone = 'bad';
        label = direction === 'high' ? 'Te heet' : 'Te koud';
      } else if (lastTemp != null) {
        /* Near boundary warning: within 2°C of alertHigh, or 2°C of alertLow */
        const nearHigh = Math.abs(lastTemp - cfg.alertHigh) < 2;
        const nearLow = cfg.alertLow !== -Infinity && Math.abs(lastTemp - cfg.alertLow) < 2;
        if (nearHigh || nearLow) { tone = 'warn'; label = 'Op grens'; }
      } else {
        /* No data */
        tone = 'warn';
        label = 'Geen data';
      }
      return { type, cfg, data: last12.map(r => Number(r.temp) || 0), last: lastTemp, breached, direction, tone, label, count: list.length };
    });
  }, [records]);

  /* Checks today = records for today */
  const todayRecords = records.filter(r => r.datum === today)
    .slice()
    .sort((a, b) => (b.tijd || '').localeCompare(a.tijd || ''));
  const doneToday = todayRecords.length; /* every logged record is considered done */

  /* Incidents in last 30 days */
  const incidents30 = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const cutoffIso = cutoff.toISOString().slice(0, 10);
    return records.filter(r => r.datum >= cutoffIso && (r.status === 'danger' || r.status === 'afwijking' || r.status === 'warn')).length;
  }, [records]);

  const sensorsOk = sensors.filter(s => s.tone === 'ok').length;
  const sensorsTotal = sensors.length;

  /* Audit-readiness derived metrics */
  const audit30Days = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const cutoffIso = cutoff.toISOString().slice(0, 10);
    const recent = records.filter(r => r.datum >= cutoffIso);
    const ok = recent.filter(r => r.status === 'ok').length;
    const total = recent.length;
    const pct = total === 0 ? 0 : Math.round((ok / total) * 100);
    return { recent, ok, total, pct };
  }, [records]);

  /* Weighted compliance score: 60% ok-ratio · 30% incident-penalty · 10% sensor-status.
     Keeps headline-cijfer in lijn met de breakdown-rijen. */
  const compliance = useMemo(() => {
    const okRatioPart = audit30Days.total > 0 ? audit30Days.pct : 100;
    const incidentPart = Math.max(0, 100 - incidents30 * 5);
    const sensorPart = sensorsTotal > 0 ? Math.round((sensorsOk / sensorsTotal) * 100) : 100;
    return Math.round(0.6 * okRatioPart + 0.3 * incidentPart + 0.1 * sensorPart);
  }, [audit30Days, incidents30, sensorsOk, sensorsTotal]);

  const auditScore = compliance >= 95 ? 'A+' : compliance >= 85 ? 'A' : compliance >= 70 ? 'B' : 'C';
  const auditTone: Tone = compliance >= 85 ? 'ok' : compliance >= 70 ? 'warn' : 'bad';

  /* Risks: recent warn/danger, deduped by (wat + type + direction) */
  const risks = useMemo(() => {
    const seen = new Set<string>();
    const unique: HaccpRecord[] = [];
    const sorted = records
      .filter(r => r.status !== 'ok')
      .slice()
      .sort((a, b) => (b.datum + (b.tijd || '')).localeCompare(a.datum + (a.tijd || '')));
    for (const r of sorted) {
      /* Truncate long test-style names to first item before comma */
      const cleanWat = (r.wat || '').split(',')[0].trim();
      const key = `${cleanWat}::${r.type}::${r.temp}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push({ ...r, wat: cleanWat } as HaccpRecord);
      if (unique.length >= 5) break;
    }
    return unique;
  }, [records]);

  /* Logbook counts */
  const logCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of records) {
      if (r.datum !== today) continue;
      counts[r.type] = (counts[r.type] || 0) + 1;
    }
    return counts;
  }, [records, today]);

  return (
    <div className="redesign-root">
      <div className="main" style={{ padding: '24px 0 40px' }}>
        <div className="page-head">
          <div>
            <div className="page-eyebrow" style={{ color: 'var(--brand-gold)' }}>
              Vandaag · {records.length} records in systeem · {doneToday} vandaag gelogd
            </div>
            <h1 className="page-title">HACCP <span style={{ color: 'var(--muted)', fontWeight: 200 }}>· Control</span></h1>
          </div>
          <div className="hstack">
            {onExport && <button className="btn btn-ghost" onClick={onExport}><Download size={14} />Auditrapport</button>}
            {onNew && <button className="btn btn-primary" onClick={onNew}><Plus size={14} />Nieuwe meting</button>}
          </div>
        </div>

        <div className="haccp-status-row">
          <div className={`hs-card ${compliance >= 85 ? 'ok' : compliance >= 70 ? 'warn' : 'bad'}`}>
            <div className="l"><ShieldCheck size={11} />Compliance</div>
            <div className="v">{compliance}<span style={{ fontSize: 18, color: 'var(--muted)' }}>%</span></div>
            <div className="s">{incidents30 === 0 ? 'Geen openstaande incidenten' : `${incidents30} incidenten laatste 30d`}</div>
            <div className="tick"></div>
          </div>
          <div className={`hs-card ${sensorsOk === sensorsTotal ? 'ok' : 'warn'}`}>
            <div className="l"><Thermometer size={11} />Sensoren</div>
            <div className="v">{sensorsOk}<span style={{ fontSize: 18, color: 'var(--muted)' }}>/{sensorsTotal || '—'}</span></div>
            <div className="s">{sensorsTotal === 0 ? 'Nog geen metingen gelogd' : 'Ok ten opzichte van limiet'}</div>
            <div className="tick"></div>
          </div>
          <div className={`hs-card ${doneToday >= 3 ? 'ok' : doneToday >= 1 ? 'warn' : 'warn'}`}>
            <div className="l"><ClipboardList size={11} />Logs vandaag</div>
            <div className="v">{doneToday}</div>
            <div className="s">{doneToday === 0 ? 'Nog geen metingen vandaag' : `${doneToday} metingen gelogd`}</div>
            <div className="tick"></div>
          </div>
          <div className={`hs-card ${incidents30 === 0 ? 'ok' : incidents30 < 3 ? 'warn' : 'bad'}`}>
            <div className="l"><AlertTriangle size={11} />Incidenten (30d)</div>
            <div className="v">{incidents30}</div>
            <div className="s">{incidents30 === 0 ? 'Alles binnen de grens' : 'Zie attentiepunten rechts'}</div>
            <div className="tick"></div>
          </div>
        </div>

        <div className="haccp-grid">
          <div>
            <div className="temp-log">
              <div className="temp-log-head">
                <div className="title">
                  <span className="icon"><Thermometer size={16} /></span>
                  Temperatuur-sensoren <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400 }}>· per type · laatste 12 metingen</span>
                </div>
                <div className="hstack">
                  <span className="pill p-ok"><Activity size={10} />Live</span>
                  <button className="icon-btn"><MoreHorizontal size={14} /></button>
                </div>
              </div>
              <div className="temp-log-body">
                {sensors.length === 0 ? (
                  <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)' }}>
                    Nog geen HACCP-metingen. Log je eerste meting om hier live data te zien.
                  </div>
                ) : sensors.map(s => (
                  <div key={s.type} className="sensor-row">
                    <div className="sensor-name">
                      <div className="n">{s.cfg.label}</div>
                      <div className="s">{s.cfg.sub} · {s.count} logs</div>
                    </div>
                    <div className="sensor-spark">
                      <Sparkline data={s.data} range={s.cfg.range} alertHigh={s.cfg.alertHigh} breached={s.breached} />
                    </div>
                    <div className="sensor-now">
                      <div className={`t ${s.tone}`}>{s.last != null ? `${s.last}${s.cfg.unit}` : '—'}</div>
                      <div className="d">{s.label}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="checks-card">
              <div className="checks-head">
                <div>
                  <div className="t">Dagtaken · vandaag</div>
                  <div className="s">{doneToday} gelogd · sorteren op tijd</div>
                </div>
                <div className="checks-progress">
                  <div className="bar"><div className="fill" style={{ width: `${Math.min(100, doneToday * 15)}%` }} /></div>
                  <div className="pct">{doneToday}</div>
                </div>
              </div>
              {todayRecords.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                  Nog geen metingen vandaag. Log een meting om hier in te verschijnen.
                </div>
              ) : todayRecords.slice(0, 10).map(r => {
                const bad = r.status === 'danger' || r.status === 'afwijking';
                const warn = r.status === 'warn';
                return (
                  <div key={r.id} className={`check-item ${!bad && !warn ? 'done' : ''}`}>
                    <div className="tickbox">{!bad && !warn && <Check size={14} />}</div>
                    <div className="body">
                      <div className="t">{r.wat} · {r.temp}°C</div>
                      <div className="s">{TYPE_CONFIG[r.type]?.label || r.type}{r.notitie ? ' — ' + r.notitie : ''}</div>
                    </div>
                    <div className="who">
                      <span style={{ color: bad ? 'var(--red)' : warn ? 'var(--amber)' : 'var(--muted)' }}>{r.tijd || '—'}</span>
                      {bad && <span className="overdue-tag">Afwijking</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="vstack" style={{ gap: 16 }}>
            <div className="audit-card" style={auditTone !== 'ok' ? { borderColor: auditTone === 'warn' ? 'rgba(245,158,11,.22)' : 'rgba(239,68,68,.22)', background: 'linear-gradient(180deg, ' + (auditTone === 'warn' ? 'rgba(245,158,11,.05)' : 'rgba(239,68,68,.05)') + ', transparent 50%), var(--card)' } : undefined}>
              <div className="audit-eyebrow" style={{ color: auditTone === 'ok' ? 'var(--green)' : auditTone === 'warn' ? 'var(--amber)' : 'var(--red)' }}>
                <ShieldCheck size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />Audit-readiness
              </div>
              <div className="audit-score" style={{ color: auditTone === 'ok' ? 'var(--green)' : auditTone === 'warn' ? 'var(--amber)' : 'var(--red)' }}>{auditScore}</div>
              <div className="audit-desc">
                {auditTone === 'ok'
                  ? 'NVWA-klaar. Coverage over 30 dagen goed, geen openstaande incidenten.'
                  : auditTone === 'warn'
                  ? 'Let op: enkele afwijkingen in de laatste 30 dagen. Plan correcties in.'
                  : 'Meerdere incidenten. Voer corrigerende acties uit voor audit-readiness.'}
              </div>
              <div className="audit-breakdown">
                <div className="audit-row"><span className="k">Records laatste 30d</span><span className="v ok">{audit30Days.total}</span></div>
                <div className="audit-row"><span className="k">Ok-ratio</span><span className={`v ${audit30Days.pct >= 95 ? 'ok' : audit30Days.pct >= 80 ? 'warn' : 'warn'}`}>{audit30Days.pct}%</span></div>
                <div className="audit-row"><span className="k">Incidenten 30d</span><span className={`v ${incidents30 === 0 ? 'ok' : 'warn'}`}>{incidents30}</span></div>
                <div className="audit-row"><span className="k">Sensoren in range</span><span className={`v ${sensorsOk === sensorsTotal ? 'ok' : 'warn'}`}>{sensorsOk}/{sensorsTotal || '—'}</span></div>
              </div>
            </div>

            <div className="risk-card">
              <div className="risk-head"><span className="icon"><AlertTriangle size={14} /></span>Attentiepunten</div>
              {risks.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--muted)', padding: '8px 0' }}>
                  Geen attentiepunten — alle recente metingen zijn binnen de grens.
                </div>
              ) : risks.map(r => (
                <div key={r.id} className="risk-item">
                  <div className="dot"></div>
                  <div className="body">
                    <div className="t">{r.wat} · {r.temp}°C</div>
                    <div className="s">{TYPE_CONFIG[r.type]?.label || r.type} — {r.datum}{r.tijd ? ' ' + r.tijd : ''}{r.notitie ? ' — ' + r.notitie : ''}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="client-card">
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10 }}>Logboek · snel toegang</div>
              {([
                { Ic: Thermometer, t: 'Kerntemperatuur', key: 'kern' },
                { Ic: Droplets, t: 'Koeling & opslag', key: 'opslag' },
                { Ic: Truck, t: 'Ontvangst', key: 'ontvangst' },
                { Ic: AlertOctagon, t: 'Afwijkingen', key: '__bad' },
              ] as const).map((row, i) => {
                const Ic = row.Ic;
                const count = row.key === '__bad'
                  ? records.filter(r => r.status !== 'ok' && r.datum === today).length
                  : (logCounts[row.key] || 0);
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: i === 0 ? 'none' : '1px solid rgba(130,130,130,.08)' }}>
                    <div style={{ width: 26, height: 26, borderRadius: 7, background: 'rgba(196,163,90,.1)', border: '1px solid rgba(196,163,90,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--brand-gold)' }}>
                      <Ic size={12} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 500 }}>{row.t}</div>
                      <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>{count} vandaag</div>
                    </div>
                    <ChevronRight size={13} color="var(--muted-light)" />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
