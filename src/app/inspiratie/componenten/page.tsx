/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
    Boxes, ArrowLeft, Plus, X, Trash2, Sparkles,
    Package, ShoppingBag, Loader2, Search, Check, ThermometerSun,
    Upload, FileText,
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';

interface AiProposal {
    name: string;
    description?: string;
    type: ComponentType;
    base_quantity: number;
    base_unit: string;
    base_cost_cents: number;
    ingredients?: Array<{ name: string; qty: number; unit: string }>;
    preparation_steps?: string[];
    flavor_tags?: string[];
    allergens?: Array<{ allergen_code: string; ai_suggested?: boolean }>;
    haccp_points?: Array<{ type: string; threshold_value?: number | null; threshold_unit?: string | null; note?: string | null; ai_suggested?: boolean }>;
    ai_suggested?: boolean;
}

interface AllergenRow {
    component_id: number;
    allergen_code: string;
    ai_suggested: boolean;
    confirmed_at: string | null;
}

interface HaccpRow {
    id?: number;
    component_id?: number;
    type: string;
    threshold_value: number | null;
    threshold_unit: string | null;
    note: string | null;
    ai_suggested: boolean;
}

const ALLERGEN_CODES = ['G', 'L', 'N', 'V', 'E', 'S', 'Sd', 'M', 'W', 'Sl', 'Lp', 'Sf', 'Sc', 'P'];

const HACCP_TYPES = [
    { value: 'kerntemp', label: 'Kerntemperatuur', defaultUnit: 'celsius' },
    { value: 'koeltemp', label: 'Koeltemperatuur', defaultUnit: 'celsius' },
    { value: 'tijd_uit_koeling', label: 'Tijd uit koeling', defaultUnit: 'minutes' },
    { value: 'handhygiene', label: 'Handhygiëne', defaultUnit: '' },
    { value: 'kruisbesmetting', label: 'Kruisbesmetting', defaultUnit: '' },
    { value: 'oppervlakte_reiniging', label: 'Oppervlakte reiniging', defaultUnit: '' },
    { value: 'overig', label: 'Overig', defaultUnit: '' },
];

