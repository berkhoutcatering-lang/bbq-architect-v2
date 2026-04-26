/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import { useState, useEffect, useMemo } from 'react';
import {
    Sparkles, LayoutGrid, Film, Clock, AlertTriangle, AlertCircle, Check,
    X, Pause, Flame, ArrowRight,
} from 'lucide-react';

const GOLD = '#c4a35a';
const BRAND = '#FFBF00';
const NOW_SIM = '17:42';

/* ═══════════════════════════════════════════════════════════════════
   SERVICE DATA — mock event "Bedrijfsfeest TechCorp"
   ═══════════════════════════════════════════════════════════════════ */

const SERVICE_EVENT = {
    id: 'techcorp-vrijdag',
    client: 'TechCorp',
    title: 'Bedrijfsfeest · TechCorp',
    date: 'Vrijdag 30 mei',
    guests: 80,
    vegetarian: 12,
    allergies: [
        { table: 3, person: 'Maaike', issue: 'Pinda-allergie', severity: 'critical' as const },
        { table: 5, person: 'Tom', issue: 'Glutenvrij', severity: 'must' as const },
        { table: 7, person: 'Sara', issue: 'Lactose-intolerant', severity: 'must' as const },
    ],
    startTime: '17:00',
    endTime: '22:00',
    pauseStart: '19:00',
    pauseEnd: '20:15',
    venue: 'Eventlocatie De Loods · Utrecht',
    service: 'Walking dinner / buffet hybride',
};

interface Dish {
    name: string; portions: number; emoji: string; hue: number;
    plating: string; allergens: string[]; warning?: string;
}

interface MiseItem { id: string; label: string; critical?: boolean; done: boolean; smokerLink?: boolean }
interface TimelineItem { time: string; label: string; done: boolean; isStart?: boolean; isEnd?: boolean; critical?: boolean }
interface Course {
    id: string; number: number | null; title: string; subtitle: string; serveAt: string;
    duration: number; status: 'upcoming' | 'prep' | 'active' | 'done' | 'pause'; isPause?: boolean;
    foodHue: number | null; heroEmoji: string; heroDescription?: string;
    countdown: { label: string; target: string; state: string };
    dishes?: Dish[];
    miseChecklist?: MiseItem[];
    timeline?: TimelineItem[];
    aiCoach?: { tip: string; severity: 'critical' | 'high' | 'normal' | 'low' };
    smokerStatus?: { active: boolean; item: string; temp: number; target: number; domeTemp: number; etaMinutes: number; wood: string } | null;
}

