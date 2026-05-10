/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
    Boxes, ArrowLeft, Plus, X, Trash2, Sparkles,
    Package, ShoppingBag, Loader2, Search,
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';

type ComponentType = 'prepared' | 'bought_in';

interface ComponentRow {
    id: number;
    name: string;
    description: string | null;
    type: ComponentType;
    base_quantity: number;
    base_unit: string;
    base_cost_cents: number;
    flavor_tags: string[] | null;
    supplier_product_id: number | null;
    ai_suggested: boolean;
    approved_at: string | null;
    created_at: string;
    updated_at: string;
}

interface FormState {
    name: string;
    description: string;
    type: ComponentType;
    base_quantity: string;   // string in input, parsed bij submit
    base_unit: string;
    base_cost_euros: string; // input in euro's, omgerekend naar cents bij submit
    flavor_tags: string;     // comma-separated input
}

const EMPTY_FORM: FormState = {
    name: '',
    description: '',
    type: 'prepared',
    base_quantity: '100',
    base_unit: 'g',
    base_cost_euros: '',
    flavor_tags: '',
};

const UNITS = ['g', 'kg', 'ml', 'liter', 'stuk', 'portie'];

function formatEuro(cents: number): string {
    return `€${(cents / 100).toFixed(2)}`;
}

function formatPerBase(cents: number, qty: number, unit: string): string {
    return `${formatEuro(cents)} / ${qty}${unit}`;
}

