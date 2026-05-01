/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import { useState, useEffect, useMemo } from 'react';
import { useSupabase } from '@/lib/useSupabase';
import { useAiStudio } from '@/lib/AiStudioContext';
import type { Event as DbEvent } from '@/types';
import {
    Sparkles, Layers, Map, RefreshCw, X, Play, Pause, CheckCircle, Check,
    Flame, Clock, Package, MapPin, Printer, ChevronRight, Info, Snowflake,
    Beef, FlaskConical, Salad, UtensilsCrossed, Utensils, AlertTriangle,
} from 'lucide-react';

const GOLD = '#c4a35a';
const BRAND = '#FFBF00';

/* ═══════════════════════════════════════════════════════════════════
   PREP DATA — 18 prep-stappen voor "Bruiloft Van Dijk"
   ═══════════════════════════════════════════════════════════════════ */

const PREP_EVENT = {
    id: 'wedding-vandijk',
    title: 'Bruiloft Van Dijk',
    date: 'Zaterdag 2 mei',
    daysUntil: 2,
    guests: 120,
    menu: 'BBQ buffet · brisket · pulled pork · ribs · 4 sides',
    startTime: '17:00',
};

interface Station {
    id: string; name: string; x: number; y: number; w: number; h: number;
    color: string; Icon: any;
}

const STATIONS: Station[] = [
    { id: 'walkin', name: 'Walk-in koeling', x: 8, y: 12, w: 24, h: 18, color: '#4ECDC4', Icon: Snowflake },
    { id: 'butcher', name: 'Slagers-tafel', x: 36, y: 12, w: 22, h: 18, color: '#ef4444', Icon: Beef },
    { id: 'rub', name: 'Rub & marinade', x: 62, y: 12, w: 22, h: 18, color: '#f59e0b', Icon: Sparkles },
    { id: 'sauce', name: 'Saus-station', x: 8, y: 38, w: 22, h: 16, color: '#a78bfa', Icon: FlaskConical },
    { id: 'smoker', name: 'Smoker pit', x: 36, y: 38, w: 30, h: 20, color: BRAND, Icon: Flame },
    { id: 'sides', name: 'Sides & garnituur', x: 70, y: 38, w: 22, h: 16, color: '#22c55e', Icon: Salad },
    { id: 'plate', name: 'Uitgifte / dressing', x: 30, y: 64, w: 40, h: 14, color: GOLD, Icon: UtensilsCrossed },
];

interface PrepStep {
    id: number; day: 'do' | 'vr' | 'za'; dayLabel: string; order: number;
    station: string; title: string; desc: string;
    duration: number; holdMin: number; holdMax: number; holdLabel: string; holdColor: string;
    isSmoke?: boolean; yields: string;
    recipe: { ingredients: string[]; steps?: string[]; temp: string; container: string };
    foodHue: number; foodEmoji: string; tags: string[];
    priority: 'must' | 'critical' | 'nice';
}

