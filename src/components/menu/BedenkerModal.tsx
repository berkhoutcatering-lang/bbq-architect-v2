/* ═══════════════════════════════════════════════════════════════
   BedenkerModal — AI gerechten-brainstorm (3 modes)
   Bucket C P0-3/P0-10. Wraps de bestaande /bedenker functionaliteit
   in een modal. Modal-state via URL ?modal=bedenker zodat refresh
   en deeplinks blijven werken (middleware redirect verbouwt /bedenker
   → /gerechten?modal=bedenker).

   2026-09-14: de popup gooide de receptuur weg — alleen zes ingrediënt-
   námen bleven over, de kostprijs was een AI-gok en het paneel rechts
   toonde vaste teksten ("12 combinaties overwogen"). Nu bewaart hij de
   hele receptuur (hoeveelheden, stappen, battle plan), laat de
   catalogus-matcher de kostprijs afleiden uit echte prijzen en toont
   rechts wat er wérkelijk opgeleverd en gekoppeld is.
   ═══════════════════════════════════════════════════════════════ */

'use client';

import { useEffect, useState } from 'react';
import { Pencil, Package, Users, Sparkles, X, Plus, RefreshCw } from 'lucide-react';
import { MRButton, MREyebrow, MRTag } from './atoms';
import { fmtEuro } from './helpers';
import type { AiFillResult, AiFillMeta, AiFillIngredient } from '@/components/RecipeAiButton';
import type { MatchRegel } from '@/lib/ingredientMatchDb';
import { IngredientAlternatieven } from './IngredientAlternatieven';

type BedenkerMode = 'vrij' | 'voorraad' | 'klant';

/* Overdracht van een geaccepteerd resultaat naar het gerecht-formulier wanneer
   de modal buiten dat formulier gemount is (layout, ?modal=bedenker). */
export const BEDENKER_HANDOFF_KEY = 'bedenker:handoff';
export const BEDENKER_HANDOFF_EVENT = 'bedenker:handoff';

export interface BedenkerCitation {
    source_title: string;
    cited_text: string;
}

export interface BedenkerResult {
    name: string;
    desc: string;
    gang: string;
    /* Kostprijs p.p. in euro, afgeleid uit gekoppelde catalogus-rijen.
       0 = niets gekoppeld → UI toont "nog geen kostprijs", geen bedrag. */
    cost: number;
    /* Hoeveel ingrediënten aan een echte prijs hangen, van het totaal. */
    matchedCount: number;
    totalCount: number;
    /* Ingrediënten mét hoeveelheid per portie, voor de preview-chips. */
    ingredients: Array<{ naam: string; qtyPp: number; unit: string; matched: boolean; supplier: string | null; approx: boolean; confidence: 'hoog' | 'middel' | 'laag' | null; toelichting: string | null }>;
    /* De leverancier waarop de kostprijs rekent (voorkeur_rang 1), of null als
       er geen voorkeur is ingesteld en over alle leveranciers gezocht is. */
    kostprijsLeverancier: string | null;
    /* Het complete formulier-payload, in dezelfde shape als de
       "AI: vul recept in"-knop levert, zodat het gerecht-formulier er
       niets anders mee hoeft te doen. */
    fill: AiFillResult;
    meta: AiFillMeta;
    /* Extra velden die AiFillResult niet kent maar het formulier wel. */
    battlePlan: string[];
    /* Bereidingstijd in seconden (formulier-veld target_prep_time). */
    prepTimeSeconds: number;
    /* Allergenen die de AI noemt — alleen ter info in de preview. Ze gaan
       NIET automatisch het formulier in: de allergeencheck bij opslaan
       legt ze vast mét herkomst. */
    allergenenSuggestie: string[];
    /* P0-C (2026-05-25): Citations API output — per-claim source-attribution
       uit het tenant-repertoire. */
    citations?: BedenkerCitation[];
    citationsEnabled?: boolean;
    inspiredBy?: string[];
}

interface Props {
    open: boolean;
    onClose: () => void;
    /* Optioneel: backend-hook die een idee genereert. Als undefined doet
       defaultGenerate een echte fetch naar /api/recipe-generate. */
    onGenerate?: (input: { mode: BedenkerMode; prompt: string }) => Promise<BedenkerResult | null>;
    /* Aangeroepen als de gebruiker "Maak gerecht" klikt — de parent opent
       het gerecht-formulier en vult het met result.fill. */
    onAccept?: (result: BedenkerResult) => void;
}

