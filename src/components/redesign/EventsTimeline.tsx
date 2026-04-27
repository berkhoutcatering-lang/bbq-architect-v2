'use client';

import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Users, Check, CircleDot, Send, Filter, Plus, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { displayEventName, titleCase } from './displayHelpers';
import { detectAllConflicts, highestSeverity, type Conflict } from '@/lib/conflictDetection';
import type { DbEvent, Offerte } from '@/types';

type ViewMode = 'timeline' | 'calendar' | 'kanban';

/* Scoped redesign styles — wrapper class must be set on parent */
import './redesign.css';

type Tone = 'ok' | 'warn' | 'bad';
type TlTone = 'confirmed' | 'option' | 'urgent';

interface PrepTask { id: number; event_id: number; done: boolean; }

interface Props {
  events: DbEvent[];
  offertes?: Offerte[];
  prepTasks?: PrepTask[];
  onOpen: (ev: DbEvent) => void;
  onNew: () => void;
}

const fmtEur = (n: number) => '€ ' + Math.round(n).toLocaleString('nl-NL');

const dowNames = ['Zo', 'Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za'];
const moNames = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

/* ISO week number */
function getIsoWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function weekKey(d: Date): string {
  return `${d.getFullYear()}-W${String(getIsoWeek(d)).padStart(2, '0')}`;
}

function eventOmzet(ev: DbEvent): number {
  return (ev.guests || 0) * (ev.ppp || 0);
}

/* Status mapping to redesign pill */
function statusPill(status: string): { variant: 'ok' | 'optie' | 'send' | 'draft'; label: string; icon: ReactNode } {
  if (status === 'confirmed' || status === 'completed') return { variant: 'ok', label: 'Bevestigd', icon: <Check size={10} /> };
  if (status === 'optie') return { variant: 'optie', label: 'Optie', icon: <CircleDot size={10} /> };
  if (status === 'pending') return { variant: 'send', label: 'Nieuw', icon: <Send size={10} /> };
  return { variant: 'draft', label: status || '—', icon: null };
}

function tlTone(status: string, daysAway: number): TlTone {
  if (status === 'confirmed' || status === 'completed') return 'confirmed';
  if (status === 'optie') return 'option';
  if (daysAway <= 3) return 'urgent';
  return 'option';
}

