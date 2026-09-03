'use client';

/**
 * /logistiek — Dashboard Hub (Claude Design v2)
 *
 * Bouwt 3 kolommen:
 *   - KPI-strip (events deze week / open checks vandaag / bus-check ready)
 *   - Events Timeline grid (cards met 6-mini-progress-bars per categorie)
 *   - Side-rail "Recent AI-voorstellen" historie
 *
 * Sticky bottom: gouden "Open Veldmodus" CTA.
 *
 * Lege state: "Geen events deze week — zodra een offerte geaccepteerd is,
 * krijg je hier een AI-voorstel."
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ChevronRight, ClipboardCheck, LayoutDashboard, Sparkles, Smartphone, Truck, Calendar as CalendarIcon, Clock, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useOrg } from '@/lib/OrgContext';
import { RequireTier } from '@/components/PaywallPrompt';
import PageHeader from '@/components/PageHeader';
import { LOGISTIEK_SECTIONS, type LogistiekCategory, type DbChecklistItem } from '@/lib/logistiek/sections';
import { AiProposalModalAutoOpen } from '@/components/logistiek/AiProposalModal';

interface EventRow {
    id: number;
    name: string | null;
    date: string | null;
    guests: number | null;
    location: string | null;
    client_naam: string | null;
    organization_id: string;
}

interface NotificationRow {
    id: string;
    type: string;
    title: string;
    body: string | null;
    link: string | null;
    metadata: Record<string, unknown>;
    read_at: string | null;
    dismissed_at: string | null;
    created_at: string;
}

interface EventWithChecklist extends EventRow {
    checks: DbChecklistItem[];
    aiPending: boolean;
}

const ISO_TODAY = () => new Date().toISOString().slice(0, 10);

function tBadge(daysLeft: number): { label: string; color: string } {
    if (daysLeft < 0) return { label: `T+${Math.abs(daysLeft)}`, color: '#64748b' };
    if (daysLeft === 0) return { label: 'T-0', color: '#22c55e' };
    if (daysLeft <= 2) return { label: `T-${daysLeft}`, color: '#f59e0b' };
    if (daysLeft <= 4) return { label: `T-${daysLeft}`, color: '#3b82f6' };
    return { label: `T-${daysLeft}`, color: '#64748b' };
}

function daysFromToday(dateStr: string | null): number {
    if (!dateStr) return 0;
    const ev = new Date(dateStr + 'T00:00:00');
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return Math.ceil((ev.getTime() - now.getTime()) / 86400000);
}

function eventDateLabel(d: string | null): string {
    if (!d) return '';
    const dt = new Date(d + 'T00:00:00');
    if (Number.isNaN(dt.getTime())) return d;
    return dt.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
}

export default function LogistiekPage() {
    return (
        <RequireTier feature="logistiek">
            <LogistiekInner />
        </RequireTier>
    );
}

function LogistiekInner() {
    const { orgId } = useOrg();
    const [events, setEvents] = useState<EventWithChecklist[]>([]);
    const [notifs, setNotifs] = useState<NotificationRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [busOk, setBusOk] = useState({ ready: 0, total: 0 });

    useEffect(() => {
        if (!orgId || !supabase) return;
        let cancelled = false;
        (async () => {
            setLoading(true);

            /* Pak de aankomende 30d aan events; 30d is bewust ruimer dan
               de "deze week"-KPI om Lars en Mathijs alvast vooruit te laten
               kijken voor planning. */
            const today = ISO_TODAY();
            const horizon = new Date();
            horizon.setDate(horizon.getDate() + 30);
            const horizonStr = horizon.toISOString().slice(0, 10);

            const { data: evRows } = await supabase
                .from('events')
                .select('id, name, date, guests, location, client_naam, organization_id, status')
                .eq('organization_id', orgId)
                .gte('date', today)
                .lte('date', horizonStr)
                .neq('status', 'completed')
                .order('date', { ascending: true });

            const eventList = (evRows ?? []) as EventRow[];
            const eventIds = eventList.map(e => e.id);

            /* Bulk-fetch alle checklist-items voor zichtbare events. */
            let allChecks: DbChecklistItem[] = [];
            if (eventIds.length > 0) {
                const { data: ck } = await supabase
                    .from('event_checklist_items')
                    .select('*')
                    .eq('organization_id', orgId)
                    .in('event_id', eventIds)
                    .order('sort_order', { ascending: true });
                allChecks = (ck ?? []) as DbChecklistItem[];
            }

            /* Recent AI-voorstel-historie via notifications. */
            const { data: nf } = await supabase
                .from('notifications')
                .select('*')
                .eq('organization_id', orgId)
                .eq('type', 'ai_proposal_ready')
                .order('created_at', { ascending: false })
                .limit(10);
            const notifList = (nf ?? []) as NotificationRow[];

            /* Per event z'n checks koppelen + ai_pending-flag afleiden. */
            const eventsWithChecklist: EventWithChecklist[] = eventList.map(e => {
                const checks = allChecks.filter(c => c.event_id === e.id);
                return {
                    ...e,
                    checks,
                    aiPending: checks.some(c => c.ai_pending),
                };
            });

            /* Bus-check ready KPI: % events deze week met materieel volledig
               afgevinkt. "Klaar" = alle checks in 'materieel'-categorie zijn
               done. Events zonder materieel-checks tellen niet mee. */
            const oneWeek = new Date();
            oneWeek.setDate(oneWeek.getDate() + 7);
            const oneWeekStr = oneWeek.toISOString().slice(0, 10);
            const thisWeek = eventsWithChecklist.filter(e => e.date && e.date <= oneWeekStr);
            let ready = 0, total = 0;
            for (const e of thisWeek) {
                const matChecks = e.checks.filter(c => c.category === 'materieel');
                if (matChecks.length === 0) continue;
                total++;
                if (matChecks.every(c => c.done)) ready++;
            }
            if (cancelled) return;
            setBusOk({ ready, total });
            setEvents(eventsWithChecklist);
            setNotifs(notifList);
            setLoading(false);
        })();
        return () => { cancelled = true; };
    }, [orgId]);

    /* KPI's */
    const kpiEventsThisWeek = useMemo(() => {
        const oneWeek = new Date();
        oneWeek.setDate(oneWeek.getDate() + 7);
        const w = oneWeek.toISOString().slice(0, 10);
        return events.filter(e => e.date && e.date <= w);
    }, [events]);

    const kpiOpenToday = useMemo(() => {
        const today = ISO_TODAY();
        let count = 0;
        let eventCount = 0;
        for (const e of kpiEventsThisWeek) {
            const open = e.checks.filter(c => !c.done && !c.ai_pending);
            if (open.length > 0) eventCount++;
            const dl = daysFromToday(e.date);
            // tellen alle items met deadline_offset_hours die binnen 24u valt OF events met dl<=1
            if (dl <= 1) {
                count += open.length;
            } else {
                count += open.filter(c => (c.deadline_offset_hours ?? -9999) >= -24).length;
            }
        }
        return { count, eventCount };
    }, [kpiEventsThisWeek]);

    return (
        <>
            <PageHeader title="Logistiek" description="Auto-checklists, AI-voorstellen, veldmodus — alles voor event-dag" />

            <div className="flex items-center gap-2 text-[12px] mb-4" style={{ color: 'var(--muted)' }}>
                <LayoutDashboard size={14} />
                <ChevronRight size={11} />
                <span className="font-medium" style={{ color: 'var(--text)' }}>Logistiek</span>
            </div>

            {/* Body grid — main + side-rail */}
            <div className="grid gap-5" style={{ gridTemplateColumns: 'minmax(0,1fr) 320px' }}>
                <div className="min-w-0 pb-24">
                    {/* KPI strip */}
                    <div className="grid gap-3 mb-7" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                        <KpiCard icon={<CalendarIcon size={18} />} label="Events deze week" value={String(kpiEventsThisWeek.length)}
                            sub={`${kpiEventsThisWeek.filter(e => !e.checks.every(c => c.done) || e.aiPending).length} nog niet klaar`}
                            accent="#3b82f6" />
                        <KpiCard icon={<ClipboardCheck size={18} />} label="Open checks vandaag" value={String(kpiOpenToday.count)}
                            sub={`Uit ${kpiOpenToday.eventCount} events`} accent="#f59e0b" />
                        <KpiCard icon={<Truck size={18} />} label="Bus-check ready" value={`${busOk.ready}/${busOk.total || 0}`}
                            sub={busOk.total === 0 ? 'Geen materieel-checks live' : `${Math.round((busOk.ready / Math.max(1, busOk.total)) * 100)}% klaar voor vertrek`}
                            accent="var(--green)" />
                    </div>

                    {/* Events Timeline */}
                    <div className="text-[10px] font-bold tracking-[0.2em] uppercase mb-3" style={{ color: 'var(--muted-light)' }}>
                        Events Timeline
                    </div>

                    {loading && (
                        <div className="rounded-2xl px-6 py-12 text-center" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                            <span className="text-[13px]" style={{ color: 'var(--muted)' }}>Events laden…</span>
                        </div>
                    )}

                    {!loading && events.length === 0 && (
                        <div className="rounded-2xl px-8 py-12 text-center"
                            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                            <div className="w-14 h-14 rounded-2xl mx-auto mb-4 grid place-items-center"
                                style={{ background: 'rgba(255,191,0,.08)', border: '1px solid rgba(255,191,0,.2)', color: 'var(--brand)' }}>
                                <CalendarIcon size={28} />
                            </div>
                            <div className="text-[16px] font-semibold mb-2">Geen events deze week</div>
                            <p className="text-[13px] mb-5 max-w-md mx-auto leading-relaxed" style={{ color: 'var(--muted)' }}>
                                Zodra een offerte geaccepteerd is, krijg je hier een AI-voorstel klaar.
                                Wil je vast handmatig planning maken? Maak eerst een event aan.
                            </p>
                            <Link href="/agenda" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-[13px] font-bold"
                                style={{ background: 'var(--brand)', color: '#000' }}>
                                Naar agenda <ArrowRight size={14} />
                            </Link>
                        </div>
                    )}

                    {!loading && events.length > 0 && (
                        <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))' }}>
                            {events.map(ev => <EventTimelineCard key={ev.id} ev={ev} />)}
                        </div>
                    )}
                </div>

                {/* Side-rail — Recent AI-voorstellen */}
                <aside className="hidden lg:block">
                    <div className="text-[10px] font-bold tracking-[0.2em] uppercase mb-3" style={{ color: 'var(--muted-light)' }}>
                        Recent AI-voorstellen
                    </div>
                    {notifs.length === 0 && (
                        <div className="rounded-xl p-4 text-[12px]" style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--muted)' }}>
                            Nog geen voorstellen. Zodra een offerte geaccepteerd wordt, verschijnt hier het AI-voorstel.
                        </div>
                    )}
                    {notifs.map(n => <NotifCard key={n.id} n={n} />)}

                    <div className="mt-5 rounded-xl p-4" style={{ background: 'rgba(130,130,130,.03)', border: '1px solid rgba(130,130,130,.06)' }}>
                        <div className="text-[9px] font-bold tracking-[0.15em] uppercase mb-2.5" style={{ color: 'var(--muted-weak)' }}>Hoe werkt het</div>
                        {[
                            'Offerte geaccepteerd',
                            'AI genereert voorstel',
                            'Jij reviewt per sectie',
                            'Checks live → je crew pakt af in het veld',
                        ].map((t, i) => (
                            <div key={i} className="flex items-center gap-2 text-[11px] py-1" style={{ color: 'var(--muted)' }}>
                                <div className="w-4 h-4 rounded grid place-items-center text-[9px] font-bold flex-shrink-0"
                                    style={{ background: 'rgba(255,191,0,.08)', border: '1px solid rgba(255,191,0,.2)', color: 'var(--brand)' }}>{i + 1}</div>
                                {t}
                            </div>
                        ))}
                    </div>
                </aside>
            </div>

            {/* Sticky bottom — Open Veldmodus */}
            <div className="fixed bottom-0 left-0 right-0 z-40 px-4 py-3 backdrop-blur-md"
                style={{ background: 'rgba(10,10,12,.9)', borderTop: '1px solid var(--border)' }}>
                <div className="max-w-[1300px] mx-auto flex items-center justify-between gap-3">
                    <div className="hidden md:block text-[12px]" style={{ color: 'var(--muted)' }}>
                        Veldmodus: handschoen-vriendelijke check vóór vertrek — 72px tap-targets, swipe, offline.
                    </div>
                    <Link href="/logistiek/field"
                        className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-[14px] font-bold w-full md:w-auto justify-center"
                        style={{ background: 'var(--brand)', color: '#000', boxShadow: '0 4px 20px rgba(255,191,0,.35)' }}>
                        <Smartphone size={16} /> Open Veldmodus
                    </Link>
                </div>
            </div>

            {/* Auto-open modal when ?proposal=<event_id> in URL */}
            <AiProposalModalAutoOpen />
        </>
    );
}