export default function ComponentenPage() {
    const toast = useToast();
    const confirm = useConfirm();

    const [components, setComponents] = useState<ComponentRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [deletingId, setDeletingId] = useState<number | null>(null);
    const [typeFilter, setTypeFilter] = useState<'all' | ComponentType>('all');
    const [search, setSearch] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState<FormState>(EMPTY_FORM);

    async function loadComponents() {
        setLoading(true);
        try {
            const res = await fetch('/api/components', { credentials: 'include' });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error || 'Laden mislukt');
            setComponents(body.components ?? []);
        } catch (e: any) {
            toast.error(e.message || 'Laden mislukt');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { loadComponents(); }, []);

    const filtered = useMemo(() => {
        return components.filter(c => {
            if (typeFilter !== 'all' && c.type !== typeFilter) return false;
            if (search.trim().length > 0) {
                const q = search.trim().toLowerCase();
                if (!c.name.toLowerCase().includes(q) && !(c.description ?? '').toLowerCase().includes(q)) {
                    return false;
                }
            }
            return true;
        });
    }, [components, typeFilter, search]);

    async function handleCreate(e: React.FormEvent) {
        e.preventDefault();
        const name = form.name.trim();
        if (!name) { toast.error('Naam verplicht'); return; }
        const baseQty = Number(form.base_quantity);
        if (!Number.isFinite(baseQty) || baseQty <= 0) { toast.error('Basis-hoeveelheid > 0'); return; }
        const costEuros = Number(form.base_cost_euros);
        if (!Number.isFinite(costEuros) || costEuros < 0) { toast.error('Kostprijs ongeldig'); return; }
        const baseCostCents = Math.round(costEuros * 100);
        const tags = form.flavor_tags
            .split(',').map(t => t.trim()).filter(t => t.length > 0);

        setCreating(true);
        try {
            const res = await fetch('/api/components', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name,
                    description: form.description.trim() || null,
                    type: form.type,
                    base_quantity: baseQty,
                    base_unit: form.base_unit,
                    base_cost_cents: baseCostCents,
                    flavor_tags: tags,
                }),
            });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error || 'Aanmaken mislukt');
            toast.success(`Component "${name}" toegevoegd`);
            setForm(EMPTY_FORM);
            setShowForm(false);
            await loadComponents();
        } catch (e: any) {
            toast.error(e.message || 'Aanmaken mislukt');
        } finally {
            setCreating(false);
        }
    }

    async function handleDelete(c: ComponentRow) {
        const ok = await confirm({
            title: `Verwijder "${c.name}"?`,
            description: 'Dit kan niet ongedaan worden gemaakt. Als de component in een gerecht zit, wordt verwijderen tegengehouden.',
            confirmText: 'Verwijder',
            danger: true,
        });
        if (!ok) return;
        setDeletingId(c.id);
        try {
            const res = await fetch(`/api/components/${c.id}`, {
                method: 'DELETE',
                credentials: 'include',
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(body.error || 'Verwijderen mislukt');
            toast.success(`"${c.name}" verwijderd`);
            await loadComponents();
        } catch (e: any) {
            toast.error(e.message || 'Verwijderen mislukt');
        } finally {
            setDeletingId(null);
        }
    }

    const preparedCount = components.filter(c => c.type === 'prepared').length;
    const boughtCount = components.filter(c => c.type === 'bought_in').length;

    return (
        <div className="mx-auto max-w-6xl space-y-6 p-6">
            <Link href="/inspiratie" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                <ArrowLeft size={14} /> Inspiratie Bibliotheek
            </Link>

            <PageHeader
                title="Componenten"
                subtitle="Atomaire bouwblokken — zelf-bereid en inkoop, één concept"
                icon={<Boxes size={28} />}
            />

            {/* Filter + zoek + nieuw */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setTypeFilter('all')}
                        className={`rounded-full px-3 py-1.5 text-sm transition ${typeFilter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
                    >
                        Alle ({components.length})
                    </button>
                    <button
                        type="button"
                        onClick={() => setTypeFilter('prepared')}
                        className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm transition ${typeFilter === 'prepared' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
                    >
                        <Package size={14} /> Zelf-bereid ({preparedCount})
                    </button>
                    <button
                        type="button"
                        onClick={() => setTypeFilter('bought_in')}
                        className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm transition ${typeFilter === 'bought_in' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
                    >
                        <ShoppingBag size={14} /> Inkoop ({boughtCount})
                    </button>
                </div>

                <div className="flex items-center gap-2">
                    <div className="relative">
                        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input
                            type="search"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Zoek component..."
                            className="rounded-md border border-border bg-background py-1.5 pl-8 pr-3 text-sm"
                        />
                    </div>
                    <button
                        type="button"
                        onClick={() => setShowForm(v => !v)}
                        className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
                    >
                        {showForm ? <X size={14} /> : <Plus size={14} />}
                        {showForm ? 'Annuleer' : 'Nieuw'}
                    </button>
                </div>
            </div>

            {/* Inline create form */}
            {showForm && (
                <form onSubmit={handleCreate} className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
                    <div className="flex items-center gap-2 text-sm font-medium">
                        <Plus size={16} className="text-primary" /> Nieuw component
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <label className="block text-sm">
                            <span className="mb-1 block text-muted-foreground">Naam</span>
                            <input
                                type="text"
                                value={form.name}
                                onChange={(e) => setForm({ ...form, name: e.target.value })}
                                placeholder="bv. Gegrilde ananas salsa"
                                required
                                className="w-full rounded-md border border-border bg-background px-3 py-2"
                            />
                        </label>

                        <label className="block text-sm">
                            <span className="mb-1 block text-muted-foreground">Type</span>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => setForm({ ...form, type: 'prepared' })}
                                    className={`flex-1 rounded-md border px-3 py-2 text-sm transition ${form.type === 'prepared' ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background'}`}
                                >
                                    <Package size={14} className="mr-1 inline" /> Zelf-bereid
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setForm({ ...form, type: 'bought_in' })}
                                    className={`flex-1 rounded-md border px-3 py-2 text-sm transition ${form.type === 'bought_in' ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background'}`}
                                >
                                    <ShoppingBag size={14} className="mr-1 inline" /> Inkoop
                                </button>
                            </div>
                        </label>
                    </div>

                    <label className="block text-sm">
                        <span className="mb-1 block text-muted-foreground">Beschrijving (optioneel)</span>
                        <input
                            type="text"
                            value={form.description}
                            onChange={(e) => setForm({ ...form, description: e.target.value })}
                            placeholder="bv. Zoete grill-aroma met chili en limoen"
                            className="w-full rounded-md border border-border bg-background px-3 py-2"
                        />
                    </label>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <label className="block text-sm">
                            <span className="mb-1 block text-muted-foreground">Basis-hoeveelheid</span>
                            <input
                                type="number"
                                value={form.base_quantity}
                                onChange={(e) => setForm({ ...form, base_quantity: e.target.value })}
                                step="0.001"
                                min="0.001"
                                required
                                className="w-full rounded-md border border-border bg-background px-3 py-2"
                            />
                        </label>

                        <label className="block text-sm">
                            <span className="mb-1 block text-muted-foreground">Eenheid</span>
                            <select
                                value={form.base_unit}
                                onChange={(e) => setForm({ ...form, base_unit: e.target.value })}
                                className="w-full rounded-md border border-border bg-background px-3 py-2"
                            >
                                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                            </select>
                        </label>

                        <label className="block text-sm">
                            <span className="mb-1 block text-muted-foreground">Kostprijs voor basis (€)</span>
                            <input
                                type="number"
                                value={form.base_cost_euros}
                                onChange={(e) => setForm({ ...form, base_cost_euros: e.target.value })}
                                step="0.01"
                                min="0"
                                placeholder="1.43"
                                required
                                className="w-full rounded-md border border-border bg-background px-3 py-2"
                            />
                        </label>
                    </div>

                    <label className="block text-sm">
                        <span className="mb-1 block text-muted-foreground">Smaakprofiel-tags (komma-gescheiden)</span>
                        <input
                            type="text"
                            value={form.flavor_tags}
                            onChange={(e) => setForm({ ...form, flavor_tags: e.target.value })}
                            placeholder="zoet, zuur, pikant, rokerig"
                            className="w-full rounded-md border border-border bg-background px-3 py-2"
                        />
                        <span className="mt-1 block text-xs text-muted-foreground">
                            Gebruikt door AI om passende componenten te combineren tot gerechten.
                        </span>
                    </label>

                    <div className="flex justify-end gap-2 pt-2">
                        <button
                            type="button"
                            onClick={() => { setShowForm(false); setForm(EMPTY_FORM); }}
                            className="rounded-md border border-border bg-background px-4 py-2 text-sm"
                        >
                            Annuleer
                        </button>
                        <button
                            type="submit"
                            disabled={creating}
                            className="inline-flex items-center gap-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                        >
                            {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                            {creating ? 'Toevoegen...' : 'Voeg toe'}
                        </button>
                    </div>
                </form>
            )}

            {/* Lijst */}
            {loading ? (
                <div className="flex items-center justify-center py-20 text-muted-foreground">
                    <Loader2 size={20} className="mr-2 animate-spin" /> Componenten laden...
                </div>
            ) : filtered.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-12 text-center">
                    <Boxes size={48} className="mx-auto mb-4 text-muted-foreground" />
                    <h2 className="mb-2 text-lg font-semibold">
                        {components.length === 0 ? 'Nog geen componenten' : 'Geen componenten gevonden'}
                    </h2>
                    <p className="mx-auto max-w-md text-sm text-muted-foreground">
                        {components.length === 0
                            ? 'Begin met je eerste bouwblok. Zelf-bereid (gegrilde ananas, kokos espuma) of inkoop (Hanos broodje, Sligro saus).'
                            : 'Geen match op huidige filter of zoekterm.'}
                    </p>
                    {components.length === 0 && !showForm && (
                        <button
                            type="button"
                            onClick={() => setShowForm(true)}
                            className="mt-6 inline-flex items-center gap-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
                        >
                            <Plus size={14} /> Eerste component toevoegen
                        </button>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {filtered.map(c => (
                        <div key={c.id} className="group rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:border-primary/50 hover:shadow-md">
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    {c.type === 'prepared'
                                        ? <><Package size={12} /> Zelf-bereid</>
                                        : <><ShoppingBag size={12} /> Inkoop</>}
                                    {c.ai_suggested && (
                                        <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                                            <Sparkles size={9} /> AI
                                        </span>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => handleDelete(c)}
                                    disabled={deletingId === c.id}
                                    aria-label={`Verwijder ${c.name}`}
                                    className="rounded p-1 text-muted-foreground opacity-0 transition hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 disabled:opacity-50"
                                >
                                    {deletingId === c.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                                </button>
                            </div>

                            <h3 className="mt-2 font-semibold leading-tight">{c.name}</h3>
                            {c.description && (
                                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{c.description}</p>
                            )}

                            <div className="mt-3 flex items-baseline justify-between">
                                <span className="text-sm font-medium">{formatPerBase(c.base_cost_cents, c.base_quantity, c.base_unit)}</span>
                            </div>

                            {c.flavor_tags && c.flavor_tags.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1">
                                    {c.flavor_tags.slice(0, 4).map(tag => (
                                        <span key={tag} className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            <div className="rounded-xl border border-dashed border-border bg-muted/30 p-4 text-xs text-muted-foreground">
                <Sparkles size={14} className="mr-1 inline text-primary" />
                PR4 brengt AI: <em>genereer component</em>, <em>categoriseer ongetagde</em>,
                en <em>combineer naar gerecht</em>. Voor nu handmatig — kostprijs en types worden in PR3 al door auto-cost-propagatie correct doorgerekend op gerechten zodra je componenten koppelt.
            </div>
        </div>
    );
}
