/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

/* /inspiratie/gerechten — PR6 Inspiratie Bibliotheek
   Toont gerechten met:
   - total_cost_cents (auto-rollup uit gekoppelde components)
   - ⭐ is_in_wizard toggle (subset voor offerte-wizard)
   - Drawer: components-koppeling (add quantity_used + delete)
   - Marge-badge (verkoopprijs vs total_cost — kleur op marge%)
   De prijs-veld (verkoopprijs) blijft via de bestaande /gerechten page worden onderhouden;
   deze pagina richt zich op de NIEUWE component-laag + wizard-curatie. */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
    ChefHat, ArrowLeft, Loader2, Search, Star, Sparkles,
    Plus, Trash2, X, Boxes, TrendingUp, ArrowUp, ArrowDown, Replace, LogOut, Lightbulb,
    ShieldAlert, ThermometerSun, Flame,
} from 'lucide-react';

function emojiForGerecht(name: string): string {
    const n = name.toLowerCase();
    if (/pork|spek|varken/.test(n)) return '🐖';
    if (/burger|slider/.test(n)) return '🍔';
    if (/rib|brisket|steak|beef|rund/.test(n)) return '🥩';
    if (/kip|chicken|gevogelte|hen/.test(n)) return '🍗';
    if (/vis|fish|zalm|tonijn/.test(n)) return '🐟';
    if (/garnaal|kreeft|shrimp|lobster|oester/.test(n)) return '🦞';
    if (/burnt|bonbon|truffel/.test(n)) return '✨';
    if (/coleslaw|salad|sla/.test(n)) return '🥗';
    if (/mac|kaas|cheese/.test(n)) return '🧀';
    if (/tofu|veggie|vega/.test(n)) return '🌱';
    if (/brownie|chocolade|dessert|melba|crumble/.test(n)) return '🍰';
    if (/peach|perzik|ananas|mango|tropical/.test(n)) return '🍑';
    if (/bbq|grill|gerookt|smoked/.test(n)) return '🔥';
    return '🍽️';
}

const ALLERGEN_LABELS: Record<string, string> = {
    G: 'gluten', L: 'lactose', N: 'noten', V: 'vis', E: 'ei', S: 'soja',
    Sd: 'sesam', M: 'mosterd', W: 'weekdieren', Sl: 'selderij',
    Lp: 'lupine', Sf: 'sulfiet', Sc: 'schaaldieren', P: 'pinda',
};

interface RollupAllergen {
    allergen_code: string;
    from_components: string[];
    has_ai_only: boolean;
}
interface RollupHaccp {
    component_name: string;
    type: string;
    threshold_value: number | null;
    threshold_unit: string | null;
    note: string | null;
    ai_suggested: boolean;
}
import PageHeader from '@/components/PageHeader';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';

interface GerechtRow {
    id: string;
    naam: string;
    beschrijving: string | null;
    verkoopprijs: number | null;
    total_cost_cents: number;
    is_in_wizard: boolean;
}

interface ComponentRow {
    id: number;
    name: string;
    type: 'prepared' | 'bought_in';
    base_quantity: number;
    base_unit: string;
    base_cost_cents: number;
}

interface GerechtComponentRow {
    gerecht_id: string;
    component_id: number;
    quantity_used: number;
    unit: string;
    cost_at_use_cents: number;
    components: ComponentRow | null;
}

function formatEuro(cents: number): string {
    return `€${(cents / 100).toFixed(2)}`;
}

function priceCents(verkoopprijs: number | null): number {
    return verkoopprijs != null ? Math.round(verkoopprijs * 100) : 0;
}

function margePct(verkoopprijs: number | null, total_cost_cents: number): number | null {
    const verkoopCents = priceCents(verkoopprijs);
    if (verkoopCents <= 0) return null;
    return ((verkoopCents - total_cost_cents) / verkoopCents) * 100;
}

function margeColor(m: number | null): string {
    if (m === null) return 'text-muted-foreground';
    if (m >= 60) return 'text-emerald-500';
    if (m >= 35) return 'text-amber-500';
    return 'text-rose-500';
}

