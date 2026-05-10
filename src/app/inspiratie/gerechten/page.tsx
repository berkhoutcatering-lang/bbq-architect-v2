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
    Plus, Trash2, X, Boxes,
} from 'lucide-react';
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
            toast.error(e.message || 'Laden mislukt');
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
            toast.success(g.is_in_wizard ? `"${g.naam}" uit wizard` : `"${g.naam}" in wizard`);
        } catch (e: any) {
            toast.error(e.message || 'Toggle mislukt');
        } finally {
            setTogglingId(null);
        }
    }

    const wizardCount = gerechten.filter(g => g.is_in_wizard).length;

    return (
        <div className="mx-auto max-w-6xl space-y-6 p-6">
            <Link href="/inspiratie" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                <ArrowLeft size={14} /> Inspiratie Bibliotheek
            </Link>

            <PageHeader
                title="Gerechten"
                subtitle="Goedgekeurde gerechten, samengesteld uit components. Vink aan voor offerte-wizard."
                icon={<ChefHat size={28} />}
            />

            {/* Filter + zoek */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setWizardFilter('all')}
                        className={`rounded-full px-3 py-1.5 text-sm transition ${wizardFilter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
                    >
                        Alle ({gerechten.length})
                    </button>
                    <button
                        type="button"
                        onClick={() => setWizardFilter('wizard')}
                        className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm transition ${wizardFilter === 'wizard' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
                    >
                        <Star size={12} className="fill-current" /> In wizard ({wizardCount})
                    </button>
                </div>

                <div className="flex items-center gap-2">
                    <div className="relative">
                        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input
                            type="search"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Zoek gerecht..."
                            className="rounded-md border border-border bg-background py-1.5 pl-8 pr-3 text-sm"
                        />
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-20 text-muted-foreground">
                    <Loader2 size={20} className="mr-2 animate-spin" /> Gerechten laden...
                </div>
            ) : filtered.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-12 text-center">
                    <ChefHat size={48} className="mx-auto mb-4 text-muted-foreground" />
                    <h2 className="mb-2 text-lg font-semibold">Geen gerechten gevonden</h2>
                    <p className="mx-auto max-w-md text-sm text-muted-foreground">
                        {gerechten.length === 0
                            ? 'Voeg gerechten toe via de oude /gerechten-pagina (PR6 koppelt ze hier aan components).'
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
                                className="group rounded-2xl border border-border bg-card p-4 text-left shadow-sm transition hover:border-primary/50 hover:shadow-md"
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <h3 className="line-clamp-2 font-semibold leading-tight">{g.naam}</h3>
                                    <span
                                        role="button"
                                        tabIndex={0}
                                        aria-label={g.is_in_wizard ? 'Haal uit wizard' : 'Zet in wizard'}
                                        onClick={(e) => { e.stopPropagation(); toggleWizard(g); }}
                                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); toggleWizard(g); } }}
                                        className={`shrink-0 rounded p-1 transition ${g.is_in_wizard ? 'text-amber-500' : 'text-muted-foreground opacity-40 hover:opacity-100'}`}
                                    >
                                        {togglingId === g.id ? <Loader2 size={16} className="animate-spin" /> : <Star size={16} className={g.is_in_wizard ? 'fill-current' : ''} />}
                                    </span>
                                </div>

                                {g.beschrijving && (
                                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{g.beschrijving}</p>
                                )}

                                <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                                    <div>
                                        <div className="text-muted-foreground">Verkoop</div>
                                        <div className="font-medium">{g.verkoopprijs != null ? formatEuro(priceCents(g.verkoopprijs)) : '—'}</div>
                                    </div>
                                    <div>
                                        <div className="text-muted-foreground">Kost</div>
                                        <div className="font-medium">{formatEuro(g.total_cost_cents)}</div>
                                    </div>
                                    <div>
                                        <div className="text-muted-foreground">Marge</div>
                                        <div className={`font-medium ${margeColor(marge)}`}>
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

    const [formComponentId, setFormComponentId] = useState<string>('');
    const [formQty, setFormQty] = useState<string>('');
    const [formUnit, setFormUnit] = useState<string>('g');

    async function loadDrawer() {
        setLoading(true);
        try {
            const [itemsRes, compsRes] = await Promise.all([
                fetch(`/api/gerechten/${gerecht.id}/components`, { credentials: 'include' }).then(r => r.json()),
                fetch('/api/components', { credentials: 'include' }).then(r => r.json()),
            ]);
            setItems(itemsRes.items ?? []);
            setAvailableComponents((compsRes.components ?? []) as ComponentRow[]);
        } catch (e: any) {
            toast.error(e.message || 'Laden mislukt');
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
        if (!componentId) { toast.error('Kies een component'); return; }
        if (!Number.isFinite(quantityUsed) || quantityUsed <= 0) { toast.error('Hoeveelheid > 0'); return; }
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
            toast.success('Component toegevoegd');
            setFormComponentId('');
            setFormQty('');
            setShowAddForm(false);
            await loadDrawer();
            onChanged();
        } catch (e: any) {
            toast.error(e.message || 'Toevoegen mislukt');
        } finally {
            setAdding(false);
        }
    }

    async function handleRemove(item: GerechtComponentRow) {
        const ok = await confirm({
            title: 'Component loskoppelen?',
            description: `"${item.components?.name ?? 'Component'}" wordt uit dit gerecht verwijderd. De component blijft in de bibliotheek.`,
            confirmText: 'Verwijder',
            danger: true,
        });
        if (!ok) return;
        setRemovingComponentId(item.component_id);
        try {
            const res = await fetch(`/api/gerechten/${gerecht.id}/components/${item.component_id}`, {
                method: 'DELETE',
                credentials: 'include',
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(body.error || 'Verwijderen mislukt');
            toast.success('Component losgekoppeld');
            await loadDrawer();
            onChanged();
        } catch (e: any) {
            toast.error(e.message || 'Verwijderen mislukt');
        } finally {
            setRemovingComponentId(null);
        }
    }

    const totalCost = items.reduce((sum, i) => sum + i.cost_at_use_cents, 0);

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="drawer-title"
            className="fixed inset-0 z-40 flex items-end justify-end bg-black/40 sm:items-stretch"
            onClick={onClose}
        >
            <div
                className="h-full w-full max-w-lg overflow-y-auto bg-background p-6 shadow-2xl sm:border-l sm:border-border"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="mb-4 flex items-start justify-between">
                    <div>
                        <div className="text-xs text-muted-foreground">Gerecht</div>
                        <h2 id="drawer-title" className="text-xl font-semibold">{gerecht.naam}</h2>
                    </div>
                    <button type="button" onClick={onClose} aria-label="Sluit" className="rounded p-1 hover:bg-muted">
                        <X size={18} />
                    </button>
                </div>

                <div className="mb-6 grid grid-cols-3 gap-2 rounded-xl border border-border bg-card p-3 text-xs">
                    <div>
                        <div className="text-muted-foreground">Verkoop</div>
                        <div className="font-medium">{gerecht.verkoopprijs != null ? formatEuro(priceCents(gerecht.verkoopprijs)) : '—'}</div>
                    </div>
                    <div>
                        <div className="text-muted-foreground">Kost (uit components)</div>
                        <div className="font-medium">{formatEuro(totalCost)}</div>
                    </div>
                    <div>
                        <div className="text-muted-foreground">Marge</div>
                        <div className={`font-medium ${margeColor(margePct(gerecht.verkoopprijs, totalCost))}`}>
                            {(() => {
                                const m = margePct(gerecht.verkoopprijs, totalCost);
                                return m !== null ? `${m.toFixed(0)}%` : '—';
                            })()}
                        </div>
                    </div>
                </div>

                <div className="mb-3 flex items-center justify-between">
                    <h3 className="font-medium">
                        <Boxes size={14} className="mr-1 inline" />
                        Componenten ({items.length})
                    </h3>
                    {!showAddForm && (
                        <button
                            type="button"
                            onClick={() => setShowAddForm(true)}
                            disabled={selectableComponents.length === 0}
                            className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                        >
                            <Plus size={12} /> Toevoegen
                        </button>
                    )}
                </div>

                {showAddForm && (
                    <form onSubmit={handleAdd} className="mb-4 space-y-3 rounded-xl border border-border bg-muted/30 p-3">
                        <label className="block text-xs">
                            <span className="mb-1 block text-muted-foreground">Component</span>
                            <select
                                value={formComponentId}
                                onChange={(e) => onPickComponent(e.target.value)}
                                required
                                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
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
                            <label className="block text-xs">
                                <span className="mb-1 block text-muted-foreground">Hoeveelheid</span>
                                <input
                                    type="number"
                                    step="0.001"
                                    min="0.001"
                                    value={formQty}
                                    onChange={(e) => setFormQty(e.target.value)}
                                    required
                                    placeholder="9"
                                    className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                                />
                            </label>
                            <label className="block text-xs">
                                <span className="mb-1 block text-muted-foreground">Eenheid</span>
                                <input
                                    type="text"
                                    value={formUnit}
                                    onChange={(e) => setFormUnit(e.target.value)}
                                    required
                                    className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                                />
                            </label>
                        </div>
                        <div className="flex justify-end gap-2">
                            <button type="button" onClick={() => { setShowAddForm(false); setFormComponentId(''); setFormQty(''); }} className="rounded-md border border-border bg-background px-2.5 py-1 text-xs">
                                Annuleer
                            </button>
                            <button type="submit" disabled={adding} className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
                                {adding ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                                {adding ? 'Toevoegen...' : 'Voeg toe'}
                            </button>
                        </div>
                    </form>
                )}

                {loading ? (
                    <div className="flex items-center justify-center py-12 text-muted-foreground">
                        <Loader2 size={16} className="mr-2 animate-spin" /> Laden...
                    </div>
                ) : items.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border bg-muted/10 p-8 text-center text-sm text-muted-foreground">
                        Nog geen components gekoppeld.
                        {availableComponents.length > 0
                            ? ' Klik op "Toevoegen".'
                            : ' Maak eerst components aan in de Componenten-pagina.'}
                    </div>
                ) : (
                    <ul className="space-y-2">
                        {items.map(item => (
                            <li key={item.component_id} className="flex items-center justify-between rounded-xl border border-border bg-card px-3 py-2">
                                <div className="flex-1 text-sm">
                                    <div className="font-medium">{item.components?.name ?? `Component #${item.component_id}`}</div>
                                    <div className="text-xs text-muted-foreground">
                                        {item.quantity_used} {item.unit} · {formatEuro(item.cost_at_use_cents)}
                                        {item.components && (
                                            <span className="opacity-60"> (basis: {formatEuro(item.components.base_cost_cents)} / {item.components.base_quantity}{item.components.base_unit})</span>
                                        )}
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => handleRemove(item)}
                                    disabled={removingComponentId === item.component_id}
                                    aria-label={`Verwijder ${item.components?.name ?? 'component'}`}
                                    className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                                >
                                    {removingComponentId === item.component_id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}

                <div className="mt-6 text-[11px] text-muted-foreground">
                    Wijzig de kostprijs van een component in de <Link className="text-primary hover:underline" href="/inspiratie/componenten">Componenten</Link>-pagina
                    → trigger updatet automatisch de kost van dit gerecht.
                </div>
            </div>
        </div>
    );
}