const ALLERGEN_LABELS: Record<string, string> = {
    G: 'gluten', L: 'lactose', N: 'noten', V: 'vis', E: 'ei', S: 'soja',
    Sd: 'sesam', M: 'mosterd', W: 'weekdieren', Sl: 'selderij',
    Lp: 'lupine', Sf: 'sulfiet', Sc: 'schaaldieren', P: 'pinda',
};

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
    const [selectedComponentId, setSelectedComponentId] = useState<number | null>(null);
    const [showImport, setShowImport] = useState(false);
    const [typeFilter, setTypeFilter] = useState<'all' | ComponentType>('all');
    const [search, setSearch] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState<FormState>(EMPTY_FORM);

    /* AI-genereer state */
    const [showAi, setShowAi] = useState(false);
    const [aiPrompt, setAiPrompt] = useState('');
    const [aiType, setAiType] = useState<ComponentType>('prepared');
    const [aiBusy, setAiBusy] = useState(false);
    const [aiProposal, setAiProposal] = useState<AiProposal | null>(null);
    const [aiAccepting, setAiAccepting] = useState(false);
    /* Bevestigde flags per allergen-code / haccp-index — default alles aan na AI-output */
    const [confirmedAllergens, setConfirmedAllergens] = useState<Set<string>>(new Set());
    const [confirmedHaccp, setConfirmedHaccp] = useState<Set<number>>(new Set());

    async function loadComponents() {
        setLoading(true);
        try {
            const res = await fetch('/api/components', { credentials: 'include' });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error || 'Laden mislukt');
            setComponents(body.components ?? []);
        } catch (e: any) {
            toast(e.message || 'Laden mislukt', 'error');
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
        if (!name) { toast('Naam verplicht', 'error'); return; }
        const baseQty = Number(form.base_quantity);
        if (!Number.isFinite(baseQty) || baseQty <= 0) { toast('Basis-hoeveelheid > 0', 'error'); return; }
        const costEuros = Number(form.base_cost_euros);
        if (!Number.isFinite(costEuros) || costEuros < 0) { toast('Kostprijs ongeldig', 'error'); return; }
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
            toast(`Component "${name}" toegevoegd`, 'success');
            setForm(EMPTY_FORM);
            setShowForm(false);
            await loadComponents();
        } catch (e: any) {
            toast(e.message || 'Aanmaken mislukt', 'error');
        } finally {
            setCreating(false);
        }
    }

    async function handleGenerate(e: React.FormEvent) {
        e.preventDefault();
        const prompt = aiPrompt.trim();
        if (!prompt) { toast('Vul een prompt in', 'error'); return; }
        setAiBusy(true);
        setAiProposal(null);
        try {
            const res = await fetch('/api/ai/component-generate', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt, type: aiType }),
            });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error || 'AI-call mislukt');
            const proposal = body.proposal as AiProposal;
            setAiProposal(proposal);
            // Default: alle AI-suggesties bevestigd (mens kan uitzetten wat niet klopt)
            setConfirmedAllergens(new Set((proposal.allergens ?? []).map(a => a.allergen_code)));
            setConfirmedHaccp(new Set((proposal.haccp_points ?? []).map((_, i) => i)));
        } catch (e: any) {
            toast(e.message || 'AI-call mislukt', 'error');
        } finally {
            setAiBusy(false);
        }
    }

    async function handleAcceptProposal() {
        if (!aiProposal) return;
        setAiAccepting(true);
        try {
            const allergens = (aiProposal.allergens ?? [])
                .filter(a => confirmedAllergens.has(a.allergen_code))
                .map(a => ({ allergen_code: a.allergen_code, ai_suggested: true }));
            const haccp_points = (aiProposal.haccp_points ?? [])
                .filter((_, i) => confirmedHaccp.has(i))
                .map(h => ({
                    type: h.type,
                    threshold_value: h.threshold_value,
                    threshold_unit: h.threshold_unit,
                    note: h.note,
                    ai_suggested: true,
                }));

            const res = await fetch('/api/components', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: aiProposal.name,
                    description: aiProposal.description ?? null,
                    type: aiProposal.type,
                    base_quantity: aiProposal.base_quantity,
                    base_unit: aiProposal.base_unit,
                    base_cost_cents: aiProposal.base_cost_cents,
                    ingredients: aiProposal.ingredients ?? null,
                    preparation_steps: aiProposal.preparation_steps ?? null,
                    flavor_tags: aiProposal.flavor_tags ?? [],
                    ai_suggested: true,
                    allergens,
                    haccp_points,
                }),
            });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error || 'Opslaan mislukt');
            toast(`"${aiProposal.name}" toegevoegd uit AI-voorstel`, 'success');
            if (body.warnings) {
                toast(`Wel met waarschuwingen: ${body.warnings.join(', ')}`, 'error');
            }
            setAiProposal(null);
            setAiPrompt('');
            setShowAi(false);
            await loadComponents();
        } catch (e: any) {
            toast(e.message || 'Opslaan mislukt', 'error');
        } finally {
            setAiAccepting(false);
        }
    }

    function toggleAllergen(code: string) {
        setConfirmedAllergens(prev => {
            const next = new Set(prev);
            if (next.has(code)) next.delete(code); else next.add(code);
            return next;
        });
    }

    function toggleHaccp(idx: number) {
        setConfirmedHaccp(prev => {
            const next = new Set(prev);
            if (next.has(idx)) next.delete(idx); else next.add(idx);
            return next;
        });
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
            toast(`"${c.name}" verwijderd`, 'success');
            await loadComponents();
        } catch (e: any) {
            toast(e.message || 'Verwijderen mislukt', 'error');
        } finally {
            setDeletingId(null);
        }
    }

    const preparedCount = components.filter(c => c.type === 'prepared').length;
    const boughtCount = components.filter(c => c.type === 'bought_in').length;

    return (
        <div className="mx-auto max-w-6xl space-y-8 px-6 py-8">
            <Link
                href="/inspiratie"
                className="inline-flex items-center gap-1.5 text-[12px] text-[var(--muted)] no-underline hover:text-[var(--text)]"
            >
                <ArrowLeft size={12} /> Inspiratie Bibliotheek
            </Link>

            {/* Hero */}
            <header className="space-y-2">
                <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--brand)]">
                    <span className="inline-block h-px w-6 bg-[var(--brand)]" />
                    Laag 1 — atomair
                </div>
                <h1 className="font-[var(--font-artisan)] text-4xl font-medium leading-tight tracking-tight">
                    Componenten
                </h1>
                <p className="max-w-2xl text-[14px] leading-relaxed text-[var(--muted-light)]">
                    Bouwblokken met receptuur, kostprijs, HACCP en allergenen. Zelf-bereid (gegrilde ananas)
                    of inkoop (Hanos broodje). Wijzig één keer — alle gerechten passen mee.
                </p>
            </header>

            {/* Toolbar */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                {/* Segmented filter */}
                <div className="inline-flex items-center rounded-lg border border-[var(--border)] bg-[var(--card)] p-0.5">
                    <button
                        type="button"
                        onClick={() => setTypeFilter('all')}
                        className={`rounded-md px-3 py-1.5 text-[12px] font-medium transition ${typeFilter === 'all' ? 'bg-[var(--brand)] text-black' : 'text-[var(--muted-light)] hover:text-[var(--text)]'}`}
                    >
                        Alle <span className="ml-0.5 opacity-60">{components.length}</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setTypeFilter('prepared')}
                        className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-[12px] font-medium transition ${typeFilter === 'prepared' ? 'bg-[var(--brand)] text-black' : 'text-[var(--muted-light)] hover:text-[var(--text)]'}`}
                    >
                        <Package size={12} /> Zelf-bereid <span className="opacity-60">{preparedCount}</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setTypeFilter('bought_in')}
                        className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-[12px] font-medium transition ${typeFilter === 'bought_in' ? 'bg-[var(--brand)] text-black' : 'text-[var(--muted-light)] hover:text-[var(--text)]'}`}
                    >
                        <ShoppingBag size={12} /> Inkoop <span className="opacity-60">{boughtCount}</span>
                    </button>
                </div>

                <div className="flex items-center gap-2">
                    <div className="relative">
                        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
                        <input
                            type="search"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Zoek..."
                            className="rounded-lg border border-[var(--border)] bg-[var(--card)] py-1.5 pl-8 pr-3 text-[12px] placeholder:text-[var(--muted)]"
                        />
                    </div>
                    <button
                        type="button"
                        onClick={() => { setShowImport(true); setShowForm(false); setShowAi(false); }}
                        className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-[12px] text-[var(--muted-light)] transition hover:border-[var(--border-strong)] hover:text-[var(--text)]"
                    >
                        <Upload size={12} /> Importeer
                    </button>
                    <button
                        type="button"
                        onClick={() => { setShowAi(v => !v); setShowForm(false); }}
                        className="inline-flex items-center gap-1 rounded-lg border border-[var(--brand)]/30 bg-[var(--brand)]/10 px-3 py-1.5 text-[12px] font-medium text-[var(--brand)] transition hover:bg-[var(--brand)]/15"
                    >
                        <Sparkles size={12} /> AI Genereer
                    </button>
                    <button
                        type="button"
                        onClick={() => { setShowForm(v => !v); setShowAi(false); }}
                        className="inline-flex items-center gap-1 rounded-lg bg-[var(--brand)] px-3 py-1.5 text-[12px] font-medium text-black transition hover:opacity-90"
                    >
                        {showForm ? <X size={12} /> : <Plus size={12} />}
                        {showForm ? 'Annuleer' : 'Nieuw'}
                    </button>
                </div>
            </div>

            {/* AI Genereer-strook */}
            {showAi && (
                <div className="space-y-4 rounded-2xl border border-primary/30 bg-primary/5 p-5 shadow-sm">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm font-medium text-primary">
                            <Sparkles size={16} /> AI als Creative Chef
                        </div>
                        <button
                            type="button"
                            onClick={() => { setShowAi(false); setAiProposal(null); setAiPrompt(''); }}
                            className="text-muted-foreground hover:text-foreground"
                            aria-label="Sluit AI-strook"
                        >
                            <X size={16} />
                        </button>
                    </div>

                    {!aiProposal && (
                        <form onSubmit={handleGenerate} className="space-y-3">
                            <p className="text-xs text-muted-foreground">
                                Beschrijf wat je wil — naam, ingrediënt, smaak. AI maakt een compleet voorstel met
                                ingrediënten, kostprijs, allergenen en HACCP-punten. Jij bevestigt wat klopt.
                            </p>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => setAiType('prepared')}
                                    className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs ${aiType === 'prepared' ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background'}`}
                                >
                                    <Package size={12} /> Zelf-bereid
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setAiType('bought_in')}
                                    className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs ${aiType === 'bought_in' ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background'}`}
                                >
                                    <ShoppingBag size={12} /> Inkoop
                                </button>
                            </div>
                            <textarea
                                value={aiPrompt}
                                onChange={(e) => setAiPrompt(e.target.value)}
                                rows={2}
                                maxLength={500}
                                placeholder="bv. 'bacon crumble met chili voor op sliders' of 'gepekelde komkommer-lintjes voor amuse'"
                                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                                required
                            />
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-muted-foreground">{aiPrompt.length} / 500</span>
                                <button
                                    type="submit"
                                    disabled={aiBusy}
                                    className="inline-flex items-center gap-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                                >
                                    {aiBusy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                                    {aiBusy ? 'AI denkt na...' : 'Genereer'}
                                </button>
                            </div>
                        </form>
                    )}

                    {aiProposal && (
                        <div className="space-y-4 rounded-xl border border-border bg-card p-4">
                            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-primary">
                                <Sparkles size={11} /> AI-voorstel — bevestig wat klopt
                            </div>

                            <div>
                                <h3 className="text-lg font-semibold">{aiProposal.name}</h3>
                                {aiProposal.description && (
                                    <p className="mt-1 text-sm text-muted-foreground">{aiProposal.description}</p>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                                <div>
                                    <div className="text-xs text-muted-foreground">Type</div>
                                    <div className="font-medium">{aiProposal.type === 'prepared' ? 'Zelf-bereid' : 'Inkoop'}</div>
                                </div>
                                <div>
                                    <div className="text-xs text-muted-foreground">Basis</div>
                                    <div className="font-medium">{aiProposal.base_quantity} {aiProposal.base_unit}</div>
                                </div>
                                <div>
                                    <div className="text-xs text-muted-foreground">Kostprijs</div>
                                    <div className="font-medium">{formatEuro(aiProposal.base_cost_cents)}</div>
                                </div>
                            </div>

                            {aiProposal.ingredients && aiProposal.ingredients.length > 0 && (
                                <div>
                                    <div className="mb-1 text-xs font-medium text-muted-foreground">Ingrediënten</div>
                                    <ul className="space-y-0.5 text-sm">
                                        {aiProposal.ingredients.map((ing, i) => (
                                            <li key={i} className="flex justify-between">
                                                <span>{ing.name}</span>
                                                <span className="text-muted-foreground">{ing.qty} {ing.unit}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {aiProposal.preparation_steps && aiProposal.preparation_steps.length > 0 && (
                                <div>
                                    <div className="mb-1 text-xs font-medium text-muted-foreground">Bereiding</div>
                                    <ol className="list-decimal space-y-0.5 pl-5 text-sm">
                                        {aiProposal.preparation_steps.map((s, i) => <li key={i}>{s}</li>)}
                                    </ol>
                                </div>
                            )}

                            {aiProposal.flavor_tags && aiProposal.flavor_tags.length > 0 && (
                                <div>
                                    <div className="mb-1 text-xs font-medium text-muted-foreground">Smaakprofiel</div>
                                    <div className="flex flex-wrap gap-1">
                                        {aiProposal.flavor_tags.map(t => (
                                            <span key={t} className="rounded-full bg-muted px-2 py-0.5 text-[10px]">{t}</span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {aiProposal.allergens && aiProposal.allergens.length > 0 && (
                                <div>
                                    <div className="mb-1 text-xs font-medium text-muted-foreground">
                                        Allergenen — klik om af te vinken als ze niet kloppen
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                        {aiProposal.allergens.map(a => {
                                            const on = confirmedAllergens.has(a.allergen_code);
                                            return (
                                                <button
                                                    key={a.allergen_code}
                                                    type="button"
                                                    onClick={() => toggleAllergen(a.allergen_code)}
                                                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs transition ${on ? 'bg-amber-100 text-amber-900 ring-1 ring-amber-300 dark:bg-amber-900/30 dark:text-amber-200' : 'bg-muted text-muted-foreground line-through'}`}
                                                >
                                                    {on && <Check size={11} />}
                                                    {ALLERGEN_LABELS[a.allergen_code] ?? a.allergen_code}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {aiProposal.haccp_points && aiProposal.haccp_points.length > 0 && (
                                <div>
                                    <div className="mb-1 text-xs font-medium text-muted-foreground">
                                        HACCP-punten — klik om af te vinken als ze niet kloppen
                                    </div>
                                    <div className="space-y-1">
                                        {aiProposal.haccp_points.map((h, i) => {
                                            const on = confirmedHaccp.has(i);
                                            return (
                                                <button
                                                    key={i}
                                                    type="button"
                                                    onClick={() => toggleHaccp(i)}
                                                    className={`flex w-full items-start gap-2 rounded-md border px-3 py-2 text-left text-xs transition ${on ? 'border-primary/40 bg-primary/5' : 'border-border bg-muted/50 text-muted-foreground line-through'}`}
                                                >
                                                    <ThermometerSun size={14} className="mt-0.5 shrink-0" />
                                                    <div className="flex-1">
                                                        <div className="font-medium">
                                                            {h.type}
                                                            {h.threshold_value != null && (
                                                                <span> — {h.threshold_value} {h.threshold_unit ?? ''}</span>
                                                            )}
                                                        </div>
                                                        {h.note && <div className="text-[11px] opacity-80">{h.note}</div>}
                                                    </div>
                                                    {on && <Check size={12} className="mt-0.5 text-primary" />}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            <div className="flex justify-end gap-2 border-t border-border pt-3">
                                <button
                                    type="button"
                                    onClick={() => setAiProposal(null)}
                                    className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                                >
                                    Opnieuw genereren
                                </button>
                                <button
                                    type="button"
                                    onClick={handleAcceptProposal}
                                    disabled={aiAccepting}
                                    className="inline-flex items-center gap-1 rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                                >
                                    {aiAccepting ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                                    {aiAccepting ? 'Opslaan...' : 'Voeg toe aan bibliotheek'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

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
                <div className="flex items-center justify-center py-20 text-[var(--muted)]">
                    <Loader2 size={18} className="mr-2 animate-spin" /> Componenten laden…
                </div>
            ) : filtered.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)] p-14 text-center">
                    <div className="mx-auto mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--brand)]/10 ring-1 ring-[var(--brand)]/20">
                        <Boxes size={26} className="text-[var(--brand)]" strokeWidth={1.5} />
                    </div>
                    <h3 className="font-[var(--font-artisan)] text-xl font-medium">
                        {components.length === 0 ? 'Nog geen componenten' : 'Geen match'}
                    </h3>
                    <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-[var(--muted-light)]">
                        {components.length === 0
                            ? 'Begin met je eerste bouwblok. Zelf-bereid (gegrilde ananas, kokos espuma) of inkoop (Hanos broodje, Sligro saus). Of laat AI er een verzinnen.'
                            : 'Geen component op huidige filter of zoekterm.'}
                    </p>
                    {components.length === 0 && !showForm && !showAi && (
                        <div className="mt-6 flex items-center justify-center gap-2">
                            <button
                                type="button"
                                onClick={() => setShowAi(true)}
                                className="inline-flex items-center gap-1 rounded-lg border border-[var(--brand)]/30 bg-[var(--brand)]/10 px-3 py-1.5 text-[12px] font-medium text-[var(--brand)] transition hover:bg-[var(--brand)]/15"
                            >
                                <Sparkles size={12} /> AI Genereer
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowForm(true)}
                                className="inline-flex items-center gap-1 rounded-lg bg-[var(--brand)] px-3 py-1.5 text-[12px] font-medium text-black transition hover:opacity-90"
                            >
                                <Plus size={12} /> Handmatig
                            </button>
                        </div>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {filtered.map(c => (
                        <button
                            key={c.id}
                            type="button"
                            onClick={() => setSelectedComponentId(c.id)}
                            className="group rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 text-left transition hover:border-[var(--brand)]/40"
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--muted)]">
                                    {c.type === 'prepared'
                                        ? <><Package size={10} /> Zelf-bereid</>
                                        : <><ShoppingBag size={10} /> Inkoop</>}
                                    {c.ai_suggested && (
                                        <span className="inline-flex items-center gap-0.5 rounded-full bg-[var(--brand)]/10 px-1.5 py-0.5 text-[9px] text-[var(--brand)]">
                                            <Sparkles size={8} /> AI
                                        </span>
                                    )}
                                </div>
                                <span
                                    role="button"
                                    tabIndex={0}
                                    aria-label={`Verwijder ${c.name}`}
                                    onClick={(e) => { e.stopPropagation(); handleDelete(c); }}
                                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); handleDelete(c); } }}
                                    className="rounded p-1 text-[var(--muted)] opacity-0 transition hover:bg-[var(--red)]/10 hover:text-[var(--red)] group-hover:opacity-100"
                                >
                                    {deletingId === c.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                                </span>
                            </div>

                            <h3 className="mt-3 font-[var(--font-artisan)] text-base font-medium leading-tight" style={{ color: 'var(--text)' }}>
                                {c.name}
                            </h3>
                            {c.description && (
                                <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-[var(--muted-light)]">{c.description}</p>
                            )}

                            <div className="mt-3 border-t border-[var(--border)] pt-2.5 font-mono text-[12px] tabular-nums" style={{ color: 'var(--text)' }}>
                                {formatPerBase(c.base_cost_cents, c.base_quantity, c.base_unit)}
                            </div>

                            {c.flavor_tags && c.flavor_tags.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1">
                                    {c.flavor_tags.slice(0, 4).map(tag => (
                                        <span key={tag} className="rounded-md bg-[var(--bg)] px-1.5 py-0.5 text-[10px] text-[var(--muted-light)]">
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </button>
                    ))}
                </div>
            )}

            {selectedComponentId !== null && (
                <ComponentEditDrawer
                    componentId={selectedComponentId}
                    onClose={() => setSelectedComponentId(null)}
                    onSaved={() => { setSelectedComponentId(null); loadComponents(); }}
                />
            )}

            {showImport && (
                <SupplierImportDrawer
                    onClose={() => setShowImport(false)}
                    onImported={() => { setShowImport(false); loadComponents(); }}
                />
            )}

            <div className="rounded-xl border border-dashed border-border bg-muted/30 p-4 text-xs text-muted-foreground">
                <Sparkles size={14} className="mr-1 inline text-primary" />
                AI suggereert, jij bevestigt. Klik <strong>AI Genereer</strong> om een full-spec component
                voorstel te krijgen (incl. allergeen- en HACCP-suggesties). Niets wordt opgeslagen tot je
                op <strong>Voeg toe aan bibliotheek</strong> klikt — uitvinkte items komen er niet in.
            </div>
        </div>
    );
}

/* ──────────────────────────────────────────────────────────────────────────
   Edit-drawer: alle component-velden + allergens-grid + HACCP-rijen-editor
   ────────────────────────────────────────────────────────────────────────── */

function ComponentEditDrawer({
    componentId, onClose, onSaved,
}: {
    componentId: number;
    onClose: () => void;
    onSaved: () => void;
}) {
    const toast = useToast();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [comp, setComp] = useState<ComponentRow | null>(null);

    // Form state
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [baseQty, setBaseQty] = useState('');
    const [baseUnit, setBaseUnit] = useState('g');
    const [costEuros, setCostEuros] = useState('');
    const [flavorTags, setFlavorTags] = useState('');
    const [allergenCodes, setAllergenCodes] = useState<Set<string>>(new Set());
    const [haccpRows, setHaccpRows] = useState<HaccpRow[]>([]);

    async function loadDetail() {
        setLoading(true);
        try {
            const res = await fetch(`/api/components/${componentId}`, { credentials: 'include' });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error || 'Laden mislukt');
            const c = body.component as ComponentRow;
            setComp(c);
            setName(c.name);
            setDescription(c.description ?? '');
            setBaseQty(String(c.base_quantity));
            setBaseUnit(c.base_unit);
            setCostEuros((c.base_cost_cents / 100).toFixed(2));
            setFlavorTags((c.flavor_tags ?? []).join(', '));
            setAllergenCodes(new Set((body.allergens as AllergenRow[] ?? []).map(a => a.allergen_code)));
            setHaccpRows((body.haccp_points as HaccpRow[] ?? []).map(h => ({
                id: h.id, type: h.type, threshold_value: h.threshold_value,
                threshold_unit: h.threshold_unit, note: h.note, ai_suggested: h.ai_suggested,
            })));
        } catch (e: any) {
            toast(e.message || 'Laden mislukt', 'error');
            onClose();
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { loadDetail(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [componentId]);

    function toggleAllergen(code: string) {
        setAllergenCodes(prev => {
            const next = new Set(prev);
            if (next.has(code)) next.delete(code); else next.add(code);
            return next;
        });
    }

    function addHaccpRow() {
        setHaccpRows(prev => [...prev, { type: 'kerntemp', threshold_value: null, threshold_unit: 'celsius', note: null, ai_suggested: false }]);
    }

    function updateHaccpRow(idx: number, patch: Partial<HaccpRow>) {
        setHaccpRows(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r));
    }

    function removeHaccpRow(idx: number) {
        setHaccpRows(prev => prev.filter((_, i) => i !== idx));
    }

    async function handleSave() {
        if (!name.trim()) { toast('Naam verplicht', 'error'); return; }
        const qty = Number(baseQty);
        if (!Number.isFinite(qty) || qty <= 0) { toast('Basis-hoeveelheid > 0', 'error'); return; }
        const cost = Number(costEuros);
        if (!Number.isFinite(cost) || cost < 0) { toast('Kostprijs ongeldig', 'error'); return; }
        const baseCostCents = Math.round(cost * 100);
        const tags = flavorTags.split(',').map(t => t.trim()).filter(Boolean);

        setSaving(true);
        try {
            const res = await fetch(`/api/components/${componentId}`, {
                method: 'PATCH',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: name.trim(),
                    description: description.trim() || null,
                    base_quantity: qty,
                    base_unit: baseUnit,
                    base_cost_cents: baseCostCents,
                    flavor_tags: tags,
                    allergens: Array.from(allergenCodes).map(code => ({ allergen_code: code, ai_suggested: false })),
                    haccp_points: haccpRows.filter(r => r.type),
                }),
            });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error || 'Opslaan mislukt');
            toast('Component bijgewerkt — wijzigingen propageren naar alle gerechten', 'success');
            if (body.warnings) toast(`Wel met waarschuwingen: ${body.warnings.join(', ')}`, 'error');
            onSaved();
        } catch (e: any) {
            toast(e.message || 'Opslaan mislukt', 'error');
        } finally {
            setSaving(false);
        }
    }

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="comp-drawer-title"
            className="fixed inset-0 z-40 flex items-end justify-end bg-black/40 sm:items-stretch"
            onClick={onClose}
        >
            <div
                className="h-full w-full max-w-lg overflow-y-auto bg-background p-6 shadow-2xl sm:border-l sm:border-border"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="mb-4 flex items-start justify-between">
                    <div>
                        <div className="text-xs text-muted-foreground">Component bewerken</div>
                        <h2 id="comp-drawer-title" className="text-xl font-semibold">{comp?.name ?? 'Laden...'}</h2>
                    </div>
                    <button type="button" onClick={onClose} aria-label="Sluit" className="rounded p-1 hover:bg-muted">
                        <X size={18} />
                    </button>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-12 text-muted-foreground">
                        <Loader2 size={16} className="mr-2 animate-spin" /> Laden...
                    </div>
                ) : (
                    <div className="space-y-5">
                        {/* Basis-info */}
                        <section className="space-y-3">
                            <label className="block text-xs">
                                <span className="mb-1 block text-muted-foreground">Naam</span>
                                <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
                            </label>
                            <label className="block text-xs">
                                <span className="mb-1 block text-muted-foreground">Beschrijving</span>
                                <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
                            </label>
                            <div className="grid grid-cols-3 gap-2">
                                <label className="block text-xs">
                                    <span className="mb-1 block text-muted-foreground">Basis-hoeveelheid</span>
                                    <input type="number" step="0.001" min="0.001" value={baseQty} onChange={(e) => setBaseQty(e.target.value)} className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
                                </label>
                                <label className="block text-xs">
                                    <span className="mb-1 block text-muted-foreground">Eenheid</span>
                                    <select value={baseUnit} onChange={(e) => setBaseUnit(e.target.value)} className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm">
                                        {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                                    </select>
                                </label>
                                <label className="block text-xs">
                                    <span className="mb-1 block text-muted-foreground">Kostprijs (€)</span>
                                    <input type="number" step="0.01" min="0" value={costEuros} onChange={(e) => setCostEuros(e.target.value)} className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
                                </label>
                            </div>
                            <label className="block text-xs">
                                <span className="mb-1 block text-muted-foreground">Smaakprofiel-tags (komma-gescheiden)</span>
                                <input type="text" value={flavorTags} onChange={(e) => setFlavorTags(e.target.value)} placeholder="zoet, rokerig, ..." className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
                            </label>
                        </section>

                        {/* Allergenen */}
                        <section>
                            <div className="mb-2 text-xs font-medium text-muted-foreground">Allergenen — klik om aan/uit te zetten</div>
                            <div className="flex flex-wrap gap-1.5">
                                {ALLERGEN_CODES.map(code => {
                                    const on = allergenCodes.has(code);
                                    return (
                                        <button
                                            key={code}
                                            type="button"
                                            onClick={() => toggleAllergen(code)}
                                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs transition ${on ? 'bg-amber-100 text-amber-900 ring-1 ring-amber-300 dark:bg-amber-900/30 dark:text-amber-200' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
                                            title={ALLERGEN_LABELS[code]}
                                        >
                                            {on && <Check size={11} />}
                                            {ALLERGEN_LABELS[code] ?? code}
                                        </button>
                                    );
                                })}
                            </div>
                        </section>

                        {/* HACCP-punten */}
                        <section>
                            <div className="mb-2 flex items-center justify-between">
                                <span className="text-xs font-medium text-muted-foreground">HACCP-punten</span>
                                <button type="button" onClick={addHaccpRow} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-[11px] hover:bg-muted/80">
                                    <Plus size={11} /> Toevoegen
                                </button>
                            </div>
                            {haccpRows.length === 0 ? (
                                <div className="rounded-md border border-dashed border-border bg-muted/10 p-3 text-center text-[11px] text-muted-foreground">
                                    Nog geen HACCP-punten.
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {haccpRows.map((h, idx) => (
                                        <div key={idx} className="rounded-md border border-border bg-card p-2 text-xs">
                                            <div className="flex items-start gap-2">
                                                <ThermometerSun size={14} className="mt-1 shrink-0 text-muted-foreground" />
                                                <div className="flex-1 space-y-1">
                                                    <select value={h.type} onChange={(e) => {
                                                        const t = HACCP_TYPES.find(x => x.value === e.target.value);
                                                        updateHaccpRow(idx, { type: e.target.value, threshold_unit: t?.defaultUnit || h.threshold_unit });
                                                    }} className="w-full rounded border border-border bg-background px-1.5 py-1 text-xs">
                                                        {HACCP_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                                    </select>
                                                    <div className="grid grid-cols-2 gap-1">
                                                        <input type="number" placeholder="waarde" value={h.threshold_value ?? ''} onChange={(e) => updateHaccpRow(idx, { threshold_value: e.target.value === '' ? null : Number(e.target.value) })} className="rounded border border-border bg-background px-1.5 py-1 text-xs" />
                                                        <input type="text" placeholder="eenheid (celsius/minutes)" value={h.threshold_unit ?? ''} onChange={(e) => updateHaccpRow(idx, { threshold_unit: e.target.value || null })} className="rounded border border-border bg-background px-1.5 py-1 text-xs" />
                                                    </div>
                                                    <input type="text" placeholder="notitie (optioneel)" value={h.note ?? ''} onChange={(e) => updateHaccpRow(idx, { note: e.target.value || null })} className="w-full rounded border border-border bg-background px-1.5 py-1 text-xs" />
                                                </div>
                                                <button type="button" onClick={() => removeHaccpRow(idx)} aria-label="Verwijder HACCP-rij" className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>

                        <div className="flex justify-end gap-2 border-t border-border pt-4">
                            <button type="button" onClick={onClose} className="rounded-md border border-border bg-background px-4 py-2 text-sm">
                                Annuleer
                            </button>
                            <button type="button" onClick={handleSave} disabled={saving} className="inline-flex items-center gap-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
                                {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                                {saving ? 'Opslaan...' : 'Opslaan'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

/* ──────────────────────────────────────────────────────────────────────────
   Supplier-import drawer: tekst-paste → AI parse → preview → bulk-insert
   ────────────────────────────────────────────────────────────────────────── */

interface SupplierLite { id: number; naam: string; }
interface ParsedProduct {
    name: string;
    supplier_sku: string | null;
    price_cents: number;
    unit: string;
    package_size: number | null;
    package_unit: string | null;
}

function SupplierImportDrawer({
    onClose, onImported,
}: {
    onClose: () => void;
    onImported: () => void;
}) {
    const toast = useToast();
    const [step, setStep] = useState<'input' | 'preview'>('input');
    const [inputMode, setInputMode] = useState<'text' | 'image'>('text');
    const [pasted, setPasted] = useState('');
    const [fileDataUrl, setFileDataUrl] = useState<string | null>(null);
    const [fileName, setFileName] = useState<string | null>(null);
    const [supplierHint, setSupplierHint] = useState('');
    const [supplierId, setSupplierId] = useState<string>('');
    const [createComponents, setCreateComponents] = useState(true);
    const [parsing, setParsing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [suppliers, setSuppliers] = useState<SupplierLite[]>([]);
    const [products, setProducts] = useState<ParsedProduct[]>([]);
    const [detectedSupplierName, setDetectedSupplierName] = useState<string | null>(null);
    const [droppedCount, setDroppedCount] = useState(0);
    const [keepFlags, setKeepFlags] = useState<boolean[]>([]);

    useEffect(() => {
        fetch('/api/leveranciers/list', { credentials: 'include' })
            .then(r => r.json())
            .then(b => setSuppliers(b.leveranciers ?? []))
            .catch(() => { /* niet kritisch */ });
    }, []);

    async function handleParse(e: React.FormEvent) {
        e.preventDefault();
        if (inputMode === 'text' && !pasted.trim()) { toast('Plak eerst een lijst', 'error'); return; }
        if (inputMode === 'image' && !fileDataUrl) { toast('Kies eerst een foto of PDF', 'error'); return; }

        setParsing(true);
        try {
            const payload: Record<string, unknown> = {
                supplier_hint: supplierHint || undefined,
            };
            if (inputMode === 'text') payload.text = pasted;
            else payload.file_data_url = fileDataUrl;

            const res = await fetch('/api/ai/supplier-catalog-parse', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error || 'Parse mislukt');
            const parsed = body.products as ParsedProduct[];
            if (parsed.length === 0) {
                toast('AI vond geen producten — probeer een ander deel uit te lichten of plak de tekst handmatig', 'error');
                return;
            }
            setProducts(parsed);
            setKeepFlags(parsed.map(() => true));
            setDetectedSupplierName(body.supplier_name ?? null);
            setDroppedCount(body.dropped_count ?? 0);
            setStep('preview');
        } catch (e: any) {
            toast(e.message || 'Parse mislukt', 'error');
        } finally {
            setParsing(false);
        }
    }

    function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 6 * 1024 * 1024) {
            toast('Bestand te groot (max 6 MB) — comprimeer of maak een kleinere screenshot', 'error');
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            setFileDataUrl(typeof reader.result === 'string' ? reader.result : null);
            setFileName(file.name);
        };
        reader.onerror = () => toast('Bestand lezen mislukt', 'error');
        reader.readAsDataURL(file);
    }

    async function handleSave() {
        const selected = products.filter((_, i) => keepFlags[i]);
        if (selected.length === 0) { toast('Geen producten geselecteerd', 'error'); return; }
        setSaving(true);
        try {
            const res = await fetch('/api/supplier-products/bulk', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    supplier_id: supplierId ? Number(supplierId) : null,
                    products: selected,
                    create_components: createComponents,
                }),
            });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error || 'Opslaan mislukt');
            const msg = `${body.supplier_products_inserted} producten opgeslagen` +
                (body.components_inserted > 0 ? `, ${body.components_inserted} components aangemaakt` : '');
            toast(msg, 'success');
            if (body.warning) toast(body.warning, 'error');
            onImported();
        } catch (e: any) {
            toast(e.message || 'Opslaan mislukt', 'error');
        } finally {
            setSaving(false);
        }
    }

    function toggleKeep(i: number) {
        setKeepFlags(prev => prev.map((v, idx) => idx === i ? !v : v));
    }
    function toggleAll(state: boolean) {
        setKeepFlags(prev => prev.map(() => state));
    }

    const keepCount = keepFlags.filter(Boolean).length;
    const totalCents = products.reduce((sum, p, i) => sum + (keepFlags[i] ? p.price_cents : 0), 0);

    return (
        <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-40 flex items-end justify-end bg-black/40 sm:items-stretch"
            onClick={onClose}
        >
            <div
                className="h-full w-full max-w-2xl overflow-y-auto bg-background p-6 shadow-2xl sm:border-l sm:border-border"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="mb-4 flex items-start justify-between">
                    <div>
                        <div className="flex items-center gap-1.5 text-xs text-primary">
                            <Upload size={12} /> Leverancier-lijst importeren
                        </div>
                        <h2 className="text-xl font-semibold">
                            {step === 'input' ? 'Plak je product-lijst' : `Preview: ${keepCount} van ${products.length} producten`}
                        </h2>
                    </div>
                    <button type="button" onClick={onClose} aria-label="Sluit" className="rounded p-1 hover:bg-muted">
                        <X size={18} />
                    </button>
                </div>

                {step === 'input' && (
                    <form onSubmit={handleParse} className="space-y-4">
                        <div className="rounded-lg border border-dashed border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                            <FileText size={12} className="mr-1 inline text-primary" />
                            Voor je <strong className="text-foreground">vaste assortiment</strong>: een favorietenlijst uit
                            Hanos Shop / Sligro Marktplaats, een prijslijst van je leverancier, of een foto van een productrek.
                            AI extraheert naam, prijs, eenheid en SKU per product en voegt ze toe als{' '}
                            <strong className="text-foreground">bought_in components</strong>.
                        </div>

                        <div className="rounded-lg border border-amber-300/40 bg-amber-50/40 p-2.5 text-[11px] text-amber-700 dark:border-amber-700/40 dark:bg-amber-900/15 dark:text-amber-300">
                            Heb je een <strong>losse factuur</strong> van een eenmalige bestelling? Die hoort thuis in{' '}
                            <Link href="/inkoop" className="underline">Inkoop</Link> — daar wordt 'm
                            voor boekhouding + BTW verwerkt. Hier bouw je je structurele product-bibliotheek op.
                        </div>

                        {/* Mode-toggle */}
                        <div className="inline-flex rounded-md border border-border bg-muted p-0.5 text-xs">
                            <button
                                type="button"
                                onClick={() => setInputMode('text')}
                                className={`rounded px-3 py-1 transition ${inputMode === 'text' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}
                            >
                                <FileText size={11} className="mr-1 inline" /> Tekst plakken
                            </button>
                            <button
                                type="button"
                                onClick={() => setInputMode('image')}
                                className={`rounded px-3 py-1 transition ${inputMode === 'image' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}
                            >
                                <Upload size={11} className="mr-1 inline" /> Foto / PDF
                            </button>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <label className="block text-xs">
                                <span className="mb-1 block text-muted-foreground">Leverancier (optioneel)</span>
                                <select
                                    value={supplierId}
                                    onChange={(e) => setSupplierId(e.target.value)}
                                    className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                                >
                                    <option value="">— niet koppelen —</option>
                                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.naam}</option>)}
                                </select>
                            </label>
                            <label className="block text-xs">
                                <span className="mb-1 block text-muted-foreground">Hint voor AI (optioneel)</span>
                                <input
                                    type="text"
                                    value={supplierHint}
                                    onChange={(e) => setSupplierHint(e.target.value)}
                                    placeholder="bv. 'Hanos' of 'Sligro'"
                                    className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                                />
                            </label>
                        </div>

                        {inputMode === 'text' ? (
                            <label className="block text-xs">
                                <span className="mb-1 block text-muted-foreground">Tekst, CSV-paste of bestellijst</span>
                                <textarea
                                    value={pasted}
                                    onChange={(e) => setPasted(e.target.value)}
                                    rows={10}
                                    maxLength={30000}
                                    placeholder={'bv.\nBrioche bun klein, 12 stuks, €5.04, Hanos 12345\nBBQ saus original, 1L, €6.80, Sligro 67890\n...'}
                                    className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs"
                                />
                                <span className="mt-1 block text-[10px] text-muted-foreground">{pasted.length} / 30000 tekens</span>
                            </label>
                        ) : (
                            <div className="space-y-2">
                                <label className="block">
                                    <span className="mb-1 block text-xs text-muted-foreground">Foto (JPEG/PNG) of PDF — max 6 MB</span>
                                    <input
                                        type="file"
                                        accept="image/jpeg,image/png,image/webp,application/pdf"
                                        onChange={handleFile}
                                        className="block w-full text-xs file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-primary-foreground hover:file:opacity-90"
                                    />
                                </label>
                                {fileDataUrl && fileName && (
                                    <div className="rounded-md border border-border bg-muted/30 p-2 text-[11px]">
                                        <div className="flex items-center gap-2">
                                            <FileText size={12} className="text-primary" />
                                            <span className="flex-1 truncate font-medium">{fileName}</span>
                                            <button
                                                type="button"
                                                onClick={() => { setFileDataUrl(null); setFileName(null); }}
                                                aria-label="Verwijder bestand"
                                                className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                            >
                                                <X size={11} />
                                            </button>
                                        </div>
                                        {fileDataUrl.startsWith('data:image/') && (
                                            <img src={fileDataUrl} alt="Preview" className="mt-2 max-h-48 rounded border border-border" />
                                        )}
                                    </div>
                                )}
                                <div className="text-[10px] text-muted-foreground">
                                    Tip: screenshot van je Hanos-bestellijst of foto van een factuur werkt prima.
                                    PDF&apos;s worden ook ondersteund.
                                </div>
                            </div>
                        )}

                        <div className="flex justify-end gap-2">
                            <button type="button" onClick={onClose} className="rounded-md border border-border bg-background px-4 py-2 text-sm">
                                Annuleer
                            </button>
                            <button
                                type="submit"
                                disabled={parsing}
                                className="inline-flex items-center gap-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                            >
                                {parsing ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                                {parsing ? (inputMode === 'image' ? 'AI leest de foto/PDF...' : 'AI parseert...') : 'Parse met AI'}
                            </button>
                        </div>
                    </form>
                )}

                {step === 'preview' && (
                    <div className="space-y-4">
                        <div className="rounded-lg border border-border bg-card p-3 text-xs">
                            <div className="flex items-center justify-between">
                                <div>
                                    {detectedSupplierName && <span>Gedetecteerd: <strong>{detectedSupplierName}</strong> · </span>}
                                    <span>{products.length} producten geparsed</span>
                                    {droppedCount > 0 && <span className="ml-1 text-muted-foreground">({droppedCount} overgeslagen wegens onvolledige data)</span>}
                                </div>
                                <div className="flex gap-1.5">
                                    <button type="button" onClick={() => toggleAll(true)} className="text-[11px] text-primary hover:underline">Alles aan</button>
                                    <span className="text-muted-foreground">·</span>
                                    <button type="button" onClick={() => toggleAll(false)} className="text-[11px] text-primary hover:underline">Alles uit</button>
                                </div>
                            </div>
                            <div className="mt-2 text-muted-foreground">
                                Selectie: {keepCount} × · Totale prijs: €{(totalCents / 100).toFixed(2)}
                            </div>
                        </div>

                        <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-border">
                            <table className="w-full text-xs">
                                <thead className="sticky top-0 bg-muted">
                                    <tr>
                                        <th className="px-2 py-1.5 text-left">✓</th>
                                        <th className="px-2 py-1.5 text-left">Naam</th>
                                        <th className="px-2 py-1.5 text-left">SKU</th>
                                        <th className="px-2 py-1.5 text-right">Prijs</th>
                                        <th className="px-2 py-1.5 text-left">Eenheid</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {products.map((p, i) => (
                                        <tr key={i} className={`border-t border-border ${!keepFlags[i] ? 'opacity-40' : ''}`}>
                                            <td className="px-2 py-1.5">
                                                <input type="checkbox" checked={keepFlags[i]} onChange={() => toggleKeep(i)} />
                                            </td>
                                            <td className="px-2 py-1.5">{p.name}</td>
                                            <td className="px-2 py-1.5 text-muted-foreground">{p.supplier_sku ?? '—'}</td>
                                            <td className="px-2 py-1.5 text-right">€{(p.price_cents / 100).toFixed(2)}</td>
                                            <td className="px-2 py-1.5 text-muted-foreground">
                                                {p.unit}{p.package_size ? ` (${p.package_size} ${p.package_unit ?? ''})` : ''}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <label className="flex items-center gap-2 rounded-lg border border-border bg-muted/20 p-3 text-xs">
                            <input
                                type="checkbox"
                                checked={createComponents}
                                onChange={(e) => setCreateComponents(e.target.checked)}
                            />
                            <span>
                                <strong>Maak meteen bought_in components</strong> per product (linked aan supplier-product).
                                Anders zitten ze alleen in de catalogus en moet je later handmatig koppelen.
                            </span>
                        </label>

                        <div className="flex justify-end gap-2">
                            <button type="button" onClick={() => setStep('input')} className="rounded-md border border-border bg-background px-3 py-2 text-sm">
                                Terug
                            </button>
                            <button
                                type="button"
                                onClick={handleSave}
                                disabled={saving || keepCount === 0}
                                className="inline-flex items-center gap-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                            >
                                {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                                {saving ? 'Opslaan...' : `Importeer ${keepCount}`}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