const COURSES: Course[] = [
    {
        id: 'g1', number: 1, title: 'Welkomst-bites', subtitle: 'Walking · 17:00–18:00',
        serveAt: '17:00', duration: 60, status: 'active', foodHue: 22, heroEmoji: '🌮',
        heroDescription: 'Mini pulled pork sliders met hoisin-mayo + coleslaw shooters in shotglas',
        countdown: { label: 'GANG 1 SERVICE', target: '17:00', state: 'live' },
        dishes: [
            { name: 'Pulled pork slider', portions: 160, emoji: '🥪', hue: 22, plating: 'Mini brioche bun · pulled pork 60g · hoisin-mayo · coleslaw · pickled onion · op leisteen', allergens: ['gluten', 'ei', 'mosterd'] },
            { name: 'Coleslaw shooter', portions: 80, emoji: '🥗', hue: 80, plating: 'Shotglas · coleslaw 30g · drizzle hot sauce · zwarte sesam · munt', allergens: ['ei', 'mosterd'] },
        ],
        miseChecklist: [
            { id: 'm1-1', label: 'Pulled pork in cambro warm (>65°C)', critical: true, done: true },
            { id: 'm1-2', label: '160 brioche bun aangesneden', done: true },
            { id: 'm1-3', label: 'Hoisin-mayo in 4 squeeze flessen', done: true },
            { id: 'm1-4', label: '80 shotglazen op planken', done: true },
            { id: 'm1-5', label: 'Coleslaw uit koeling 15 min vooraf', done: true },
            { id: 'm1-6', label: 'Pickled onion in inox bakje', done: true },
            { id: 'm1-7', label: 'Hot sauce squeeze flessen × 4', done: false },
            { id: 'm1-8', label: 'Leisteen planken × 8 op service-line', done: false },
        ],
        timeline: [
            { time: '16:30', label: 'Pulled pork uit smoker → cambro', done: true },
            { time: '16:45', label: 'Pulled vlees plukken (warm houden)', done: true },
            { time: '17:00', label: '🎬 SERVICE START · runners hand-out', done: false, isStart: true },
            { time: '17:15', label: 'Eerste round bijvullen check', done: false },
            { time: '17:45', label: 'Last call welcome bites', done: false },
            { time: '18:00', label: 'Service-line wisselen naar gang 2', done: false, isEnd: true },
        ],
        aiCoach: { tip: 'Over 18 min komt aankomst-piek (75% gasten 17:18-17:35). Zet nu 4 extra slider-planken klaar.', severity: 'high' },
        smokerStatus: null,
    },
    {
        id: 'g2', number: 2, title: 'Hoofdgang BBQ buffet', subtitle: 'Buffet · 18:00–19:00',
        serveAt: '18:00', duration: 60, status: 'prep', foodHue: 14, heroEmoji: '🥩',
        heroDescription: 'Smoked brisket gesneden · short ribs glazed · 3 sides · sauzenbar',
        countdown: { label: 'GANG 2 SERVICE', target: '18:00', state: 'upcoming' },
        dishes: [
            { name: 'Smoked brisket', portions: 80, emoji: '🥩', hue: 12, plating: 'Slices van 1.5cm · point + flat mix · grof zout · BBQ saus apart', allergens: [] },
            { name: 'Short ribs glazed', portions: 80, emoji: '🍖', hue: 8, plating: '1 rib per gast · BBQ glaze · sesamzaad · lente-ui', allergens: ['sesam'] },
            { name: 'Mac & cheese', portions: 80, emoji: '🧀', hue: 45, plating: 'GN-tray heet uit oven · breadcrumb topping · bieslook', allergens: ['gluten', 'lactose'] },
            { name: 'Cornbread', portions: 80, emoji: '🍞', hue: 50, plating: 'In vierkanten · honingboter pot ernaast', allergens: ['gluten', 'ei', 'lactose'] },
            { name: 'Coleslaw', portions: 80, emoji: '🥗', hue: 80, plating: 'Inox bak · 2 tongs · munt en koriander gehakt', allergens: ['ei', 'mosterd'] },
        ],
        miseChecklist: [
            { id: 'm2-1', label: 'Brisket in smoker (96°C internal — wachten)', critical: true, done: false, smokerLink: true },
            { id: 'm2-2', label: 'Short ribs glaze opwarmen', done: false },
            { id: 'm2-3', label: 'Mac & cheese in oven 180°C 15 min vóór 18:00', done: false },
            { id: 'm2-4', label: 'Cornbread snijden + honingboter', done: false },
            { id: 'm2-5', label: 'Bain-maries op temperatuur (>65°C)', critical: true, done: true },
            { id: 'm2-6', label: 'BBQ saus warm in dipper × 3', done: true },
            { id: 'm2-7', label: 'Snijplanken brisket × 2 + slicer scherp', done: true },
            { id: 'm2-8', label: 'Borden 80st voorverwarmd', done: false },
        ],
        timeline: [
            { time: '01:00', label: 'Brisket op smoker (start nacht-cyclus)', done: true },
            { time: '17:30', label: 'Brisket verwacht klaar (96°C internal)', done: false, critical: true },
            { time: '17:35', label: 'Brisket rust in cambro', done: false },
            { time: '17:45', label: 'Mac & cheese in oven', done: false },
            { time: '17:55', label: 'Brisket snijden start', done: false },
            { time: '18:00', label: '🎬 BUFFET OPEN', done: false, isStart: true },
            { time: '18:30', label: 'Bijvul-check brisket + sides', done: false },
            { time: '18:55', label: 'Last call hoofdgang', done: false },
            { time: '19:00', label: 'Buffet sluiten · pauze speeches', done: false, isEnd: true },
        ],
        aiCoach: { tip: 'Brisket internal nu 91°C, moet naar 96°C. Verwacht klaar 17:35 — perfect voor service 18:00. Begin mac & cheese om 17:45.', severity: 'normal' },
        smokerStatus: { active: true, item: 'Brisket 25kg', temp: 91, target: 96, domeTemp: 110, etaMinutes: 12, wood: 'Pecan + post oak' },
    },
    {
        id: 'pause', number: null, title: 'PAUZE · Speeches & live band', subtitle: '19:00–20:15 · Geen service',
        serveAt: '19:00', duration: 75, status: 'pause', isPause: true, foodHue: null, heroEmoji: '🎤',
        countdown: { label: 'TUSSEN PAUZE', target: '20:15', state: 'upcoming' },
        aiCoach: { tip: 'Tijdens pauze: smoker satay-sticks opzetten 19:30 (45 min cycle voor avondhap). Buffet schoonmaken, glazen wisselen.', severity: 'low' },
        timeline: [
            { time: '19:00', label: 'Buffet weg · stilte voor speech', done: false, isStart: true },
            { time: '19:15', label: 'CEO speech', done: false },
            { time: '19:30', label: 'SATAY OP DE SMOKER (avondhap prep)', done: false, critical: true },
            { time: '19:45', label: 'Live band start', done: false },
            { time: '20:15', label: 'Avondhap GAAT LIVE', done: false, isEnd: true },
        ],
    },
    {
        id: 'g3', number: 3, title: 'Avondhap', subtitle: 'Walking · 20:15–21:30',
        serveAt: '20:15', duration: 75, status: 'upcoming', foodHue: 28, heroEmoji: '🍢',
        heroDescription: 'Smoked chicken satay · steamed bao buns met pulled pork · loaded nachos',
        countdown: { label: 'GANG 3 START', target: '20:15', state: 'upcoming' },
        dishes: [
            { name: 'Chicken satay', portions: 160, emoji: '🍢', hue: 28, plating: '2 sticks per gast · pindasaus warm · zwarte sesam · lente-ui', allergens: ['pinda', 'soja', 'sesam'], warning: 'BEVAT PINDA — Tafel 3 (Maaike) ALLERGISCH' },
            { name: 'Bao bun pulled pork', portions: 80, emoji: '🥟', hue: 30, plating: 'Gestoomde bao · pulled pork 50g · hoisin · komkommer · koriander', allergens: ['gluten', 'soja'] },
            { name: 'Loaded nachos', portions: 80, emoji: '🌽', hue: 35, plating: 'Tortillas · cheddar gesmolten · jalapeño · mango-habanero · zure room', allergens: ['lactose'] },
        ],
        miseChecklist: [
            { id: 'm3-1', label: 'Satay sticks op smoker 19:30 (45 min)', critical: true, done: false, smokerLink: true },
            { id: 'm3-2', label: 'Pindasaus opwarmen au-bain-marie', done: false },
            { id: 'm3-3', label: 'Bao buns stomen 5 min vóór service', done: false },
            { id: 'm3-4', label: 'Pulled pork warm houden', done: false },
            { id: 'm3-5', label: 'Tortillas frituren + warm', done: false },
            { id: 'm3-6', label: 'Komkommer julienne snijden', done: false },
            { id: 'm3-7', label: 'GLUTENVRIJE OPTIE Tom (T5)', critical: true, done: false },
        ],
        timeline: [
            { time: '19:30', label: 'Satay op smoker', done: false, critical: true },
            { time: '20:00', label: 'Bao buns stoom-set start', done: false },
            { time: '20:10', label: 'Pindasaus check', done: false },
            { time: '20:15', label: '🎬 AVONDHAP LIVE', done: false, isStart: true },
            { time: '20:45', label: 'Bijvul-check satay', done: false },
            { time: '21:25', label: 'Last call avondhap', done: false },
            { time: '21:30', label: 'Wissel naar dessert', done: false, isEnd: true },
        ],
        aiCoach: { tip: '⚠ Maaike (T3) heeft pinda-allergie. Maak satay-portie zonder pindasaus apart op aparte plank. Tom (T5) glutenvrij — bao bun is GEEN optie, maak rijst-bowl variant.', severity: 'critical' },
    },
    {
        id: 'g4', number: 4, title: 'Dessert', subtitle: 'Plated · 21:30–22:00',
        serveAt: '21:30', duration: 30, status: 'upcoming', foodHue: 320, heroEmoji: '🍰',
        heroDescription: 'Smoked cheesecake met bourbon-karamel · gepocheerde peer · espresso',
        countdown: { label: 'DESSERT', target: '21:30', state: 'upcoming' },
        dishes: [
            { name: 'Smoked cheesecake', portions: 80, emoji: '🍰', hue: 45, plating: 'Plak · bourbon-karamel · gekonfijte peer · sea salt · mascarpone quenelle', allergens: ['gluten', 'ei', 'lactose'] },
            { name: 'Espresso (vrij)', portions: 80, emoji: '☕', hue: 20, plating: 'Demitasse + suiker + melk · te bestellen aan tafel', allergens: [] },
        ],
        miseChecklist: [
            { id: 'm4-1', label: 'Cheesecake uit koeling 30 min vooraf', done: false },
            { id: 'm4-2', label: 'Bourbon-karamel warm in dipper', done: false },
            { id: 'm4-3', label: 'Peren confijten 21:00', done: false },
            { id: 'm4-4', label: 'Mascarpone quenelles vooruit', done: false },
            { id: 'm4-5', label: 'Espresso machine op temp', done: false },
        ],
        timeline: [
            { time: '21:00', label: 'Dessert mise start', done: false },
            { time: '21:15', label: 'Quenelles + plating prep', done: false },
            { time: '21:30', label: '🎬 DESSERT SERVICE', done: false, isStart: true },
            { time: '22:00', label: 'Service einde · debrief', done: false, isEnd: true },
        ],
        aiCoach: { tip: 'Sara (T7) lactose-intolerant — desserts zijn allemaal lactose. Reserve sorbet-bol als alternatief.', severity: 'critical' },
    },
];

