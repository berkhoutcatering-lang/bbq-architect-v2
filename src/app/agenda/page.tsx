/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import { useState, useMemo } from 'react';
import { useSupabase } from '@/lib/useSupabase';
import { detectAllConflicts } from '@/lib/conflictDetection';
import type { Event as DbEvent, PrepTask } from '@/types';
import {
    PartyPopper, ClipboardList, Flame, Users, HeartHandshake, Truck, UserRound,
    ChevronLeft, ChevronRight, Filter, Grid3x3, Columns3, List as ListIcon,
    Sparkles, AlertTriangle, TrendingUp, Wand2, X, MapPin, Euro, Clock, Calendar,
    ArrowRight, Check, RefreshCw,
} from 'lucide-react';

const GOLD = '#c4a35a';
const BRAND = '#FFBF00';

/* ═══════════════════════════════════════════════════════════════════
   AGENDA — gevoed door echte DB events (tabel: events) + prep_tasks.
   Smoker / Team / Tasting / Delivery / Personal blijven (voorlopig)
   demo-data tot er DB-tabellen voor zijn — gemarkeerd als "demo".
   ═══════════════════════════════════════════════════════════════════ */

const NL_MONTHS = ['Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni', 'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December'];

interface CalendarMeta { id: string; label: string; color: string; Icon: any; synced: boolean; source: string; count: number }

const CALENDARS: CalendarMeta[] = [
    { id: 'events', label: 'Events', color: BRAND, Icon: PartyPopper, synced: true, source: 'lokaal', count: 7 },
    { id: 'prep', label: 'Prep deadlines', color: GOLD, Icon: ClipboardList, synced: true, source: 'lokaal', count: 14 },
    { id: 'smoker', label: 'Smoker cycli', color: '#ef6c4d', Icon: Flame, synced: true, source: 'lokaal', count: 5 },
    { id: 'team', label: 'Team rooster', color: '#10b981', Icon: Users, synced: true, source: 'Google · BBQA Team', count: 18 },
    { id: 'tasting', label: 'Klant-afspraken', color: '#a78bfa', Icon: HeartHandshake, synced: true, source: 'Google · Sales', count: 6 },
    { id: 'delivery', label: 'Leveringen', color: '#60a5fa', Icon: Truck, synced: true, source: 'Google · Inkoop', count: 8 },
    { id: 'personal', label: 'Persoonlijk', color: '#888888', Icon: UserRound, synced: true, source: 'Google · martijn@…', count: 4 },
];

interface AgendaEvent {
    id: string; calId: string; day: number; start: number; duration: number; title: string;
    [key: string]: any;
}

const ev = (id: string, calId: string, day: number, start: number, duration: number, title: string, extras: any = {}): AgendaEvent =>
    ({ id, calId, day, start, duration, title, ...extras });

const EVENTS_DATA: AgendaEvent[] = [
    ev('e1', 'events', 8, 16, 7, 'Bedrijfsfeest Sentec 90p', { client: 'Sentec BV', guests: 90, type: 'Bedrijfsfeest', venue: 'De Schuur, Diepenheim', revenue: 8100, status: 'afgerond', package: 'Low & Slow All-In', hero: '🥩' }),
    ev('e2', 'events', 12, 17, 6, 'Diner Familie Berghuis 24p', { client: 'Fam. Berghuis', guests: 24, type: 'Verjaardag', venue: 'Privé locatie Goor', revenue: 1920, status: 'live', package: 'Pulled Pork & Brisket', hero: '🍖', isToday: true }),
    ev('e3', 'events', 15, 14, 8, 'Bruiloft Joost & Liane 80p', { client: 'J. van Asperen + L. Pol', guests: 80, type: 'Bruiloft', venue: 'Landgoed Singraven', revenue: 9600, status: 'bevestigd', package: 'Premium Wedding BBQ', hero: '💍', prepLeadDays: 4 }),
    ev('e4', 'events', 21, 12, 9, 'Bruiloft Anouk & Tim 110p', { client: 'A. Brinkman + T. de Wit', guests: 110, type: 'Bruiloft', venue: 'Boerderij De Eik, Markelo', revenue: 13200, status: 'bevestigd', package: 'Hand-in-Hand Premium', hero: '💍', prepLeadDays: 5 }),
    ev('e5', 'events', 22, 16, 6, 'Bedrijfsfeest TechCorp 80p', { client: 'TechCorp Nederland', guests: 80, type: 'Bedrijfsfeest', venue: 'HQ Hengelo', revenue: 7200, status: 'bevestigd', package: 'Low & Slow All-In', hero: '🏢', prepLeadDays: 3, conflict: { with: 'e4', note: 'Smoker dubbel bezet' } }),
    ev('e6', 'events', 28, 17, 5, 'Lentediner Rotary Club 45p', { client: 'Rotary Hengelo', guests: 45, type: 'Bedrijfsfeest', venue: 'Watertoren Borne', revenue: 4050, status: 'optie', package: 'Mid Tier BBQ', hero: '🌷', prepLeadDays: 3 }),
    ev('e7', 'events', 29, 13, 8, 'Bruiloft Fleur & Daan 65p', { client: 'F. Hoekstra + D. Smit', guests: 65, type: 'Bruiloft', venue: 'Kasteel Twickel', revenue: 7800, status: 'bevestigd', package: 'Premium Wedding BBQ', hero: '💍', prepLeadDays: 4 }),
];

const PREP_DATA: AgendaEvent[] = [
    ev('p1', 'prep', 11, 8, 1, 'Brisket dry-rub start', { for: 'e3', critical: true }),
    ev('p2', 'prep', 12, 9, 1, 'Pulled pork bestelling Sligro', { for: 'e3' }),
    ev('p3', 'prep', 13, 6, 2, 'Smoker brisket low & slow IN', { for: 'e3', critical: true }),
    ev('p4', 'prep', 14, 7, 1.5, 'Sauces & rubs voorbereiden', { for: 'e3' }),
    ev('p5', 'prep', 18, 8, 1, 'Brisket rub e4 + e5', { for: 'e4+e5', critical: true }),
    ev('p6', 'prep', 19, 9, 1, 'Bestelling vlees Sligro', { for: 'e4' }),
    ev('p7', 'prep', 20, 5, 3, 'Smoker IN brisket e4', { for: 'e4', critical: true }),
    ev('p8', 'prep', 21, 5, 2.5, 'Smoker IN brisket e5', { for: 'e5', critical: true, conflict: 'p7' }),
    ev('p9', 'prep', 25, 8, 1, 'Bestelling Rotary + bruiloft', { for: 'e6+e7' }),
    ev('p10', 'prep', 27, 7, 2, 'Mise en place lentediner', { for: 'e6' }),
    ev('p11', 'prep', 28, 6, 2, 'Bruiloft setup checklist', { for: 'e7' }),
];