/* Ruwe ingrediënt-regel zoals /api/recipe-generate hem teruggeeft. */
interface RawIngredient { naam?: string; hoeveelheid?: number | string; eenheid?: string }

/* Stap 1: AI bedenkt het gerecht (naam, receptuur, stappen).
   Stap 2: de catalogus-matcher koppelt elk ingrediënt aan een echte prijs-
   bron en leidt de kostprijs af — de AI rekent hier niets. Faalt stap 2,
   dan blijft de receptuur staan en is de kostprijs eerlijk "onbekend". */
async function defaultGenerate({ mode, prompt }: { mode: BedenkerMode; prompt: string }): Promise<BedenkerResult | null> {
    const flavourContext: Record<string, unknown> = {};
    if (mode === 'voorraad') flavourContext.voorraad = prompt;
    if (mode === 'klant') flavourContext.context = prompt;

    const t0 = Date.now();
    const res = await fetch('/api/recipe-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            prompt: mode === 'vrij' ? prompt : 'Bedenk een passend gerecht',
            mode: 'recipe',
            options: { flavour: mode, flavourContext },
        }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Onbekende fout' }));
        throw new Error(err.error ?? `HTTP ${res.status}`);
    }
    const body = await res.json();
    const data = body.data ?? {};

    /* De AI geeft hoeveelheden voor `porties` (standaard 10); het formulier
       en de matcher rekenen per portie (qty_pp). */
    const porties = Math.max(1, Number(data.porties) || 10);
    const raw: RawIngredient[] = Array.isArray(data.ingredienten) ? data.ingredienten : [];
    const rows = raw
        .map((i) => ({
            naam: String(i.naam ?? '').trim(),
            eenheid: String(i.eenheid ?? '').trim() || 'stuks',
            qtyPp: Math.round((Number(i.hoeveelheid) || 0) / porties * 1000) / 1000,
        }))
        .filter((i) => i.naam.length > 0);

    let matches: any[] = [];
    let kostprijsCents = 0;
    let matchedCount = 0;
    let kostprijsLeverancier: string | null = null;
    if (rows.length > 0) {
        try {
            const mr = await fetch('/api/recipe/match-ingredients', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ingredients: rows.map((i) => ({ naam: i.naam, qty_pp: i.qtyPp, eenheid: i.eenheid })),
                    /* Golf 4: geen treffer → de AI zoekt synoniemen, meteen. */
                    ai: true,
                }),
            });
            const mb = await mr.json();
            if (mr.ok && mb.success) {
                matches = mb.data?.ingredients || [];
                kostprijsCents = mb.data?.kostprijs_pp_cents || 0;
                matchedCount = mb.data?.matched_count || 0;
                kostprijsLeverancier = mb.data?.kostprijs_leverancier ?? null;
            }
        } catch { /* matcher stuk → receptuur blijft, kostprijs onbekend */ }
    }

    const ingredient_costs: AiFillIngredient[] = rows.map((i, idx) => {
        const m = matches[idx]?.match || null;
        const hasCost = !!(m && m.line_cost_cents != null);
        const perUnit = hasCost && i.qtyPp > 0 ? (m.line_cost_cents / 100) / i.qtyPp : null;
        return {
            naam: i.naam,
            inventory_id: null,
            qty_pp: i.qtyPp,
            unit: i.eenheid,
            yield: 1,
            is_estimated: !hasCost,
            estimated_price_eur: perUnit,
            match: m,
        };
    });

    const stappen: string[] = Array.isArray(data.instructies)
        ? data.instructies.map((s: unknown) => String(s).trim()).filter(Boolean)
        : [];
    const battlePlan: string[] = Array.isArray(data.battle_plan)
        ? data.battle_plan.map((s: unknown) => String(s).trim()).filter(Boolean)
        : [];
    const allergenen: string[] = Array.isArray(data.allergenen)
        ? data.allergenen.map((s: unknown) => String(s).trim()).filter(Boolean)
        : [];
    /* Stijl-tags (BBQ, rook, zomer) mogen van de AI komen; dieetclaims niet.
       Hij plakte "vegan" en "glutenvrij" op een saus met Worcestersaus
       (ansjovis) waar de allergeencheck gluten op zette. Zo'n claim doet de
       kok, na de allergeencheck — niet het model. */
    const DIEETCLAIMS = new Set(['vegan', 'veganistisch', 'vega', 'vegetarisch', 'glutenvrij', 'lactosevrij', 'notenvrij', 'halal', 'kosher', 'koosjer', 'suikervrij']);
    const tags: string[] = Array.isArray(data.tags)
        ? data.tags.map((s: unknown) => String(s).trim()).filter((t: string) => t && !DIEETCLAIMS.has(t.toLowerCase()))
        : [];

    const fill: AiFillResult = {
        naam: data.naam ?? 'Naamloos gerecht',
        beschrijving: data.beschrijving ?? '',
        porties,
        ingredient_costs,
        bereidingswijze: stappen.map((s, i) => `${i + 1}. ${s}`).join('\n'),
        allergenen: [],   // compliance: nooit AI-afgeleid — de allergeencheck bij opslaan doet dit mét herkomst
        tags,
        wijn_suggestie: data.wijn_suggestie ?? '',
        service_tip: data.service_tip ?? '',
        kostprijs_pp_schatting: kostprijsCents / 100,
        gangcategorie: data.gang ?? data.categorie ?? undefined,
    };
    const meta: AiFillMeta = {
        inventory_size: 0,
        matched_count: matchedCount,
        estimated_count: Math.max(0, rows.length - matchedCount),
        cost_cents: body.usage?.cost_eur_cents ?? 0,
        elapsed_ms: Date.now() - t0,
    };

    return {
        name: fill.naam,
        desc: fill.beschrijving,
        gang: fill.gangcategorie ?? 'Onbekend',
        cost: kostprijsCents / 100,
        matchedCount,
        totalCount: rows.length,
        ingredients: rows.map((i, idx) => ({
            naam: i.naam, qtyPp: i.qtyPp, unit: i.eenheid,
            matched: !!(matches[idx]?.match && matches[idx].match.line_cost_cents != null),
            supplier: matches[idx]?.match?.supplier ?? (matches[idx]?.match ? 'eigen' : null),
            approx: !!matches[idx]?.match?.unit_approx,
            confidence: matches[idx]?.match?.confidence ?? null,
            toelichting: matches[idx]?.match?.via_alias ? 'Eerder door jou bevestigd'
                : matches[idx]?.match?.via_ai ? `AI: ${matches[idx].match.ai_reden ?? 'zelfde product, andere naam'}`
                : matches[idx]?.ai_voorstel ? `AI stelt voor: ${matches[idx].ai_voorstel.name} — ${matches[idx].ai_voorstel.reden} (ander product, jij beslist)`
                : null,
        })),
        kostprijsLeverancier,
        fill,
        meta,
        battlePlan,
        prepTimeSeconds: Math.max(0, Math.round(Number(data.preptime) || 0)) * 60,
        allergenenSuggestie: allergenen,
        citations: Array.isArray(body.citations) ? body.citations : [],
        citationsEnabled: Boolean(body.citationsEnabled),
        inspiredBy: Array.isArray(data.inspired_by) ? data.inspired_by : [],
    };
}