/* ═══════════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════════ */
function minsBetween(a: string, b: string): number {
    const [ah, am] = a.split(':').map(Number);
    const [bh, bm] = b.split(':').map(Number);
    return (bh * 60 + bm) - (ah * 60 + am);
}

function useLiveCountdown(target: string) {
    const [secs, setSecs] = useState(() => minsBetween(NOW_SIM, target) * 60);
    useEffect(() => {
        const i = setInterval(() => setSecs(s => s - 1), 1000);
        return () => clearInterval(i);
    }, []);
    const abs = Math.abs(secs);
    return {
        h: Math.floor(abs / 3600), m: Math.floor((abs % 3600) / 60), s: abs % 60,
        past: secs < 0, total: secs,
    };
}

/* ═══════════════════════════════════════════════════════════════════
   ATOMS
   ═══════════════════════════════════════════════════════════════════ */
function Eyebrow({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
    return <div style={{ fontSize: 9, letterSpacing: '.2em', color: 'var(--muted-light)', fontWeight: 700, textTransform: 'uppercase', ...style }}>{children}</div>;
}

function MetalCard({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
    return <div style={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--border)', borderRadius: 14, padding: 18, ...style }}>{children}</div>;
}

function BtnPrimary({ children, icon: I, onClick, style }: { children: React.ReactNode; icon?: any; onClick?: () => void; style?: React.CSSProperties }) {
    return (
        <button onClick={onClick} style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 8,
            background: `linear-gradient(180deg, ${GOLD}, #9e781c)`, color: '#0a0a0c',
            fontWeight: 600, fontSize: 13, border: 'none', cursor: 'pointer', ...style,
        }}>
            {I && <I size={14} />}
            {children}
        </button>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   FOOD HERO
   ═══════════════════════════════════════════════════════════════════ */
function FoodHero({ course, height = 220 }: { course: Course; height?: number }) {
    const grain = useMemo(() => {
        const lines = [];
        for (let i = 0; i < 18; i++) lines.push({ y: 4 + i * 5.5 + (i * 13 % 5), x1: 4 + (i * 7 % 6), x2: 96 - (i * 11 % 7), opacity: 0.04 + (i % 3) * 0.025 });
        return lines;
    }, []);
    return (
        <div style={{
            position: 'relative', height, borderRadius: 16, overflow: 'hidden',
            background: course.foodHue !== null
                ? `linear-gradient(135deg, hsl(${course.foodHue} 60% 32%), hsl(${course.foodHue} 50% 20%) 60%, hsl(${course.foodHue + 18} 40% 16%))`
                : 'linear-gradient(135deg, #2a2440, #1a1226)',
            boxShadow: 'inset 0 0 60px rgba(0,0,0,.5), 0 6px 24px rgba(0,0,0,.4)',
        }}>
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
                {grain.map((g, i) => (
                    <path key={i} d={`M ${g.x1} ${g.y} Q 50 ${g.y + (i % 2 ? 3 : -3)}, ${g.x2} ${g.y}`} fill="none" stroke="rgba(0,0,0,.5)" strokeWidth="0.4" opacity={g.opacity} />
                ))}
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: height * 0.5, filter: 'drop-shadow(0 6px 18px rgba(0,0,0,.5))' }}>{course.heroEmoji}</div>
            <div style={{ position: 'absolute', top: 14, left: 16, right: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    {course.number && (
                        <div style={{ fontSize: 9, letterSpacing: '.25em', fontWeight: 700, color: 'rgba(255,255,255,.6)', marginBottom: 4 }}>GANG {course.number} · {course.subtitle}</div>
                    )}
                    <h2 style={{ margin: 0, fontFamily: 'Outfit, sans-serif', fontWeight: 300, fontSize: 28, color: '#fff', letterSpacing: '-.01em', textShadow: '0 2px 8px rgba(0,0,0,.4)' }}>{course.title}</h2>
                </div>
                {course.status === 'active' && (
                    <span style={{ padding: '4px 10px', borderRadius: 6, background: 'rgba(34,197,94,.95)', color: '#000', fontSize: 9, letterSpacing: '.25em', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#000' }} /> LIVE
                    </span>
                )}
                {course.status === 'prep' && <span style={{ padding: '4px 10px', borderRadius: 6, background: `${BRAND}f2`, color: '#000', fontSize: 9, letterSpacing: '.25em', fontWeight: 700 }}>MISE</span>}
            </div>
            {course.heroDescription && (
                <div style={{ position: 'absolute', bottom: 14, left: 16, right: 16, fontSize: 12, color: 'rgba(255,255,255,.85)', textShadow: '0 1px 4px rgba(0,0,0,.6)', lineHeight: 1.4 }}>{course.heroDescription}</div>
            )}
        </div>
    );
}

function BigCountdown({ target, label }: { target: string; label: string }) {
    const { h, m, s, past, total } = useLiveCountdown(target);
    const isLive = past && Math.abs(total) < 3600;
    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minWidth: 220 }}>
            <Eyebrow>{isLive ? 'LIVE · GESTART' : past ? 'AFGEROND' : label}</Eyebrow>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, fontFamily: 'Outfit, sans-serif', fontWeight: 200, color: isLive ? 'var(--green)' : past ? 'var(--muted)' : 'var(--text)', marginTop: 4 }}>
                {h > 0 && <><span style={{ fontSize: 56, lineHeight: 1 }}>{String(h).padStart(2, '0')}</span><span style={{ fontSize: 28, color: 'var(--muted)' }}>u</span></>}
                <span style={{ fontSize: 56, lineHeight: 1 }}>{String(m).padStart(2, '0')}</span>
                <span style={{ fontSize: 28, color: 'var(--muted)' }}>m</span>
                <span style={{ fontSize: 32, lineHeight: 1, color: 'var(--muted)' }}>{String(s).padStart(2, '0')}</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{past ? 'gestart om' : 'tot'} {target}</div>
        </div>
    );
}