const SMOKER_DATA: AgendaEvent[] = [
    ev('s1', 'smoker', 13, 6, 14, 'Brisket Singraven · 18u smoke', { cuts: '24kg brisket', target: '96°C IT', smokerNo: 1, for: 'e3', type: 'low&slow', wood: 'hickory + oak' }),
    ev('s2', 'smoker', 14, 22, 8, 'Pulled pork Singraven · nacht', { cuts: '32kg PP', target: '93°C IT', smokerNo: 2, for: 'e3', type: 'low&slow', wood: 'apple' }),
    ev('s3', 'smoker', 20, 5, 14, 'Brisket dubbel · TechCorp + Bruiloft', { cuts: '40kg brisket', target: '96°C IT', smokerNo: 1, for: 'e4+e5', type: 'low&slow', wood: 'hickory', conflictNote: 'Capaciteit kritiek' }),
    ev('s4', 'smoker', 27, 6, 13, 'Brisket Twickel', { cuts: '20kg brisket', target: '96°C IT', smokerNo: 1, for: 'e7', type: 'low&slow', wood: 'oak' }),
    ev('s5', 'smoker', 28, 11, 4, 'Spareribs hot smoke Rotary', { cuts: '15kg ribs', target: '88°C IT', smokerNo: 2, for: 'e6', type: 'hot', wood: 'cherry' }),
];

const TEAM_DATA: AgendaEvent[] = [
    ev('t1', 'team', 12, 16, 7, 'Service: Martijn + Lotte', { staff: ['MB', 'LV'] }),
    ev('t2', 'team', 13, 6, 8, 'Smoker shift: Martijn', { staff: ['MB'] }),
    ev('t3', 'team', 15, 12, 10, 'Bruiloft team — 4 man', { staff: ['MB', 'LV', 'JD', 'KE'] }),
    ev('t4', 'team', 20, 5, 8, 'Smoker shift: Martijn', { staff: ['MB'] }),
    ev('t5', 'team', 21, 11, 11, 'Bruiloft team — 5 man', { staff: ['MB', 'LV', 'JD', 'KE', 'TR'] }),
    ev('t6', 'team', 22, 15, 7, 'TechCorp service — 3 man', { staff: ['MB', 'LV', 'JD'], short: true }),
    ev('t7', 'team', 28, 16, 6, 'Rotary service', { staff: ['MB', 'LV'] }),
    ev('t8', 'team', 29, 11, 11, 'Bruiloft team Twickel', { staff: ['MB', 'LV', 'JD', 'KE'] }),
];

const TASTING_DATA: AgendaEvent[] = [
    ev('ta1', 'tasting', 12, 14, 1.5, 'Intake: Bruiloft De Vries 2026', { client: 'Fam. de Vries', kind: 'intake' }),
    ev('ta2', 'tasting', 17, 19, 2, 'Proeverij: Janssen-Smid', { client: 'Janssen-Smid', kind: 'tasting', stage: 'gesloten' }),
    ev('ta3', 'tasting', 19, 16, 1, 'Site visit Twickel', { client: 'Fleur & Daan', kind: 'visit' }),
    ev('ta4', 'tasting', 24, 18, 2, 'Proeverij: Lead Goorse Industriedag', { client: 'Goorse Industrie', kind: 'tasting' }),
    ev('ta5', 'tasting', 26, 14, 1.5, 'Intake: Zomerfeest Domino', { client: 'Domino Hengelo', kind: 'intake' }),
    ev('ta6', 'tasting', 31, 19, 2, 'Proeverij groep Saxion 2025', { client: 'Saxion Hogeschool', kind: 'tasting' }),
];

const DELIVERY_DATA: AgendaEvent[] = [
    ev('d1', 'delivery', 12, 9, 0.5, 'Sligro vlees · €847', { supplier: 'Sligro', amount: 847 }),
    ev('d2', 'delivery', 14, 8.5, 0.5, 'Sligro brisket + PP · €2.140', { supplier: 'Sligro', amount: 2140, big: true }),
    ev('d3', 'delivery', 17, 10, 0.5, 'Hop & Bites bier · €420', { supplier: 'Hop & Bites', amount: 420 }),
    ev('d4', 'delivery', 19, 9, 0.5, 'Sligro premium pakket · €3.200', { supplier: 'Sligro', amount: 3200, big: true }),
    ev('d5', 'delivery', 21, 8, 0.5, 'Bakker Holtkamp brood', { supplier: 'Bakker', amount: 180 }),
    ev('d6', 'delivery', 26, 9, 0.5, 'Sligro Rotary + Twickel · €1.840', { supplier: 'Sligro', amount: 1840 }),
    ev('d7', 'delivery', 28, 8, 0.5, 'Boerderij groente Twickel', { supplier: 'De Maat', amount: 240 }),
    ev('d8', 'delivery', 31, 9, 0.5, 'Sligro maandbestelling', { supplier: 'Sligro', amount: 920 }),
];

const PERSONAL_DATA: AgendaEvent[] = [
    ev('pe1', 'personal', 13, 18, 1.5, 'Avondeten zus', { source: 'Google' }),
    ev('pe2', 'personal', 16, 10, 2, 'Voetbal Tygo', { source: 'Google', recurring: true }),
    ev('pe3', 'personal', 23, 10, 2, 'Voetbal Tygo', { source: 'Google', recurring: true }),
    ev('pe4', 'personal', 30, 19, 2.5, 'Bioscoop Lieke', { source: 'Google' }),
];

/* DEMO_FALLBACK_EVENTS bundelt alle hardcoded mock-data; wordt alléén
   getoond als de DB nog leeg is. Zodra de gebruiker echte events heeft
   draait de Agenda volledig op live data. */
const DEMO_FALLBACK_EVENTS: AgendaEvent[] = [...EVENTS_DATA, ...PREP_DATA, ...SMOKER_DATA, ...TEAM_DATA, ...TASTING_DATA, ...DELIVERY_DATA, ...PERSONAL_DATA];