const PREP_STEPS: PrepStep[] = [
    { id: 1, day: 'do', dayLabel: 'Donderdag', order: 1, station: 'walkin', title: 'Brisket trim & dry-brine', desc: 'Trim 25 kg brisket points, deck point fat tot 6 mm. Strooi 2 % zout, vacuüm verpakken.', duration: 45, holdMin: 24 * 60, holdMax: 48 * 60, holdLabel: '24–48u in koeling', holdColor: '#22c55e', yields: '25 kg brisket gebrined', recipe: { ingredients: ['25 kg brisket prime', '500 g zeezout grof'], temp: '4°C', container: 'Cambro 1/1 GN' }, foodHue: 12, foodEmoji: '🥩', tags: ['vlees', 'long-term'], priority: 'must' },
    { id: 2, day: 'do', dayLabel: 'Donderdag', order: 2, station: 'rub', title: 'Hop & Bites rub mixen', desc: '4 kg signature rub (paprika, bruine suiker, knoflook, mosterdpoeder, koffie). Vacuüm in 500 g batches.', duration: 30, holdMin: 30 * 24 * 60, holdMax: 90 * 24 * 60, holdLabel: '30 dagen droog', holdColor: '#22c55e', yields: '4 kg rub · 8 batches', recipe: { ingredients: ['1.2 kg paprika rookzoet', '800 g bruine basterdsuiker', '600 g zeezout', '400 g knoflookpoeder', '300 g mosterdpoeder', '200 g espresso gemalen', '500 g zwarte peper'], temp: 'ambient', container: 'Vacuum bag 500 g' }, foodHue: 28, foodEmoji: '🌶️', tags: ['rub', 'voorraad'], priority: 'must' },
    { id: 3, day: 'do', dayLabel: 'Donderdag', order: 3, station: 'sauce', title: 'Hoisin-mayo (160 ml × 12)', desc: 'Mayo huisgemaakt met eigeel + arachideolie, hoisin 1:3, sesamolie, rijstazijn.', duration: 25, holdMin: 5 * 24 * 60, holdMax: 7 * 24 * 60, holdLabel: '5–7 dagen koel', holdColor: '#f59e0b', yields: '1.92 L hoisin-mayo', recipe: { ingredients: ['12 eidooiers', '1.2 L arachideolie', '400 g hoisin saus', '40 ml sesamolie', '60 ml rijstazijn', '2 EL limoensap', '1 TL witte peper'], steps: ['Eigeel + mosterd + zout op kamertemp', 'Olie sláng-trekken in keukenmachine', 'Hoisin er beetje bij beetje door', 'Sesamolie + rijstazijn op smaak', 'Vacuüm in 160 ml flessen'], temp: '4°C', container: '160 ml squeeze fles × 12' }, foodHue: 18, foodEmoji: '🥫', tags: ['saus'], priority: 'must' },
    { id: 4, day: 'do', dayLabel: 'Donderdag', order: 4, station: 'sauce', title: 'Texas BBQ saus 4 L', desc: 'Donkere variant: ketchup, melasse, espresso, ancho-chili, ciderazijn, brown sugar. 45 min reduceren.', duration: 60, holdMin: 14 * 24 * 60, holdMax: 21 * 24 * 60, holdLabel: '2–3 weken koel', holdColor: '#22c55e', yields: '4 L BBQ saus', recipe: { ingredients: ['2.5 L tomaten ketchup', '500 g melasse', '400 ml ciderazijn', '300 g bruine suiker', '40 g ancho chilipoeder', '20 g rookpoeder', '200 ml espresso', '20 g rookzout'], temp: '4°C', container: '1 L glas-flessen × 4' }, foodHue: 8, foodEmoji: '🍯', tags: ['saus'], priority: 'must' },
    { id: 5, day: 'do', dayLabel: 'Donderdag', order: 5, station: 'butcher', title: 'Pulled pork inwrijven (15 kg)', desc: 'Pork shoulders mosterd-glaze, dan rub. Folie en koel tot vrijdag 04:00 (low&slow).', duration: 35, holdMin: 8 * 60, holdMax: 24 * 60, holdLabel: '8–24u', holdColor: '#22c55e', yields: '15 kg ingerubt', recipe: { ingredients: ['15 kg pork shoulder', '300 ml gele mosterd', '500 g Hop & Bites rub'], temp: '4°C', container: 'Bain-marie GN 1/1 × 3' }, foodHue: 22, foodEmoji: '🐖', tags: ['vlees'], priority: 'must' },
    { id: 6, day: 'vr', dayLabel: 'Vrijdag', order: 6, station: 'smoker', title: 'Pulled pork in smoker · 04:00', desc: 'Apple + cherry chunks. 110°C tot internal 92°C (~12u). Spritz om de 90 min.', duration: 720, holdMin: 0, holdMax: 4 * 60, holdLabel: 'Direct serveren / 4u warm', holdColor: BRAND, isSmoke: true, yields: '15 kg → 11 kg pulled', recipe: { ingredients: ['15 kg pork (uit step 5)', '4 kg apple chunks', '2 kg cherry chunks', '500 ml appelsap'], temp: '110°C dome', container: 'Smoker rack' }, foodHue: 18, foodEmoji: '🔥', tags: ['smoke'], priority: 'critical' },
    { id: 7, day: 'vr', dayLabel: 'Vrijdag', order: 7, station: 'sides', title: 'Coleslaw dressing (3.5 L)', desc: 'Mayo-azijn-mosterd basis met honing en korianderzaad. Apart van groente bewaren.', duration: 25, holdMin: 3 * 24 * 60, holdMax: 5 * 24 * 60, holdLabel: '3 dagen koel', holdColor: '#22c55e', yields: '3.5 L dressing', recipe: { ingredients: ['2 L mayonaise', '300 ml ciderazijn', '300 ml volle melk', '200 g honing', '60 g mosterd dijon', '40 g korianderzaad gerist'], temp: '4°C', container: '5 L Cambro' }, foodHue: 48, foodEmoji: '🥗', tags: ['side'], priority: 'must' },
    { id: 8, day: 'vr', dayLabel: 'Vrijdag', order: 8, station: 'sides', title: 'Cornbread bakken (8 trays)', desc: 'Buttermilk cornbread met scallion en jalapeño. Bakken 09:00, afkoelen tot lunch.', duration: 75, holdMin: 24 * 60, holdMax: 48 * 60, holdLabel: '1–2 dagen droog', holdColor: '#22c55e', yields: '8 trays · 24 porties', recipe: { ingredients: ['3 kg cornmeal', '1.5 kg bloem', '600 g suiker', '120 g bakpoeder', '12 eieren', '2 L buttermilk', '500 g boter gesmolten', '300 g jalapeño', '8 bos lente-ui'], temp: '180°C', container: 'GN 1/1 × 8' }, foodHue: 50, foodEmoji: '🍞', tags: ['bake'], priority: 'must' },
    { id: 9, day: 'vr', dayLabel: 'Vrijdag', order: 9, station: 'rub', title: 'Brisket finale rub & wrap', desc: 'Brisket uit step 1 afdroppen, finale rub, op smoker rack klaarzetten voor zaterdag 01:00.', duration: 30, holdMin: 4 * 60, holdMax: 12 * 60, holdLabel: 'Tot smoker', holdColor: BRAND, yields: '25 kg klaar voor smoker', recipe: { ingredients: ['25 kg gebrinde brisket', '600 g rub', '200 g zwarte peper grof'], temp: '4°C', container: 'Smoker rack op stelling' }, foodHue: 14, foodEmoji: '🥩', tags: ['vlees'], priority: 'must' },
    { id: 10, day: 'vr', dayLabel: 'Vrijdag', order: 10, station: 'butcher', title: 'Short ribs French + season', desc: 'Plate ribs French-trimmed, salzen, peper, knoflookpoeder. Folie en koelen.', duration: 40, holdMin: 12 * 60, holdMax: 24 * 60, holdLabel: '12–24u koel', holdColor: '#22c55e', yields: '12 kg ribs klaar', recipe: { ingredients: ['12 kg short ribs', '120 g zeezout', '60 g peper grof', '40 g knoflookpoeder'], temp: '4°C', container: 'GN 1/2 × 4' }, foodHue: 6, foodEmoji: '🦴', tags: ['vlees'], priority: 'must' },
    { id: 11, day: 'vr', dayLabel: 'Vrijdag', order: 11, station: 'rub', title: 'Pickled red onion (2 L)', desc: 'Rode ui dunne ringen, witte wijn azijn 1:1 water, suiker, zout, peperkorrels, laurier.', duration: 20, holdMin: 21 * 24 * 60, holdMax: 30 * 24 * 60, holdLabel: '3 weken koel', holdColor: '#22c55e', yields: '2 L pickled onion', recipe: { ingredients: ['1.5 kg rode ui', '500 ml witte wijn azijn', '500 ml water', '200 g suiker', '40 g zout', '20 g zwarte peperkorrels', '8 laurierblaadjes'], temp: '4°C', container: 'Pots 500 ml × 4' }, foodHue: 320, foodEmoji: '🧅', tags: ['pickle'], priority: 'nice' },
    { id: 12, day: 'vr', dayLabel: 'Vrijdag', order: 12, station: 'sauce', title: 'Mango-habanero hot sauce', desc: 'Mango, habanero, witte ui, ciderazijn. Stoven, blenden, zeven. 1.2 L afgevuld.', duration: 50, holdMin: 30 * 24 * 60, holdMax: 60 * 24 * 60, holdLabel: '4–8 weken koel', holdColor: '#22c55e', yields: '1.2 L hot sauce', recipe: { ingredients: ['2 kg mango rijp', '60 g habanero (ontzaad)', '300 g witte ui', '300 ml ciderazijn', '60 g zout', '40 g suiker'], temp: '4°C', container: '120 ml druppelflesjes × 10' }, foodHue: 32, foodEmoji: '🌶️', tags: ['saus'], priority: 'nice' },
    { id: 13, day: 'vr', dayLabel: 'Vrijdag', order: 13, station: 'sides', title: 'Mac & cheese saus base (5 L)', desc: 'Béchamel met cheddar+gruyere+parm. Apart koelen, pasta zaterdag erbij.', duration: 60, holdMin: 2 * 24 * 60, holdMax: 3 * 24 * 60, holdLabel: '2–3 dagen koel', holdColor: '#f59e0b', yields: '5 L kaassaus base', recipe: { ingredients: ['600 g boter', '600 g bloem', '4 L volle melk', '1.5 kg cheddar matuur', '500 g gruyere', '300 g parmezaan', '40 g mosterd droog'], temp: '4°C', container: 'Bain-marie 5 L' }, foodHue: 45, foodEmoji: '🧀', tags: ['side'], priority: 'must' },
    { id: 14, day: 'za', dayLabel: 'Zaterdag', order: 14, station: 'smoker', title: 'Brisket in smoker · 01:00', desc: 'Pecan + post oak chunks. 110°C tot stall (~71°C), wrap in butcher paper, terug tot 96°C internal.', duration: 840, holdMin: 60, holdMax: 4 * 60, holdLabel: 'Rust 1-4u in cambro', holdColor: BRAND, isSmoke: true, yields: '25 kg → 18 kg brisket gesneden', recipe: { ingredients: ['25 kg brisket (uit step 9)', '5 kg pecan chunks', '3 kg post oak'], temp: '110°C / wrap bij 71°C', container: 'Smoker rack' }, foodHue: 14, foodEmoji: '🔥', tags: ['smoke'], priority: 'critical' },
    { id: 15, day: 'za', dayLabel: 'Zaterdag', order: 15, station: 'sides', title: 'Coleslaw mix snijden', desc: 'Witte kool, rode kool, wortel julienne. Mengen met dressing 30 min vóór service.', duration: 35, holdMin: 4 * 60, holdMax: 8 * 60, holdLabel: '4–8u droog', holdColor: '#f59e0b', yields: '8 kg coleslaw mix', recipe: { ingredients: ['5 kg witte kool', '2 kg rode kool', '1 kg wortel'], temp: '4°C', container: 'GN 1/1 × 2' }, foodHue: 80, foodEmoji: '🥬', tags: ['side'], priority: 'must' },
    { id: 16, day: 'za', dayLabel: 'Zaterdag', order: 16, station: 'smoker', title: 'Short ribs in smoker · 09:00', desc: 'Hickory + cherry. 120°C tot 95°C internal. ~6u. Glazen met BBQ saus laatste 30 min.', duration: 360, holdMin: 30, holdMax: 90, holdLabel: '30-90 min warm', holdColor: BRAND, isSmoke: true, yields: '12 kg ribs (60 porties)', recipe: { ingredients: ['12 kg short ribs (uit step 10)', '3 kg hickory', '2 kg cherry chunks', '500 ml BBQ saus glaze'], temp: '120°C', container: 'Smoker rack' }, foodHue: 6, foodEmoji: '🍖', tags: ['smoke'], priority: 'critical' },
    { id: 17, day: 'za', dayLabel: 'Zaterdag', order: 17, station: 'sides', title: 'Mac & cheese assemblage', desc: 'Pasta koken al dente, mengen met saus uit step 13. In GN 1/1 trays, breadcrumb + reserve cheddar topping.', duration: 45, holdMin: 30, holdMax: 2 * 60, holdLabel: '30 min – 2u', holdColor: '#f59e0b', yields: '8 kg mac & cheese', recipe: { ingredients: ['3 kg cavatappi pasta', '5 L kaassaus (uit step 13)', '500 g panko', '300 g cheddar grof'], temp: 'oven 180°C 15 min vóór service', container: 'GN 1/1 × 4' }, foodHue: 45, foodEmoji: '🧀', tags: ['side'], priority: 'must' },
    { id: 18, day: 'za', dayLabel: 'Zaterdag', order: 18, station: 'plate', title: 'Service-line dressing', desc: 'Bain-maries opzetten, sauzen in squeeze flessen, garnituur klaarzetten.', duration: 40, holdMin: 0, holdMax: 30, holdLabel: 'Direct service', holdColor: '#ef4444', yields: 'Service line live', recipe: { ingredients: ['Alle eerdere preps', 'Bain-maries (8)', 'Squeeze flessen (12)', 'Tongs, slepers, planken'], temp: 'Hot bain >65°C / cold <8°C', container: 'Service-line' }, foodHue: 200, foodEmoji: '🍽️', tags: ['service'], priority: 'critical' },
];