export default function GerechtenInspiratiePage() {
    const toast = useToast();
    const confirm = useConfirm();

    const [gerechten, setGerechten] = useState<GerechtRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [wizardFilter, setWizardFilter] = useState<'all' | 'wizard'>('all');
    const [search, setSearch] = useState('');
    const [selectedGerecht, setSelectedGerecht] = useState<GerechtRow | null>(null);
    const [togglingId, setTogglingId] = useState<string | null>(null);

    async function loadGerechten() {
        setLoading(true);
        try {
            const res = await fetch('/api/gerechten/list', { credentials: 'include' });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error || 'Laden mislukt');
            setGerechten(body.gerechten ?? []);
        } catch (e: any) {
            toast(e.message || 'Laden mislukt', 'error');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { loadGerechten(); }, []);

    const filtered = useMemo(() => {
        return gerechten.filter(g => {
            if (wizardFilter === 'wizard' && !g.is_in_wizard) return false;
            if (search.trim()) {
                const q = search.toLowerCase();
                if (!g.naam.toLowerCase().includes(q) && !(g.beschrijving ?? '').toLowerCase().includes(q)) return false;
            }
            return true;
        });
    }, [gerechten, wizardFilter, search]);

    async function toggleWizard(g: GerechtRow) {
        setTogglingId(g.id);
        try {
            const res = await fetch(`/api/gerechten/${g.id}`, {
                method: 'PATCH',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_in_wizard: !g.is_in_wizard }),
            });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error || 'Toggle mislukt');
            setGerechten(prev => prev.map(x => x.id === g.id ? { ...x, is_in_wizard: !x.is_in_wizard } : x));
            toast(g.is_in_wizard ? `"${g.naam}" uit wizard` : `"${g.naam}" in wizard`, 'success');
        } catch (e: any) {
            toast(e.message || 'Toggle mislukt', 'error');
        } finally {
            setTogglingId(null);
        }
    }

    const wizardCount = gerechten.filter(g => g.is_in_wizard).length;

    return (
        <div className="mx-auto max-w-6xl space-y-8 px-6 py-8">
            <Link
                href="/inspiratie"
                className="inline-flex items-center gap-1.5 text-[12px] text-[var(--muted)] no-underline hover:text-[#FFA552]"
            >
                <ArrowLeft size={12} /> Inspiratie Bibliotheek
            </Link>

            {/* Hero */}
            <header className="relative space-y-3 overflow-hidden">
                <div
                    aria-hidden
                    className="pointer-events-none absolute -left-10 -top-10 h-48 w-48 rounded-full opacity-20 blur-3xl"
                    style={{ background: 'radial-gradient(circle, #FFBF00 0%, transparent 70%)' }}
                />
                <div className="relative">
                    <div className="inline-flex items-center gap-1.5 rounded-full border border-[#FF6B35]/30 bg-[#FF6B35]/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#FFA552]">
                        <ChefHat size={10} /> Op het bord
                    </div>
                    <h1 className="mt-3 text-5xl font-bold leading-[1.05] tracking-tight" style={{ color: 'var(--text)' }}>
                        Gerechten
                    </h1>
                    <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-[var(--muted-light)]">
                        Bouwstenen × creativiteit = wat je verkoopt. Marges live, ⭐ aanvinken voor de offerte-wizard.
                        Klik een gerecht — koppel bouwstenen — <span style={{ color: 'var(--text)' }}>zie marge meebewegen</span>.
                    </p>
                </div>
            </header>

            {/* Toolbar */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="inline-flex items-center rounded-xl border border-[var(--border)] bg-[var(--card)] p-1">
                    <button
                        type="button"
                        onClick={() => setWizardFilter('all')}
                        className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold transition ${wizardFilter === 'all' ? 'text-black shadow-md' : 'text-[var(--muted-light)] hover:text-[var(--text)]'}`}
                        style={wizardFilter === 'all' ? { background: 'linear-gradient(90deg, #FFBF00 0%, #FF6B35 100%)' } : undefined}
                    >
                        Alle <span className="ml-0.5 opacity-70">{gerechten.length}</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setWizardFilter('wizard')}
                        className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition ${wizardFilter === 'wizard' ? 'text-black shadow-md' : 'text-[var(--muted-light)] hover:text-[var(--text)]'}`}
                        style={wizardFilter === 'wizard' ? { background: 'linear-gradient(90deg, #FFBF00 0%, #FF6B35 100%)' } : undefined}
                    >
                        <Star size={11} className={wizardFilter === 'wizard' ? 'fill-current' : ''} /> Op de kaart <span className="opacity-70">{wizardCount}</span>
                    </button>
                </div>

                <div className="relative">
                    <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
                    <input
                        type="search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Welk gerecht?"
                        className="rounded-lg border border-[var(--border)] bg-[var(--card)] py-1.5 pl-8 pr-3 text-[12px] placeholder:text-[var(--muted)] focus:border-[#FF6B35]/40 focus:outline-none"
                    />
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-20 text-[#FFA552]">
                    <Flame size={18} className="mr-2 animate-pulse" /> De pitmaster zet de borden klaar…
                </div>
            ) : filtered.length === 0 ? (
                <div
                    className="overflow-hidden rounded-2xl border-2 border-dashed border-[#FF6B35]/30 p-14 text-center"
                    style={{ background: 'linear-gradient(135deg, var(--card) 0%, var(--card-solid) 100%)' }}
                >
                    <div className="mb-4 text-5xl">🍽️</div>
                    <h3 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>
                        {gerechten.length === 0 ? 'Nog geen gerechten' : 'Niks gevonden'}
                    </h3>
                    <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-[var(--muted-light)]">
                        {gerechten.length === 0
                            ? 'Voeg gerechten toe via /gerechten en koppel ze hier aan bouwstenen.'
                            : 'Andere filter of zoekterm proberen?'}
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {filtered.map(g => {
                        const marge = margePct(g.verkoopprijs, g.total_cost_cents);
                        const isStar = marge !== null && marge >= 60;
                        return (
                            <button
                                key={g.id}
                                type="button"
                                onClick={() => setSelectedGerecht(g)}
                                className="group relative overflow-hidden rounded-xl border border-[var(--border)] p-4 text-left transition-all duration-300 hover:-translate-y-0.5 hover:border-[#FF6B35]/40 hover:shadow-lg hover:shadow-[#FF6B35]/10"
                                style={{ background: 'linear-gradient(135deg, var(--card) 0%, var(--card-solid) 100%)' }}
                            >
                                {/* Glow voor sterren */}
                                {g.is_in_wizard && (
                                    <div
                                        aria-hidden
                                        className="pointer-events-none absolute -right-4 -top-4 h-20 w-20 rounded-full opacity-30 blur-2xl"
                                        style={{ background: 'radial-gradient(circle, #FFBF00 0%, transparent 70%)' }}
                                    />
                                )}

                                <div className="relative flex items-start justify-between gap-2">
                                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-black/30 text-2xl ring-1 ring-[var(--border)] transition group-hover:ring-[#FF6B35]/40">
                                        {emojiForGerecht(g.naam)}
                                    </span>
                                    <span
                                        role="button"
                                        tabIndex={0}
                                        aria-label={g.is_in_wizard ? 'Haal van de kaart' : 'Zet op de kaart'}
                                        onClick={(e) => { e.stopPropagation(); toggleWizard(g); }}
                                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); toggleWizard(g); } }}
                                        className={`shrink-0 rounded-lg p-1.5 transition ${g.is_in_wizard ? 'bg-[#FFBF00]/10 text-[#FFBF00] ring-1 ring-[#FFBF00]/30' : 'text-[var(--muted)] opacity-40 hover:opacity-100'}`}
                                    >
                                        {togglingId === g.id ? <Loader2 size={15} className="animate-spin" /> : <Star size={15} className={g.is_in_wizard ? 'fill-current' : ''} />}
                                    </span>
                                </div>

                                <h3 className="relative mt-3 line-clamp-2 text-[15px] font-bold leading-tight" style={{ color: 'var(--text)' }}>
                                    {g.naam}
                                </h3>
                                {g.beschrijving && (
                                    <p className="relative mt-1 line-clamp-2 text-[11px] leading-relaxed text-[var(--muted-light)]">{g.beschrijving}</p>
                                )}

                                <div className="relative mt-3 grid grid-cols-3 gap-2 border-t border-[var(--border)] pt-2.5">
                                    <div>
                                        <div className="text-[9px] font-semibold uppercase tracking-wider text-[var(--muted)]">Verkoop</div>
                                        <div className="font-mono text-[13px] font-bold tabular-nums" style={{ color: 'var(--text)' }}>{g.verkoopprijs != null ? formatEuro(priceCents(g.verkoopprijs)) : '—'}</div>
                                    </div>
                                    <div>
                                        <div className="text-[9px] font-semibold uppercase tracking-wider text-[var(--muted)]">Kost</div>
                                        <div className="font-mono text-[13px] tabular-nums text-[var(--muted-light)]">{formatEuro(g.total_cost_cents)}</div>
                                    </div>
                                    <div>
                                        <div className="text-[9px] font-semibold uppercase tracking-wider text-[var(--muted)]">Marge</div>
                                        <div className={`inline-flex items-center gap-0.5 font-mono text-[13px] font-bold tabular-nums ${margeColor(marge)}`}>
                                            {isStar && <Flame size={10} className="animate-pulse" />}
                                            {marge !== null ? `${marge.toFixed(0)}%` : '—'}
                                        </div>
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Detail-drawer voor components-koppeling */}
            {selectedGerecht && (
                <GerechtDetailDrawer
                    gerecht={selectedGerecht}
                    onClose={() => setSelectedGerecht(null)}
                    onChanged={() => loadGerechten()}
                />
            )}

            <div className="rounded-xl border border-dashed border-border bg-muted/30 p-4 text-xs text-muted-foreground">
                <Sparkles size={14} className="mr-1 inline text-primary" />
                <strong>De heilige-graal-loop:</strong> Wijzig kostprijs van een component
                → auto-trigger updatet alle gerechten die de component gebruiken. Vink ⭐ aan
                → gerecht verschijnt in de offerte-wizard (filter komt in PR6b).
            </div>
        </div>
    );
}