const AI_INSIGHTS = [
    { id: 'ai1', severity: 'critical' as const, Icon: AlertTriangle, title: 'Smoker conflict: 21–22 maart', body: 'Bruiloft Anouk & Tim (110p) en TechCorp (80p) hebben beide brisket nodig. Smoker 1 kan max 30kg in 18u doen — tekort van 12kg.', suggestion: 'Verplaats TechCorp brisket naar Smoker 2 of overweeg pulled pork', action: 'Bekijk schedule' },
    { id: 'ai2', severity: 'opportunity' as const, Icon: Sparkles, title: '3 lege slots voor nieuwe leads', body: 'Wo 19/3 hele dag, vr 21/3 ochtend, za 5/4 hele dag — ideaal voor 60-80p events.', suggestion: 'Stuur prospectief mailtje naar 4 warme leads in CRM', action: 'Open lead-voorstel' },
    { id: 'ai3', severity: 'info' as const, Icon: TrendingUp, title: 'Omzet maart: €51.870', body: '€47.820 bevestigd · €4.050 in optie · 14% boven budget. April pipeline staat op €38k.', suggestion: 'Zet april kortings-campagne live', action: 'Open rapport' },
    { id: 'ai4', severity: 'opportunity' as const, Icon: Wand2, title: 'Smoker schedule geoptimaliseerd', body: 'Door brisket e3 op 13/3 06:00 ipv 14/3 te starten win je 8u en kan PP er overheen.', suggestion: 'Pas auto-aan', action: 'Toepassen' },
    { id: 'ai5', severity: 'info' as const, Icon: ClipboardList, title: '14 prep-deadlines auto-gepland', body: 'Vanaf event-datums teruggerekend met je standaard lead-times. Allemaal in agenda gezet.', suggestion: 'Bekijk en pas aan', action: 'Open prep planning' },
];

const UPCOMING = [
    { day: 12, name: 'Diner Berghuis', guests: 24, time: '17:00', revenue: 1920, status: 'live', emoji: '🍖' },
    { day: 15, name: 'Bruiloft Singraven', guests: 80, time: '14:00', revenue: 9600, status: 'bevestigd', emoji: '💍' },
    { day: 21, name: 'Bruiloft Markelo', guests: 110, time: '12:00', revenue: 13200, status: 'bevestigd', emoji: '💍' },
    { day: 22, name: 'TechCorp', guests: 80, time: '16:00', revenue: 7200, status: 'bevestigd', emoji: '🏢', warning: true },
    { day: 28, name: 'Rotary Lentediner', guests: 45, time: '17:00', revenue: 4050, status: 'optie', emoji: '🌷' },
    { day: 29, name: 'Bruiloft Twickel', guests: 65, time: '13:00', revenue: 7800, status: 'bevestigd', emoji: '💍' },
];

/* ═══════════════════════════════════════════════════════════════════
   ATOMS
   ═══════════════════════════════════════════════════════════════════ */
function Eyebrow({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
    return <div style={{ fontSize: 9, letterSpacing: '.2em', color: 'var(--muted-light)', fontWeight: 700, textTransform: 'uppercase', ...style }}>{children}</div>;
}

function MetalCard({ children, style, className }: { children: React.ReactNode; style?: React.CSSProperties; className?: string }) {
    return <div className={className} style={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--border)', borderRadius: 14, padding: 18, ...style }}>{children}</div>;
}

const calById = (id: string) => CALENDARS.find(c => c.id === id) || CALENDARS[0];
const fmtEur = (n: number) => '€ ' + n.toLocaleString('nl-NL');

/* ═══════════════════════════════════════════════════════════════════
   HERO + KPIs + SYNC
   ═══════════════════════════════════════════════════════════════════ */
interface AgendaKpis {
    upcoming30d: number; revenuePipeline: number; revenuePipelineConfirmed: number; conflicts: number;
    freeWeekendsLeft: number; usingDemoData: boolean;
}
function AgendaHero({ kpis, onAiClick }: { kpis: AgendaKpis; onAiClick: () => void }) {
    return (
        <div style={{
            position: 'relative', borderRadius: 20, padding: 24,
            background: `linear-gradient(135deg, ${BRAND}0a 0%, ${GOLD}05 50%, rgba(28,28,32,.7) 100%)`,
            border: `1px solid ${GOLD}30`, overflow: 'hidden',
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, marginBottom: 18 }}>
                <div style={{ minWidth: 0 }}>
                    <h1 style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 200, fontSize: 34, letterSpacing: '-.015em', margin: '0 0 4px' }}>Agenda</h1>
                    <div style={{ color: 'var(--muted)', fontSize: 14 }}>
                        {kpis.usingDemoData
                            ? 'Demo-modus — voeg een echt event toe in /events om je live agenda te zien'
                            : 'Live agenda · gevoed door je events + prep-taken'}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <SyncBadge live={!kpis.usingDemoData} />
                    <button onClick={onAiClick} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 8,
                        background: `linear-gradient(180deg, ${GOLD}, #9e781c)`, color: '#0a0a0c',
                        fontWeight: 600, fontSize: 13, border: 'none', cursor: 'pointer',
                    }}>
                        <Sparkles size={14} /> AI Insights
                    </button>
                </div>
            </div>

            <div className="agenda-kpi-grid">
                <KpiTile Icon={PartyPopper} color={BRAND} label="Komende 30d" value={kpis.upcoming30d.toString()} sub="events bevestigd" />
                <KpiTile Icon={Euro} color={GOLD} label="Omzet pipeline" value={fmtEur(kpis.revenuePipeline)} sub={`${fmtEur(kpis.revenuePipelineConfirmed)} bevestigd`} />
                <KpiTile Icon={Flame} color="#ef6c4d" label="Smoker bezet" value="—" sub="koppel data" />
                <KpiTile Icon={Calendar} color="#10b981" label="Vrije weekends" value={kpis.freeWeekendsLeft.toString()} sub="deze maand" />
                <KpiTile Icon={AlertTriangle} color="var(--red)" label="Conflicten" value={kpis.conflicts.toString()} sub={kpis.conflicts > 0 ? 'vraagt actie' : 'geen issues'} />
            </div>
        </div>
    );
}

function KpiTile({ Icon, color, label, value, sub }: { Icon: any; color: string; label: string; value: string; sub: string }) {
    return (
        <div style={{ padding: 14, borderRadius: 12, background: 'rgba(28,28,32,.6)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 500 }}>{label}</span>
                <Icon size={14} style={{ color }} />
            </div>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 200, fontSize: 24, color: 'var(--text)', fontVariantNumeric: 'tabular-nums', lineHeight: 1.05 }}>{value}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{sub}</div>
        </div>
    );
}

function SyncBadge({ live }: { live: boolean }) {
    const color = live ? '#10b981' : 'var(--muted)';
    const bg = live ? 'rgba(16,185,129,.08)' : 'rgba(255,255,255,.04)';
    const bd = live ? 'rgba(16,185,129,.3)' : 'var(--border)';
    return (
        <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 12px',
            borderRadius: 999, background: bg,
            border: `1px solid ${bd}`, fontSize: 11, color,
        }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, animation: live ? 'sync-pulse 2s infinite' : 'none' }} />
            <strong>{live ? 'Live data' : 'Demo data'}</strong>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   MONTH NAV
   ═══════════════════════════════════════════════════════════════════ */