/* Booking pulse sparkline — 12 weeks of confirmed count */
function BookingPulse({ weeks }: { weeks: number[] }) {
  const max = Math.max(1, ...weeks);
  const w = 300, h = 110, pad = 4;
  const step = (w - pad * 2) / Math.max(1, weeks.length - 1);
  const pts = weeks.map((v, i) => [pad + i * step, h - pad - (v / max) * (h - pad * 2)] as const);
  const path = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0] + ',' + p[1]).join(' ');
  const areaPath = path + ` L ${pad + (weeks.length - 1) * step},${h - pad} L ${pad},${h - pad} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" width="100%" height="100%">
      <defs>
        <linearGradient id="pulseGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFBF00" stopOpacity=".35" />
          <stop offset="100%" stopColor="#FFBF00" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#pulseGrad)" />
      <path d={path} fill="none" stroke="#c4a35a" strokeWidth="1.5" />
      {pts.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r={i === pts.length - 1 ? 3.5 : 0} fill="#FFBF00" />
      ))}
    </svg>
  );
}

export default function EventsTimeline({ events, offertes = [], prepTasks = [], onOpen, onNew }: Props) {
  const router = useRouter();
  const now = new Date();
  const todayIso = now.toISOString().slice(0, 10);
  const [view, setView] = useState<ViewMode>('timeline');
  const [calCursor, setCalCursor] = useState<Date>(() => new Date(now.getFullYear(), now.getMonth(), 1));

  /* Upcoming events sorted ascending */
  const upcoming = useMemo(
    () => events.filter(e => e.date && e.date >= todayIso).slice().sort((a, b) => a.date.localeCompare(b.date)),
    [events, todayIso],
  );
  const hero = upcoming[0];

  /* Week groupings: index upcoming events into buckets.
     Always include "Deze week" and "Volgende week" as anchor rows even if empty,
     so the UI never jumps straight to "Jun · week 25" as first visible context. */
  const weekBuckets = useMemo(() => {
    const buckets: Record<string, { label: string; events: DbEvent[]; weekStart: Date }> = {};

    /* Anchor buckets: current + next week */
    const nowMonday = new Date(now);
    const nowDow = nowMonday.getDay() || 7;
    nowMonday.setDate(nowMonday.getDate() - (nowDow - 1));
    nowMonday.setHours(0, 0, 0, 0);
    const nextMonday = new Date(nowMonday);
    nextMonday.setDate(nextMonday.getDate() + 7);
    buckets[weekKey(nowMonday)] = { label: 'Deze week', events: [], weekStart: nowMonday };
    buckets[weekKey(nextMonday)] = { label: 'Volgende week', events: [], weekStart: nextMonday };

    for (const ev of upcoming) {
      const d = new Date(ev.date);
      const monday = new Date(d);
      const dow = monday.getDay() || 7;
      monday.setDate(monday.getDate() - (dow - 1));
      monday.setHours(0, 0, 0, 0);
      const key = weekKey(monday);
      if (!buckets[key]) {
        const diffDays = Math.round((monday.getTime() - nowMonday.getTime()) / 86400000);
        let label: string;
        if (diffDays <= 0) label = 'Deze week';
        else if (diffDays <= 7) label = 'Volgende week';
        else if (monday.getMonth() !== now.getMonth()) label = moNames[monday.getMonth()].charAt(0).toUpperCase() + moNames[monday.getMonth()].slice(1) + ' · week ' + getIsoWeek(monday);
        else label = 'Week ' + getIsoWeek(monday);
        buckets[key] = { label, events: [], weekStart: monday };
      }
      buckets[key].events.push(ev);
    }
    return Object.values(buckets).sort((a, b) => a.weekStart.getTime() - b.weekStart.getTime()).slice(0, 6);
  }, [upcoming, now]);

  /* Prep-readiness per event */
  const prepReadyMap = useMemo(() => {
    const map: Record<number, number> = {};
    const eventPrep: Record<number, { done: number; total: number }> = {};
    for (const p of prepTasks) {
      const e = eventPrep[p.event_id] || { done: 0, total: 0 };
      e.total += 1;
      if (p.done) e.done += 1;
      eventPrep[p.event_id] = e;
    }
    for (const [id, v] of Object.entries(eventPrep)) {
      map[Number(id)] = v.total === 0 ? 0 : Math.round((v.done / v.total) * 100);
    }
    return map;
  }, [prepTasks]);

  /* Margin from linked offerte — only when the offerte actually has cost-per-line data.
     We refuse to show a 40% fake estimate; a missing margin is more honest than a pretty lie. */
  const marginMap = useMemo(() => {
    const map: Record<number, number> = {};
    for (const ev of events) {
      if (!ev.offerte_id) continue;
      const off = offertes.find(o => o.id === ev.offerte_id);
      if (!off) continue;
      let rawItems: unknown = off.items;
      if (typeof rawItems === 'string') { try { rawItems = JSON.parse(rawItems); } catch { rawItems = []; } }
      const lineItems = Array.isArray(rawItems) ? rawItems as Array<Record<string, unknown>> : [];
      const hasCostField = lineItems.length > 0 && lineItems.every(it => Number(it.cost) > 0);
      if (!hasCostField) continue; /* no synthetic cost — skip */
      const revenue = lineItems.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.prijs) || 0), 0);
      const totalCost = lineItems.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.cost) || 0), 0);
      if (revenue > 0) {
        map[ev.id] = Math.round(((revenue - totalCost) / revenue) * 100);
      }
    }
    return map;
  }, [events, offertes]);

  /* Conflict-detectie: smoker-overlap, venue-dubbeling, capacity-grens.
     Logica zit in lib/conflictDetection.ts zodat dezelfde detector ook elders
     herbruikt kan worden (Agenda, AI-suggesties, prep counter). */
  const conflictMaps = useMemo(() => detectAllConflicts(events as any), [events]);
  const criticalConflicts: Conflict[] = useMemo(() => conflictMaps.conflicts.filter(c => c.severity === 'critical'), [conflictMaps]);

  /* Booking pulse — 12 weeks of confirmed event count */
  const pulseWeeks = useMemo(() => {
    const weeks: number[] = [];
    const today = new Date();
    for (let i = 11; i >= 0; i--) {
      const weekStart = new Date(today);
      const dow = weekStart.getDay() || 7;
      weekStart.setDate(weekStart.getDate() - (dow - 1) - i * 7);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);
      const startIso = weekStart.toISOString().slice(0, 10);
      const endIso = weekEnd.toISOString().slice(0, 10);
      const count = events.filter(e => (e.status === 'confirmed' || e.status === 'completed') && e.date >= startIso && e.date < endIso).length;
      weeks.push(count);
    }
    return weeks;
  }, [events]);

  const thisWeekConfirmed = pulseWeeks[pulseWeeks.length - 1] ?? 0;
  /* Compare to 4-week rolling average for a meaningful signal instead of week-over-week noise */
  const rolling4 = pulseWeeks.slice(-5, -1); /* last 4 before current */
  const avgPrev = rolling4.length > 0 ? rolling4.reduce((s, x) => s + x, 0) / rolling4.length : 0;
  const deltaAbs = thisWeekConfirmed - avgPrev;
  const deltaPct = avgPrev === 0
    ? (thisWeekConfirmed > 0 ? 100 : 0)
    : Math.round((deltaAbs / avgPrev) * 100);
  const deltaDisplay = avgPrev === 0 && thisWeekConfirmed === 0
    ? '—'
    : (deltaPct > 0 ? `+${deltaPct}%` : `${deltaPct}%`);

  /* Pipeline next month (omzet) */
  const pipelineNextMonth = useMemo(() => {
    const today = new Date();
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const nextMonthEnd = new Date(today.getFullYear(), today.getMonth() + 2, 0);
    return events
      .filter(e => e.date >= nextMonth.toISOString().slice(0, 10) && e.date <= nextMonthEnd.toISOString().slice(0, 10))
      .reduce((sum, e) => sum + eventOmzet(e), 0);
  }, [events]);

  /* Win rate — confirmed / (confirmed + cancelled) over last 90 days */
  const winRate = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    const cutoffIso = cutoff.toISOString().slice(0, 10);
    const recent = events.filter(e => e.date >= cutoffIso);
    const won = recent.filter(e => e.status === 'confirmed' || e.status === 'completed').length;
    const total = recent.filter(e => ['confirmed', 'completed', 'cancelled'].includes(e.status)).length;
    return total === 0 ? 0 : Math.round((won / total) * 100);
  }, [events]);

  /* Hero: parse date, guests, omzet, time-to-show */
  let heroData: {
    title: string; date: string; time: string; location: string; guests: number;
    omzet: number; margin: number | null; countdown: string; countdownLabel: string; eyebrow: string;
  } | null = null;
  if (hero) {
    const dt = new Date(hero.date + 'T18:00:00'); // default 18:00 if no time column
    const nowMs = Date.now();
    const diffMs = dt.getTime() - nowMs;
    const hoursLeft = Math.max(0, Math.floor(diffMs / 3600000));
    const minsLeft = Math.max(0, Math.floor((diffMs % 3600000) / 60000));
    const daysLeft = Math.floor(hoursLeft / 24);
    let countdown: string;
    let countdownLabel: string;
    let eyebrow: string;
    if (daysLeft > 7) { countdown = `${daysLeft}`; countdownLabel = 'Dagen te gaan'; eyebrow = `T-${daysLeft}d`; }
    else if (daysLeft > 1) { countdown = `${daysLeft}d`; countdownLabel = 'Dagen te gaan'; eyebrow = `T-${daysLeft}d`; }
    else if (hoursLeft >= 1) {
      countdown = `${String(hoursLeft).padStart(2, '0')}:${String(minsLeft).padStart(2, '0')}`;
      countdownLabel = 'Tot show-time';
      const remHours = hoursLeft % 24;
      eyebrow = daysLeft >= 1 ? `T-${daysLeft}d ${remHours}u` : `T-${remHours}u ${minsLeft}min`;
    }
    else { countdown = `${minsLeft}m`; countdownLabel = 'Tot show-time'; eyebrow = `T-${minsLeft}min`; }
    heroData = {
      title: titleCase(displayEventName(hero.name)),
      date: hero.date,
      time: '18:00',
      location: hero.location || 'Locatie onbekend',
      guests: hero.guests || 0,
      omzet: eventOmzet(hero),
      margin: marginMap[hero.id] ?? null,
      countdown,
      countdownLabel,
      eyebrow,
    };
  }

  /* Hero checklist from prep_tasks for hero event */
  const heroPrep = useMemo(() => {
    if (!hero) return [];
    return prepTasks.filter(p => p.event_id === hero.id).slice(0, 4);
  }, [hero, prepTasks]);

  /* Total revenue all upcoming */
  const upcomingRevenue = upcoming.reduce((s, e) => s + eventOmzet(e), 0);

  /* Heading eyebrow */
  const todayStr = `${dowNames[now.getDay()]} ${now.getDate()} ${moNames[now.getMonth()]}`;
  const todayWeek = getIsoWeek(now);

  return (
    <div className="redesign-root">
      <div className="main" style={{ padding: '24px 0 40px' }}>
        <div className="page-head">
          <div>
            <div className="page-eyebrow" style={{ color: 'var(--brand-gold)' }}>{todayStr} · week {todayWeek} · {upcoming.length} aankomend</div>
            <h1 className="page-title">Events</h1>
          </div>
          <div className="hstack">
            <div className="ev-view-tabs" role="tablist" aria-label="Eventweergave">
              <button className={view === 'timeline' ? 'on' : ''} role="tab" aria-selected={view === 'timeline'} onClick={() => setView('timeline')}>Tijdlijn</button>
              <button className={view === 'calendar' ? 'on' : ''} role="tab" aria-selected={view === 'calendar'} onClick={() => setView('calendar')}>Kalender</button>
              <button className={view === 'kanban' ? 'on' : ''} role="tab" aria-selected={view === 'kanban'} onClick={() => setView('kanban')}>Kanban</button>
            </div>
            <button className="btn btn-ghost"><Filter size={14} />Filters</button>
            <button className="btn btn-primary" onClick={onNew}><Plus size={14} />Nieuw event</button>
          </div>
        </div>

        <div className="ev-hero">
          {heroData ? (
            <div className="ev-next-card" style={{ cursor: 'pointer' }} onClick={() => hero && onOpen(hero)}>
              <div className="ev-next-eyebrow"><span className="dot"></span>Eerstvolgend · {heroData.eyebrow}</div>
              <h2 className="ev-next-title">{heroData.title}</h2>
              <div className="ev-next-meta">{heroData.guests} gasten · {heroData.location}</div>
              <div className="ev-next-stats">
                <div className="ev-next-stat"><div className="v">{heroData.guests}</div><div className="l">Gasten</div></div>
                <div className="ev-next-stat"><div className="v">{fmtEur(heroData.omzet)}</div><div className="l">Omzet</div></div>
                <div className="ev-next-stat"><div className="v" style={{ color: heroData.margin != null && heroData.margin >= 55 ? 'var(--green)' : heroData.margin != null && heroData.margin >= 40 ? 'var(--amber)' : 'var(--muted)' }}>{heroData.margin != null ? heroData.margin + '%' : '—'}</div><div className="l">Marge</div></div>
                <div className="ev-next-stat"><div className="v" style={{ color: 'var(--brand-gold)' }}>{heroData.countdown}</div><div className="l">{heroData.countdownLabel}</div></div>
              </div>
              {heroPrep.length > 0 && (
                <div className="ev-next-checklist">
                  <div className="ev-check-label">Prep checklist</div>
                  {heroPrep.map(p => {
                    const pAny = p as PrepTask & { text?: string; dagen?: number };
                    const dagen = typeof pAny.dagen === 'number' ? pAny.dagen : null;
                    const metaLabel = dagen == null ? '' : dagen === 0 ? 'Op de dag' : dagen < 0 ? `T+${Math.abs(dagen)}d` : `T-${dagen}d`;
                    return (
                      <div key={p.id} className={`ev-check-row ${p.done ? 'done' : ''}`}>
                        <div className="box">{p.done && <Check size={12} />}</div>
                        <span className="txt">{pAny.text || '—'}</span>
                        {metaLabel && <span className="meta">{metaLabel}</span>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="ev-next-card">
              <div className="ev-next-eyebrow"><span className="dot"></span>Geen aankomend event</div>
              <h2 className="ev-next-title">Rustige agenda</h2>
              <div className="ev-next-meta">Voeg een event toe om hier een live-overzicht te zien.</div>
              <button className="btn btn-primary" onClick={onNew} style={{ marginTop: 14 }}><Plus size={14} />Nieuw event</button>
            </div>
          )}

          <div className="ev-pulse-card">
            <div className="ev-pulse-title">Booking pulse · 12 weken</div>
            <div className="ev-pulse-sub">Bevestigde events per week — actuele data</div>
            <div className="ev-pulse-graph"><BookingPulse weeks={pulseWeeks} /></div>
            <div className="ev-pulse-stats">
              <div className="ev-pulse-stat">
                <div className="v" style={{ color: deltaPct >= 0 ? 'var(--green)' : 'var(--red)' }}>
                  {deltaDisplay}
                </div>
                <div className="l">vs 4wk gem.</div>
              </div>
              <div className="ev-pulse-stat"><div className="v">{fmtEur(pipelineNextMonth)}</div><div className="l">Pijplijn volgende maand</div></div>
              <div className="ev-pulse-stat"><div className="v">{winRate}%</div><div className="l">Win rate (90d)</div></div>
            </div>
          </div>
        </div>

        {view === 'calendar' && (
          <CalendarView
            cursor={calCursor}
            onCursor={setCalCursor}
            events={events}
            marginMap={marginMap}
            onOpen={onOpen}
            router={router}
          />
        )}

        {view === 'kanban' && (
          <KanbanView events={events} marginMap={marginMap} onOpen={onOpen} router={router} />
        )}

        {/* Conflict-banner: top-of-list waarschuwing voor planning-conflicten */}
        {view === 'timeline' && criticalConflicts.length > 0 && (
            <div className="metal" style={{ padding: '12px 16px', marginBottom: 16, borderLeft: '3px solid var(--red)', background: 'rgba(239,68,68,.06)', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <AlertTriangle size={18} style={{ color: 'var(--red)', flexShrink: 0, marginTop: 2 }} />
                <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, color: 'var(--red)', marginBottom: 4 }}>
                        {criticalConflicts.length} {criticalConflicts.length === 1 ? 'planning-conflict' : 'planning-conflicten'} gedetecteerd
                    </div>
                    {criticalConflicts.slice(0, 3).map((c, i) => (
                        <div key={i} style={{ fontSize: 12, color: 'var(--muted)' }}>{c.note}</div>
                    ))}
                </div>
            </div>
        )}

        {view === 'timeline' && (weekBuckets.length === 0 ? (
          <div className="metal" style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--muted)' }}>
            Geen aankomende events. Klik &quot;Nieuw event&quot; om te beginnen.
          </div>
        ) : (
          weekBuckets.map(bucket => {
            const bucketRev = bucket.events.reduce((s, e) => s + eventOmzet(e), 0);
            const bucketMargins = bucket.events.map(e => marginMap[e.id]).filter((x): x is number => typeof x === 'number');
            const avgMargin = bucketMargins.length ? Math.round(bucketMargins.reduce((s, m) => s + m, 0) / bucketMargins.length) : null;
            const isEmpty = bucket.events.length === 0;
            return (
              <div key={bucket.label} className="tl-section">
                <div className="tl-head">
                  <h3 style={isEmpty ? { color: 'var(--muted)' } : undefined}>{bucket.label}</h3>
                  <span className="count">{bucket.events.length} event{bucket.events.length === 1 ? '' : 's'}</span>
                  {!isEmpty && (
                    <span className="revenue">
                      omzet <strong>{fmtEur(bucketRev)}</strong>
                      {avgMargin != null && <> · gem. marge <strong>{avgMargin}%</strong></>}
                    </span>
                  )}
                </div>
                {isEmpty && (
                  <div style={{ padding: '12px 0 8px 26px', color: 'var(--muted-light)', fontSize: 12, fontStyle: 'italic' }}>
                    Geen events gepland. <button onClick={onNew} style={{ background: 'none', border: 'none', color: 'var(--brand-gold)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, textDecoration: 'underline' }}>Event toevoegen</button>
                  </div>
                )}
                <div className="tl-rail">
                  {bucket.events.map(ev => {
                    const d = new Date(ev.date);
                    const pill = statusPill(ev.status);
                    const daysAway = Math.round((d.getTime() - now.getTime()) / 86400000);
                    const tone = tlTone(ev.status, daysAway);
                    const margin = marginMap[ev.id];
                    const mTone: Tone = margin == null ? 'ok' : margin >= 55 ? 'ok' : margin >= 40 ? 'warn' : 'bad';
                    const ready = prepReadyMap[ev.id] ?? 0;
                    const rTone: Tone = ready >= 70 ? 'ok' : ready >= 30 ? 'warn' : 'bad';
                    const evConflicts = conflictMaps.byEventId.get(ev.id) || [];
                    const conflictSev = highestSeverity(evConflicts);
                    return (
                      <div key={ev.id} className={`tl-row ${tone}`} data-event-id={ev.id}>
                        <div
                          className="tl-card"
                          role="button"
                          tabIndex={0}
                          onClick={() => onOpen(ev)}
                          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(ev); } }}
                          aria-label={`Open event ${ev.name || ''}`}
                        >
                          <div className="tl-date">
                            <div className="dow">{dowNames[d.getDay()]}</div>
                            <div className="day">{String(d.getDate()).padStart(2, '0')}</div>
                            <div className="mo">{moNames[d.getMonth()]}</div>
                          </div>
                          <div className="tl-body">
                            <div className="title-row">
                              <h4>{titleCase(displayEventName(ev.name))}</h4>
                              <span className={`pill p-${pill.variant}`}>{pill.icon}{pill.label}</span>
                              {conflictSev && (
                                <span
                                    className="pill"
                                    title={evConflicts.map(c => c.note).join(' · ')}
                                    style={{
                                        background: conflictSev === 'critical' ? 'rgba(239,68,68,.18)' : 'rgba(245,158,11,.18)',
                                        color: conflictSev === 'critical' ? 'var(--red)' : 'var(--amber)',
                                        border: '1px solid ' + (conflictSev === 'critical' ? 'rgba(239,68,68,.4)' : 'rgba(245,158,11,.4)'),
                                    }}
                                >
                                    <AlertTriangle size={10} />{conflictSev === 'critical' ? 'Conflict' : 'Let op'}
                                </span>
                              )}
                            </div>
                            <div className="meta-row">
                              <span><Users size={11} style={{ marginRight: 4, verticalAlign: 'middle' }} />{ev.guests || 0} gasten</span>
                              <span className="dot"></span>
                              <span>{ev.location || '—'}</span>
                              {ev.type && <>
                                <span className="dot"></span>
                                <span>{ev.type}</span>
                              </>}
                            </div>
                            <div className="ready-bar">
                              <span className="lbl">Prep</span>
                              <div className="track"><div className={`fill ${rTone}`} style={{ width: ready + '%' }} /></div>
                              <span className="lbl" style={{ color: rTone === 'bad' ? 'var(--red)' : rTone === 'warn' ? 'var(--amber)' : 'var(--green)' }}>{ready}%</span>
                            </div>
                          </div>
                          <div className="tl-meta">
                            <div className="amount">{fmtEur(eventOmzet(ev))}</div>
                            {margin != null && <div className={`margin ${mTone}`}>marge {margin}%</div>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        ))}

        {view === 'timeline' && upcoming.length > 0 && (
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 12, textAlign: 'center' }}>
            Totaal aankomende omzet: <strong style={{ color: 'var(--brand-gold)' }}>{fmtEur(upcomingRevenue)}</strong>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────── Calendar view ─────────── */

interface CalendarViewProps {
  cursor: Date;
  onCursor: (d: Date) => void;
  events: DbEvent[];
  marginMap: Record<number, number>;
  onOpen: (ev: DbEvent) => void;
  router: ReturnType<typeof useRouter>;
}

function CalendarView({ cursor, onCursor, events, marginMap, onOpen, router }: CalendarViewProps) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const monthLabel = firstOfMonth.toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' });
  /* ISO-week offset: Monday-first. getDay returns 0=Sun..6=Sat; shift to Mon=0 */
  const leadingBlank = (firstOfMonth.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<{ iso: string | null; day: number | null }> = [];
  for (let i = 0; i < leadingBlank; i++) cells.push({ iso: null, day: null });
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({ iso, day: d });
  }
  while (cells.length % 7 !== 0) cells.push({ iso: null, day: null });

  const eventsByDate = useMemo(() => {
    const m: Record<string, DbEvent[]> = {};
    for (const ev of events) {
      if (!ev.date) continue;
      (m[ev.date] ||= []).push(ev);
    }
    return m;
  }, [events]);

  const monthEvents = events.filter(e => e.date && e.date.startsWith(`${year}-${String(month + 1).padStart(2, '0')}`));
  const monthRev = monthEvents.reduce((s, e) => s + (e.guests || 0) * (e.ppp || 0), 0);

  const dowLabels = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'];

  function shiftMonth(delta: number) {
    onCursor(new Date(year, month + delta, 1));
  }

  return (
    <div className="ev-cal">
      <div className="ev-cal-head">
        <div className="ev-cal-nav">
          <button type="button" onClick={() => shiftMonth(-1)} aria-label="Vorige maand"><ChevronLeft size={14} /></button>
          <h3>{monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}</h3>
          <button type="button" onClick={() => shiftMonth(1)} aria-label="Volgende maand"><ChevronRight size={14} /></button>
          <button type="button" className="ev-cal-today" onClick={() => onCursor(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>Vandaag</button>
        </div>
        <div className="ev-cal-summary">
          <span>{monthEvents.length} event{monthEvents.length === 1 ? '' : 's'}</span>
          <span className="sep">·</span>
          <span>omzet <strong>{fmtEur(monthRev)}</strong></span>
        </div>
      </div>
      <div className="ev-cal-grid">
        {dowLabels.map(d => <div key={d} className="ev-cal-dow">{d}</div>)}
        {cells.map((c, i) => {
          const list = c.iso ? (eventsByDate[c.iso] || []) : [];
          const isToday = c.iso === todayIso;
          const isPast = c.iso != null && c.iso < todayIso;
          return (
            <div key={i} className={`ev-cal-cell ${c.day == null ? 'empty' : ''} ${isToday ? 'today' : ''} ${isPast ? 'past' : ''}`}>
              {c.day != null && (
                <>
                  <div className="ev-cal-day">{c.day}</div>
                  <div className="ev-cal-events">
                    {list.slice(0, 3).map(ev => {
                      const pill = statusPill(ev.status);
                      return (
                        <button
                          key={ev.id}
                          type="button"
                          className={`ev-cal-chip p-${pill.variant}`}
                          title={`${ev.name || 'Event'} · ${ev.guests || 0} gasten`}
                          onClick={() => onOpen(ev)}
                        >
                          <span className="t">{titleCase(displayEventName(ev.name))}</span>
                          <span className="g">{ev.guests || 0}p</span>
                        </button>
                      );
                    })}
                    {list.length > 3 && (
                      <button
                        type="button"
                        className="ev-cal-more"
                        onClick={() => router.push(`/agenda?date=${c.iso}`)}
                      >
                        +{list.length - 3} meer
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
      {/* marginMap reserved for future avg-margin display per cell */}
      <div style={{ display: 'none' }}>{Object.keys(marginMap).length}</div>
    </div>
  );
}

/* ─────────── Kanban view ─────────── */

interface KanbanViewProps {
  events: DbEvent[];
  marginMap: Record<number, number>;
  onOpen: (ev: DbEvent) => void;
  router: ReturnType<typeof useRouter>;
}

function KanbanView({ events, marginMap, onOpen, router }: KanbanViewProps) {
  const columns: Array<{ key: string; label: string; tone: 'warn' | 'info' | 'ok' | 'done'; match: (s: string) => boolean }> = [
    { key: 'optie', label: 'Optie', tone: 'warn', match: s => s === 'optie' },
    { key: 'pending', label: 'Nieuw', tone: 'info', match: s => s === 'pending' || !s },
    { key: 'confirmed', label: 'Bevestigd', tone: 'ok', match: s => s === 'confirmed' },
    { key: 'completed', label: 'Afgerond', tone: 'done', match: s => s === 'completed' },
  ];

  const dowNames = ['Zo', 'Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za'];
  const moNames = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

  const sorted = events.slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  return (
    <div className="ev-kanban">
      {columns.map(col => {
        const items = sorted.filter(e => col.match(e.status));
        const rev = items.reduce((s, e) => s + (e.guests || 0) * (e.ppp || 0), 0);
        return (
          <div key={col.key} className={`ev-kanban-col tone-${col.tone}`}>
            <div className="ev-kanban-head">
              <span className="label">{col.label}</span>
              <span className="count">{items.length}</span>
              <span className="rev">{fmtEur(rev)}</span>
            </div>
            <div className="ev-kanban-body">
              {items.length === 0 ? (
                <div className="ev-kanban-empty">Geen events</div>
              ) : items.map(ev => {
                const d = ev.date ? new Date(ev.date) : null;
                const margin = marginMap[ev.id];
                const mTone: Tone = margin == null ? 'ok' : margin >= 55 ? 'ok' : margin >= 40 ? 'warn' : 'bad';
                return (
                  <div
                    key={ev.id}
                    className="ev-kanban-card"
                    role="button"
                    tabIndex={0}
                    onClick={() => onOpen(ev)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(ev); } }}
                  >
                    <div className="t">{titleCase(displayEventName(ev.name))}</div>
                    <div className="meta">
                      {d && <span>{dowNames[d.getDay()]} {String(d.getDate()).padStart(2, '0')} {moNames[d.getMonth()]}</span>}
                      <span className="dot" />
                      <span>{ev.guests || 0}p</span>
                    </div>
                    <div className="foot">
                      <span className="amount">{fmtEur((ev.guests || 0) * (ev.ppp || 0))}</span>
                      {margin != null && <span className={`margin ${mTone}`}>{margin}%</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
