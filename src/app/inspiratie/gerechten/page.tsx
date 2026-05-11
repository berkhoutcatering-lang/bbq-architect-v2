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
    ShieldAlert, ThermometerSun,
} from 'lucide-react';

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
import '@/components/redesign/redesign.css';

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

    /* ⌘K / Ctrl+K focuses the search input — matches the shortcut-hint badge */
    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                document.getElementById('gerecht-search')?.focus();
            }
        }
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

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
    const totalCount = gerechten.length;
    const wizardProgress = totalCount === 0 ? 0 : wizardCount / totalCount;
    const totalCostCents = gerechten.reduce((s, g) => s + (g.total_cost_cents || 0), 0);
    const totalVerkoopCents = gerechten.reduce((s, g) => s + priceCents(g.verkoopprijs), 0);
    const avgCostCents = totalCount === 0 ? 0 : Math.round(totalCostCents / totalCount);
    const avgVerkoopCents = totalCount === 0 ? 0 : Math.round(totalVerkoopCents / totalCount);
    const avgMarge = totalVerkoopCents > 0
        ? ((totalVerkoopCents - totalCostCents) / totalVerkoopCents) * 100
        : null;
    const circumference = 2 * Math.PI * 86;

    return (
        <div className="redesign-root">
            <div className="main" style={{ padding: '24px 0 40px' }}>
                <div style={{ marginBottom: 12 }}>
                    <Link
                        href="/inspiratie"
                        className="btn btn-ghost btn-sm"
                        style={{ textDecoration: 'none' }}
                    >
                        <ArrowLeft size={14} /> Inspiratie Bibliotheek
                    </Link>
                </div>

                <div className="eh-hero">
                    <div className="eh-hero-bg"></div>
                    <div className="eh-hero-content">
                        <div className="eh-hero-left">
                            <div>
                                <div className="eh-hero-eyebrow"><span className="dot"></span>Inspiratie · Laag 2 · Samengesteld</div>
                                <h1 className="eh-hero-title">Gerechten</h1>
                                <div className="eh-hero-sub">
                                    <span className="pill">{totalCount} {totalCount === 1 ? 'gerecht' : 'gerechten'}</span>
                                    <span className="sep">·</span>
                                    <span>Marges live · auto-rollup uit componenten</span>
                                    <span className="sep">·</span>
                                    <span><Star size={11} className="inline fill-[var(--brand)] text-[var(--brand)]" /> = op de kaart</span>
                                </div>
                            </div>
                            <div className="eh-hero-actions">
                                <button
                                    type="button"
                                    onClick={() => setWizardFilter(wizardFilter === 'wizard' ? 'all' : 'wizard')}
                                    className="btn btn-primary"
                                    style={{ background: 'var(--brand)', color: '#0a0a0c', fontWeight: 700 }}
                                >
                                    <Star size={14} className={wizardFilter === 'wizard' ? 'fill-current' : ''} />
                                    {wizardFilter === 'wizard' ? 'Toon alles' : `Toon op de kaart (${wizardCount})`}
                                </button>
                                <Link
                                    href="/gerechten"
                                    className="btn btn-ghost"
                                    style={{ textDecoration: 'none' }}
                                >
                                    <Plus size={14} /> Nieuw gerecht
                                </Link>
                                <Link
                                    href="/marges"
                                    className="btn btn-ghost"
                                    style={{ textDecoration: 'none' }}
                                >
                                    <TrendingUp size={14} /> Marges (BCG)
                                </Link>
                            </div>
                        </div>
                        <div className="eh-countdown">
                            <div className="eh-countdown-ring">
                                <svg viewBox="0 0 200 200">
                                    <defs>
                                        <linearGradient id="gerechtenWizardGrad" x1="0" x2="1" y1="0" y2="1">
                                            <stop offset="0%" stopColor="#FFBF00" />
                                            <stop offset="60%" stopColor="#ff8c20" />
                                            <stop offset="100%" stopColor="#ff5010" />
                                        </linearGradient>
                                    </defs>
                                    <circle className="bg-ring" cx="100" cy="100" r="86" />
                                    <circle className="fg-ring" cx="100" cy="100" r="86"
                                        stroke="url(#gerechtenWizardGrad)"
                                        strokeDasharray={circumference}
                                        strokeDashoffset={circumference * (1 - wizardProgress)} />
                                    {Array.from({ length: 30 }).map((_, i) => {
                                        const a = (i / 30) * Math.PI * 2;
                                        const x1 = 100 + Math.cos(a) * 72;
                                        const y1 = 100 + Math.sin(a) * 72;
                                        const x2 = 100 + Math.cos(a) * 76;
                                        const y2 = 100 + Math.sin(a) * 76;
                                        return <line key={i} className="tick" x1={x1} y1={y1} x2={x2} y2={y2} />;
                                    })}
                                </svg>
                                <div className="eh-countdown-center">
                                    <div className="eh-countdown-num">{wizardCount}</div>
                                    <div className="eh-countdown-lbl">Op de kaart</div>
                                    <div className="eh-countdown-sub">{Math.round(wizardProgress * 100)}% van {totalCount}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="eh-hero-stats">
                        <div className="eh-hero-stat">
                            <div className="l">Totaal</div>
                            <div className="v">{totalCount}</div>
                            <div className="s">In bibliotheek</div>
                        </div>
                        <div className="eh-hero-stat">
                            <div className="l">Op de kaart</div>
                            <div className={`v ${wizardCount > 0 ? 'ok' : 'muted'}`}>{wizardCount}</div>
                            <div className="s">{wizardCount > 0 ? 'In offerte-wizard' : 'Selecteer met ⭐'}</div>
                            {totalCount > 0 && (
                                <div className="bar"><div className="fill" style={{ width: `${wizardProgress * 100}%`, background: 'var(--brand)' }}></div></div>
                            )}
                        </div>
                        <div className="eh-hero-stat">
                            <div className="l">Gem. marge</div>
                            <div className={`v ${avgMarge != null && avgMarge >= 60 ? 'ok' : avgMarge != null && avgMarge >= 35 ? 'warn' : 'muted'}`}>
                                {avgMarge != null ? `${avgMarge.toFixed(0)}%` : '—'}
                            </div>
                            <div className="s">{avgMarge != null ? 'Verkoop − kostprijs' : 'Geen verkoopprijzen'}</div>
                        </div>
                        <div className="eh-hero-stat">
                            <div className="l">Gem. kostprijs</div>
                            <div className="v">€{(avgCostCents / 100).toFixed(2)}</div>
                            <div className="s">Auto-rollup</div>
                        </div>
                        <div className="eh-hero-stat">
                            <div className="l">Gem. verkoop</div>
                            <div className="v">{avgVerkoopCents > 0 ? `€${(avgVerkoopCents / 100).toFixed(2)}` : '—'}</div>
                            <div className="s">Per gerecht</div>
                        </div>
                    </div>
                </div>

                {/* Glass Filter Pill Bar */}
                <div className="filter-bar">
                    <div className="filter-bar-pills">
                        <button
                            type="button"
                            onClick={() => setWizardFilter('all')}
                            className={`filter-bar-pill ${wizardFilter === 'all' ? 'is-active' : ''}`}
                        >
                            Alle <span className="count">{gerechten.length}</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setWizardFilter('wizard')}
                            className={`filter-bar-pill ${wizardFilter === 'wizard' ? 'is-active' : ''}`}
                        >
                            <Star size={11} className={wizardFilter === 'wizard' ? 'fill-current' : ''} /> Op de kaart <span className="count">{wizardCount}</span>
                        </button>
                    </div>
                    <div className="filter-bar-sep" aria-hidden></div>
                    <div className="filter-bar-search">
                        <Search size={14} className="search-icon" />
                        <input
                            type="search"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Zoek gerecht…"
                            id="gerecht-search"
                        />
                        {search.length > 0 ? (
                            <>
                                <span className="result-count">{filtered.length} van {gerechten.length}</span>
                                <button
                                    type="button"
                                    onClick={() => setSearch('')}
                                    aria-label="Wis zoekopdracht"
                                    className="clear-btn"
                                >
                                    <X size={11} />
                                </button>
                            </>
                        ) : (
                            <span className="shortcut-hint">⌘ K</span>
                        )}
                    </div>
                </div>

            {loading ? (
                <div className="flex items-center justify-center py-20 text-[var(--muted)]">
                    <Loader2 size={18} className="mr-2 animate-spin" /> Gerechten laden…
                </div>
            ) : filtered.length === 0 ? (
                <div
                    className="overflow-hidden rounded-2xl border border-dashed border-[var(--border)] p-14 text-center"
                    style={{ background: 'linear-gradient(135deg, var(--card) 0%, var(--card-solid) 100%)' }}
                >
                    <div className="mx-auto mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--brand)]/10 ring-1 ring-[var(--brand)]/20">
                        <ChefHat size={24} className="text-[var(--brand)]" strokeWidth={1.5} />
                    </div>
                    <h3 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>
                        {gerechten.length === 0 ? 'Nog geen gerechten' : 'Geen match'}
                    </h3>
                    <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-[var(--muted-light)]">
                        {gerechten.length === 0
                            ? 'Voeg gerechten toe via /gerechten en koppel ze hier aan componenten.'
                            : 'Pas filter of zoekterm aan.'}
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {filtered.map(g => {
                        const marge = margePct(g.verkoopprijs, g.total_cost_cents);
                        return (
                            <button
                                key={g.id}
                                type="button"
                                onClick={() => setSelectedGerecht(g)}
                                className="group relative overflow-hidden rounded-xl border border-[var(--border)] p-4 text-left transition hover:border-[var(--brand)]/40"
                                style={{ background: 'linear-gradient(135deg, var(--card) 0%, var(--card-solid) 100%)' }}
                            >
                                {/* Subtle gold-glow voor wizard-gerechten */}
                                {g.is_in_wizard && (
                                    <div
                                        aria-hidden
                                        className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-[0.15] blur-2xl"
                                        style={{ background: 'radial-gradient(circle, #FFBF00 0%, transparent 70%)' }}
                                    />
                                )}

                                <div className="relative flex items-start justify-between gap-2">
                                    <h3 className="line-clamp-2 text-[15px] font-semibold leading-tight" style={{ color: 'var(--text)' }}>
                                        {g.naam}
                                    </h3>
                                    <span
                                        role="button"
                                        tabIndex={0}
                                        aria-label={g.is_in_wizard ? 'Haal van de kaart' : 'Zet op de kaart'}
                                        onClick={(e) => { e.stopPropagation(); toggleWizard(g); }}
                                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); toggleWizard(g); } }}
                                        className={`shrink-0 rounded-lg p-1.5 transition ${g.is_in_wizard ? 'text-[var(--brand)]' : 'text-[var(--muted)] opacity-40 hover:opacity-100'}`}
                                    >
                                        {togglingId === g.id ? <Loader2 size={15} className="animate-spin" /> : <Star size={15} className={g.is_in_wizard ? 'fill-current' : ''} />}
                                    </span>
                                </div>

                                {g.beschrijving && (
                                    <p className="relative mt-1 line-clamp-2 text-[12px] leading-relaxed text-[var(--muted-light)]">{g.beschrijving}</p>
                                )}

                                <div className="relative mt-3 grid grid-cols-3 gap-2 border-t border-[var(--border)] pt-2.5">
                                    <div>
                                        <div className="text-[9px] font-semibold uppercase tracking-wider text-[var(--muted)]">Verkoop</div>
                                        <div className="font-mono text-[13px] font-semibold tabular-nums" style={{ color: 'var(--text)' }}>{g.verkoopprijs != null ? formatEuro(priceCents(g.verkoopprijs)) : '—'}</div>
                                    </div>
                                    <div>
                                        <div className="text-[9px] font-semibold uppercase tracking-wider text-[var(--muted)]">Kost</div>
                                        <div className="font-mono text-[13px] tabular-nums text-[var(--muted-light)]">{formatEuro(g.total_cost_cents)}</div>
                                    </div>
                                    <div>
                                        <div className="text-[9px] font-semibold uppercase tracking-wider text-[var(--muted)]">Marge</div>
                                        <div className={`font-mono text-[13px] font-semibold tabular-nums ${margeColor(marge)}`}>
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

                <div className="rounded-xl border border-dashed border-border bg-muted/30 p-4 text-xs text-muted-foreground" style={{ marginTop: 18 }}>
                    <Sparkles size={14} className="mr-1 inline text-primary" />
                    <strong>De heilige-graal-loop:</strong> Wijzig kostprijs van een component
                    → auto-trigger updatet alle gerechten die de component gebruiken. Vink ⭐ aan
                    → gerecht verschijnt in de offerte-wizard (filter komt in PR6b).
                </div>
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