/* ────────────────────────── Subcomponents ────────────────────────── */

function KpiCard({ icon, label, value, sub, accent }: {
    icon: React.ReactNode; label: string; value: string; sub?: string; accent: string;
}) {
    return (
        <div className="rounded-2xl px-5 py-4 relative overflow-hidden"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2.5 mb-2.5">
                <div className="w-9 h-9 rounded-lg grid place-items-center"
                    style={{ background: `${accent}15`, border: `1px solid ${accent}30`, color: accent }}>
                    {icon}
                </div>
                <span className="text-[11px] font-semibold tracking-[0.08em] uppercase" style={{ color: 'var(--muted)' }}>{label}</span>
            </div>
            <div className="text-[26px] font-bold tabular-nums leading-tight" style={{ fontFamily: 'var(--font-display)' }}>{value}</div>
            {sub && <div className="text-[11px] mt-1" style={{ color: 'var(--muted)' }}>{sub}</div>}
        </div>
    );
}

function EventTimelineCard({ ev }: { ev: EventWithChecklist }) {
    const dl = daysFromToday(ev.date);
    const t = tBadge(dl);

    /* Tellers per categorie. */
    const grouped: Record<LogistiekCategory, DbChecklistItem[]> = {} as any;
    LOGISTIEK_SECTIONS.forEach(s => { grouped[s.id] = []; });
    ev.checks.forEach(c => { if (grouped[c.category]) grouped[c.category].push(c); });
    const totalDone = ev.checks.filter(c => c.done).length;
    const total = ev.checks.length;
    const allDone = total > 0 && totalDone === total;
    const pct = total === 0 ? 0 : Math.round((totalDone / total) * 100);
    const eventNaam = ev.client_naam || ev.name || `Event #${ev.id}`;

    return (
        <div className="rounded-2xl p-5 relative transition-shadow hover:shadow-lg"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>

            {/* Top row */}
            <div className="flex items-start gap-3 mb-4">
                <span
                    className="px-2.5 py-1 rounded-md text-[12px] font-bold leading-none whitespace-nowrap"
                    style={{ background: `${t.color}18`, color: t.color, border: `1px solid ${t.color}35`, fontFamily: 'var(--font-display)' }}
                >{t.label}</span>
                <div className="flex-1 min-w-0">
                    <div className="text-[15px] font-semibold truncate">{eventNaam}</div>
                    <div className="text-[12px] mt-0.5" style={{ color: 'var(--muted)' }}>
                        {ev.guests ?? 0} pax · {ev.location || 'locatie onbekend'} · {eventDateLabel(ev.date)}
                    </div>
                </div>
                {allDone && (
                    <span className="px-2 py-1 rounded-full text-[10px] font-semibold inline-flex items-center gap-1"
                        style={{ background: 'rgba(34,197,94,.12)', color: 'var(--green)', border: '1px solid rgba(34,197,94,.3)' }}>
                        <CheckCircle2 size={10} /> Klaar
                    </span>
                )}
                {ev.aiPending && !allDone && (
                    <span className="px-2 py-1 rounded-full text-[10px] font-semibold inline-flex items-center gap-1"
                        style={{ background: 'rgba(255,191,0,.12)', color: 'var(--brand)', border: '1px solid rgba(255,191,0,.3)' }}>
                        <Sparkles size={10} /> AI-voorstel klaar
                    </span>
                )}
            </div>

            {/* 6 Mini-bars */}
            <div className="grid grid-cols-6 gap-1.5">
                {LOGISTIEK_SECTIONS.map(s => {
                    const items = grouped[s.id];
                    const done = items.filter(c => c.done).length;
                    const sectionPct = items.length === 0 ? 0 : Math.round((done / items.length) * 100);
                    const sectionDone = items.length > 0 && done === items.length;
                    return (
                        <div key={s.id} className="flex flex-col items-center gap-1">
                            <span className="text-[10px]" style={{ color: sectionDone ? 'var(--green)' : 'var(--muted)', fontWeight: 600 }}>{s.emoji}</span>
                            <div className="w-full h-[3px] rounded-full overflow-hidden" style={{ background: 'rgba(130,130,130,.1)' }}>
                                <div style={{
                                    width: `${sectionPct}%`,
                                    height: '100%',
                                    background: sectionDone ? 'var(--green)' : 'var(--brand-gold)',
                                    transition: 'width .3s',
                                }} />
                            </div>
                            <span className="text-[8px]" style={{ color: 'var(--muted)', fontWeight: 600 }}>{sectionPct}%</span>
                        </div>
                    );
                })}
            </div>

            {/* Bottom row */}
            <div className="flex items-center justify-between mt-3.5 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
                <span className="text-[12px]" style={{ color: 'var(--muted)' }}>
                    {totalDone}/{total} checks {total > 0 ? `· ${pct}%` : '· nog leeg'}
                </span>
                {ev.aiPending ? (
                    <Link href={`/logistiek?proposal=${ev.id}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-semibold"
                        style={{ background: 'rgba(255,191,0,.06)', border: '1px solid rgba(255,191,0,.25)', color: 'var(--brand)' }}>
                        <Sparkles size={12} /> Bekijk AI-voorstel
                    </Link>
                ) : (
                    <Link href={`/events/${ev.id}/logistiek`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-semibold"
                        style={{ background: 'rgba(255,191,0,.06)', border: '1px solid rgba(255,191,0,.25)', color: 'var(--brand)' }}>
                        Open checklist <ArrowRight size={12} />
                    </Link>
                )}
            </div>
        </div>
    );
}

function NotifCard({ n }: { n: NotificationRow }) {
    const dt = new Date(n.created_at);
    const isToday = dt.toISOString().slice(0, 10) === ISO_TODAY();
    const tijd = dt.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
    const dag = isToday ? 'Vandaag' : dt.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
    const dismissed = !!n.dismissed_at;
    const eventId = (n.metadata as any)?.event_id;
    return (
        <div className="rounded-xl px-4 py-3 mb-2 relative overflow-hidden"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2 mb-1.5">
                <Sparkles size={12} style={{ color: 'var(--brand)' }} />
                <span className="text-[12px] font-semibold flex-1 truncate">{n.title}</span>
                <span className="text-[10px]" style={{ color: 'var(--muted)' }}>{tijd}</span>
            </div>
            <div className="flex items-center gap-1.5 mb-1.5">
                {dismissed ? (
                    <span className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold inline-flex items-center gap-1"
                        style={{ background: 'rgba(34,197,94,.12)', color: 'var(--green)', border: '1px solid rgba(34,197,94,.3)' }}>
                        <CheckCircle2 size={9} /> Afgehandeld
                    </span>
                ) : (
                    <span className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold inline-flex items-center gap-1"
                        style={{ background: 'rgba(255,191,0,.12)', color: 'var(--brand)', border: '1px solid rgba(255,191,0,.3)' }}>
                        <Clock size={9} /> Wacht op review
                    </span>
                )}
                <span className="text-[10px]" style={{ color: 'var(--muted)' }}>{dag}</span>
            </div>
            {!dismissed && eventId && (
                <Link href={`/logistiek?proposal=${eventId}`}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold"
                    style={{ color: 'var(--brand)' }}>
                    Bekijken <ArrowRight size={11} />
                </Link>
            )}
            {dismissed && eventId && (
                <Link href={`/events/${eventId}/logistiek`}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold"
                    style={{ color: 'var(--muted)' }}>
                    Bekijk event <ArrowRight size={11} />
                </Link>
            )}
        </div>
    );
}