/* ──────────────────────────────────────────────────────────────────────────
   Drawer: components-koppeling per gerecht
   ────────────────────────────────────────────────────────────────────────── */

function GerechtDetailDrawer({
    gerecht, onClose, onChanged,
}: {
    gerecht: GerechtRow;
    onClose: () => void;
    onChanged: () => void;
}) {
    const toast = useToast();
    const confirm = useConfirm();

    const [items, setItems] = useState<GerechtComponentRow[]>([]);
    const [availableComponents, setAvailableComponents] = useState<ComponentRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddForm, setShowAddForm] = useState(false);
    const [adding, setAdding] = useState(false);
    const [removingComponentId, setRemovingComponentId] = useState<number | null>(null);
    const [showCostEng, setShowCostEng] = useState(false);
    const [costEngBusy, setCostEngBusy] = useState(false);
    const [costEngResult, setCostEngResult] = useState<any>(null);
    const [rollup, setRollup] = useState<{ allergens: RollupAllergen[]; haccp_points: RollupHaccp[] } | null>(null);

    const [formComponentId, setFormComponentId] = useState<string>('');
    const [formQty, setFormQty] = useState<string>('');
    const [formUnit, setFormUnit] = useState<string>('g');

    async function loadDrawer() {
        setLoading(true);
        try {
            const [itemsRes, compsRes, rollupRes] = await Promise.all([
                fetch(`/api/gerechten/${gerecht.id}/components`, { credentials: 'include' }).then(r => r.json()),
                fetch('/api/components', { credentials: 'include' }).then(r => r.json()),
                fetch(`/api/gerechten/${gerecht.id}/rollup`, { credentials: 'include' }).then(r => r.json()),
            ]);
            setItems(itemsRes.items ?? []);
            setAvailableComponents((compsRes.components ?? []) as ComponentRow[]);
            setRollup({ allergens: rollupRes.allergens ?? [], haccp_points: rollupRes.haccp_points ?? [] });
        } catch (e: any) {
            toast(e.message || 'Laden mislukt', 'error');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { loadDrawer(); }, [gerecht.id]);

    const usedComponentIds = useMemo(() => new Set(items.map(i => i.component_id)), [items]);
    const selectableComponents = availableComponents.filter(c => !usedComponentIds.has(c.id));

    // Bij keuze in dropdown — autofill default unit
    function onPickComponent(idStr: string) {
        setFormComponentId(idStr);
        const c = availableComponents.find(c => String(c.id) === idStr);
        if (c) setFormUnit(c.base_unit);
    }

    async function handleAdd(e: React.FormEvent) {
        e.preventDefault();
        const componentId = Number(formComponentId);
        const quantityUsed = Number(formQty);
        if (!componentId) { toast('Kies een component', 'error'); return; }
        if (!Number.isFinite(quantityUsed) || quantityUsed <= 0) { toast('Hoeveelheid > 0', 'error'); return; }
        setAdding(true);
        try {
            const res = await fetch(`/api/gerechten/${gerecht.id}/components`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ component_id: componentId, quantity_used: quantityUsed, unit: formUnit }),
            });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error || 'Toevoegen mislukt');
            toast('Component toegevoegd', 'success');
            setFormComponentId('');
            setFormQty('');
            setShowAddForm(false);
            await loadDrawer();
            onChanged();
        } catch (e: any) {
            toast(e.message || 'Toevoegen mislukt', 'error');
        } finally {
            setAdding(false);
        }
    }

    async function handleCostEngineering() {
        if (items.length === 0) {
            toast('Koppel eerst components voordat AI marge kan analyseren', 'error');
            return;
        }
        setShowCostEng(true);
        setCostEngBusy(true);
        setCostEngResult(null);
        try {
            const res = await fetch('/api/ai/cost-engineering', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ gerecht_id: gerecht.id }),
            });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error || 'AI-call mislukt');
            setCostEngResult(body);
        } catch (e: any) {
            toast(e.message || 'AI-call mislukt', 'error');
            setShowCostEng(false);
        } finally {
            setCostEngBusy(false);
        }
    }

    async function handleRemove(item: GerechtComponentRow) {
        if (!window.confirm(`Component loskoppelen?\n\n"${item.components?.name ?? 'Component'}" wordt uit dit gerecht verwijderd. De component blijft in de bibliotheek.`)) return;
        setRemovingComponentId(item.component_id);
        try {
            const res = await fetch(`/api/gerechten/${gerecht.id}/components/${item.component_id}`, {
                method: 'DELETE',
                credentials: 'include',
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(body.error || 'Verwijderen mislukt');
            toast('Component losgekoppeld', 'success');
            await loadDrawer();
            onChanged();
        } catch (e: any) {
            toast(e.message || 'Verwijderen mislukt', 'error');
        } finally {
            setRemovingComponentId(null);
        }
    }

    const totalCost = items.reduce((sum, i) => sum + i.cost_at_use_cents, 0);

    const marge = margePct(gerecht.verkoopprijs, totalCost);

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="drawer-title"
            className="fixed inset-0 z-40 flex items-end justify-end bg-black/60 backdrop-blur-sm sm:items-stretch"
            onClick={onClose}
        >
            <div
                className="h-full w-full max-w-lg overflow-y-auto border-l border-[var(--border)] bg-[var(--bg)] shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--bg)]/95 px-6 pb-4 pt-5 backdrop-blur">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                            <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--brand)]">
                                Gerecht
                            </div>
                            <h2 id="drawer-title" className="font-[var(--font-artisan)] text-2xl font-medium leading-tight" style={{ color: 'var(--text)' }}>
                                {gerecht.naam}
                            </h2>
                            {gerecht.beschrijving && (
                                <p className="mt-1 line-clamp-2 text-[12px] text-[var(--muted-light)]">{gerecht.beschrijving}</p>
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="Sluit"
                            className="shrink-0 rounded-lg p-1.5 text-[var(--muted)] transition hover:bg-[var(--card)] hover:text-[var(--text)]"
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>

                <div className="space-y-6 px-6 py-5">
                    {/* Totals strip */}
                    <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl bg-[var(--border)]">
                        <div className="bg-[var(--card)] p-3">
                            <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Verkoop</div>
                            <div className="mt-0.5 font-mono text-[16px] font-medium tabular-nums" style={{ color: 'var(--text)' }}>
                                {gerecht.verkoopprijs != null ? formatEuro(priceCents(gerecht.verkoopprijs)) : '—'}
                            </div>
                        </div>
                        <div className="bg-[var(--card)] p-3">
                            <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Kost</div>
                            <div className="mt-0.5 font-mono text-[16px] font-medium tabular-nums" style={{ color: 'var(--text)' }}>
                                {formatEuro(totalCost)}
                            </div>
                        </div>
                        <div className="bg-[var(--card)] p-3">
                            <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Marge</div>
                            <div className={`mt-0.5 font-mono text-[16px] font-medium tabular-nums ${margeColor(marge)}`}>
                                {marge !== null ? `${marge.toFixed(0)}%` : '—'}
                            </div>
                        </div>
                    </div>

                    {/* Components-sectie */}
                    <section>
                        <div className="mb-3 flex items-center justify-between">
                            <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--muted)]">
                                <Boxes size={11} /> Componenten · {items.length}
                            </div>
                            {!showAddForm && (
                                <button
                                    type="button"
                                    onClick={() => setShowAddForm(true)}
                                    disabled={selectableComponents.length === 0}
                                    className="inline-flex items-center gap-1 rounded-lg bg-[var(--brand)] px-2.5 py-1 text-[11px] font-medium text-black transition hover:opacity-90 disabled:opacity-50"
                                >
                                    <Plus size={11} /> Koppel
                                </button>
                            )}
                        </div>

                        {showAddForm && (
                            <form onSubmit={handleAdd} className="mb-3 space-y-2.5 rounded-xl border border-[var(--brand)]/30 bg-[var(--brand)]/5 p-3">
                                <label className="block text-[11px]">
                                    <span className="mb-1 block uppercase tracking-wider text-[var(--muted)]">Component</span>
                                    <select
                                        value={formComponentId}
                                        onChange={(e) => onPickComponent(e.target.value)}
                                        required
                                        className="w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-[12px]"
                                    >
                                        <option value="">— kies een component —</option>
                                        {selectableComponents.map(c => (
                                            <option key={c.id} value={c.id}>
                                                {c.name} ({formatEuro(c.base_cost_cents)} / {c.base_quantity}{c.base_unit})
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <div className="grid grid-cols-2 gap-2">
                                    <label className="block text-[11px]">
                                        <span className="mb-1 block uppercase tracking-wider text-[var(--muted)]">Hoeveelheid</span>
                                        <input
                                            type="number" step="0.001" min="0.001"
                                            value={formQty}
                                            onChange={(e) => setFormQty(e.target.value)}
                                            required
                                            placeholder="9"
                                            className="w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-[12px]"
                                        />
                                    </label>
                                    <label className="block text-[11px]">
                                        <span className="mb-1 block uppercase tracking-wider text-[var(--muted)]">Eenheid</span>
                                        <input
                                            type="text"
                                            value={formUnit}
                                            onChange={(e) => setFormUnit(e.target.value)}
                                            required
                                            className="w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-[12px]"
                                        />
                                    </label>
                                </div>
                                <div className="flex justify-end gap-2 pt-1">
                                    <button
                                        type="button"
                                        onClick={() => { setShowAddForm(false); setFormComponentId(''); setFormQty(''); }}
                                        className="rounded-md border border-[var(--border)] bg-[var(--card)] px-2.5 py-1 text-[11px] text-[var(--muted-light)]"
                                    >
                                        Annuleer
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={adding}
                                        className="inline-flex items-center gap-1 rounded-md bg-[var(--brand)] px-3 py-1 text-[11px] font-medium text-black hover:opacity-90 disabled:opacity-50"
                                    >
                                        {adding ? <Loader2 size={10} className="animate-spin" /> : <Plus size={10} />}
                                        {adding ? 'Bezig…' : 'Koppel'}
                                    </button>
                                </div>
                            </form>
                        )}

                        {loading ? (
                            <div className="flex items-center justify-center py-10 text-[var(--muted)]">
                                <Loader2 size={14} className="mr-2 animate-spin" /> Laden…
                            </div>
                        ) : items.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] p-6 text-center text-[12px] text-[var(--muted-light)]">
                                Nog geen componenten gekoppeld.
                                {availableComponents.length > 0
                                    ? ' Klik op Koppel.'
                                    : ' Maak eerst componenten aan.'}
                            </div>
                        ) : (
                            <ul className="space-y-1.5">
                                {items.map(item => (
                                    <li
                                        key={item.component_id}
                                        className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2"
                                    >
                                        <div className="min-w-0 flex-1">
                                            <div className="truncate text-[13px]" style={{ color: 'var(--text)' }}>
                                                {item.components?.name ?? `Component #${item.component_id}`}
                                            </div>
                                            <div className="mt-0.5 font-mono text-[10px] tabular-nums text-[var(--muted)]">
                                                {item.quantity_used} {item.unit} · {formatEuro(item.cost_at_use_cents)}
                                                {item.components && (
                                                    <span className="opacity-60"> · basis {formatEuro(item.components.base_cost_cents)}/{item.components.base_quantity}{item.components.base_unit}</span>
                                                )}
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => handleRemove(item)}
                                            disabled={removingComponentId === item.component_id}
                                            aria-label={`Verwijder ${item.components?.name ?? 'component'}`}
                                            className="shrink-0 rounded p-1 text-[var(--muted)] transition hover:bg-[var(--red)]/10 hover:text-[var(--red)] disabled:opacity-50"
                                        >
                                            {removingComponentId === item.component_id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>

                    {/* Rollup */}
                    {rollup && (rollup.allergens.length > 0 || rollup.haccp_points.length > 0) && (
                        <section className="space-y-4">
                            {rollup.allergens.length > 0 && (
                                <div>
                                    <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--muted)]">
                                        <ShieldAlert size={11} /> Allergenen · uit componenten
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                        {rollup.allergens.map(a => (
                                            <span
                                                key={a.allergen_code}
                                                title={`Uit: ${a.from_components.join(', ')}${a.has_ai_only ? ' (AI-suggestie)' : ''}`}
                                                className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] ${a.has_ai_only ? 'bg-[var(--card)] text-[var(--muted-light)] ring-1 ring-dashed ring-[var(--border-strong)]' : 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30'}`}
                                            >
                                                {ALLERGEN_LABELS[a.allergen_code] ?? a.allergen_code}
                                                {a.has_ai_only && <Sparkles size={9} />}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {rollup.haccp_points.length > 0 && (
                                <div>
                                    <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--muted)]">
                                        <ThermometerSun size={11} /> HACCP-punten · uit componenten
                                    </div>
                                    <ul className="space-y-1">
                                        {rollup.haccp_points.map((h, i) => (
                                            <li key={i} className="rounded-md border border-[var(--border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px]">
                                                <span className="text-[var(--muted)]">{h.component_name}</span>
                                                <span className="mx-1.5 text-[var(--muted)]">·</span>
                                                <span style={{ color: 'var(--text)' }}>{h.type}</span>
                                                {h.threshold_value != null && (
                                                    <span className="font-mono tabular-nums" style={{ color: 'var(--brand)' }}> — {h.threshold_value}{h.threshold_unit ? ' ' + h.threshold_unit : ''}</span>
                                                )}
                                                {h.note && <div className="mt-0.5 text-[10px] italic text-[var(--muted-light)]">{h.note}</div>}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </section>
                    )}

                    {items.length > 0 && (
                        <button
                            type="button"
                            onClick={handleCostEngineering}
                            disabled={costEngBusy}
                            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-[var(--brand)]/30 bg-[var(--brand)]/10 px-3 py-2.5 text-[13px] font-medium text-[var(--brand)] transition hover:bg-[var(--brand)]/15 disabled:opacity-50"
                        >
                            {costEngBusy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                            {costEngBusy ? 'AI analyseert marge…' : 'AI · Optimaliseer marge'}
                        </button>
                    )}

                    <p className="text-[10px] leading-relaxed text-[var(--muted)]">
                        Wijzig de kostprijs in{' '}
                        <Link className="text-[var(--brand)] no-underline hover:underline" href="/inspiratie/componenten">
                            Componenten
                        </Link>
                        {' '}→ alle gerechten passen automatisch mee.
                    </p>
                </div>
            </div>

            {showCostEng && (
                <CostEngineeringPanel
                    busy={costEngBusy}
                    result={costEngResult}
                    onClose={() => { setShowCostEng(false); setCostEngResult(null); }}
                />
            )}
        </div>
    );
}

/* ──────────────────────────────────────────────────────────────────────────
   Cost-Engineering panel: AI-suggesties om marge te verhogen
   ────────────────────────────────────────────────────────────────────────── */

function CostEngineeringPanel({
    busy, result, onClose,
}: {
    busy: boolean;
    result: any;
    onClose: () => void;
}) {
    const analysis = result?.analysis;
    const ctx = result?.context;
    const suggestions = (analysis?.suggestions ?? []) as Array<{
        action: string;
        title: string;
        description: string;
        estimated_impact_cents: number | null;
        target_component_name: string | null;
        estimated_new_margin_pct: number | null;
    }>;

    function actionIcon(action: string) {
        switch (action) {
            case 'increase_price': return <ArrowUp size={14} />;
            case 'swap_component': return <Replace size={14} />;
            case 'reduce_quantity': return <ArrowDown size={14} />;
            case 'remove_from_wizard': return <LogOut size={14} />;
            case 'promote_alternative': return <Lightbulb size={14} />;
            default: return <Sparkles size={14} />;
        }
    }

    function verdictColor(v: string | undefined) {
        if (v === 'Star') return 'text-emerald-300 bg-emerald-500/15 ring-emerald-500/30';
        if (v === 'Plowhorse') return 'text-amber-300 bg-amber-500/15 ring-amber-500/30';
        if (v === 'Puzzle') return 'text-sky-300 bg-sky-500/15 ring-sky-500/30';
        if (v === 'Dog') return 'text-rose-300 bg-rose-500/15 ring-rose-500/30';
        return 'text-[var(--muted-light)] bg-[var(--card)] ring-[var(--border)]';
    }

    return (
        <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-50 flex items-end justify-end bg-black/60 backdrop-blur-sm sm:items-stretch"
            onClick={onClose}
        >
            <div
                className="h-full w-full max-w-lg overflow-y-auto border-l border-[var(--border)] bg-[var(--bg)] shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--bg)]/95 px-6 pb-4 pt-5 backdrop-blur">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                            <div className="mb-1 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--brand)]">
                                <TrendingUp size={11} /> Cost Engineering
                            </div>
                            <h2 className="font-[var(--font-artisan)] text-2xl font-medium leading-tight" style={{ color: 'var(--text)' }}>
                                Marge-suggesties
                            </h2>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="Sluit"
                            className="shrink-0 rounded-lg p-1.5 text-[var(--muted)] transition hover:bg-[var(--card)] hover:text-[var(--text)]"
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>

                <div className="space-y-5 px-6 py-5">
                    {busy && (
                        <div className="flex flex-col items-center justify-center gap-3 py-16 text-[var(--muted)]">
                            <Loader2 size={22} className="animate-spin text-[var(--brand)]" />
                            <p className="text-[12px]">AI analyseert je gerecht…</p>
                        </div>
                    )}

                    {!busy && analysis && (
                        <>
                            <div className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
                                <div>
                                    <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">{ctx?.gerecht_name}</div>
                                    <div className="mt-1 flex items-baseline gap-1.5">
                                        <span className="font-mono text-[22px] font-medium tabular-nums" style={{ color: 'var(--text)' }}>
                                            {(analysis.current_margin_pct ?? 0).toFixed(1)}%
                                        </span>
                                        <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">marge</span>
                                    </div>
                                </div>
                                {analysis.verdict && (
                                    <span className={`rounded-md px-2.5 py-1 text-[11px] font-medium ring-1 ${verdictColor(analysis.verdict)}`}>
                                        {analysis.verdict}
                                    </span>
                                )}
                            </div>

                            {suggestions.length === 0 ? (
                                <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] p-6 text-center text-[12px] text-[var(--muted-light)]">
                                    AI heeft geen concrete suggesties — marge is wellicht al optimaal.
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--muted)]">
                                        {suggestions.length} suggesties
                                    </div>
                                    {suggestions.map((s, i) => (
                                        <div key={i} className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 transition hover:border-[var(--brand)]/30">
                                            <div className="flex items-start gap-3">
                                                <div className="mt-0.5 shrink-0 rounded-lg bg-[var(--brand)]/10 p-2 text-[var(--brand)] ring-1 ring-[var(--brand)]/20">
                                                    {actionIcon(s.action)}
                                                </div>
                                                <div className="flex-1 space-y-1.5">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="text-[13px] font-medium leading-tight" style={{ color: 'var(--text)' }}>{s.title}</div>
                                                        {s.estimated_new_margin_pct != null && (
                                                            <span className="shrink-0 rounded-md bg-emerald-500/15 px-2 py-0.5 font-mono text-[10px] font-medium tabular-nums text-emerald-300 ring-1 ring-emerald-500/30">
                                                                → {s.estimated_new_margin_pct.toFixed(0)}%
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-[11px] leading-relaxed text-[var(--muted-light)]">{s.description}</p>
                                                    {s.target_component_name && (
                                                        <div className="inline-flex items-center gap-1 rounded bg-[var(--bg)] px-1.5 py-0.5 text-[10px] text-[var(--muted-light)]">
                                                            <Boxes size={9} /> {s.target_component_name}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--card)] p-3 text-[10px] leading-relaxed text-[var(--muted-light)]">
                                <Sparkles size={10} className="mr-1 inline text-[var(--brand)]" />
                                Advies — geen automatische wijzigingen. Pas zelf aan in de drawer of in Componenten.
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
