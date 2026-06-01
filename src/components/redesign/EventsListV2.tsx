'use client';

/* ── /events — lijst-weergave (tabel + kaart-grid) ────────────────────────
   Redesign uit de Plannen-hub design-zip (plannen-events.jsx), aangesloten op
   echte DbEvent-data. Status-mapping via src/lib/statuses.ts. Marge-bar uit het
   design bewust weggelaten: er is geen kant-en-klare event-marge in de data
   (zou per-event een dure facturen+uren+inkoop-query vereisen) — nep-data zou
   tegen "alles moet kloppen" ingaan. Omzet = guests × ppp (bestaande conventie). */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search, CalendarRange, Table2, LayoutGrid, Tag, FileDown, Check,
  MapPin, Calendar, Users, PartyPopper, SearchX, Plus,
} from 'lucide-react';
import type { DbEvent, Offerte } from '@/types';
import { normalizeEventStatus, type EventStatus } from '@/lib/statuses';
import EmptyState from '@/components/EmptyState';
import StatusBadge from '@/components/StatusBadge';
import { formatEurInt } from '@/lib/format';

interface PrepTask { id: number; event_id: number; done: boolean; }

interface Props {
  events: DbEvent[];
  offertes?: Offerte[];
  prepTasks?: PrepTask[];
  onOpen: (ev: DbEvent) => void;
  onNew: () => void;
}

/* Display-status (concept/optie/bevestigd/afgerond/geannuleerd) met spec-kleuren.
   DB-status (pending/optie/confirmed/in_progress/completed/cancelled) wordt
   hierop gemapt via normalizeEventStatus + STATUS_DISPLAY. */
type DisplayStatus = 'concept' | 'optie' | 'bevestigd' | 'afgerond' | 'geannuleerd';

const STATUS_META: Record<DisplayStatus, { label: string; dot: string; text: string; bg: string; border: string }> = {
  concept:     { label: 'Concept',     dot: 'rgba(255,255,255,.55)', text: 'rgba(255,255,255,.85)', bg: 'rgba(255,255,255,.05)', border: 'rgba(255,255,255,.16)' },
  optie:       { label: 'Optie',       dot: '#60a5fa', text: '#7cb6ff', bg: 'rgba(59,130,246,.10)', border: 'rgba(59,130,246,.30)' },
  bevestigd:   { label: 'Bevestigd',   dot: '#22c55e', text: '#4ade80', bg: 'rgba(34,197,94,.10)', border: 'rgba(34,197,94,.28)' },
  afgerond:    { label: 'Afgerond',    dot: '#10b981', text: '#34d399', bg: 'rgba(16,185,129,.10)', border: 'rgba(16,185,129,.30)' },
  geannuleerd: { label: 'Geannuleerd', dot: '#ef4444', text: '#f87171', bg: 'rgba(239,68,68,.10)', border: 'rgba(239,68,68,.28)' },
};

function toDisplayStatus(dbStatus: string | null | undefined): DisplayStatus {
  const n: EventStatus | null = normalizeEventStatus(dbStatus);
  switch (n) {
    case 'pending': return 'concept';
    case 'optie': return 'optie';
    case 'confirmed': return 'bevestigd';
    case 'in_progress': return 'bevestigd';
    case 'completed': return 'afgerond';
    case 'cancelled': return 'geannuleerd';
    default: return 'concept';
  }
}

const MND = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
function fmtDatum(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return '—';
  return d.getDate() + ' ' + MND[d.getMonth()];
}
function eventOmzet(ev: DbEvent): number {
  return (ev.guests || 0) * ((ev as { ppp?: number }).ppp || 0);
}

/* StatusBadge komt nu uit de gedeelde component (src/components/StatusBadge.tsx) —
   design-eenheid (WP-2.1). STATUS_META blijft alleen voor de kaart-stripe-kleur
   (CardGridView) + de filter-pill-styling in de Toolbar; dat zijn geen badges. */

function Checkbox({ checked, onClick }: { checked: boolean; onClick: (e: React.MouseEvent) => void }) {
  return (
    <span onClick={onClick} style={{
      width: 18, height: 18, borderRadius: 5,
      border: `1.5px solid ${checked ? 'var(--brand)' : 'var(--border-strong, var(--border))'}`,
      background: checked ? 'var(--brand)' : 'transparent',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
    }}>
      {checked && <Check size={13} color="#000" strokeWidth={3} />}
    </span>
  );
}