/* Hoeveelheid per portie leesbaar: 0.025 kg → "25 g", 0.5 → "0,5". */
function fmtQty(qty: number, unit: string): string {
    if (!qty) return '';
    const u = unit.toLowerCase();
    if (u === 'kg' && qty < 1) return `${Math.round(qty * 1000)} g`;
    if ((u === 'l' || u === 'liter') && qty < 1) return `${Math.round(qty * 1000)} ml`;
    const n = qty >= 10 ? Math.round(qty) : Math.round(qty * 100) / 100;
    return `${String(n).replace('.', ',')} ${unit}`;
}

const MODES: Array<{ id: BedenkerMode; label: string; Icon: typeof Pencil }> = [
    { id: 'vrij',     label: 'Vrij',              Icon: Pencil },
    { id: 'voorraad', label: 'Voorraad-gebaseerd', Icon: Package },
    { id: 'klant',    label: 'Klant-context',      Icon: Users },
];

const PROMPT_PLACEHOLDERS: Record<BedenkerMode, string> = {
    vrij: 'Bijv. "Een vegetarisch hoofdgerecht met Aziatische smaken en smoke"',
    voorraad: 'AI analyseert je huidige voorraad en stelt gerechten voor…',
    klant: 'Bijv. "Bruiloft, 80 personen, 3 vegetariërs, glutenvrij kind"',
};