function AICoach({ tip, severity = 'normal' }: { tip: string; severity?: 'critical' | 'high' | 'normal' | 'low' }) {
    const colors = {
        critical: { bg: 'rgba(239,68,68,.08)', border: 'rgba(239,68,68,.3)', icon: 'var(--red)', label: 'KRITISCH' },
        high: { bg: `${BRAND}14`, border: `${BRAND}4D`, icon: GOLD, label: 'NU DOEN' },
        normal: { bg: `${GOLD}0d`, border: `${GOLD}33`, icon: GOLD, label: 'AI COACH' },
        low: { bg: 'rgba(78,205,196,.05)', border: 'rgba(78,205,196,.2)', icon: '#4ECDC4', label: 'TIP' },
    };
    const c = colors[severity];
    return (
        <div style={{ padding: 14, borderRadius: 12, background: c.bg, border: `1px solid ${c.border}`, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, background: `linear-gradient(135deg, ${c.icon}, ${c.icon}80)`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 0 18px ${c.icon}40` }}>
                {severity === 'critical' ? <AlertTriangle size={16} style={{ color: '#000' }} /> : <Sparkles size={16} style={{ color: '#000' }} />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 9, letterSpacing: '.2em', fontWeight: 700, color: c.icon, marginBottom: 4 }}>{c.label}</div>
                <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.55 }}>{tip}</div>
            </div>
        </div>
    );
}

function SmokerWidget({ status }: { status: NonNullable<Course['smokerStatus']> }) {
    const pct = (status.temp / status.target) * 100;
    return (
        <div style={{ padding: 14, borderRadius: 12, background: `linear-gradient(135deg, ${BRAND}14, ${GOLD}08)`, border: `1px solid ${BRAND}40`, display: 'grid', gridTemplateColumns: '36px 1fr auto', gap: 12, alignItems: 'center' }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: `linear-gradient(135deg, ${BRAND}, ${GOLD})`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 0 14px ${BRAND}66` }}>
                <Flame size={18} style={{ color: '#000' }} />
            </div>
            <div>
                <div style={{ fontSize: 10, letterSpacing: '.2em', color: GOLD, fontWeight: 700 }}>SMOKER · {status.wood}</div>
                <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600, marginTop: 2 }}>{status.item}</div>
                <div style={{ marginTop: 6, height: 4, borderRadius: 2, background: 'rgba(255,255,255,.06)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: `linear-gradient(90deg, ${GOLD}, ${BRAND})`, transition: 'width .5s' }} />
                </div>
            </div>
            <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 400, fontSize: 22, lineHeight: 1, color: 'var(--text)' }}>{status.temp}°</div>
                <div style={{ fontSize: 9, color: 'var(--muted)', letterSpacing: '.15em' }}>→ {status.target}° · {status.etaMinutes}m</div>
            </div>
        </div>
    );
}