const stationById = (id: string) => STATIONS.find(s => s.id === id) || STATIONS[0];

type StepStatus = Record<number, 'todo' | 'active' | 'done' | undefined>;

/* ═══════════════════════════════════════════════════════════════════
   PERSISTENT STATE HOOK (localStorage)
   ═══════════════════════════════════════════════════════════════════ */
function usePrepState(): [StepStatus, React.Dispatch<React.SetStateAction<StepStatus>>] {
    const [state, setState] = useState<StepStatus>({});
    useEffect(() => {
        try {
            const raw = typeof window !== 'undefined' ? window.localStorage.getItem('prep_state_v1') : null;
            if (raw) setState(JSON.parse(raw));
        } catch { /* ignore */ }
    }, []);
    useEffect(() => {
        try { window.localStorage.setItem('prep_state_v1', JSON.stringify(state)); } catch { /* ignore */ }
    }, [state]);
    return [state, setState];
}

/* ═══════════════════════════════════════════════════════════════════
   INVENTORY DEDUCTION — bij prep "done" trekken we de ingrediënten af
   via de gedeelde inventoryDeduction helper. Silent fail.
   ═══════════════════════════════════════════════════════════════════ */
async function deductIngredientsFromInventory(step: PrepStep): Promise<void> {
    try {
        const ingredients = step.recipe?.ingredients || [];
        if (ingredients.length === 0) return;

        const { supabase } = await import('@/lib/supabase');
        const { parseQty, deductFromInventory } = await import('@/lib/inventoryDeduction');
        const { data: inv } = await supabase
            .from('inventory')
            .select('id, naam, current_stock, unit, organization_id');
        if (!inv) return;

        const lines = ingredients
            .map(ingLine => {
                const parsed = parseQty(ingLine);
                if (!parsed || !parsed.rest) return null;
                return {
                    name: parsed.rest,
                    qty: parsed.qty,
                    note: `Prep #${step.order}: ${step.title}`,
                };
            })
            .filter((x): x is { name: string; qty: number; note: string } => x !== null);

        await deductFromInventory(lines, inv as any);
    } catch {
        /* silent — prep-flow blokkeren we niet voor inventory-fail */
    }
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════════════ */
export default function PrepCounter() {
    const [variant, setVariant] = useState<'A' | 'B'>('A');
    const [openStep, setOpenStep] = useState<PrepStep | null>(null);
    const [stepStatus, setStepStatus] = usePrepState();
    const aiStudio = useAiStudio();

    const doneCount = PREP_STEPS.filter(s => stepStatus[s.id] === 'done').length;
    const activeStep = PREP_STEPS.find(s => stepStatus[s.id] === 'active') || null;

    /* AI-plan: opent AiStudio met context-prompt voor prep-volgorde-optimalisatie.
       Hergebruikt bestaande AI-infrastructuur i.p.v. nieuwe API. */
    function handleAiPlan() {
        const openSteps = PREP_STEPS.filter(s => stepStatus[s.id] !== 'done');
        const stepList = openSteps.map(s => `- ${s.title} (dag: ${s.day}, ${s.duration} min, station: ${s.station})`).join('\n');
        const prompt = `Plan de prep-volgorde voor "${PREP_EVENT.title}" — ${PREP_EVENT.guests} gasten, start ${PREP_EVENT.startTime}, ${PREP_EVENT.daysUntil} dagen vooruit.

Menu: ${PREP_EVENT.menu}

Open prep-stappen (${openSteps.length}):
${stepList}

Geef een geoptimaliseerde volgorde met tijdslots (T-2 do / vr 04:00 / za 13:00 etc.) gebaseerd op:
- Marinades & rubs eerst (T-2 do)
- Smoker-cycli (lange cooks zoals brisket en pulled pork starten 's nachts)
- Sides & dressings T-1
- Same-day finishes (slicing, plating)
- Houdbaarheid en temperatuur-eisen

Houd het kort en concreet — een uitvoerbare lijst, geen uitleg over de regels.`;
        aiStudio.open({
            mode: 'brainstorm',
            messages: [{ role: 'user', content: prompt }],
        });
    }

    const byDay = useMemo(() => {
        const groups: Record<'do' | 'vr' | 'za', PrepStep[]> = { do: [], vr: [], za: [] };
        PREP_STEPS.forEach(s => groups[s.day].push(s));
        return groups;
    }, []);

    function resetAll() {
        if (typeof window !== 'undefined' && !window.confirm('Alle prep-status resetten?')) return;
        setStepStatus({});
    }

    function handleStart() {
        if (!openStep) return;
        setStepStatus(prev => ({ ...prev, [openStep.id]: 'active' }));
    }

    function handleComplete() {
        if (!openStep) return;
        setStepStatus(prev => ({ ...prev, [openStep.id]: 'done' }));
        /* Best-effort: trek inventory af voor ingrediënten in dit recept.
           Match op substring-naam (case-insensitive). Faalt stilletjes als
           inventory item niet bestaat — geen UI-blok. */
        void deductIngredientsFromInventory(openStep);
    }

    return (
        <div style={{ padding: '24px 32px 100px', maxWidth: 1500, margin: '0 auto' }}>
            <DemoModeBanner />

            <PrepHero doneCount={doneCount} totalCount={PREP_STEPS.length} activeStep={activeStep}
                onAIPlan={handleAiPlan}
            />

            <div style={{ height: 22 }} />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <div style={{
                    display: 'inline-flex', padding: 4, borderRadius: 12,
                    background: 'rgba(28,28,32,.6)', border: '1px solid var(--border)',
                }}>
                    <button onClick={() => setVariant('A')} style={tabBtnStyle(variant === 'A')}>
                        <Layers size={13} /> Smoke Stack
                    </button>
                    <button onClick={() => setVariant('B')} style={tabBtnStyle(variant === 'B')}>
                        <Map size={13} /> Pit Floor
                    </button>
                </div>
                <button onClick={resetAll} style={{
                    padding: '6px 10px', borderRadius: 8, fontSize: 11, color: 'var(--muted)',
                    background: 'transparent', border: '1px solid var(--border)', cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                }}>
                    <RefreshCw size={11} /> Reset alles
                </button>
            </div>

            <div style={{ height: 14 }} />

            {variant === 'A' && (
                <div>
                    {(['do', 'vr', 'za'] as const).map(day => {
                        const tasks = byDay[day];
                        const done = tasks.filter(t => stepStatus[t.id] === 'done').length;
                        const labels = {
                            do: 'Donderdag · long-term marinades & rubs',
                            vr: 'Vrijdag · sides, smokers start, dressings',
                            za: 'Zaterdag · same-day finals & service',
                        };
                        return (
                            <div key={day} style={{ marginBottom: 32 }}>
                                <DayHeader day={day} label={labels[day]} count={tasks.length} doneCount={done} isToday={day === 'do'} />
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    {tasks.map(t => (
                                        <FoodLog key={t.id} step={t} status={stepStatus[t.id] || 'todo'} onClick={() => setOpenStep(t)} />
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {variant === 'B' && (
                <div>
                    <PitFloor stepStatus={stepStatus} onTaskClick={(t: PrepStep) => setOpenStep(t)} />
                    <div style={{ marginTop: 22, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
                        {PREP_STEPS.map(t => {
                            const st = stationById(t.station);
                            const status = stepStatus[t.id] || 'todo';
                            return (
                                <div key={t.id} onClick={() => setOpenStep(t)} style={{
                                    padding: 12, borderRadius: 10, cursor: 'pointer',
                                    background: status === 'done' ? 'rgba(34,197,94,.05)' : 'rgba(28,28,32,.5)',
                                    border: '1px solid ' + (status === 'done' ? 'rgba(34,197,94,.2)' : 'rgba(255,255,255,.05)'),
                                    display: 'grid', gridTemplateColumns: '32px 1fr auto', gap: 10, alignItems: 'center',
                                }}>
                                    <div style={{ width: 32, height: 32, borderRadius: 8, background: `${st.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                                        {t.foodEmoji}
                                    </div>
                                    <div style={{ minWidth: 0 }}>
                                        <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: status === 'done' ? 'line-through' : 'none' }}>
                                            #{t.order} {t.title}
                                        </div>
                                        <div style={{ fontSize: 10, color: 'var(--muted)' }}>{st.name} · {t.duration}m</div>
                                    </div>
                                    {status === 'done' && <Check size={14} style={{ color: '#22c55e' }} />}
                                    {status === 'active' && <span style={{ width: 8, height: 8, borderRadius: '50%', background: GOLD }} />}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            <div style={{ marginTop: 32, padding: 14, borderRadius: 10, background: `${GOLD}10`, border: `1px solid ${GOLD}33`, display: 'flex', gap: 10, fontSize: 11, color: 'var(--muted)', lineHeight: 1.55 }}>
                <Info size={14} style={{ color: GOLD, flexShrink: 0, marginTop: 1 }} />
                <span>
                    <strong style={{ color: 'var(--text)' }}>Prep Counter · hoe het werkt:</strong>{' '}
                    AI berekent prep-hoeveelheden uit event (gasten × recept) en optimaliseert volgorde op houdbaarheid + smoke-tijden. Klik een prep om recept te openen, timer te starten en sticker te genereren bij done. Voorraad in <a href="/voorraad" style={{ color: GOLD }}>Smart Inventory</a> wordt automatisch verminderd.
                </span>
            </div>

            {openStep && (
                <RecipeModal
                    step={openStep}
                    status={stepStatus[openStep.id] || 'todo'}
                    onClose={() => setOpenStep(null)}
                    onStart={handleStart}
                    onComplete={handleComplete}
                />
            )}
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   DEMO MODE BANNER — laat user weten dat de prep-stappen mock zijn
   en wijst naar echte upcoming events met prep-tasks (acceptance-workflow).
   ═══════════════════════════════════════════════════════════════════ */
function DemoModeBanner() {
    const { data: dbEvents } = useSupabase<DbEvent>('events', []);
    const todayIso = new Date().toISOString().slice(0, 10);
    const upcoming = useMemo(
        () => dbEvents
            .filter(e => (e.date || '') >= todayIso && e.status !== 'cancelled')
            .sort((a, b) => a.date.localeCompare(b.date))
            .slice(0, 1),
        [dbEvents, todayIso]
    );
    return (
        <div style={{
            marginBottom: 18, padding: '12px 16px', borderRadius: 10,
            background: 'rgba(245,158,11,.05)', border: '1px solid rgba(245,158,11,.25)',
            display: 'flex', gap: 12, alignItems: 'flex-start',
        }}>
            <AlertTriangle size={16} style={{ color: 'var(--amber)', flexShrink: 0, marginTop: 2 }} />
            <div style={{ flex: 1, fontSize: 12, color: 'var(--muted)', lineHeight: 1.55 }}>
                <strong style={{ color: 'var(--text)' }}>Demo-modus:</strong> deze prep-stappen zijn voorbeeld-data voor &quot;Bruiloft Van Dijk&quot;.
                Echte prep-taken voor je events worden automatisch gemaakt bij offerte-acceptatie en zijn zichtbaar op de{' '}
                <a href="/agenda" style={{ color: GOLD, textDecoration: 'underline' }}>Agenda</a>
                {upcoming.length > 0 && <> — eerstvolgend event: <strong>{upcoming[0].name}</strong> ({upcoming[0].date}, {upcoming[0].guests} gasten)</>}.
            </div>
        </div>
    );
}

const tabBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: '8px 16px', borderRadius: 8, background: active ? `linear-gradient(180deg, ${BRAND}1a, ${GOLD}0a)` : 'transparent',
    border: 'none', color: active ? 'var(--text)' : 'var(--muted)',
    fontSize: 12, fontWeight: 600, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: 8,
    boxShadow: active ? `inset 0 0 0 1px ${GOLD}4D` : 'none',
});

/* ═══════════════════════════════════════════════════════════════════
   PREP HERO — event card with progress ring
   ═══════════════════════════════════════════════════════════════════ */
function PrepHero({ doneCount, totalCount, activeStep, onAIPlan }: { doneCount: number; totalCount: number; activeStep: PrepStep | null; onAIPlan: () => void }) {
    const pct = Math.round((doneCount / totalCount) * 100);
    return (
        <div className="prep-event-hero" style={{
            position: 'relative', borderRadius: 20, padding: 26,
            background: `linear-gradient(135deg, ${BRAND}0a 0%, ${GOLD}05 50%, rgba(28,28,32,.6) 100%)`,
            border: `1px solid ${GOLD}30`, overflow: 'hidden',
        }}>
            <svg viewBox="0 0 600 200" style={{ position: 'absolute', right: -60, top: -20, width: 500, height: 200, opacity: .06, pointerEvents: 'none' }}>
                <path d="M 100 150 Q 100 80, 180 80 Q 260 80, 260 150" fill="none" stroke={GOLD} strokeWidth="3" />
                <line x1="120" y1="150" x2="240" y2="150" stroke={GOLD} strokeWidth="3" />
                <path d="M 150 80 Q 150 50, 170 40" stroke={GOLD} strokeWidth="2" fill="none" />
                <path d="M 180 80 Q 180 45, 200 30" stroke={GOLD} strokeWidth="2" fill="none" />
                <path d="M 210 80 Q 210 50, 230 40" stroke={GOLD} strokeWidth="2" fill="none" />
            </svg>

            <div style={{ minWidth: 0, position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <span style={{ fontSize: 9, letterSpacing: '.2em', color: 'var(--muted-light)', fontWeight: 700, textTransform: 'uppercase' }}>Mise en place voor</span>
                    <span style={{
                        fontSize: 9, fontWeight: 700, letterSpacing: '.2em',
                        padding: '3px 8px', borderRadius: 4,
                        background: `${BRAND}20`, color: GOLD, border: `1px solid ${BRAND}4D`,
                    }}>EVENT · T-{PREP_EVENT.daysUntil} DAGEN</span>
                </div>
                <h1 style={{ margin: 0, fontFamily: 'Outfit, sans-serif', fontWeight: 200, fontSize: 38, letterSpacing: '-.02em', lineHeight: 1.05 }}>
                    {PREP_EVENT.title}
                </h1>
                <div style={{ marginTop: 6, color: 'var(--muted)', fontSize: 14 }}>
                    {PREP_EVENT.date} · {PREP_EVENT.guests} gasten · service {PREP_EVENT.startTime}
                </div>
                <div style={{ marginTop: 14, display: 'flex', gap: 18, fontSize: 12, color: 'var(--muted)', flexWrap: 'wrap' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <Utensils size={12} style={{ color: GOLD }} />
                        {PREP_EVENT.menu}
                    </span>
                </div>
            </div>

            <div style={{ position: 'relative', width: 140, height: 140 }}>
                <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
                    <circle cx="50" cy="50" r="44" stroke="rgba(255,255,255,.05)" strokeWidth="6" fill="none" />
                    <circle cx="50" cy="50" r="44" stroke="url(#heroGrad)" strokeWidth="6" fill="none"
                        strokeLinecap="round"
                        strokeDasharray={`${pct * 2.764} 276.4`}
                        style={{ transition: 'stroke-dasharray 1s ease' }} />
                    <defs>
                        <linearGradient id="heroGrad" x1="0" x2="1" y1="0" y2="1">
                            <stop offset="0%" stopColor={BRAND} />
                            <stop offset="100%" stopColor={GOLD} />
                        </linearGradient>
                    </defs>
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 300, fontSize: 32, lineHeight: 1 }}>
                        {pct}<span style={{ fontSize: 16, color: 'var(--muted)' }}>%</span>
                    </div>
                    <div style={{ fontSize: 10, letterSpacing: '.2em', color: 'var(--muted)', marginTop: 2 }}>
                        {doneCount}/{totalCount}
                    </div>
                </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
                <button onClick={onAIPlan} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 14px',
                    borderRadius: 8, background: `linear-gradient(180deg, ${GOLD}, #9e781c)`,
                    color: '#0a0a0c', fontWeight: 600, fontSize: 12, border: 'none', cursor: 'pointer',
                }}>
                    <Sparkles size={14} /> AI volgorde-plan
                </button>
                <div style={{ fontSize: 10, color: 'var(--muted)', maxWidth: 160, textAlign: 'right', lineHeight: 1.4 }}>
                    AI heeft 18 stappen geoptimaliseerd op houdbaarheid + smoke-tijd
                </div>
                {activeStep && (
                    <div style={{
                        marginTop: 4, padding: '6px 10px', borderRadius: 8,
                        background: `${BRAND}1a`, border: `1px solid ${BRAND}40`,
                        display: 'flex', alignItems: 'center', gap: 6, fontSize: 11,
                    }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: GOLD }} />
                        <span style={{ color: 'var(--text)' }}>Bezig: <strong>#{activeStep.order} {activeStep.title.split('·')[0].trim()}</strong></span>
                    </div>
                )}
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   VARIANT A — DAY HEADER + FOOD LOG
   ═══════════════════════════════════════════════════════════════════ */
function DayHeader({ day, label, count, doneCount, isToday }: { day: string; label: string; count: number; doneCount: number; isToday: boolean }) {
    const pct = count ? Math.round((doneCount / count) * 100) : 0;
    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 16,
            padding: '20px 4px 12px', borderBottom: '1px solid rgba(255,255,255,.06)', marginBottom: 14,
        }}>
            <div style={{
                width: 56, height: 56, borderRadius: 14,
                background: isToday ? `linear-gradient(180deg, ${BRAND}, ${GOLD})` : 'rgba(28,28,32,.6)',
                border: `1px solid ${isToday ? `${BRAND}66` : 'var(--border)'}`,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                color: isToday ? '#000' : 'var(--text)', flexShrink: 0,
            }}>
                <div style={{ fontSize: 9, letterSpacing: '.2em', fontWeight: 700, opacity: .7 }}>{day.toUpperCase()}</div>
                <div style={{ fontSize: 22, fontFamily: 'Outfit, sans-serif', fontWeight: 500, lineHeight: 1 }}>
                    {day === 'do' ? '30' : day === 'vr' ? '01' : '02'}
                </div>
            </div>
            <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 4 }}>
                    <h2 style={{ margin: 0, fontFamily: 'Outfit, sans-serif', fontWeight: 300, fontSize: 26, letterSpacing: '-.01em' }}>{label}</h2>
                    {isToday && (
                        <span style={{ fontSize: 9, letterSpacing: '.2em', fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: `${BRAND}20`, color: GOLD, border: `1px solid ${BRAND}4D` }}>VANDAAG</span>
                    )}
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>{doneCount}/{count} klaar · {pct}%</span>
                </div>
                <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,.05)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? '#22c55e' : `linear-gradient(90deg, ${GOLD}, ${BRAND})`, transition: 'width .4s ease' }} />
                </div>
            </div>
        </div>
    );
}

function FoodLog({ step, status, onClick }: { step: PrepStep; status: 'todo' | 'active' | 'done'; onClick: () => void }) {
    const grain = useMemo(() => {
        const lines = [];
        for (let i = 0; i < 14; i++) lines.push({ y: 6 + i * 6 + (i * 13 % 5), x1: 4 + (i * 7 % 8), x2: 96 - (i * 11 % 7), opacity: 0.04 + (i % 3) * 0.03 });
        return lines;
    }, []);

    const isDone = status === 'done';
    const isActive = status === 'active';

    return (
        <div onClick={onClick} className="prep-step-card" style={{
            position: 'relative', padding: 16, borderRadius: 16,
            background: isDone ? 'linear-gradient(180deg, rgba(34,197,94,.06), rgba(34,197,94,.02))'
                : isActive ? `linear-gradient(180deg, ${BRAND}14, ${GOLD}08)`
                    : 'linear-gradient(180deg, rgba(28,28,32,.7), rgba(18,18,22,.5))',
            border: `1px solid ${isDone ? 'rgba(34,197,94,.3)' : isActive ? `${BRAND}66` : 'rgba(255,255,255,.06)'}`,
            cursor: 'pointer', transition: 'transform .2s, border-color .2s, background .3s', opacity: isDone ? 0.7 : 1,
        }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}>

            <div style={{
                width: 180, height: 130, borderRadius: 12, position: 'relative', overflow: 'hidden',
                background: `linear-gradient(135deg, hsl(${step.foodHue} 60% 35%), hsl(${step.foodHue} 50% 22%) 60%, hsl(${step.foodHue + 20} 40% 18%))`,
                boxShadow: 'inset 0 0 30px rgba(0,0,0,.5), 0 6px 18px rgba(0,0,0,.3)', flexShrink: 0,
            }}>
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
                    {grain.map((g, i) => (
                        <path key={i} d={`M ${g.x1} ${g.y} Q 50 ${g.y + (i % 2 ? 3 : -3)}, ${g.x2} ${g.y}`} fill="none" stroke="rgba(0,0,0,.5)" strokeWidth="0.4" opacity={g.opacity} />
                    ))}
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 64, filter: 'drop-shadow(0 4px 12px rgba(0,0,0,.5))', opacity: isDone ? 0.4 : 1 }}>{step.foodEmoji}</div>
                {isDone && (
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(34,197,94,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(34,197,94,.95)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 20px rgba(34,197,94,.6)' }}>
                            <Check size={32} style={{ color: '#000' }} />
                        </div>
                    </div>
                )}
                {isActive && (
                    <div style={{ position: 'absolute', top: 8, right: 8, width: 12, height: 12, borderRadius: '50%', background: GOLD, boxShadow: `0 0 12px ${BRAND}` }} />
                )}
                <div style={{ position: 'absolute', top: 8, left: 8, padding: '3px 8px', borderRadius: 6, background: 'rgba(0,0,0,.6)', color: '#fff', fontSize: 10, fontWeight: 700, letterSpacing: '.1em', fontFamily: 'Outfit, sans-serif', backdropFilter: 'blur(8px)' }}>#{String(step.order).padStart(2, '0')}</div>
                <div style={{ position: 'absolute', bottom: 8, right: 8, padding: '3px 8px', borderRadius: 6, background: 'rgba(0,0,0,.6)', color: '#fff', fontSize: 10, fontWeight: 600, backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Clock size={10} />
                    {step.duration >= 60 ? `${Math.floor(step.duration / 60)}u${step.duration % 60 ? ` ${step.duration % 60}m` : ''}` : `${step.duration}m`}
                </div>
            </div>

            <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 8 }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                        <h3 style={{ margin: 0, fontFamily: 'Outfit, sans-serif', fontWeight: 500, fontSize: 18, letterSpacing: '-.01em', textDecoration: isDone ? 'line-through' : 'none', color: isDone ? 'var(--muted)' : 'var(--text)' }}>{step.title}</h3>
                        {step.priority === 'critical' && !isDone && (
                            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.15em', padding: '2px 6px', borderRadius: 4, background: 'rgba(239,68,68,.15)', color: 'var(--red)', border: '1px solid rgba(239,68,68,.3)' }}>CRITICAL</span>
                        )}
                        {step.isSmoke && (
                            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.15em', padding: '2px 6px', borderRadius: 4, background: `${BRAND}1a`, color: GOLD, border: `1px solid ${BRAND}4D`, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <Flame size={9} />SMOKE
                            </span>
                        )}
                    </div>
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>{step.desc}</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--muted-light)' }}>
                        <Package size={11} /> {step.yields}
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: step.holdColor, boxShadow: `0 0 8px ${step.holdColor}` }} />
                        <span style={{ color: 'var(--muted)' }}>{step.holdLabel}</span>
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--muted-light)' }}>
                        <MapPin size={11} /> {stationById(step.station).name}
                    </span>
                </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                {isDone ? (
                    <div style={{ textAlign: 'right', fontSize: 10, color: 'var(--muted)', lineHeight: 1.4 }}>
                        <div style={{ color: 'var(--green)', fontWeight: 600, fontSize: 11 }}>KLAAR</div>
                        <div>Tik voor sticker</div>
                    </div>
                ) : isActive ? (
                    <span style={{ fontSize: 11, fontWeight: 600, color: GOLD, padding: '6px 12px', border: `1px solid ${GOLD}66`, borderRadius: 8 }}>Bezig…</span>
                ) : (
                    <div style={{ width: 44, height: 44, borderRadius: 12, border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>
                        <ChevronRight size={20} />
                    </div>
                )}
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   VARIANT B — PIT FLOOR (isometric SVG kitchen layout)
   ═══════════════════════════════════════════════════════════════════ */
const ISO_W = 1100;
const ISO_H = 600;

function PitFloor({ stepStatus, onTaskClick }: { stepStatus: StepStatus; onTaskClick: (s: PrepStep) => void }) {
    const tasksByStation = useMemo(() => {
        const map: Record<string, PrepStep[]> = {};
        STATIONS.forEach(s => map[s.id] = []);
        PREP_STEPS.forEach(s => { if (map[s.station]) map[s.station].push(s); });
        return map;
    }, []);

    const routePath = useMemo(() => {
        const points = PREP_STEPS.map(s => {
            const st = stationById(s.station);
            return {
                x: (st.x / 100) * ISO_W + (st.w / 100) * ISO_W / 2,
                y: (st.y / 100) * ISO_H + (st.h / 100) * ISO_H / 2,
            };
        });
        return points.reduce((d, p, i) => {
            if (i === 0) return `M ${p.x} ${p.y}`;
            const prev = points[i - 1];
            const mx = (prev.x + p.x) / 2;
            const my = (prev.y + p.y) / 2;
            return d + ` Q ${prev.x} ${my}, ${mx} ${my} T ${p.x} ${p.y}`;
        }, '');
    }, []);

    return (
        <div style={{
            position: 'relative', borderRadius: 18,
            background: `radial-gradient(ellipse at top, ${GOLD}0a 0%, rgba(28,28,32,.6) 60%, rgba(14,14,16,.9) 100%)`,
            border: `1px solid ${GOLD}26`, overflow: 'hidden', padding: 0,
        }}>
            <svg viewBox={`0 0 ${ISO_W} ${ISO_H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
                <defs>
                    {STATIONS.map(s => (
                        <linearGradient key={s.id} id={`stationGrad-${s.id}`} x1="0" x2="0" y1="0" y2="1">
                            <stop offset="0%" stopColor="rgba(38,38,42,.95)" />
                            <stop offset="100%" stopColor="rgba(20,20,24,.95)" />
                        </linearGradient>
                    ))}
                    <pattern id="floorGrid" width="40" height="40" patternUnits="userSpaceOnUse">
                        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,.02)" strokeWidth="1" />
                    </pattern>
                </defs>
                <rect width={ISO_W} height={ISO_H} fill="url(#floorGrid)" />

                {/* AI Route */}
                <g style={{ pointerEvents: 'none' }}>
                    <path d={routePath} stroke={`${GOLD}30`} strokeWidth="2" fill="none" strokeDasharray="4 8" />
                    <circle r="6" fill={BRAND} style={{ filter: `drop-shadow(0 0 8px ${BRAND})` }}>
                        <animateMotion dur="20s" repeatCount="indefinite" path={routePath} />
                    </circle>
                </g>

                {/* Stations */}
                {STATIONS.map(s => {
                    const tasks = tasksByStation[s.id] || [];
                    const doneCount = tasks.filter(t => stepStatus[t.id] === 'done').length;
                    const hasActive = tasks.some(t => stepStatus[t.id] === 'active');
                    const x = (s.x / 100) * ISO_W;
                    const y = (s.y / 100) * ISO_H;
                    const w = (s.w / 100) * ISO_W;
                    const h = (s.h / 100) * ISO_H;
                    const pct = tasks.length ? (doneCount / tasks.length) * 100 : 0;
                    return (
                        <g key={s.id} style={{ cursor: 'pointer' }}>
                            <rect x={x + 4} y={y + 4} width={w} height={h} rx="14" fill="rgba(0,0,0,.3)" />
                            <rect x={x} y={y} width={w} height={h} rx="14"
                                fill={`url(#stationGrad-${s.id})`}
                                stroke={hasActive ? s.color : 'rgba(255,255,255,.1)'}
                                strokeWidth={hasActive ? 2 : 1}
                                style={{ filter: hasActive ? `drop-shadow(0 0 12px ${s.color}80)` : 'none' }} />
                            <line x1={x + 14} y1={y + 6} x2={x + w - 14} y2={y + 6} stroke="rgba(255,255,255,.08)" strokeWidth="1" />
                            <circle cx={x + 28} cy={y + 28} r="14" fill={`${s.color}22`} stroke={s.color} strokeWidth="1.5" />
                            <text x={x + 28} y={y + 32} fill={s.color} fontSize="14" fontWeight="600" textAnchor="middle">{s.name[0]}</text>
                            <text x={x + 50} y={y + 24} fill="#fff" fontSize="13" fontWeight="600">{s.name}</text>
                            <text x={x + 50} y={y + 40} fill="rgba(255,255,255,.5)" fontSize="10" letterSpacing=".15em">{tasks.length} TAKEN · {doneCount} KLAAR</text>
                            <rect x={x + 14} y={y + h - 16} width={w - 28} height="4" rx="2" fill="rgba(0,0,0,.4)" />
                            <rect x={x + 14} y={y + h - 16} width={(w - 28) * pct / 100} height="4" rx="2" fill={s.color} />
                        </g>
                    );
                })}

                {/* Task chips */}
                {STATIONS.map(s => {
                    const tasks = tasksByStation[s.id] || [];
                    const x = (s.x / 100) * ISO_W;
                    const y = (s.y / 100) * ISO_H;
                    const w = (s.w / 100) * ISO_W;
                    const h = (s.h / 100) * ISO_H;
                    return tasks.map((t, idx) => {
                        const status = stepStatus[t.id] || 'todo';
                        const col = idx % 3;
                        const row = Math.floor(idx / 3);
                        const chipW = 44, chipH = 44, gap = 6;
                        const startX = x + (w - (3 * chipW + 2 * gap)) / 2;
                        const cx = startX + col * (chipW + gap);
                        const cy = y + h + 6 + row * (chipH + gap);
                        const isDone = status === 'done';
                        const isActive = status === 'active';
                        return (
                            <g key={t.id} style={{ cursor: 'pointer' }} onClick={() => onTaskClick(t)}>
                                <rect x={cx} y={cy} width={chipW} height={chipH} rx="10"
                                    fill={isDone ? 'rgba(34,197,94,.15)' : isActive ? `${s.color}30` : 'rgba(28,28,32,.85)'}
                                    stroke={isDone ? 'rgba(34,197,94,.5)' : isActive ? s.color : 'rgba(255,255,255,.1)'}
                                    strokeWidth={isActive ? 2 : 1} />
                                <foreignObject x={cx} y={cy} width={chipW} height={chipH}>
                                    <div style={{ width: chipW, height: chipH, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, opacity: isDone ? 0.4 : 1, filter: isDone ? 'grayscale(1)' : 'none' }}>{t.foodEmoji}</div>
                                </foreignObject>
                                <rect x={cx + 2} y={cy + 2} width="16" height="14" rx="3" fill="rgba(0,0,0,.7)" />
                                <text x={cx + 10} y={cy + 12} fill="#fff" fontSize="9" fontWeight="700" textAnchor="middle">{t.order}</text>
                                {isDone && <circle cx={cx + chipW - 6} cy={cy + 6} r="6" fill="#22c55e" />}
                                {isActive && <circle cx={cx + chipW - 6} cy={cy + 6} r="5" fill={s.color}><animate attributeName="r" values="5;8;5" dur="1.5s" repeatCount="indefinite" /></circle>}
                            </g>
                        );
                    });
                })}
            </svg>

            <div style={{
                position: 'absolute', bottom: 16, left: 16,
                padding: '10px 14px', borderRadius: 10,
                background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255,255,255,.06)',
                display: 'flex', gap: 14, fontSize: 11, color: 'var(--muted)', alignItems: 'center',
            }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 24, height: 2, background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)` }} />
                    AI-volgorde
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e' }} /> Klaar
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: GOLD }} /> Bezig
                </span>
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   RECIPE MODAL — review/cooking/sticker
   ═══════════════════════════════════════════════════════════════════ */
function RecipeModal({ step, status, onClose, onStart, onComplete }: { step: PrepStep; status: 'todo' | 'active' | 'done'; onClose: () => void; onStart: () => void; onComplete: () => void }) {
    const [phase, setPhase] = useState<'review' | 'cooking' | 'sticker'>(status === 'active' ? 'cooking' : status === 'done' ? 'sticker' : 'review');
    const ingredients = step.recipe?.ingredients || [];
    const steps = step.recipe?.steps || [];

    return (
        <div onClick={onClose} style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(8px)',
            zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 30,
        }}>
            <div onClick={e => e.stopPropagation()} style={{
                width: '100%', maxWidth: 980, maxHeight: '90vh', overflow: 'auto', borderRadius: 20,
                background: 'linear-gradient(180deg, #1a1a1e, #0e0e10)',
                border: `1px solid ${GOLD}33`, boxShadow: '0 30px 80px rgba(0,0,0,.5)',
                display: 'grid', gridTemplateColumns: phase === 'sticker' ? '1fr' : '380px 1fr',
                position: 'relative',
            }}>
                <button onClick={onClose} style={{
                    position: 'absolute', top: 14, right: 14, zIndex: 10,
                    width: 36, height: 36, borderRadius: 10,
                    background: 'rgba(0,0,0,.5)', border: '1px solid var(--border)',
                    color: 'var(--muted)', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}><X size={16} /></button>

                {phase !== 'sticker' && (
                    <div style={{
                        padding: 30,
                        background: `linear-gradient(180deg, hsl(${step.foodHue} 50% 30%) 0%, hsl(${step.foodHue} 40% 18%) 50%, rgba(18,18,22,.95) 100%)`,
                        borderRight: '1px solid rgba(255,255,255,.06)', position: 'relative', overflow: 'hidden',
                    }}>
                        <div style={{ fontSize: 140, lineHeight: 1, filter: 'drop-shadow(0 8px 24px rgba(0,0,0,.5))', textAlign: 'center', marginTop: 10, marginBottom: 18 }}>{step.foodEmoji}</div>
                        <div style={{ fontSize: 9, letterSpacing: '.25em', fontWeight: 700, color: 'rgba(255,255,255,.6)', marginBottom: 6 }}>STEP #{String(step.order).padStart(2, '0')} · {step.dayLabel.toUpperCase()}</div>
                        <h2 style={{ margin: 0, fontFamily: 'Outfit, sans-serif', fontWeight: 300, fontSize: 28, lineHeight: 1.1, letterSpacing: '-.01em', color: '#fff' }}>{step.title}</h2>
                        <p style={{ margin: '14px 0 22px', fontSize: 13, color: 'rgba(255,255,255,.7)', lineHeight: 1.55 }}>{step.desc}</p>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            {[
                                { label: 'OPBRENGST', value: step.yields },
                                { label: 'TIJD', value: step.duration >= 60 ? `${Math.floor(step.duration / 60)}u${step.duration % 60 ? ` ${step.duration % 60}m` : ''}` : `${step.duration}m` },
                                { label: 'TEMP', value: step.recipe?.temp || '—' },
                                { label: 'HOUDBAAR', value: step.holdLabel },
                            ].map(t => (
                                <div key={t.label} style={{ padding: 12, borderRadius: 10, background: 'rgba(0,0,0,.3)', backdropFilter: 'blur(4px)' }}>
                                    <div style={{ fontSize: 9, letterSpacing: '.2em', color: 'rgba(255,255,255,.5)', fontWeight: 700 }}>{t.label}</div>
                                    <div style={{ fontSize: 14, color: '#fff', fontWeight: 600, marginTop: 4 }}>{t.value}</div>
                                </div>
                            ))}
                        </div>

                        <div style={{ marginTop: 20, padding: 12, borderRadius: 10, background: 'rgba(0,0,0,.4)', backdropFilter: 'blur(4px)' }}>
                            <div style={{ fontSize: 9, letterSpacing: '.2em', color: 'rgba(255,255,255,.5)', fontWeight: 700, marginBottom: 4 }}>CONTAINER</div>
                            <div style={{ fontSize: 13, color: '#fff' }}>{step.recipe?.container || '—'}</div>
                        </div>
                    </div>
                )}

                <div style={{ padding: 30, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                    {phase === 'review' && (
                        <>
                            <div style={{ fontSize: 9, letterSpacing: '.2em', color: 'var(--muted-light)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Receptuur</div>
                            <h3 style={{ margin: '0 0 16px', fontFamily: 'Outfit, sans-serif', fontWeight: 400, fontSize: 22 }}>Ingrediënten</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 22 }}>
                                {ingredients.map((ing, i) => (
                                    <div key={i} style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,.02)', border: '1px solid rgba(255,255,255,.04)', fontSize: 13, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <span style={{ width: 22, height: 22, borderRadius: 6, background: `${GOLD}1a`, color: GOLD, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>{i + 1}</span>
                                        {ing}
                                    </div>
                                ))}
                            </div>

                            {steps.length > 0 && (
                                <>
                                    <h3 style={{ margin: '0 0 12px', fontFamily: 'Outfit, sans-serif', fontWeight: 400, fontSize: 22 }}>Werkwijze</h3>
                                    <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 22 }}>
                                        {steps.map((s, i) => (
                                            <li key={i} style={{ padding: 12, borderRadius: 8, background: `${GOLD}0a`, border: `1px solid ${GOLD}1a`, display: 'grid', gridTemplateColumns: '28px 1fr', gap: 10, fontSize: 13, lineHeight: 1.5 }}>
                                                <span style={{ width: 26, height: 26, borderRadius: 8, background: GOLD, color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, fontFamily: 'Outfit, sans-serif' }}>{i + 1}</span>
                                                <span>{s}</span>
                                            </li>
                                        ))}
                                    </ol>
                                </>
                            )}

                            <div style={{ marginTop: 'auto', display: 'flex', gap: 10 }}>
                                <button onClick={onClose} style={{ padding: '8px 14px', borderRadius: 8, background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer', fontSize: 12 }}>Annuleer</button>
                                <button onClick={() => { setPhase('cooking'); onStart(); }} style={{ flex: 1, padding: '10px 14px', borderRadius: 8, background: `linear-gradient(180deg, ${GOLD}, #9e781c)`, color: '#0a0a0c', fontWeight: 600, fontSize: 12, border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                                    <Play size={14} /> Start prep · {step.duration}m timer
                                </button>
                            </div>
                        </>
                    )}

                    {phase === 'cooking' && (
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24, padding: 20 }}>
                            <div style={{ fontSize: 9, letterSpacing: '.2em', color: 'var(--muted-light)', fontWeight: 700, textTransform: 'uppercase' }}>Live timer</div>
                            <LiveTimer durationMin={step.duration} />
                            <div style={{ textAlign: 'center', maxWidth: 320, fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
                                Volg de werkwijze. Druk op <strong>"Klaar"</strong> zodra de prep gereed is — er wordt automatisch een sticker gegenereerd met datum, naam en THT.
                            </div>
                            <button onClick={() => setPhase('sticker')} style={{ padding: '10px 20px', borderRadius: 8, background: `linear-gradient(180deg, ${GOLD}, #9e781c)`, color: '#0a0a0c', fontWeight: 600, fontSize: 13, border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 200, justifyContent: 'center' }}>
                                <CheckCircle size={14} /> Klaar · genereer sticker
                            </button>
                        </div>
                    )}

                    {phase === 'sticker' && (
                        <div style={{ padding: 30, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: 48, marginBottom: 8, color: '#22c55e' }}>✓</div>
                                <h2 style={{ margin: 0, fontFamily: 'Outfit, sans-serif', fontWeight: 300, fontSize: 28 }}>Prep klaar!</h2>
                                <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>Plak de sticker op de container</div>
                            </div>
                            <div style={{ padding: 30, background: `radial-gradient(ellipse at center, ${BRAND}10, transparent 70%)` }}>
                                <Sticker step={step} />
                            </div>
                            <div style={{ display: 'flex', gap: 10 }}>
                                <button onClick={() => window.print()} style={{ padding: '8px 14px', borderRadius: 8, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', cursor: 'pointer', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                    <Printer size={14} /> Print sticker
                                </button>
                                <button onClick={() => { onComplete(); onClose(); }} style={{ padding: '8px 14px', borderRadius: 8, background: `linear-gradient(180deg, ${GOLD}, #9e781c)`, color: '#0a0a0c', fontWeight: 600, fontSize: 12, border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                    <Check size={14} /> Done — naar volgende prep
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   STICKER (printed when prep is done)
   ═══════════════════════════════════════════════════════════════════ */
function Sticker({ step, name = 'Joris' }: { step: PrepStep; name?: string }) {
    const dateStr = new Date().toLocaleDateString('nl-NL', { day: '2-digit', month: 'short' });
    const expiry = new Date(Date.now() + step.holdMin * 60 * 1000).toLocaleDateString('nl-NL', { day: '2-digit', month: 'short' });
    return (
        <div style={{
            width: 280, padding: 18, borderRadius: 8,
            background: 'linear-gradient(180deg, #fafaf3, #f0eee2)',
            color: '#1a1a1a', fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
            boxShadow: '0 12px 40px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.8)',
            transform: 'rotate(-2deg)', border: '2px dashed rgba(0,0,0,.15)', position: 'relative',
        }}>
            <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%) rotate(2deg)', width: 80, height: 24, background: 'rgba(255,255,255,.5)', borderLeft: '1px dashed rgba(0,0,0,.2)', borderRight: '1px dashed rgba(0,0,0,.2)', backdropFilter: 'blur(4px)' }} />
            <div style={{ fontSize: 9, letterSpacing: '.25em', fontWeight: 700, color: '#666', marginBottom: 10 }}>HOP &amp; BITES · MISE EN PLACE</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4, lineHeight: 1.2 }}>{step.title}</div>
            <div style={{ fontSize: 11, color: '#444', marginBottom: 12 }}>{step.yields}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 10, marginBottom: 10 }}>
                <div>
                    <div style={{ color: '#888', fontSize: 8, letterSpacing: '.15em' }}>BEREID</div>
                    <div style={{ fontWeight: 700, fontSize: 12 }}>{dateStr}</div>
                </div>
                <div>
                    <div style={{ color: '#888', fontSize: 8, letterSpacing: '.15em' }}>THT</div>
                    <div style={{ fontWeight: 700, fontSize: 12 }}>{expiry}</div>
                </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px dashed rgba(0,0,0,.2)', paddingTop: 8, fontSize: 10 }}>
                <span style={{ color: '#444' }}>door <strong>{name}</strong></span>
                <span style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 600, fontSize: 14 }}>#{String(step.order).padStart(2, '0')}</span>
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   LIVE TIMER
   ═══════════════════════════════════════════════════════════════════ */
function LiveTimer({ durationMin }: { durationMin: number }) {
    const [secs, setSecs] = useState(durationMin * 60);
    const [running, setRunning] = useState(true);

    useEffect(() => {
        if (!running) return;
        const i = setInterval(() => setSecs(s => Math.max(0, s - 1)), 1000);
        return () => clearInterval(i);
    }, [running]);

    const total = durationMin * 60;
    const pct = ((total - secs) / total) * 100;
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;

    return (
        <div style={{ position: 'relative', width: 200, height: 200 }}>
            <svg viewBox="0 0 100 100" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
                <circle cx="50" cy="50" r="44" stroke="rgba(255,255,255,.06)" strokeWidth="6" fill="none" />
                <circle cx="50" cy="50" r="44" stroke="url(#timerGrad)" strokeWidth="6" fill="none"
                    strokeLinecap="round"
                    strokeDasharray={`${pct * 2.764} 276.4`}
                    style={{ transition: 'stroke-dasharray .5s' }} />
                <defs>
                    <linearGradient id="timerGrad" x1="0" x2="1">
                        <stop offset="0%" stopColor={BRAND} />
                        <stop offset="100%" stopColor={GOLD} />
                    </linearGradient>
                </defs>
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontSize: 10, letterSpacing: '.25em', color: 'var(--muted)', fontWeight: 700 }}>{running ? 'BEZIG' : 'GEPAUZEERD'}</div>
                <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 300, fontSize: 36, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                    {h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`}
                </div>
                <button onClick={() => setRunning(r => !r)} style={{
                    marginTop: 10, padding: '6px 14px', borderRadius: 8,
                    background: 'rgba(255,255,255,.05)', border: '1px solid var(--border)',
                    color: 'var(--muted)', fontSize: 11, fontWeight: 600,
                    cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
                }}>
                    {running ? <Pause size={11} /> : <Play size={11} />}
                    {running ? 'Pauze' : 'Hervat'}
                </button>
            </div>
        </div>
    );
}