const PROMPT_LABELS: Record<BedenkerMode, string> = {
    vrij: 'Beschrijf je gerecht-idee',
    voorraad: 'AI bekijkt je huidige voorraad',
    klant: 'Beschrijf het event & dieetwensen',
};

/* Wat er écht gebeurt tijdens het wachten — twee stappen, geen toneel. */
const THINKING_STEPS = [
    'AI schrijft receptuur en stappen…',
    'Ingrediënten koppelen aan je catalogus…',
];
/* Feitelijke tellingen — elk regeltje is controleerbaar in het resultaat. */
function summaryLines(r: BedenkerResult): Array<{ ok: boolean; text: string }> {
    const steps = r.fill.bereidingswijze ? r.fill.bereidingswijze.split('\n').filter(Boolean).length : 0;
    return [
        { ok: r.totalCount > 0, text: r.totalCount > 0 ? `${r.totalCount} ingrediënten met hoeveelheid` : 'Geen ingrediënten teruggekregen' },
        { ok: r.matchedCount > 0, text: r.kostprijsLeverancier
            ? `${r.matchedCount} van ${r.totalCount} gevonden bij ${r.kostprijsLeverancier} of in eigen bibliotheek`
            : `${r.matchedCount} van ${r.totalCount} gekoppeld aan een echte prijs` },
        { ok: steps > 0, text: steps > 0 ? `${steps} bereidingsstappen` : 'Geen bereidingsstappen' },
        { ok: r.battlePlan.length > 0, text: r.battlePlan.length > 0 ? `Battle plan: ${r.battlePlan.length} stappen` : 'Geen battle plan' },
        { ok: r.prepTimeSeconds > 0, text: r.prepTimeSeconds > 0 ? `Bereidingstijd ≈ ${Math.round(r.prepTimeSeconds / 60)} min` : 'Geen bereidingstijd' },
        { ok: false, text: r.allergenenSuggestie.length > 0 ? `AI noemt: ${r.allergenenSuggestie.join(', ')} — check bij opslaan` : 'Allergenen: check bij opslaan' },
    ];
}