function DishCard({ dish, compact = false }: { dish: Dish; compact?: boolean }) {
    return (
        <div style={{ borderRadius: 12, overflow: 'hidden', background: 'rgba(28,28,32,.6)', border: '1px solid rgba(255,255,255,.06)', cursor: 'pointer' }}>
            <div style={{
                height: compact ? 80 : 110, background: `linear-gradient(135deg, hsl(${dish.hue} 55% 32%), hsl(${dish.hue} 45% 20%))`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: compact ? 36 : 50,
                filter: 'drop-shadow(0 3px 8px rgba(0,0,0,.4))', position: 'relative',
            }}>
                {dish.emoji}
                {dish.warning && <div style={{ position: 'absolute', top: 6, right: 6, padding: '2px 6px', borderRadius: 4, background: 'rgba(239,68,68,.9)', color: '#fff', fontSize: 8, fontWeight: 700, letterSpacing: '.1em' }}>⚠ ALLERGIE</div>}
            </div>
            <div style={{ padding: compact ? 8 : 12 }}>
                <div style={{ fontSize: compact ? 12 : 13, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>{dish.name}</div>
                <div style={{ fontSize: 10, color: 'var(--muted)' }}>{dish.portions} porties</div>
                {!compact && dish.allergens.length > 0 && (
                    <div style={{ marginTop: 6, display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                        {dish.allergens.map(a => (
                            <span key={a} style={{ fontSize: 9, padding: '1px 6px', borderRadius: 999, background: 'rgba(239,68,68,.08)', color: 'var(--red)', border: '1px solid rgba(239,68,68,.15)' }}>{a}</span>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

function CourseStrip({ courses, activeId, onSelect }: { courses: Course[]; activeId: string; onSelect: (id: string) => void }) {
    return (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${courses.length}, 1fr)`, gap: 8, padding: 8, borderRadius: 12, background: 'rgba(28,28,32,.4)', border: '1px solid var(--border)' }}>
            {courses.map(c => {
                const isActive = c.id === activeId;
                const isPause = c.isPause;
                const statusColor = c.status === 'active' ? 'var(--green)' : c.status === 'prep' ? GOLD : isPause ? '#a78bfa' : 'var(--muted)';
                const statusLabel = c.status === 'active' ? '● LIVE' : c.status === 'prep' ? '◐ MISE' : isPause ? '◷ PAUZE' : '○ STRAKS';
                return (
                    <button key={c.id} onClick={() => onSelect(c.id)} style={{
                        padding: 10, borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                        background: isActive ? (isPause ? 'rgba(167,139,250,.1)' : `linear-gradient(180deg, ${BRAND}1f, ${GOLD}0a)`) : 'transparent',
                        border: `1px solid ${isActive ? (isPause ? 'rgba(167,139,250,.3)' : `${GOLD}4D`) : 'transparent'}`,
                        color: 'var(--text)', display: 'flex', flexDirection: 'column', gap: 4,
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 18 }}>{c.heroEmoji}</span>
                            <span style={{ fontSize: 9, letterSpacing: '.15em', fontWeight: 700, color: statusColor }}>{statusLabel}</span>
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 600 }}>{c.number ? `Gang ${c.number}` : 'Pauze'} · {c.serveAt}</div>
                        <div style={{ fontSize: 10, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.title}</div>
                    </button>
                );
            })}
        </div>
    );
}

function MiseChecklist({ items, onToggle }: { items: MiseItem[]; onToggle: (id: string) => void }) {
    const doneCount = items.filter(i => i.done).length;
    const pct = items.length ? Math.round((doneCount / items.length) * 100) : 0;
    return (
        <MetalCard>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div>
                    <Eyebrow>Mise en place</Eyebrow>
                    <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 400, fontSize: 18, marginTop: 2 }}>{doneCount}/{items.length} klaar</div>
                </div>
                <div style={{ width: 60, height: 60, position: 'relative' }}>
                    <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
                        <circle cx="50" cy="50" r="40" stroke="rgba(255,255,255,.06)" strokeWidth="8" fill="none" />
                        <circle cx="50" cy="50" r="40" stroke={GOLD} strokeWidth="8" fill="none" strokeLinecap="round"
                            strokeDasharray={`${pct * 2.51} 251`} style={{ transition: '.5s' }} />
                    </svg>
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600 }}>{pct}%</div>
                </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {items.map(item => (
                    <div key={item.id} onClick={() => onToggle(item.id)} style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                        background: item.done ? 'rgba(34,197,94,.05)' : 'rgba(255,255,255,.02)',
                        border: `1px solid ${item.critical && !item.done ? 'rgba(239,68,68,.2)' : 'rgba(255,255,255,.04)'}`,
                    }}>
                        <div style={{
                            width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                            background: item.done ? 'var(--green)' : 'transparent',
                            border: `1.5px solid ${item.done ? 'var(--green)' : item.critical ? 'var(--red)' : 'var(--border)'}`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            {item.done && <Check size={12} style={{ color: '#000' }} />}
                        </div>
                        <span style={{ fontSize: 13, color: item.done ? 'var(--muted)' : 'var(--text)', textDecoration: item.done ? 'line-through' : 'none', flex: 1, lineHeight: 1.4 }}>{item.label}</span>
                        {item.critical && !item.done && <span style={{ fontSize: 8, padding: '2px 6px', borderRadius: 4, background: 'rgba(239,68,68,.1)', color: 'var(--red)', fontWeight: 700, letterSpacing: '.1em' }}>!</span>}
                        {item.smokerLink && <Flame size={12} style={{ color: GOLD }} />}
                    </div>
                ))}
            </div>
        </MetalCard>
    );
}

function CourseTimelineList({ timeline }: { timeline: TimelineItem[] }) {
    return (
        <MetalCard>
            <Eyebrow style={{ marginBottom: 12 }}>Battle plan</Eyebrow>
            <div style={{ position: 'relative', paddingLeft: 18 }}>
                <div style={{ position: 'absolute', left: 6, top: 8, bottom: 8, width: 2, background: 'rgba(255,255,255,.08)' }} />
                {timeline.map((t, i) => (
                    <div key={i} style={{ position: 'relative', paddingBottom: 14, paddingLeft: 14 }}>
                        <div style={{
                            position: 'absolute', left: -7, top: 4, width: 14, height: 14, borderRadius: '50%',
                            background: t.done ? 'var(--green)' : t.isStart ? GOLD : t.isEnd ? 'var(--red)' : 'rgba(28,28,32,1)',
                            border: `2px solid ${t.done ? 'var(--green)' : t.critical ? 'var(--red)' : 'var(--border)'}`,
                            boxShadow: t.isStart && !t.done ? `0 0 0 4px ${BRAND}26` : 'none',
                        }} />
                        <div style={{ fontSize: 10, fontFamily: 'Outfit, sans-serif', color: t.critical ? 'var(--red)' : 'var(--muted)', fontWeight: 700, letterSpacing: '.1em' }}>{t.time}</div>
                        <div style={{ fontSize: 12, color: t.done ? 'var(--muted)' : 'var(--text)', textDecoration: t.done ? 'line-through' : 'none', marginTop: 2, lineHeight: 1.4 }}>{t.label}</div>
                    </div>
                ))}
            </div>
        </MetalCard>
    );
}

function AllergyBanner() {
    return (
        <MetalCard>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div>
                    <Eyebrow>Allergieën deze service</Eyebrow>
                    <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 400, fontSize: 18, marginTop: 2 }}>{SERVICE_EVENT.allergies.length} aandachtspunten</div>
                </div>
                <AlertTriangle size={22} style={{ color: 'var(--red)' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
                {SERVICE_EVENT.allergies.map((a, i) => (
                    <div key={i} style={{
                        padding: 12, borderRadius: 10,
                        background: a.severity === 'critical' ? 'rgba(239,68,68,.06)' : `${BRAND}0d`,
                        border: `1px solid ${a.severity === 'critical' ? 'rgba(239,68,68,.2)' : `${BRAND}33`}`,
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <span style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text)' }}>T{a.table}</span>
                            <span style={{ fontWeight: 600, fontSize: 13 }}>{a.person}</span>
                        </div>
                        <div style={{ fontSize: 12, color: a.severity === 'critical' ? 'var(--red)' : GOLD, fontWeight: 600 }}>{a.issue}</div>
                    </div>
                ))}
            </div>
        </MetalCard>
    );
}

function GangCard({ course, isFocus, onClick, position }: { course: Course; isFocus: boolean; onClick: () => void; position: 'focus' | 'near' | 'far' }) {
    const w = isFocus ? 380 : 240;
    const h = isFocus ? 480 : 340;
    return (
        <div onClick={onClick} style={{
            flexShrink: 0, width: w, height: h, cursor: 'pointer',
            transition: 'all .4s cubic-bezier(.2,.9,.3,1)',
            transform: isFocus ? 'translateY(-12px) scale(1)' : 'scale(.92)',
            opacity: position === 'far' ? 0.5 : 1, position: 'relative',
        }}>
            <div style={{
                height: '100%', borderRadius: 18, overflow: 'hidden',
                background: course.foodHue !== null
                    ? `linear-gradient(180deg, hsl(${course.foodHue} 60% 32%) 0%, hsl(${course.foodHue} 50% 18%) 60%, rgba(14,14,16,.95) 100%)`
                    : 'linear-gradient(180deg, #2a2440, #0f0a1a)',
                border: `1px solid ${isFocus ? `${BRAND}66` : 'rgba(255,255,255,.08)'}`,
                boxShadow: isFocus ? `0 24px 60px rgba(0,0,0,.5), 0 0 40px ${BRAND}26` : '0 8px 24px rgba(0,0,0,.3)',
                position: 'relative', display: 'flex', flexDirection: 'column',
            }}>
                <div style={{ height: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: isFocus ? 130 : 80, filter: 'drop-shadow(0 6px 18px rgba(0,0,0,.5))' }}>
                    {course.heroEmoji}
                </div>
                <div style={{ position: 'absolute', top: 14, left: 14, right: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 9, letterSpacing: '.2em', fontWeight: 700, color: 'rgba(255,255,255,.7)', padding: '3px 8px', borderRadius: 4, background: 'rgba(0,0,0,.4)', backdropFilter: 'blur(4px)' }}>{course.serveAt}</span>
                    {course.status === 'active' && <span style={{ fontSize: 9, letterSpacing: '.2em', fontWeight: 700, color: '#000', padding: '3px 8px', borderRadius: 4, background: 'var(--green)' }}>● LIVE</span>}
                    {course.status === 'prep' && <span style={{ fontSize: 9, letterSpacing: '.2em', fontWeight: 700, color: '#000', padding: '3px 8px', borderRadius: 4, background: GOLD }}>MISE</span>}
                    {course.isPause && <span style={{ fontSize: 9, letterSpacing: '.2em', fontWeight: 700, color: '#fff', padding: '3px 8px', borderRadius: 4, background: 'rgba(167,139,250,.8)' }}>PAUZE</span>}
                </div>
                <div style={{ padding: 18, paddingTop: 10, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div>
                        {course.number && <div style={{ fontSize: 9, letterSpacing: '.25em', fontWeight: 700, color: 'rgba(255,255,255,.5)', marginBottom: 4 }}>GANG {course.number}</div>}
                        <h3 style={{ margin: 0, fontFamily: 'Outfit, sans-serif', fontWeight: 400, fontSize: isFocus ? 24 : 18, color: '#fff', lineHeight: 1.1 }}>{course.title}</h3>
                        {isFocus && course.heroDescription && (
                            <p style={{ margin: '8px 0 0', fontSize: 12, color: 'rgba(255,255,255,.7)', lineHeight: 1.5 }}>{course.heroDescription}</p>
                        )}
                    </div>
                    {isFocus && course.dishes && (
                        <div style={{ marginTop: 14, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {course.dishes.map((d, i) => (
                                <div key={i} style={{ padding: '4px 8px', borderRadius: 6, background: 'rgba(0,0,0,.4)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'rgba(255,255,255,.85)' }}>
                                    <span>{d.emoji}</span><span>{d.name}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function GangCarousel({ courses, focusId, onFocus }: { courses: Course[]; focusId: string; onFocus: (id: string) => void }) {
    const focusIdx = courses.findIndex(c => c.id === focusId);
    return (
        <div style={{
            position: 'relative', borderRadius: 20,
            background: `radial-gradient(ellipse at center, ${GOLD}0a 0%, rgba(14,14,16,.8) 70%)`,
            border: `1px solid ${GOLD}26`, padding: '50px 30px 30px', overflow: 'hidden',
        }}>
            <div style={{
                position: 'absolute', top: 30, left: '50%', transform: 'translateX(-50%)',
                padding: '4px 12px', borderRadius: 999,
                background: `linear-gradient(135deg, ${BRAND}, ${GOLD})`,
                color: '#000', fontSize: 9, letterSpacing: '.25em', fontWeight: 700,
                boxShadow: `0 4px 16px ${BRAND}66`,
            }}>● NU · {NOW_SIM}</div>
            <div style={{ position: 'absolute', top: 56, bottom: 30, left: '50%', width: 1, background: `linear-gradient(180deg, ${GOLD}, transparent)`, opacity: 0.4, pointerEvents: 'none' }} />
            <div style={{ display: 'flex', gap: 18, alignItems: 'center', justifyContent: 'center', overflowX: 'auto', padding: '20px 100px' }}>
                {courses.map((c, i) => {
                    const dist = Math.abs(i - focusIdx);
                    const pos: 'focus' | 'near' | 'far' = dist === 0 ? 'focus' : dist === 1 ? 'near' : 'far';
                    return <GangCard key={c.id} course={c} isFocus={pos === 'focus'} position={pos} onClick={() => onFocus(c.id)} />;
                })}
            </div>
            <div style={{ marginTop: 14, padding: '0 30px' }}>
                <AICoach tip={courses[focusIdx]?.aiCoach?.tip || 'Selecteer een gang'} severity={courses[focusIdx]?.aiCoach?.severity || 'normal'} />
            </div>
        </div>
    );
}

const WIZARD_STEPS = [
    { q: 'Wat voor type event is het?', placeholder: 'Bedrijfsfeest / bruiloft / verjaardag…', key: 'type' },
    { q: 'Hoeveel gasten en welk service-type?', placeholder: 'Bv. 80 gasten, walking dinner met buffet', key: 'guests' },
    { q: 'Hoe laat start service en wat is einde?', placeholder: 'Bv. 17:00 start, 22:00 einde', key: 'time' },
    { q: 'Zijn er pauzes of momenten zonder service?', placeholder: 'Bv. 19:00–20:15 speeches + live band', key: 'pause' },
    { q: 'Welke gangen wil je serveren?', placeholder: 'Bv. welkomst-bites, BBQ buffet, avondhap, dessert', key: 'courses' },
    { q: 'Allergieën of dieetwensen?', placeholder: 'Bv. 1× pinda-allergie, 1× glutenvrij', key: 'allergies' },
];

function AIWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
    const [step, setStep] = useState(0);
    const [answers, setAnswers] = useState<Record<string, string>>({});
    const [input, setInput] = useState('');
    const [generating, setGenerating] = useState(false);
    const [done, setDone] = useState(false);

    useEffect(() => {
        if (open) { setStep(0); setAnswers({}); setInput(''); setDone(false); setGenerating(false); }
    }, [open]);

    if (!open) return null;
    const current = WIZARD_STEPS[step];
    const isLast = step === WIZARD_STEPS.length - 1;

    function submit() {
        if (!input.trim()) return;
        const newAns = { ...answers, [current.key]: input.trim() };
        setAnswers(newAns);
        setInput('');
        if (isLast) {
            setGenerating(true);
            setTimeout(() => { setGenerating(false); setDone(true); }, 2200);
        } else setStep(s => s + 1);
    }

    return (
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(8px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 30 }}>
            <div onClick={e => e.stopPropagation()} style={{
                width: '100%', maxWidth: 640, maxHeight: '85vh', overflow: 'auto',
                borderRadius: 20, background: 'linear-gradient(180deg, #1a1a1e, #0e0e10)',
                border: `1px solid ${GOLD}40`, boxShadow: '0 30px 80px rgba(0,0,0,.5)',
                padding: 30, position: 'relative',
            }}>
                <button onClick={onClose} style={{ position: 'absolute', top: 14, right: 14, width: 32, height: 32, borderRadius: 8, background: 'rgba(0,0,0,.5)', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <X size={14} />
                </button>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: `linear-gradient(135deg, ${BRAND}, ${GOLD})`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 0 20px ${BRAND}66` }}>
                        <Sparkles size={20} style={{ color: '#000' }} />
                    </div>
                    <div>
                        <Eyebrow style={{ color: GOLD }}>AI DRAAIBOEK WIZARD</Eyebrow>
                        <h2 style={{ margin: 0, fontFamily: 'Outfit, sans-serif', fontWeight: 300, fontSize: 24 }}>Vertel me over je event</h2>
                    </div>
                </div>

                {!done && !generating && (
                    <>
                        <div style={{ marginBottom: 16, height: 4, borderRadius: 2, background: 'rgba(255,255,255,.05)', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${((step + 1) / WIZARD_STEPS.length) * 100}%`, background: `linear-gradient(90deg, ${GOLD}, ${BRAND})`, transition: '.3s' }} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
                            {WIZARD_STEPS.slice(0, step).map((s, i) => (
                                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    <div style={{ alignSelf: 'flex-start', maxWidth: '80%', padding: '8px 12px', borderRadius: '14px 14px 14px 4px', background: `${GOLD}14`, border: `1px solid ${GOLD}26`, fontSize: 12, color: 'var(--text)' }}>{s.q}</div>
                                    <div style={{ alignSelf: 'flex-end', maxWidth: '80%', padding: '8px 12px', borderRadius: '14px 14px 4px 14px', background: 'rgba(255,255,255,.05)', fontSize: 12, color: 'var(--text)' }}>{answers[s.key]}</div>
                                </div>
                            ))}
                            <div style={{ alignSelf: 'flex-start', maxWidth: '80%', padding: '10px 14px', borderRadius: '14px 14px 14px 4px', background: `linear-gradient(135deg, ${BRAND}1a, ${GOLD}0a)`, border: `1px solid ${BRAND}40`, fontSize: 13, color: 'var(--text)' }}>{current.q}</div>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <input autoFocus value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} placeholder={current.placeholder}
                                style={{ flex: 1, padding: '10px 14px', borderRadius: 8, background: 'var(--color-bg-deep)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 13, outline: 'none' }} />
                            <BtnPrimary icon={isLast ? Sparkles : ArrowRight} onClick={submit}>{isLast ? 'Genereer' : 'Volgende'}</BtnPrimary>
                        </div>
                        <div style={{ marginTop: 8, fontSize: 10, color: 'var(--muted)', textAlign: 'right' }}>Stap {step + 1}/{WIZARD_STEPS.length}</div>
                    </>
                )}

                {generating && (
                    <div style={{ padding: 40, textAlign: 'center' }}>
                        <div style={{ width: 60, height: 60, margin: '0 auto 16px', borderRadius: '50%', border: `3px solid ${BRAND}33`, borderTopColor: GOLD, animation: 'spin 1s linear infinite' }} />
                        <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 300, fontSize: 22 }}>Draaiboek bouwen…</div>
                        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>Bereken portionering · plan smoker-cycli · check allergieën · genereer tijdlijn</div>
                    </div>
                )}

                {done && (
                    <div style={{ padding: '20px 0' }}>
                        <div style={{ width: 60, height: 60, margin: '0 auto 16px', borderRadius: '50%', background: 'rgba(34,197,94,.15)', border: '2px solid var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Check size={28} style={{ color: 'var(--green)' }} />
                        </div>
                        <h3 style={{ margin: '0 0 8px', fontFamily: 'Outfit, sans-serif', fontWeight: 300, fontSize: 24, textAlign: 'center' }}>Draaiboek klaar</h3>
                        <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', marginBottom: 18 }}>4 gangen · 28 mise-stappen · 3 smoker-cycli · 3 allergieën gevlagd</div>
                        <div style={{ padding: 14, borderRadius: 10, background: `${GOLD}0d`, border: `1px solid ${GOLD}26`, fontSize: 12, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 16 }}>
                            <strong style={{ color: 'var(--text)' }}>AI-suggesties:</strong><br />
                            • Brisket op 01:00 op smoker (low&slow nacht-cyclus)<br />
                            • Satay op 19:30 tijdens speech-pauze (45 min cyclus)<br />
                            • Maaike (T3) pinda-allergie: aparte satay-portie zonder pindasaus<br />
                            • Tom (T5) glutenvrij: bao bun → rijst-bowl variant<br />
                            • Sara (T7) lactose: sorbet als dessert-alternatief
                        </div>
                        <BtnPrimary onClick={onClose} style={{ width: '100%', justifyContent: 'center' }}>Start Service · open KDS</BtnPrimary>
                    </div>
                )}
            </div>
        </div>
    );
}

function ServiceHero({ onWizard }: { onWizard: () => void }) {
    return (
        <div style={{
            position: 'relative', borderRadius: 20, padding: 24,
            background: `linear-gradient(135deg, ${BRAND}0d 0%, ${GOLD}05 50%, rgba(28,28,32,.7) 100%)`,
            border: `1px solid ${GOLD}33`,
            display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 28, alignItems: 'center',
            overflow: 'hidden',
        }}>
            <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <Eyebrow>Service KDS · Live</Eyebrow>
                    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.2em', padding: '3px 8px', borderRadius: 4, background: 'rgba(34,197,94,.12)', color: 'var(--green)', border: '1px solid rgba(34,197,94,.3)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)' }} /> ONLINE
                    </span>
                </div>
                <h1 style={{ margin: 0, fontFamily: 'Outfit, sans-serif', fontWeight: 200, fontSize: 38, letterSpacing: '-.02em', lineHeight: 1.05 }}>{SERVICE_EVENT.title}</h1>
                <div style={{ marginTop: 6, color: 'var(--muted)', fontSize: 13 }}>
                    {SERVICE_EVENT.date} · {SERVICE_EVENT.guests} gasten ({SERVICE_EVENT.vegetarian} veggie) · {SERVICE_EVENT.service} · {SERVICE_EVENT.venue}
                </div>
                <div style={{ marginTop: 12, display: 'flex', gap: 16, fontSize: 11, color: 'var(--muted)', flexWrap: 'wrap' }}>
                    <span><Clock size={11} style={{ marginRight: 4, verticalAlign: '-2px' }} />{SERVICE_EVENT.startTime}–{SERVICE_EVENT.endTime}</span>
                    <span><Pause size={11} style={{ marginRight: 4, verticalAlign: '-2px' }} />Pauze {SERVICE_EVENT.pauseStart}–{SERVICE_EVENT.pauseEnd}</span>
                    <span style={{ color: 'var(--red)' }}><AlertCircle size={11} style={{ marginRight: 4, verticalAlign: '-2px' }} />{SERVICE_EVENT.allergies.length} allergieën</span>
                </div>
            </div>
            <BigCountdown target="18:00" label="GANG 2 · BUFFET" />
            <BtnPrimary icon={Sparkles} onClick={onWizard}>AI Draaiboek Wizard</BtnPrimary>
        </div>
    );
}

export default function ServiceKDS() {
    const [variant, setVariant] = useState<'A' | 'B'>('A');
    const [focusId, setFocusId] = useState<string>('g1');
    const [wizardOpen, setWizardOpen] = useState(false);
    const [miseState, setMiseState] = useState<Record<string, boolean>>({});

    const focusCourse = COURSES.find(c => c.id === focusId) || COURSES[0];
    const decoratedItems = (items: MiseItem[]) => items.map(i => ({
        ...i, done: miseState[i.id] !== undefined ? miseState[i.id] : i.done,
    }));
    const toggleMise = (id: string) => setMiseState(s => {
        const orig = focusCourse.miseChecklist?.find(i => i.id === id)?.done || false;
        const cur = s[id] !== undefined ? s[id] : orig;
        return { ...s, [id]: !cur };
    });

    return (
        <div style={{ padding: '24px 32px 100px', maxWidth: 1500, margin: '0 auto' }}>
            <ServiceHero onWizard={() => setWizardOpen(true)} />
            <div style={{ height: 18 }} />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <div style={{ display: 'inline-flex', padding: 4, borderRadius: 12, background: 'rgba(28,28,32,.6)', border: '1px solid var(--border)' }}>
                    <button onClick={() => setVariant('A')} style={tabBtnStyle(variant === 'A')}>
                        <LayoutGrid size={13} /> Pit Console
                    </button>
                    <button onClick={() => setVariant('B')} style={tabBtnStyle(variant === 'B')}>
                        <Film size={13} /> Gang Carousel
                    </button>
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                    <Clock size={12} style={{ verticalAlign: '-2px', marginRight: 4 }} /> NU · {NOW_SIM} · simulated
                </div>
            </div>

            <div style={{ height: 18 }} />

            {variant === 'A' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                    <CourseStrip courses={COURSES} activeId={focusId} onSelect={setFocusId} />
                    <FoodHero course={focusCourse} height={260} />
                    <div style={{ display: 'grid', gridTemplateColumns: focusCourse.smokerStatus ? '1fr 360px' : '1fr', gap: 18 }}>
                        {focusCourse.aiCoach && <AICoach tip={focusCourse.aiCoach.tip} severity={focusCourse.aiCoach.severity} />}
                        {focusCourse.smokerStatus && <SmokerWidget status={focusCourse.smokerStatus} />}
                    </div>
                    {focusCourse.dishes && (
                        <div>
                            <Eyebrow style={{ marginBottom: 10 }}>Plating · {focusCourse.dishes.length} gerechten</Eyebrow>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
                                {focusCourse.dishes.map((d, i) => <DishCard key={i} dish={d} />)}
                            </div>
                        </div>
                    )}
                    {focusCourse.miseChecklist && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 18 }}>
                            <MiseChecklist items={decoratedItems(focusCourse.miseChecklist)} onToggle={toggleMise} />
                            <CourseTimelineList timeline={focusCourse.timeline || []} />
                        </div>
                    )}
                    {focusCourse.isPause && focusCourse.timeline && <CourseTimelineList timeline={focusCourse.timeline} />}
                    {SERVICE_EVENT.allergies.length > 0 && <AllergyBanner />}
                </div>
            )}

            {variant === 'B' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                    <GangCarousel courses={COURSES} focusId={focusId} onFocus={setFocusId} />
                    <div style={{ display: 'grid', gridTemplateColumns: focusCourse.smokerStatus ? '1fr 360px' : '1fr', gap: 18 }}>
                        {focusCourse.dishes && (
                            <MetalCard>
                                <Eyebrow style={{ marginBottom: 10 }}>{focusCourse.title} · plating</Eyebrow>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
                                    {focusCourse.dishes.map((d, i) => <DishCard key={i} dish={d} compact />)}
                                </div>
                            </MetalCard>
                        )}
                        {focusCourse.smokerStatus && <SmokerWidget status={focusCourse.smokerStatus} />}
                    </div>
                    {focusCourse.miseChecklist && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 18 }}>
                            <MiseChecklist items={decoratedItems(focusCourse.miseChecklist)} onToggle={toggleMise} />
                            <CourseTimelineList timeline={focusCourse.timeline || []} />
                        </div>
                    )}
                    {focusCourse.isPause && focusCourse.timeline && <CourseTimelineList timeline={focusCourse.timeline} />}
                </div>
            )}

            <div style={{ marginTop: 32, padding: 14, borderRadius: 10, background: `${GOLD}0a`, border: `1px solid ${GOLD}24`, display: 'flex', gap: 10, fontSize: 11, color: 'var(--muted)', lineHeight: 1.55 }}>
                <Sparkles size={14} style={{ color: GOLD, flexShrink: 0, marginTop: 1 }} />
                <span>
                    <strong style={{ color: 'var(--text)' }}>Service KDS · hoe het werkt:</strong>{' '}
                    AI Wizard bouwt het draaiboek vanuit jouw event-info. Tijdens service zie je per gang: foodporn-hero, mise-checklist (afvinken), live timeline met countdown, smoker-status, dishes met allergenen, en de AI-coach met realtime tips. Koppelt naar <a href="/prep-counter" style={{ color: GOLD }}>Prep Counter</a> en <a href="/voorraad" style={{ color: GOLD }}>Voorraad</a>.
                </span>
            </div>

            <AIWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />
        </div>
    );
}

const tabBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: '8px 16px', borderRadius: 8,
    background: active ? `linear-gradient(180deg, ${BRAND}1f, ${GOLD}0a)` : 'transparent',
    border: 'none', color: active ? 'var(--text)' : 'var(--muted)',
    fontSize: 12, fontWeight: 600, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: 8,
    boxShadow: active ? `inset 0 0 0 1px ${GOLD}4D` : 'none',
});