interface Row {
  ev: DbEvent;
  id: string;
  naam: string;
  klant: string;
  datum: string;
  tijd: string;
  gasten: number;
  locatie: string;
  omzet: number;
  status: DisplayStatus;
}

const STATUSES: DisplayStatus[] = ['concept', 'optie', 'bevestigd', 'afgerond', 'geannuleerd'];

export default function EventsListV2({ events, onOpen, onNew }: Props) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<DisplayStatus[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'tabel' | 'grid'>('tabel');

  const allRows: Row[] = useMemo(() => events.map((ev) => ({
    ev,
    id: String(ev.id),
    naam: ev.name || 'Naamloos event',
    klant: (ev as { client_naam?: string }).client_naam || '—',
    datum: ev.date || '',
    tijd: (ev as { tijd?: string }).tijd || '',
    gasten: ev.guests || 0,
    locatie: ev.location || '—',
    omzet: eventOmzet(ev),
    status: toDisplayStatus(ev.status),
  })), [events]);

  const ql = q.trim().toLowerCase();
  const rows = allRows.filter((r) =>
    (statusFilter.length === 0 || statusFilter.includes(r.status)) &&
    (ql === '' || r.naam.toLowerCase().includes(ql) || r.klant.toLowerCase().includes(ql) || r.locatie.toLowerCase().includes(ql) || r.id.toLowerCase().includes(ql))
  );

  const toggle = (id: string) => setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  const toggleAll = () => setSelected((s) => s.length === rows.length ? [] : rows.map((r) => r.id));

  const isEmpty = events.length === 0;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Events</h1>
          <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 4, margin: '4px 0 0' }}>Alle events op een rij — van aanvraag tot afgerond.</p>
        </div>
        <button className="btn btn-brand" onClick={onNew} style={{ minHeight: 42 }}><Plus size={15} /> Nieuw event</button>
      </div>

      {isEmpty ? (
        <EmptyState page="/events" />
      ) : (
        <>
          {/* Toolbar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', display: 'inline-flex' }}><Search size={15} color="var(--muted)" /></span>
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Zoek op klant, locatie of nummer…"
                  style={{ width: '100%', background: 'var(--bg-deep, var(--card))', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 10, padding: '10px 12px 10px 36px', fontSize: 13.5, outline: 'none', minHeight: 42 }}
                />
              </div>
              <div style={{ display: 'inline-flex', padding: 3, gap: 2, borderRadius: 10, background: 'var(--bg-deep, var(--card))', border: '1px solid var(--border)' }}>
                {([['tabel', Table2], ['grid', LayoutGrid]] as const).map(([m, IconC]) => (
                  <button key={m} onClick={() => setViewMode(m)} aria-label={m === 'tabel' ? 'Tabelweergave' : 'Kaartweergave'}
                    style={{ minHeight: 36, minWidth: 36, border: 'none', borderRadius: 8, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: viewMode === m ? 'var(--brand-tint)' : 'transparent', color: viewMode === m ? 'var(--brand)' : 'var(--muted)' }}>
                    <IconC size={16} />
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: 3, borderRadius: 999, background: 'var(--bg-deep, var(--card))', border: '1px solid var(--border)', flexWrap: 'wrap' }}>
                {STATUSES.map((s) => {
                  const on = statusFilter.includes(s);
                  const c = STATUS_META[s];
                  return (
                    <button key={s} onClick={() => setStatusFilter(on ? statusFilter.filter((x) => x !== s) : [...statusFilter, s])}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 999, cursor: 'pointer', border: 'none', background: on ? c.bg : 'transparent', color: on ? c.text : 'var(--muted)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                      <span style={{ width: 6, height: 6, borderRadius: 999, background: on ? c.dot : 'var(--muted)' }} />{c.label}
                    </button>
                  );
                })}
              </div>
              <div style={{ flex: 1 }} />
              {selected.length > 0 ? (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 8px 6px 14px', borderRadius: 999, background: 'var(--brand-tint)', border: '1px solid var(--brand-tint-border, var(--border))' }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--brand)' }}>{selected.length} geselecteerd</span>
                  <button className="btn btn-ghost btn-sm" style={{ minHeight: 34 }} onClick={() => setSelected([])}><Tag size={13} /> Status</button>
                  <button className="btn btn-ghost btn-sm" style={{ minHeight: 34 }} onClick={() => setSelected([])}><FileDown size={13} /> Export</button>
                </div>
              ) : (
                <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{rows.length} van {events.length} events</span>
              )}
            </div>
          </div>

          {rows.length === 0 ? (
            <div style={{ padding: '48px 24px', textAlign: 'center' }}>
              <SearchX size={30} color="var(--muted)" style={{ marginBottom: 12 }} />
              <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', margin: '0 0 6px' }}>Niets gevonden</h3>
              <p style={{ color: 'var(--muted)', fontSize: 14, margin: 0 }}>Geen events matchen je zoekopdracht of filters.</p>
            </div>
          ) : viewMode === 'tabel' ? (
            <TableView rows={rows} selected={selected} toggle={toggle} toggleAll={toggleAll} onOpen={(r) => onOpen(r.ev)} />
          ) : (
            <CardGridView rows={rows} onOpen={(r) => onOpen(r.ev)} />
          )}
        </>
      )}
    </div>
  );
}

function TableView({ rows, selected, toggle, toggleAll, onOpen }: {
  rows: Row[]; selected: string[]; toggle: (id: string) => void; toggleAll: () => void; onOpen: (r: Row) => void;
}) {
  const cols = '40px 76px 1fr 130px 70px 110px 132px';
  const allSel = rows.length > 0 && selected.length === rows.length;
  return (
    <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 12, padding: '12px 18px', borderBottom: '1px solid var(--border)', alignItems: 'center', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--muted)' }}>
        <span><Checkbox checked={allSel} onClick={(e) => { e.stopPropagation(); toggleAll(); }} /></span>
        <span>Datum</span><span>Event</span><span>Locatie</span>
        <span style={{ textAlign: 'right' }}>Gasten</span><span style={{ textAlign: 'right' }}>Omzet</span><span>Status</span>
      </div>
      {rows.map((r, i) => {
        const sel = selected.includes(r.id);
        return (
          <div key={r.id} onClick={() => onOpen(r)}
            style={{ display: 'grid', gridTemplateColumns: cols, gap: 12, padding: '13px 18px', alignItems: 'center', cursor: 'pointer', fontSize: 13.5, borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none', background: sel ? 'var(--brand-tint-subtle, var(--brand-tint))' : 'transparent' }}>
            <span onClick={(e) => { e.stopPropagation(); toggle(r.id); }}><Checkbox checked={sel} onClick={() => {}} /></span>
            <span className="mono" style={{ color: 'var(--muted-light, var(--text))' }}>{fmtDatum(r.datum)}</span>
            <span style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)' }}>{r.naam}</div>
              <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{r.klant}</div>
            </span>
            <span style={{ color: 'var(--muted-light, var(--text))', display: 'inline-flex', alignItems: 'center', gap: 5, overflow: 'hidden' }}><MapPin size={13} color="var(--muted)" />{r.locatie}</span>
            <span className="mono" style={{ textAlign: 'right', color: 'var(--muted-light, var(--text))' }}>{r.gasten}</span>
            <span className="mono" style={{ textAlign: 'right', fontWeight: 600, color: 'var(--text)' }}>{formatEurInt(r.omzet)}</span>
            <span><StatusBadge status={r.status} size="sm" /></span>
          </div>
        );
      })}
    </div>
  );
}

function CardGridView({ rows, onOpen }: { rows: Row[]; onOpen: (r: Row) => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
      {rows.map((r) => {
        const s = STATUS_META[r.status];
        return (
          <button key={r.id} onClick={() => onOpen(r)} className="panel panel-interactive"
            style={{ padding: 0, overflow: 'hidden', textAlign: 'left', cursor: 'pointer', display: 'flex', flexDirection: 'column', border: '1px solid var(--border)', background: 'var(--card)', borderRadius: 14 }}>
            <div style={{ height: 4, background: s.dot }} />
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)' }}>{r.naam}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{r.klant}</div>
                </div>
                <StatusBadge status={r.status} size="sm" />
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', fontSize: 12.5, color: 'var(--muted-light, var(--text))' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Calendar size={13} color="var(--muted)" />{fmtDatum(r.datum)}{r.tijd ? ' · ' + r.tijd : ''}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Users size={13} color="var(--muted)" />{r.gasten}p</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><MapPin size={13} color="var(--muted)" />{r.locatie}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                <span className="mono" style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>{formatEurInt(r.omzet)}</span>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