export function BedenkerModal({ open, onClose, onGenerate, onAccept }: Props) {
    const [mode, setMode] = useState<BedenkerMode>('vrij');
    const [prompt, setPrompt] = useState('');
    const [thinking, setThinking] = useState(false);
    const [result, setResult] = useState<BedenkerResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    /* Welke ingrediënt-chip het alternatieven-paneel open heeft. */
    const [altIdx, setAltIdx] = useState<number | null>(null);

    /* Een gekozen alternatief (of "laat leeg") landt in fill.ingredient_costs
       én in de preview, en de kostprijs wordt opnieuw opgeteld uit de regels
       die een prijs hebben. De AI-gok komt er niet meer aan te pas. */
    function zetKoppeling(idx: number, match: MatchRegel | null) {
        setResult((r) => {
            if (!r) return r;
            const rows = r.fill.ingredient_costs.map((row, i) => {
                if (i !== idx) return row;
                const hasCost = !!(match && match.line_cost_cents != null);
                const perUnit = hasCost && row.qty_pp > 0 ? (match!.line_cost_cents! / 100) / row.qty_pp : null;
                return { ...row, match, is_estimated: !hasCost, estimated_price_eur: perUnit };
            });
            const cents = rows.reduce((s, row) => s + (row.match?.line_cost_cents ?? 0), 0);
            const matched = rows.filter((row) => row.match && row.match.line_cost_cents != null).length;
            return {
                ...r,
                fill: { ...r.fill, ingredient_costs: rows, kostprijs_pp_schatting: cents / 100 },
                cost: cents / 100,
                matchedCount: matched,
                ingredients: r.ingredients.map((ing, i) => i !== idx ? ing : {
                    ...ing,
                    matched: !!(match && match.line_cost_cents != null),
                    supplier: match ? (match.supplier ?? (match.source === 'component' || match.source === 'inventory' ? 'eigen' : null)) : null,
                    approx: !!match?.unit_approx,
                    confidence: match?.confidence ?? null,
                    toelichting: match ? 'Door jou gekozen' : null,
                }),
            };
        });
        setAltIdx(null);
    }

    /* Reset bij open */
    useEffect(() => {
        if (open) { setMode('vrij'); setPrompt(''); setResult(null); setThinking(false); setAltIdx(null); }
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    if (!open) return null;

    const handleGenerate = async () => {
        if (mode !== 'voorraad' && prompt.trim().length === 0) return;
        setThinking(true);
        setResult(null);
        setError(null);
        try {
            const generator = onGenerate ?? defaultGenerate;
            const r = await generator({ mode, prompt });
            setResult(r);
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'AI-call mislukt';
            setError(msg);
        } finally {
            setThinking(false);
        }
    };

    return (
        <div className="mr-modal-scrim" onClick={onClose} role="presentation">
            <div
                className="mr-bedenker-modal"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="bedenker-modal-title"
            >
                {/* Header */}
                <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '20px 24px', borderBottom: '1px solid var(--border)',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Sparkles size={20} color="var(--brand)" />
                        <h3 id="bedenker-modal-title" style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 500, margin: 0 }}>
                            Bedenk met AI
                        </h3>
                    </div>
                    <button
                        onClick={onClose}
                        aria-label="Sluit"
                        style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}
                    >
                        <X size={18} />
                    </button>
                </div>

                <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
                    {/* Left: input */}
                    <div style={{
                        flex: 1, padding: '20px 24px', display: 'flex', flexDirection: 'column',
                        gap: 16, borderRight: '1px solid var(--border)', overflowY: 'auto',
                    }}>
                        {/* Mode segmented control */}
                        <div style={{
                            display: 'flex', gap: 0, padding: 3,
                            background: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: 10,
                        }}>
                            {MODES.map((m) => {
                                const I = m.Icon;
                                const active = mode === m.id;
                                return (
                                    <button
                                        key={m.id}
                                        onClick={() => setMode(m.id)}
                                        aria-pressed={active}
                                        style={{
                                            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            gap: 6, padding: '8px 12px', borderRadius: 7,
                                            background: active ? 'rgba(255,191,0,.08)' : 'transparent',
                                            border: active ? '1px solid rgba(255,191,0,.25)' : '1px solid transparent',
                                            color: active ? 'var(--brand)' : 'var(--muted)',
                                            cursor: 'pointer', fontSize: 12, fontWeight: 600,
                                            fontFamily: 'var(--font-sans)', transition: '.15s',
                                        }}
                                    >
                                        <I size={13} /> {m.label}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Prompt input */}
                        <div>
                            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 6, display: 'block' }}>
                                {PROMPT_LABELS[mode]}
                            </label>
                            <textarea
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                placeholder={PROMPT_PLACEHOLDERS[mode]}
                                disabled={mode === 'voorraad'}
                                style={{
                                    width: '100%', height: 120, padding: 12, borderRadius: 10,
                                    background: 'var(--bg-subtle)', border: '1px solid var(--border)',
                                    color: 'var(--text)', fontSize: 13, fontFamily: 'var(--font-sans)',
                                    resize: 'none', outline: 'none',
                                }}
                            />
                        </div>

                        <MRButton
                            variant="primary"
                            icon={<Sparkles size={14} />}
                            onClick={handleGenerate}
                            disabled={thinking || (mode !== 'voorraad' && prompt.trim().length === 0)}
                        >
                            {thinking ? 'Bezig met bedenken…' : 'Genereer gerecht'}
                        </MRButton>

                        {/* Error display */}
                        {error && (
                            <div style={{
                                padding: 12, borderRadius: 10,
                                background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.25)',
                                fontSize: 12, color: 'var(--red, #ef4444)',
                            }}>
                                Fout: {error}
                            </div>
                        )}

                        {/* Result */}
                        {result && (
                            <div style={{
                                padding: 16, borderRadius: 12,
                                background: 'rgba(255,191,0,.04)', border: '1px solid rgba(255,191,0,.15)',
                            }}>
                                <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 500 }}>{result.name}</div>
                                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, lineHeight: 1.5 }}>{result.desc}</div>
                                <div style={{ display: 'flex', gap: 12, marginTop: 10, fontSize: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                                    <MRTag>{result.gang}</MRTag>
                                    {result.cost > 0 ? (
                                        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                                            Kostprijs: {fmtEuro(result.cost)} p.p.
                                            <span style={{ color: 'var(--muted)' }}> · {result.matchedCount} van {result.totalCount} ingrediënten gekoppeld{result.kostprijsLeverancier ? ` (${result.kostprijsLeverancier})` : ''}</span>
                                        </span>
                                    ) : (
                                        <span style={{ color: 'var(--muted)' }}>Nog geen kostprijs — koppel de ingrediënten in het formulier</span>
                                    )}
                                    {result.fill.porties ? <span style={{ color: 'var(--muted)' }}>Receptuur voor {result.fill.porties} porties</span> : null}
                                </div>

                                {/* Ingrediënten preview */}
                                {result.ingredients.length > 0 && (
                                    <div style={{ marginTop: 12 }}>
                                        <MREyebrow style={{ marginBottom: 6 }}>Ingrediënten per portie</MREyebrow>
                                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                            {result.ingredients.map((c, i) => (
                                                <button type="button" key={i} onClick={() => setAltIdx(altIdx === i ? null : i)} title={[
                                                    c.matched
                                                        ? `Prijs uit ${c.supplier === 'eigen' ? 'je eigen bibliotheek of voorraad' : c.supplier ?? 'de catalogus'}${c.approx ? ' — gram en milliliter 1:1 gerekend' : ''}`
                                                        : result.kostprijsLeverancier ? `Niet gevonden bij ${result.kostprijsLeverancier}` : 'Nog geen prijsbron gevonden',
                                                    c.toelichting,
                                                ].filter(Boolean).join(' · ')} style={{
                                                    fontSize: 11, padding: '3px 8px', borderRadius: 5, cursor: 'pointer', fontFamily: 'var(--font-sans)',
                                                    outline: altIdx === i ? '2px solid var(--brand)' : 'none',
                                                    background: c.matched ? 'rgba(34,197,94,.07)' : 'rgba(196,163,90,.08)',
                                                    border: c.matched ? '1px solid rgba(34,197,94,.3)' : '1px solid rgba(196,163,90,.2)',
                                                    color: 'var(--text)',
                                                }}>
                                                    {c.naam}
                                                    {c.qtyPp > 0 && <span style={{ color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}> · {fmtQty(c.qtyPp, c.unit)}</span>}
                                                    {c.matched && c.supplier && c.supplier !== 'eigen' && <span style={{ color: 'var(--green, #22c55e)' }}> · {c.supplier}{c.approx ? ' ≈' : ''}</span>}
                                                    {c.matched && c.supplier === 'eigen' && <span style={{ color: 'var(--green, #22c55e)' }}> · eigen</span>}
                                                    {(!c.matched || c.confidence !== 'hoog') && <span style={{ color: 'var(--brand)' }}> · {c.matched ? '?' : 'kies'}</span>}
                                                </button>
                                            ))}
                                        </div>
                                        <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 6 }}>
                                            Klik op een ingrediënt voor alternatieven. Groen = gekoppeld aan een echte prijs, ? = twijfel, kies = niets gevonden.
                                        </div>
                                        {altIdx != null && result.ingredients[altIdx] && (
                                            <IngredientAlternatieven
                                                naam={result.ingredients[altIdx].naam}
                                                qtyPp={result.ingredients[altIdx].qtyPp}
                                                unit={result.ingredients[altIdx].unit}
                                                huidige={(result.fill.ingredient_costs[altIdx]?.match as MatchRegel | null | undefined) ?? null}
                                                onKies={(m) => zetKoppeling(altIdx, m)}
                                                onLeeg={() => zetKoppeling(altIdx, null)}
                                                onSluit={() => setAltIdx(null)}
                                            />
                                        )}
                                    </div>
                                )}

                                {/* Bereiding — eerste stappen, de rest staat in het formulier */}
                                {result.fill.bereidingswijze && (
                                    <div style={{ marginTop: 12 }}>
                                        <MREyebrow style={{ marginBottom: 6 }}>Bereiding</MREyebrow>
                                        <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--text)', lineHeight: 1.5 }}>
                                            {result.fill.bereidingswijze.split('\n').slice(0, 4).map((s, i) => (
                                                <li key={i}>{s.replace(/^\d+\.\s*/, '')}</li>
                                            ))}
                                        </ol>
                                        {result.fill.bereidingswijze.split('\n').length > 4 && (
                                            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                                                + {result.fill.bereidingswijze.split('\n').length - 4} stappen meer in het formulier
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* P0-C: Citations chips — per claim source-attribution.
                                    Inspired-by zijn de aangewezen stijl-bron-gerechten;
                                    citations zijn de daadwerkelijke text-spans uit Anthropic API. */}
                                {result.citationsEnabled && (result.inspiredBy?.length || result.citations?.length) ? (
                                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,.06)' }}>
                                        <MREyebrow style={{ marginBottom: 6 }}>
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                                <Sparkles size={10} /> Geïnspireerd door
                                            </span>
                                        </MREyebrow>
                                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                            {(result.inspiredBy ?? []).map((src, i) => (
                                                <span key={`ib-${i}`} style={{
                                                    fontSize: 11, padding: '3px 8px', borderRadius: 5,
                                                    background: 'rgba(255,191,0,.08)', border: '1px solid rgba(255,191,0,.25)',
                                                    color: 'var(--brand)', fontWeight: 600,
                                                }} title="Uit jouw repertoire — AI-bevestigde stijl-bron">
                                                    {src}
                                                </span>
                                            ))}
                                            {(result.citations ?? []).slice(0, 3).map((c, i) => (
                                                <span key={`c-${i}`} style={{
                                                    fontSize: 10, padding: '2px 7px', borderRadius: 5,
                                                    background: 'rgba(34,197,94,.06)', border: '1px solid rgba(34,197,94,.2)',
                                                    color: 'var(--green, #22c55e)', fontStyle: 'italic',
                                                }} title={c.cited_text}>
                                                    ✓ {c.source_title}
                                                </span>
                                            ))}
                                        </div>
                                        <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 6, fontStyle: 'italic' }}>
                                            Bronnen uit jouw eigen gerechten-lijst — geen hallucinatie
                                        </div>
                                    </div>
                                ) : null}

                                <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                                    <MRButton variant="primary" icon={<Plus size={13} />} sm onClick={() => onAccept?.(result)}>
                                        Maak gerecht
                                    </MRButton>
                                    <MRButton variant="ghost" icon={<RefreshCw size={13} />} sm onClick={handleGenerate}>Opnieuw</MRButton>
                                </div>
                            </div>
                        )}

                        {/* Thinking indicator */}
                        {thinking && (
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 10, padding: 14, borderRadius: 10,
                                background: 'rgba(255,191,0,.04)', border: '1px solid rgba(255,191,0,.12)',
                            }}>
                                <div style={{
                                    width: 20, height: 20,
                                    border: '2px solid var(--brand)', borderTopColor: 'transparent',
                                    borderRadius: '50%', animation: 'mr-spin 1s linear infinite',
                                }} />
                                <span style={{ fontSize: 13, color: 'var(--brand)' }}>AI denkt na over je gerecht…</span>
                            </div>
                        )}
                    </div>

                    {/* Right: thinking trail */}
                    <div style={{
                        width: 260, padding: '20px 16px',
                        display: 'flex', flexDirection: 'column', gap: 12,
                        background: 'rgba(0,0,0,.2)', overflowY: 'auto',
                    }}>
                        <MREyebrow>Wat de AI opleverde</MREyebrow>
                        {thinking ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {THINKING_STEPS.map((step, i) => (
                                    <div
                                        key={i}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: 8,
                                            padding: '8px 10px', borderRadius: 7,
                                            background: 'rgba(255,191,0,.04)', border: '1px solid rgba(255,191,0,.08)',
                                            fontSize: 11, color: 'var(--muted)',
                                        }}
                                    >
                                        <div style={{
                                            width: 14, height: 14,
                                            border: '2px solid var(--brand)', borderTopColor: 'transparent',
                                            borderRadius: '50%', animation: 'mr-spin 1s linear infinite',
                                        }} />
                                        {step}
                                    </div>
                                ))}
                            </div>
                        ) : result ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {summaryLines(result).map((s, i) => (
                                    <div key={i} style={{
                                        fontSize: 11, color: s.ok ? 'var(--green, #22c55e)' : 'var(--muted)',
                                        padding: '6px 8px', borderRadius: 5,
                                        background: s.ok ? 'rgba(34,197,94,.05)' : 'rgba(255,255,255,.03)',
                                    }}>{s.ok ? '✓ ' : '○ '}{s.text}</div>
                                ))}
                                <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 6, lineHeight: 1.5 }}>
                                    {result.kostprijsLeverancier
                                        ? `Kostprijs rekent op ${result.kostprijsLeverancier} (je kostprijs-leverancier) plus je eigen bibliotheek en voorraad — niet op de AI.`
                                        : 'Kostprijs komt uit je eigen catalogus en voorraad, niet uit de AI.'} Allergenen worden bij opslaan gecheckt en vastgelegd.
                                </div>
                            </div>
                        ) : (
                            <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>
                                Genereer een gerecht; hier zie je wat er echt is opgeleverd en gekoppeld.
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