interface MonthNavProps {
    view: string;
    setView: (v: 'month' | 'week' | 'list') => void;
    monthLabel: string;
    onPrev: () => void;
    onNext: () => void;
    onToday: () => void;
}
function MonthNav({ view, setView, monthLabel, onPrev, onNext, onToday }: MonthNavProps) {
    return (
        <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 16px', background: 'rgba(28,28,32,.6)', border: '1px solid var(--border)', borderRadius: 12,
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button onClick={onPrev} style={navBtnStyle()} aria-label="Vorige maand"><ChevronLeft size={16} /></button>
                <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 28, fontWeight: 300, letterSpacing: '-.01em', minWidth: 180 }}>{monthLabel}</div>
                <button onClick={onNext} style={navBtnStyle()} aria-label="Volgende maand"><ChevronRight size={16} /></button>
                <button onClick={onToday} style={navPillStyle(BRAND)}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: BRAND }} /> Vandaag
                </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ display: 'inline-flex', padding: 3, borderRadius: 10, background: 'rgba(0,0,0,.3)', border: '1px solid var(--border)' }}>
                    <button onClick={() => setView('month')} style={viewTabStyle(view === 'month')}><Grid3x3 size={11} /> Maand</button>
                    <button onClick={() => setView('week')} style={viewTabStyle(view === 'week')}><Columns3 size={11} /> Week</button>
                    <button onClick={() => setView('list')} style={viewTabStyle(view === 'list')}><ListIcon size={11} /> Lijst</button>
                </div>
                <button style={navPillStyle()}>
                    <Filter size={11} /> Filter
                </button>
            </div>
        </div>
    );
}

const navBtnStyle = (): React.CSSProperties => ({
    width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,.04)', border: '1px solid var(--border)',
    color: 'var(--text)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
});

/* Uniforme pill-style voor MonthNav-knoppen (Vandaag, Filter). Optionele accent-color
   tint de border + tekst zodat de "Vandaag"-knop herkenbaar blijft als dag-anchor. */
const navPillStyle = (accent?: string): React.CSSProperties => ({
    padding: '7px 12px', borderRadius: 8,
    background: accent ? `${accent}0f` : 'rgba(255,255,255,.04)',
    border: `1px solid ${accent ? `${accent}40` : 'var(--border)'}`,
    color: accent || 'var(--muted)',
    fontSize: 11, fontWeight: 600, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: 6,
});

const viewTabStyle = (active: boolean): React.CSSProperties => ({
    padding: '6px 14px', borderRadius: 7,
    background: active ? `${BRAND}1f` : 'transparent',
    border: 'none', color: active ? BRAND : 'var(--muted)',
    fontSize: 11, fontWeight: 600, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: 5,
    boxShadow: active ? `inset 0 0 0 1px ${BRAND}4D` : 'none',
});

/* ═══════════════════════════════════════════════════════════════════
   CALENDAR LEGEND
   ═══════════════════════════════════════════════════════════════════ */
function CalendarLegend({ active, onToggle }: { active: string[]; onToggle: (id: string) => void }) {
    return (
        <MetalCard>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>Agenda&rsquo;s</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {CALENDARS.map(c => {
                    const isOn = active.includes(c.id);
                    return (
                        <div key={c.id} onClick={() => onToggle(c.id)} style={{
                            display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 8, cursor: 'pointer',
                            background: isOn ? `${c.color}10` : 'transparent', opacity: isOn ? 1 : 0.5,
                            border: `1px solid ${isOn ? `${c.color}33` : 'transparent'}`,
                        }}>
                            <div style={{ width: 10, height: 10, borderRadius: 2, background: c.color, flexShrink: 0 }} />
                            <c.Icon size={13} style={{ color: c.color, flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12, fontWeight: 500 }}>{c.label}</div>
                                <div style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {c.source} · {c.count}
                                </div>
                            </div>
                            {c.synced && <RefreshCw size={10} style={{ color: 'var(--muted-light)', flexShrink: 0 }} />}
                        </div>
                    );
                })}
            </div>
        </MetalCard>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   MONTH GRID
   ═══════════════════════════════════════════════════════════════════ */
const WEEKDAYS_NL = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'];
function daysInMonth(year: number, month: number) { return new Date(year, month + 1, 0).getDate(); }
function dowMon0(date: Date) { return (date.getDay() + 6) % 7; }

function MonthGrid({ year, month, activeCals, events, onSelectEvent }: {
    year: number; month: number; activeCals: string[]; events: AgendaEvent[]; onSelectEvent: (e: AgendaEvent) => void;
}) {
    /* "Vandaag" alleen highlighten als de zichtbare maand daadwerkelijk de
       huidige maand is — anders staat hij verkeerd in een ander tijdvak. */
    const now = new Date();
    const todayDay = (now.getFullYear() === year && now.getMonth() === month) ? now.getDate() : -1;
    const totalDays = daysInMonth(year, month);
    const firstDow = dowMon0(new Date(year, month, 1));
    const cells = useMemo(() => {
        const rows: { day: number | null; date: Date | null }[][] = [];
        let curRow: { day: number | null; date: Date | null }[] = [];
        for (let i = 0; i < firstDow; i++) curRow.push({ day: null, date: null });
        for (let d = 1; d <= totalDays; d++) {
            curRow.push({ day: d, date: new Date(year, month, d) });
            if (curRow.length === 7) { rows.push(curRow); curRow = []; }
        }
        while (curRow.length > 0 && curRow.length < 7) curRow.push({ day: null, date: null });
        if (curRow.length === 7) rows.push(curRow);
        return rows;
    }, [year, month, totalDays, firstDow]);

    const eventsByDay = useMemo(() => {
        const map: Record<number, AgendaEvent[]> = {};
        events.filter(e => activeCals.includes(e.calId)).forEach(e => {
            (map[e.day] ||= []).push(e);
        });
        Object.values(map).forEach(arr => arr.sort((a, b) => a.start - b.start));
        return map;
    }, [events, activeCals]);

    return (
        <MetalCard style={{ padding: 0, overflow: 'hidden' }} className="agenda-cal-card">
            <div className="agenda-cal-scroll">
                <div className="agenda-cal-head">
                    {WEEKDAYS_NL.map(w => (
                        <div key={w} style={{ padding: '8px 12px', textAlign: 'center', fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700, background: 'rgba(130,130,130,.04)' }}>{w}</div>
                    ))}
                </div>
                <div>
                    {cells.map((row, rIdx) => (
                        <div key={rIdx} className="agenda-cal-row" style={{ borderBottom: rIdx === cells.length - 1 ? 'none' : '1px solid var(--border)' }}>
                        {row.map((cell, cIdx) => (
                            <DayCell key={cIdx} day={cell.day} isToday={cell.day === todayDay} isWeekend={cIdx >= 5}
                                events={cell.day ? eventsByDay[cell.day] || [] : []}
                                isLastCol={cIdx === 6}
                                onSelectEvent={onSelectEvent}
                            />
                        ))}
                    </div>
                ))}
                </div>
            </div>
        </MetalCard>
    );
}

function DayCell({ day, isWeekend, isToday, events, isLastCol, onSelectEvent }: {
    day: number | null; isWeekend: boolean; isToday: boolean; events: AgendaEvent[]; isLastCol: boolean; onSelectEvent: (e: AgendaEvent) => void;
}) {
    if (!day) return <div style={{ minHeight: 110, borderRight: isLastCol ? 'none' : '1px solid var(--border)', background: 'rgba(0,0,0,.15)' }} />;
    const visible = events.slice(0, 3);
    const more = events.length - visible.length;
    return (
        <div style={{
            minHeight: 110, padding: 8, borderRight: isLastCol ? 'none' : '1px solid var(--border)',
            background: isToday ? `${BRAND}0a` : isWeekend ? 'rgba(0,0,0,.1)' : 'transparent',
            position: 'relative',
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{
                    fontSize: 12, fontWeight: isToday ? 700 : 500, color: isToday ? BRAND : 'var(--text)',
                    fontVariantNumeric: 'tabular-nums',
                }}>{day}</span>
                {isToday && <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 3, background: BRAND, color: '#000', fontWeight: 700, letterSpacing: '.1em' }}>NU</span>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {visible.map(ev => <EventChip key={ev.id} event={ev} onClick={() => onSelectEvent(ev)} />)}
                {more > 0 && (
                    <div style={{ fontSize: 10, color: 'var(--muted)', textAlign: 'center', padding: 2 }}>+ {more} meer</div>
                )}
            </div>
        </div>
    );
}

function EventChip({ event, onClick }: { event: AgendaEvent; onClick: () => void }) {
    const cal = calById(event.calId);
    const critical = event.critical || event.conflict || event.warning;
    return (
        <div onClick={(e) => { e.stopPropagation(); onClick(); }} style={{
            padding: '3px 6px', borderRadius: 4, fontSize: 10, lineHeight: 1.3,
            background: `${cal.color}1f`, color: 'var(--text)',
            borderLeft: `3px solid ${cal.color}`,
            cursor: 'pointer',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            position: 'relative',
        }}>
            <span style={{ fontVariantNumeric: 'tabular-nums', color: cal.color, fontWeight: 600, marginRight: 4 }}>
                {String(Math.floor(event.start)).padStart(2, '0')}:{event.start % 1 ? '30' : '00'}
            </span>
            {event.title}
            {critical && <span style={{ position: 'absolute', right: 4, top: 2, fontSize: 8, color: 'var(--red)' }}>!</span>}
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   SMOKER SCHEDULE STRIP
   ═══════════════════════════════════════════════════════════════════ */
function SmokerSchedule({ smokes }: { smokes: AgendaEvent[] }) {
    const startDay = 13;
    const days = 18;
    /* SmokerSchedule is alleen demo-data; vandaag-highlight match op kalenderdag. */
    const todayDay = new Date().getDate();
    return (
        <MetalCard>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Flame size={14} style={{ color: '#ef6c4d' }} />
                <Eyebrow>Smoker schedule · komende 18 dagen</Eyebrow>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <SmokerLane no={1} smokes={smokes.filter(s => s.smokerNo === 1)} startDay={startDay} days={days} />
                <SmokerLane no={2} smokes={smokes.filter(s => s.smokerNo === 2)} startDay={startDay} days={days} />
            </div>
            <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '32px ' + Array.from({ length: days }, () => '1fr').join(' '), gap: 1, fontSize: 9, color: 'var(--muted)', textAlign: 'center' }}>
                <div />
                {Array.from({ length: days }, (_, i) => (
                    <div key={i} style={{ fontVariantNumeric: 'tabular-nums', fontWeight: i + startDay === todayDay ? 700 : 400, color: i + startDay === todayDay ? BRAND : 'var(--muted)' }}>
                        {i + startDay}
                    </div>
                ))}
            </div>
        </MetalCard>
    );
}

function SmokerLane({ no, smokes, startDay, days }: { no: number; smokes: AgendaEvent[]; startDay: number; days: number }) {
    return (
        <div style={{ display: 'grid', gridTemplateColumns: '32px ' + Array.from({ length: days }, () => '1fr').join(' '), gap: 1, alignItems: 'center' }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', textAlign: 'center' }}>S{no}</div>
            {Array.from({ length: days }, (_, i) => {
                const day = i + startDay;
                const smoke = smokes.find(s => s.day === day);
                if (!smoke) return <div key={i} style={{ height: 18, background: 'rgba(255,255,255,.02)', borderRadius: 2 }} />;
                return (
                    <div key={i} title={smoke.title} style={{
                        height: 18, borderRadius: 3, background: smoke.type === 'low&slow' ? 'linear-gradient(90deg, #ef6c4d, #c4a35a)' : '#ef6c4d',
                        position: 'relative', cursor: 'pointer',
                        boxShadow: smoke.conflictNote ? '0 0 0 1px var(--red)' : 'none',
                    }}>
                        <div style={{ position: 'absolute', inset: 0, fontSize: 8, color: '#000', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                            {smoke.type === 'low&slow' ? '🔥' : '🌶️'}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   UPCOMING LIST
   ═══════════════════════════════════════════════════════════════════ */
function UpcomingList({ items, onSelect }: { items: typeof UPCOMING; onSelect: (it: typeof UPCOMING[0]) => void }) {
    return (
        <MetalCard>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <Eyebrow>Komende events</Eyebrow>
                <span style={{ fontSize: 10, color: 'var(--muted)' }}>{items.length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {items.map((it, i) => (
                    <div key={i} onClick={() => onSelect(it)} style={{
                        display: 'grid', gridTemplateColumns: '36px 1fr auto', gap: 10, alignItems: 'center',
                        padding: 10, borderRadius: 10, cursor: 'pointer',
                        background: it.warning ? 'rgba(239,68,68,.04)' : 'rgba(28,28,32,.4)',
                        border: `1px solid ${it.warning ? 'rgba(239,68,68,.2)' : 'transparent'}`,
                    }}>
                        <div style={{
                            width: 36, height: 36, borderRadius: 8, background: 'rgba(0,0,0,.3)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, position: 'relative',
                        }}>
                            {it.emoji}
                            <span style={{ position: 'absolute', bottom: -3, right: -3, fontSize: 9, padding: '1px 4px', borderRadius: 3, background: BRAND, color: '#000', fontWeight: 700 }}>{it.day}</span>
                        </div>
                        <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.name}</div>
                            <div style={{ fontSize: 10, color: 'var(--muted)' }}>{it.time} · {it.guests} gasten · {fmtEur(it.revenue)}</div>
                        </div>
                        <span style={{
                            fontSize: 9, padding: '2px 6px', borderRadius: 4, fontWeight: 700, letterSpacing: '.08em',
                            background: it.status === 'live' ? 'rgba(34,197,94,.15)' : it.status === 'optie' ? `${BRAND}1f` : `${GOLD}26`,
                            color: it.status === 'live' ? 'var(--green)' : it.status === 'optie' ? BRAND : GOLD,
                        }}>{(it.status as string).toUpperCase()}</span>
                    </div>
                ))}
            </div>
        </MetalCard>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   AI INSIGHTS PANEL
   ═══════════════════════════════════════════════════════════════════ */
function AIInsightsPanel() {
    return (
        <MetalCard style={{ position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)` }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Sparkles size={14} style={{ color: GOLD }} />
                    <Eyebrow>AI insights</Eyebrow>
                </div>
                <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 3, background: `${GOLD}26`, color: GOLD, fontWeight: 700, letterSpacing: '.1em' }}>{AI_INSIGHTS.length} TIPS</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {AI_INSIGHTS.map(insight => <AIInsightCard key={insight.id} insight={insight} />)}
            </div>
        </MetalCard>
    );
}

function AIInsightCard({ insight }: { insight: typeof AI_INSIGHTS[0] }) {
    const colors = {
        critical: { bg: 'rgba(239,68,68,.06)', border: 'rgba(239,68,68,.25)', icon: 'var(--red)', label: 'Kritisch' },
        opportunity: { bg: `${BRAND}0d`, border: `${BRAND}33`, icon: BRAND, label: 'Kans' },
        info: { bg: `${GOLD}0a`, border: `${GOLD}26`, icon: GOLD, label: 'Info' },
    };
    const c = colors[insight.severity];
    return (
        <div style={{ padding: 12, borderRadius: 10, background: c.bg, border: `1px solid ${c.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div style={{ width: 26, height: 26, borderRadius: 7, background: 'rgba(0,0,0,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <insight.Icon size={13} style={{ color: c.icon }} />
                </div>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.icon }} />
                <div style={{ fontSize: 11, color: c.icon, fontWeight: 600 }}>{c.label}</div>
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{insight.title}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5, marginBottom: 8 }}>{insight.body}</div>
            <div style={{ fontSize: 11, color: c.icon, fontStyle: 'italic', marginBottom: 10 }}>→ {insight.suggestion}</div>
            <button style={{
                width: '100%', padding: '7px 10px', borderRadius: 6,
                background: 'rgba(0,0,0,.3)', border: `1px solid ${c.border}`,
                color: c.icon, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
                {insight.action} <ArrowRight size={11} />
            </button>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   EVENT DETAIL DRAWER
   ═══════════════════════════════════════════════════════════════════ */
function EventDetailDrawer({ event, onClose }: { event: AgendaEvent | null; onClose: () => void }) {
    if (!event) return null;
    const cal = calById(event.calId);
    return (
        <>
            <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(4px)', zIndex: 9998 }} />
            <aside style={{ position: 'fixed', right: 0, top: 0, height: '100vh', width: 580, maxWidth: '100vw', background: 'var(--color-bg-elevated)', borderLeft: '1px solid var(--border)', zIndex: 9999, boxShadow: '-20px 0 40px rgba(0,0,0,.4)', display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
                <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', background: `linear-gradient(180deg, ${cal.color}15, transparent)`, position: 'relative' }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${cal.color}, transparent)` }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                        <div style={{ minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                <span style={{ padding: '2px 7px', borderRadius: 4, fontSize: 9, fontWeight: 700, letterSpacing: '.1em', background: `${cal.color}22`, color: cal.color, border: `1px solid ${cal.color}40` }}>{cal.label.toUpperCase()}</span>
                                {event.status && <span style={{ padding: '2px 7px', borderRadius: 4, fontSize: 9, fontWeight: 700, letterSpacing: '.1em', background: 'rgba(0,0,0,.3)', color: 'var(--text)' }}>{(event.status as string).toUpperCase()}</span>}
                                {event.critical && <span style={{ padding: '2px 7px', borderRadius: 4, fontSize: 9, fontWeight: 700, letterSpacing: '.1em', background: 'rgba(239,68,68,.15)', color: 'var(--red)' }}>CRITICAL</span>}
                            </div>
                            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 24, fontWeight: 300, letterSpacing: '-.01em' }}>{event.title}</div>
                            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                                {String(Math.floor(event.start)).padStart(2, '0')}:{event.start % 1 ? '30' : '00'} · {event.duration}u · maart {event.day}, 2025
                            </div>
                        </div>
                        <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: 8, background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <X size={16} />
                        </button>
                    </div>
                </div>
                <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {event.client && <FactRow label="Klant" value={event.client} />}
                    {event.guests && <FactRow label="Gasten" value={`${event.guests}p`} />}
                    {event.venue && <FactRow label="Locatie" value={event.venue} Icon={MapPin} />}
                    {event.revenue && <FactRow label="Omzet" value={fmtEur(event.revenue)} Icon={Euro} highlight />}
                    {event.package && <FactRow label="Pakket" value={event.package} />}
                    {event.cuts && <FactRow label="Vleeswaar" value={event.cuts} />}
                    {event.target && <FactRow label="Target" value={event.target} />}
                    {event.wood && <FactRow label="Hout" value={event.wood} />}
                    {event.staff && <FactRow label="Team" value={(event.staff as string[]).join(', ')} Icon={Users} />}
                    {event.supplier && <FactRow label="Leverancier" value={event.supplier} Icon={Truck} />}
                    {event.amount && <FactRow label="Bedrag" value={fmtEur(event.amount)} />}
                    {event.kind && <FactRow label="Type" value={event.kind} />}

                    {event.conflict && (
                        <div style={{ padding: 12, borderRadius: 10, background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.25)' }}>
                            <Eyebrow style={{ color: 'var(--red)', marginBottom: 4 }}>Conflict</Eyebrow>
                            <div style={{ fontSize: 12, color: 'var(--text)' }}>{event.conflict.note || event.conflict}</div>
                        </div>
                    )}
                    {event.conflictNote && (
                        <div style={{ padding: 12, borderRadius: 10, background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.25)' }}>
                            <Eyebrow style={{ color: 'var(--red)', marginBottom: 4 }}>Capaciteit-warning</Eyebrow>
                            <div style={{ fontSize: 12, color: 'var(--text)' }}>{event.conflictNote}</div>
                        </div>
                    )}

                    <div style={{ marginTop: 14, padding: 14, borderRadius: 10, background: `${GOLD}0d`, border: `1px solid ${GOLD}26` }}>
                        <Eyebrow style={{ marginBottom: 8 }}>Gerelateerd</Eyebrow>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <a href="/prep-counter" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text)', textDecoration: 'none' }}>
                                <ClipboardList size={14} style={{ color: GOLD }} />
                                Open prep planning
                            </a>
                            {/* Service-deeplink: koppel agenda-event aan een service-mock-event als titel matcht */}
                            <a
                                href={(() => {
                                    /* Match op event-naam keywords → mock event-id */
                                    const t = (event.title || '').toLowerCase();
                                    if (t.includes('bruiloft') || t.includes('singraven') || t.includes('joost') || t.includes('liane')) return '/service?eventId=evt_singraven';
                                    if (t.includes('techcorp') || t.includes('bedrijfsfeest')) return '/service?eventId=evt_techcorp';
                                    if (t.includes('berghuis') || t.includes('verjaardag') || t.includes('familie')) return '/service?eventId=evt_berghuis';
                                    return '/service';
                                })()}
                                style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text)', textDecoration: 'none' }}
                            >
                                <PartyPopper size={14} style={{ color: GOLD }} />
                                Open Service Mode →
                            </a>
                            <a href="/voorraad" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text)', textDecoration: 'none' }}>
                                <Check size={14} style={{ color: GOLD }} />
                                Check voorraad-status
                            </a>
                        </div>
                    </div>
                </div>
            </aside>
        </>
    );
}

function FactRow({ label, value, Icon, highlight }: { label: string; value: React.ReactNode; Icon?: any; highlight?: boolean }) {
    return (
        <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 12, padding: '10px 12px', borderRadius: 8, background: highlight ? `${GOLD}0a` : 'transparent', border: `1px solid ${highlight ? `${GOLD}26` : 'var(--border)'}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--muted)', letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 600 }}>
                {Icon && <Icon size={12} />}
                {label}
            </div>
            <div style={{ fontSize: 13, color: highlight ? GOLD : 'var(--text)', fontWeight: highlight ? 600 : 500 }}>{value}</div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════════════ */
/* Parse "HH:MM" of "HH:MM:SS" naar uren-decimaal. Default 17 als ontbrekend. */
function parseTimeToHours(t: string | null | undefined, fallback: number): number {
    if (!t) return fallback;
    const m = t.match(/^(\d{1,2}):(\d{2})/);
    if (!m) return fallback;
    return parseInt(m[1], 10) + parseInt(m[2], 10) / 60;
}

/* Map een DB event naar het AgendaEvent shape dat dit page intern gebruikt. */
function mapDbEventToAgendaEvent(e: DbEvent): AgendaEvent {
    const [, , dd] = (e.date || '').split('-');
    const day = parseInt(dd || '1', 10);
    const guests = e.guests || 0;
    const omzet = guests * (e.ppp || 0);
    const start = parseTimeToHours(e.start_time, 17);
    const end = parseTimeToHours(e.end_time, start + (guests > 80 ? 8 : 6));
    const duration = Math.max(0.5, end - start);
    return ev(
        'evt_' + e.id,
        'events',
        day,
        start,
        duration,
        e.name + (guests ? ' ' + guests + 'p' : ''),
        {
            client: e.client_naam || '—',
            guests,
            type: e.type || 'Event',
            venue: e.location || '—',
            revenue: omzet,
            status: e.status || 'pending',
            dbId: e.id,
            dbDate: e.date,
            startTime: e.start_time,
            endTime: e.end_time,
        }
    );
}

/* Map prep_tasks naar het AgendaEvent prep-shape, tenzij geen event_id of geen text. */
function mapPrepTaskToAgendaEvent(p: PrepTask, eventDateMap: Record<number, string>): AgendaEvent | null {
    const eventDate = eventDateMap[p.event_id];
    if (!eventDate) return null;
    /* dagen is offset t.o.v. event-datum (negatief = vooraf, positief = erna) */
    const dt = new Date(eventDate);
    dt.setDate(dt.getDate() + (p.dagen || 0));
    return ev(
        'pt_' + p.id,
        'prep',
        dt.getDate(),
        8,
        1,
        p.text || 'Prep-taak',
        {
            for: 'evt_' + p.event_id,
            critical: false,
            done: !!p.done,
            dbDate: dt.toISOString().slice(0, 10),
        }
    );
}

export default function Agenda() {
    const today = new Date();
    const [viewYear, setViewYear] = useState(today.getFullYear());
    const [viewMonth, setViewMonth] = useState(today.getMonth());
    const [activeCals, setActiveCals] = useState<string[]>(CALENDARS.map(c => c.id));
    const [view, setView] = useState<'month' | 'week' | 'list'>('month');
    const [selectedEvent, setSelectedEvent] = useState<AgendaEvent | null>(null);

    const { data: dbEvents } = useSupabase<DbEvent>('events', []);
    const { data: prepTasks } = useSupabase<PrepTask>('prep_tasks', []);

    const toggleCal = (id: string) => setActiveCals(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

    /* Filter DB events op de zichtbare maand, map naar AgendaEvent shape. */
    const monthPrefix = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`;
    const monthDbEvents = useMemo(() => dbEvents.filter(e => (e.date || '').startsWith(monthPrefix)), [dbEvents, monthPrefix]);
    const dbAgendaEvents = useMemo(() => monthDbEvents.map(mapDbEventToAgendaEvent), [monthDbEvents]);

    /* Prep-taken alleen voor events in de huidige maand. */
    const eventDateMap = useMemo(() => {
        const m: Record<number, string> = {};
        for (const e of dbEvents) m[e.id] = e.date;
        return m;
    }, [dbEvents]);
    const dbPrepEvents = useMemo(() => {
        const list: AgendaEvent[] = [];
        for (const p of prepTasks) {
            const mapped = mapPrepTaskToAgendaEvent(p, eventDateMap);
            if (mapped && mapped.dbDate && mapped.dbDate.startsWith(monthPrefix)) list.push(mapped);
        }
        return list;
    }, [prepTasks, eventDateMap, monthPrefix]);

    /* Demo-fallback: alleen tonen als er nog géén echte events zijn. */
    const usingDemoData = dbEvents.length === 0;
    const allEvents: AgendaEvent[] = useMemo(() => {
        if (usingDemoData) return DEMO_FALLBACK_EVENTS;
        return [...dbAgendaEvents, ...dbPrepEvents];
    }, [usingDemoData, dbAgendaEvents, dbPrepEvents]);

    /* KPIs uit echte data. */
    const conflicts = useMemo(() => {
        if (usingDemoData) return [];
        return detectAllConflicts(dbEvents).conflicts;
    }, [dbEvents, usingDemoData]);

    const kpis: AgendaKpis = useMemo(() => {
        if (usingDemoData) {
            return { upcoming30d: 7, revenuePipeline: 51870, revenuePipelineConfirmed: 47820, conflicts: 1, freeWeekendsLeft: 2, usingDemoData: true };
        }
        const now = new Date();
        const horizon = new Date(); horizon.setDate(horizon.getDate() + 30);
        const horizonIso = horizon.toISOString().slice(0, 10);
        const todayIso = now.toISOString().slice(0, 10);
        const upcoming = dbEvents.filter(e => e.date && e.date.slice(0, 10) >= todayIso && e.date.slice(0, 10) <= horizonIso);
        /* Case-insensitive status-match — DB-status kan 'confirmed' / 'Confirmed' / 'bevestigd' staan
           afhankelijk van waar het event vandaan komt (acceptance-workflow vs handmatig). */
        const isConfirmed = (s: string) => {
            const x = (s || '').toLowerCase();
            return x === 'confirmed' || x === 'completed' || x === 'bevestigd';
        };
        const upcomingConfirmed = upcoming.filter(e => isConfirmed(e.status));
        const pipeline = upcoming.reduce((s, e) => s + (e.guests || 0) * (e.ppp || 0), 0);
        const pipelineConfirmed = upcomingConfirmed.reduce((s, e) => s + (e.guests || 0) * (e.ppp || 0), 0);
        /* Vrije weekends: in deze maand, weekend-dagen zonder event. */
        const totalDays = daysInMonth(viewYear, viewMonth);
        const monthEventDays = new Set(monthDbEvents.map(e => parseInt((e.date || '').split('-')[2] || '0', 10)));
        let freeWeekends = 0;
        for (let d = 1; d <= totalDays; d++) {
            const dow = new Date(viewYear, viewMonth, d).getDay();
            if ((dow === 0 || dow === 6) && !monthEventDays.has(d)) freeWeekends++;
        }
        return {
            upcoming30d: upcomingConfirmed.length,
            revenuePipeline: pipeline,
            revenuePipelineConfirmed: pipelineConfirmed,
            conflicts: conflicts.length,
            freeWeekendsLeft: Math.floor(freeWeekends / 2), /* zaterdag+zondag = 1 weekend */
            usingDemoData: false,
        };
    }, [dbEvents, monthDbEvents, conflicts, viewYear, viewMonth, usingDemoData]);

    /* UPCOMING-rail uit live data; demo-fallback bij lege DB. */
    const upcomingList = useMemo(() => {
        if (usingDemoData) return UPCOMING;
        const todayIso = new Date().toISOString().slice(0, 10);
        return dbEvents
            .filter(e => e.date >= todayIso)
            .sort((a, b) => a.date.localeCompare(b.date))
            .slice(0, 8)
            .map(e => ({
                day: parseInt((e.date || '').split('-')[2] || '0', 10),
                name: e.name,
                guests: e.guests || 0,
                time: e.start_time ? e.start_time.slice(0, 5) : '—',
                revenue: (e.guests || 0) * (e.ppp || 0),
                status: e.status,
                emoji: e.type?.toLowerCase().includes('bruiloft') ? '💍' : e.type?.toLowerCase().includes('bedrijf') ? '🏢' : '🍖',
                dbId: e.id,
                dbDate: e.date,
            }));
    }, [dbEvents, usingDemoData]);

    function shiftMonth(delta: number) {
        let m = viewMonth + delta;
        let y = viewYear;
        if (m < 0) { m = 11; y--; }
        if (m > 11) { m = 0; y++; }
        setViewMonth(m); setViewYear(y);
    }

    return (
        <div style={{ padding: '24px 32px 100px', maxWidth: 1600, margin: '0 auto' }}>
            <AgendaHero kpis={kpis} onAiClick={() => document.getElementById('ai-rail-anchor')?.scrollIntoView({ behavior: 'smooth' })} />

            <div style={{ height: 18 }} />
            <MonthNav
                view={view}
                setView={setView}
                monthLabel={`${NL_MONTHS[viewMonth]} ${viewYear}`}
                onPrev={() => shiftMonth(-1)}
                onNext={() => shiftMonth(1)}
                onToday={() => { const now = new Date(); setViewYear(now.getFullYear()); setViewMonth(now.getMonth()); }}
            />
            <div style={{ height: 18 }} />

            <div className="agenda-grid">
                <div>
                    <CalendarLegend active={activeCals} onToggle={toggleCal} />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                    {view === 'month' && (
                        <MonthGrid year={viewYear} month={viewMonth} activeCals={activeCals} events={allEvents} onSelectEvent={setSelectedEvent} />
                    )}
                    {view !== 'month' && (
                        <MetalCard style={{ padding: 60, textAlign: 'center' }}>
                            {view === 'week' ? <Columns3 size={48} style={{ color: 'var(--muted-weak)' }} /> : <ListIcon size={48} style={{ color: 'var(--muted-weak)' }} />}
                            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 22, fontWeight: 300, marginTop: 16, color: 'var(--text)' }}>
                                {view === 'week' ? 'Week-view' : 'Lijst-view'}
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
                                Coming soon — focus deze ronde was de maand-grid
                            </div>
                        </MetalCard>
                    )}
                    {usingDemoData && <SmokerSchedule smokes={SMOKER_DATA} />}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                    <span id="ai-rail-anchor" />
                    <UpcomingList items={upcomingList as any} onSelect={(it: any) => {
                        if (usingDemoData) {
                            const ev = EVENTS_DATA.find(e => e.day === it.day);
                            if (ev) setSelectedEvent(ev);
                        } else if (it.dbId) {
                            const ev = dbAgendaEvents.find(e => e.dbId === it.dbId);
                            if (ev) setSelectedEvent(ev);
                        }
                    }} />
                    {usingDemoData && <AIInsightsPanel />}
                    {!usingDemoData && conflicts.length > 0 && (
                        <MetalCard>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                                <AlertTriangle size={14} style={{ color: 'var(--red)' }} />
                                <Eyebrow style={{ color: 'var(--red)' }}>Live conflicten</Eyebrow>
                            </div>
                            {conflicts.map((c, i) => (
                                <div key={i} style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.18)', marginBottom: 6, fontSize: 11, color: 'var(--text)', lineHeight: 1.45 }}>
                                    {c.note}
                                </div>
                            ))}
                        </MetalCard>
                    )}
                </div>
            </div>

            <EventDetailDrawer event={selectedEvent} onClose={() => setSelectedEvent(null)} />
        </div>
    );
}
