/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Boxes, Plus, X, Trash2, Sparkles,
    Package, ShoppingBag, Loader2, Search, Check, ThermometerSun,
    Upload, FileText, ChefHat, Camera, Calculator, ImagePlus, ArrowRight,
    Beef, Fish, Leaf, Milk, Droplet, Wheat, Candy, Scissors,
} from 'lucide-react';
import { getComponentVisual } from '@/components/menu/component-visuals';

/* Icoon-resolver voor de soort-tegel op de componentkaart. */
const SOORT_ICONS: Record<string, typeof Beef> = {
    Beef, Fish, Leaf, Milk, Droplet, Wheat, Candy, Package, Boxes,
};
import PageHeader from '@/components/PageHeader';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';
import '@/components/redesign/redesign.css';
import { useComponentFolders, type ComponentFolderRow } from './_lib/useComponentFolders';
/* GP-5 (2026-05-25): FolderBar vervangen door FolderTree (Drive-style sidebar).
   Import gehouden voor evt. fallback maar momenteel niet gerendered. */
import FolderModal from './_components/FolderModal';
/* GP-4 (2026-05-25): live foodcost-impact preview bij component-prijswijziging. */
import { FoodcostImpactModal, type FoodcostImpactPayload } from '@/components/menu/FoodcostImpactModal';
/* GP-5 (2026-05-25): Drive-style folder tree + drag-drop. */
import { DndContext, type DragEndEvent, DragOverlay, useDraggable, useSensor, useSensors, PointerSensor } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { FolderTree, parseDropId } from '@/components/menu/FolderTree';
/* Inkoop-helderheid (2026-06-12): terugreken-canon grootverpakking → eenheidsprijs. */
import { packToBase, unitPriceLabel, exampleUseCost, PACK_UNITS, type PackUnit, normalizeYield, effectiveBaseCostCents, yieldRestatement } from '@/lib/unitPrice';
import SupplierProductAutocomplete, { type CatalogSearchHit } from '@/components/SupplierProductAutocomplete';
import {
    ingredientRowCostCents,
    resolvePricingFromSupplierPrice,
    resolvePricingFromSupplierProduct,
    recipeYieldFromRows,
    costPerBaseFromRecipe,
} from '@/lib/ingredientPricing';

interface AiProposal {
    name: string;
    description?: string;
    type: ComponentType;
    base_quantity: number;
    base_unit: string;
    base_cost_cents: number;
    ingredients?: Array<{ name: string; qty: number; unit: string; cost_cents?: number }>;
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
type ComponentCategory = 'food' | 'non_food';

interface ComponentRow {
    id: number;
    name: string;
    description: string | null;
    type: ComponentType;
    /* food = menu-bouwsteen, non_food = verpakking/materieel (2026-06-12). */
    category: ComponentCategory;
    base_quantity: number;
    base_unit: string;
    base_cost_cents: number;
    /* Snijverlies: bruikbare fractie van de inkoop (0<y<=1). 1 = geen verlies.
       base_cost_cents blijft de inkoopprijs; de deling zit in de formule. */
    yield_factor?: number | null;
    /* Pak-prijs administratie (2026-06-12): wat er bij de groothandel betaald is,
       voor welke inhoud. Bron van base_*; herzienbaar in de edit-drawer. */
    pack_price_cents: number | null;
    pack_quantity: number | null;
    pack_unit: string | null;
    ingredients: unknown;
    preparation_steps: unknown;
    flavor_tags: string[] | null;
    supplier_product_id: number | null;
    /* Blijvende koppeling aan een leverancier-prijs (Catalog A) — migratie 20260725. */
    master_product_id: number | null;
    supplier_price_id: number | null;
    ai_suggested: boolean;
    approved_at: string | null;
    created_at: string;
    updated_at: string;
    /* S2-deel-3: koppeling aan component_folders. NULL = root. */
    folder_id: string | null;
}

const UNITS = ['g', 'kg', 'ml', 'liter', 'stuk', 'portie'];

function formatEuro(cents: number): string {
    return '€ ' + (cents / 100).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Hoeveelheid zonder overbodige nullen: 1000 → "1000", 0.5 → "0,5". */
function formatQty(n: number): string {
    return Number(n).toLocaleString('nl-NL', { maximumFractionDigits: 3 });
}

function formatPerBase(cents: number, qty: number, unit: string): string {
    return `${formatEuro(cents)} / ${qty}${unit}`;
}

/* Decimaal-parser die ook Nederlandse komma's accepteert ("2,5"). */
function parseDec(s: string): number {
    return Number(String(s).trim().replace(',', '.'));
}

/* ── Ingrediëntregels: form-state (strings) ⇄ JSONB [{name,qty,unit,cost_cents}] ── */

interface IngredientFormRow {
    name: string;
    qty: string;
    unit: string;
    cost_euros: string;
    /* Optionele koppeling aan de prijslijst-catalogus (master_products +
       supplier_prices). Is deze gezet, dan volgt de kostprijs automatisch uit
       de gekozen leverancier-prijs × aantal (zie linkedRowCostCents). */
    master_product_id?: number | null;
    supplier_price_id?: number | null;
    /* Koppeling aan de gescande bestel-catalogus (Catalog B). Een regel is
       gekoppeld via master_product_id ÓF supplier_product_id — nooit beide. */
    supplier_product_id?: number | null;
    leverancier?: string | null;
    unit_price?: number | null;              // € per kg of per (verpakkings)eenheid
    price_basis?: 'kg' | 'stuk' | null;      // rekenwijze: 'kg' = per kilo, 'stuk' = per eenheid × aantal
    price_unit?: string | null;              // eerlijk label/lock-eenheid van de prijs ('kg' | 'stuk' | 'doos' | 'pak' …)
}

/** Is deze regel gekoppeld aan een leverancier-product (welke catalogus dan ook)? */
function isRowLinked(r: IngredientFormRow): boolean {
    return !!r.master_product_id || !!r.supplier_product_id;
}

/** Alle koppel-velden leeg — gebruikt bij ontkoppelen en bij naam-wijziging. */
const UNLINKED_FIELDS = {
    master_product_id: null,
    supplier_price_id: null,
    supplier_product_id: null,
    leverancier: null,
    unit_price: null,
    price_basis: null,
    price_unit: null,
} as const;

const emptyIngredientRow = (): IngredientFormRow => ({ name: '', qty: '', unit: 'g', cost_euros: '' });

function ingredientsFromJson(value: unknown): IngredientFormRow[] {
    if (!Array.isArray(value)) return [];
    return value
        .filter((v): v is Record<string, unknown> => typeof v === 'object' && v !== null)
        .map(v => ({
            name: typeof v.name === 'string' ? v.name : '',
            qty: v.qty != null && Number.isFinite(Number(v.qty)) ? String(v.qty) : '',
            unit: typeof v.unit === 'string' ? v.unit : '',
            cost_euros: typeof v.cost_cents === 'number' && Number.isFinite(v.cost_cents) && v.cost_cents > 0
                ? (v.cost_cents / 100).toFixed(2) : '',
            master_product_id: typeof v.master_product_id === 'number' ? v.master_product_id : null,
            supplier_price_id: typeof v.supplier_price_id === 'number' ? v.supplier_price_id : null,
            supplier_product_id: typeof v.supplier_product_id === 'number' ? v.supplier_product_id : null,
            leverancier: typeof v.leverancier === 'string' ? v.leverancier : null,
            unit_price: typeof v.unit_price === 'number' && Number.isFinite(v.unit_price) ? v.unit_price : null,
            price_basis: v.price_basis === 'kg' || v.price_basis === 'stuk' ? v.price_basis : null,
            price_unit: typeof v.price_unit === 'string' ? v.price_unit : null,
        }));
}

type IngredientJson = {
    name: string; qty: number; unit: string; cost_cents: number;
    master_product_id?: number; supplier_price_id?: number | null;
    supplier_product_id?: number | null;
    leverancier?: string | null; unit_price?: number | null;
    price_basis?: 'kg' | 'stuk' | null; price_unit?: string | null;
};

function rowsToIngredientsJson(rows: IngredientFormRow[]): IngredientJson[] {
    return rows
        .filter(r => r.name.trim().length > 0)
        .map(r => {
            const qty = parseDec(r.qty);
            const cents = Math.round(parseDec(r.cost_euros) * 100);
            const base: IngredientJson = {
                name: r.name.trim(),
                qty: Number.isFinite(qty) && qty > 0 ? qty : 0,
                unit: r.unit.trim(),
                cost_cents: Number.isFinite(cents) && cents > 0 ? cents : 0,
            };
            /* Koppel-velden alleen meesturen als er echt een leverancier-product
               gekozen is — houdt de JSONB schoon voor vrije-tekst-ingrediënten. */
            if (isRowLinked(r)) {
                if (r.master_product_id) {
                    base.master_product_id = r.master_product_id;
                    base.supplier_price_id = r.supplier_price_id ?? null;
                } else {
                    base.supplier_product_id = r.supplier_product_id ?? null;
                }
                base.leverancier = r.leverancier ?? null;
                base.unit_price = r.unit_price ?? null;
                base.price_basis = r.price_basis ?? null;
                base.price_unit = r.price_unit ?? null;
            }
            return base;
        });
}

function ingredientSumCents(rows: IngredientFormRow[]): number {
    return rows.reduce((s, r) => {
        const cents = Math.round(parseDec(r.cost_euros) * 100);
        return s + (Number.isFinite(cents) && cents > 0 ? cents : 0);
    }, 0);
}

/* Kostprijs van een gekoppelde ingrediëntregel = gekozen leverancier-prijs ×
   aantal. Puur code-rekenwerk (nooit AI): per kg → €/kg × aantal-in-kg;
   per stuk → €/stuk × aantal. Geeft null als de regel niet (volledig) gekoppeld
   is, zodat de vrij-getikte kostprijs blijft staan. */
function linkedRowCostCents(row: IngredientFormRow): number | null {
    if (!isRowLinked(row)) return null;
    return ingredientRowCostCents({
        qty: parseDec(row.qty),
        unit: row.unit,
        unit_price: row.unit_price,
        price_basis: row.price_basis,
    });
}

function stepsFromJson(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((s): s is string => typeof s === 'string');
}

/* Naam-heuristiek voor non-food bij scan-import (default food). */
const NON_FOOD_RE = /folie|vacuumzak|snijplank|braadpan|servet|beker|handschoen|krat|disposable|tape|zak/i;

export default function ComponentenPage() {
    const toast = useToast();
    const confirm = useConfirm();

    const [components, setComponents] = useState<ComponentRow[]>([]);
    /* Per component: in hoeveel gerechten zit hij — de zichtbare lijn
       van inkoopprijs naar gerecht (2026-06-12). */
    const [usage, setUsage] = useState<Record<number, number>>({});
    const [loading, setLoading] = useState(true);
    const [deletingId, setDeletingId] = useState<number | null>(null);
    const [selectedComponentId, setSelectedComponentId] = useState<number | null>(null);
    const [showImport, setShowImport] = useState(false);
    /* Zelf-bereid/Inkoop zijn food-only; non_food en unused zijn eigen chips.
       "Alle" toont álles, zodat Alle = Zelf-bereid + Inkoop + Non-food. */
    const [typeFilter, setTypeFilter] = useState<'all' | ComponentType | 'non_food' | 'unused'>('all');
    const [search, setSearch] = useState('');

    /* Twee first-class toevoegen-routes (2026-06-12):
       Zelf bereid → ReceptuurDrawer, Scan kant-en-klaar → ScanDrawer. */
    const [showReceptuur, setShowReceptuur] = useState(false);
    const [showScan, setShowScan] = useState(false);
    /* Het pad dat ontbrak: een ingekocht product handmatig toevoegen, zonder AI. */
    const [showInkoop, setShowInkoop] = useState(false);

    /* S2-deel-3: folder-state. currentFolderId=null toont alle componenten;
       als ingesteld → filter op components.folder_id.
       GP-5 (2026-05-25): currentFolderId kan ook '__root__' zijn = "zonder folder". */
    const { rows: folders, available: foldersAvailable, refetch: refetchFolders } = useComponentFolders();
    const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
    const [folderModalOpen, setFolderModalOpen] = useState(false);
    const [folderEditing, setFolderEditing] = useState<ComponentFolderRow | null>(null);

    /* GP-5: drag-overlay state — toont een floating chip van het slepende
       component zodat user weet wat hij verplaatst. */
    const [draggingComp, setDraggingComp] = useState<ComponentRow | null>(null);
    const dndSensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), // 5px drag-threshold om click vs drag te onderscheiden
    );

    async function handleDragEnd(event: DragEndEvent) {
        setDraggingComp(null);
        const targetFolderId = parseDropId(event.over?.id as string | null | undefined);
        if (targetFolderId === undefined) return; // niet boven een folder
        const componentId = Number(event.active.id);
        if (!Number.isInteger(componentId)) return;

        const target = components.find(c => c.id === componentId);
        if (!target) return;
        if (target.folder_id === targetFolderId) return; // al in deze folder

        /* Optimistic UI: update direct, rollback bij API-error. */
        const previousFolderId = target.folder_id;
        setComponents(prev => prev.map(c =>
            c.id === componentId ? { ...c, folder_id: targetFolderId } : c
        ));

        try {
            const res = await fetch(`/api/components/${componentId}`, {
                method: 'PATCH',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ folder_id: targetFolderId }),
            });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error || 'Verplaatsen mislukt');
            const folderName = targetFolderId === null
                ? 'Zonder folder'
                : folders.find(f => f.id === targetFolderId)?.name ?? 'folder';
            toast(`"${target.name}" → ${folderName}`, 'success');
        } catch (e: any) {
            /* Rollback */
            setComponents(prev => prev.map(c =>
                c.id === componentId ? { ...c, folder_id: previousFolderId } : c
            ));
            toast(e.message || 'Verplaatsen mislukt', 'error');
        }
    }

    async function loadComponents() {
        setLoading(true);
        try {
            const res = await fetch('/api/components', { credentials: 'include' });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error || 'Laden mislukt');
            setComponents(body.components ?? []);
            setUsage(body.usage ?? {});
        } catch (e: any) {
            toast(e.message || 'Laden mislukt', 'error');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { loadComponents(); }, []);

    /* ⌘K / Ctrl+K focuses the search input — matches the shortcut-hint badge */
    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                document.getElementById('component-search')?.focus();
            }
        }
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    const filtered = useMemo(() => {
        return components.filter(c => {
            /* Folder-filter: bij currentFolderId=null tonen we ALLE componenten
               (root + sub). Bij specifieke folder tonen we alleen die folder. */
            if (currentFolderId !== null && c.folder_id !== currentFolderId) return false;
            /* "Alle" toont écht alles (food + non-food) zodat de tellingen
               kloppen: Alle = Zelf-bereid + Inkoop + Non-food. Eerder liet
               "Alle" non-food weg, waardoor de chip 23 zei en de mappen 29 —
               verwarrend. Zelf-bereid/Inkoop blijven food-only. */
            if (typeFilter === 'non_food') {
                if (c.category !== 'non_food') return false;
            } else if (typeFilter === 'unused') {
                if ((usage[c.id] ?? 0) > 0) return false;
            } else if (typeFilter !== 'all') {
                if (c.category === 'non_food') return false;
                if (c.type !== typeFilter) return false;
            }
            if (search.trim().length > 0) {
                const q = search.trim().toLowerCase();
                if (!c.name.toLowerCase().includes(q) && !(c.description ?? '').toLowerCase().includes(q)) {
                    return false;
                }
            }
            return true;
        });
    }, [components, currentFolderId, typeFilter, search, usage]);

    /* Counts per folder voor de FolderBar chips. */
    const folderCounts = useMemo(() => {
        const m: Record<string, number> = {};
        for (const c of components) {
            if (c.folder_id) m[c.folder_id] = (m[c.folder_id] ?? 0) + 1;
        }
        return m;
    }, [components]);
    const rootCount = useMemo(() => components.filter(c => c.folder_id === null).length, [components]);

    async function handleDelete(c: ComponentRow) {
        if (!window.confirm(`Verwijder "${c.name}"?\n\nDit kan niet ongedaan worden gemaakt. Als de component in een gerecht zit, wordt verwijderen tegengehouden.`)) return;
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

    /* Statistieken rekenen alleen over food — non-food (folie, kratten) zou
       het gemiddelde kostprijs-beeld vervuilen. Defensief: alles ≠ non_food = food. */
    const foodComponents = components.filter(c => c.category !== 'non_food');
    const nonFoodCount = components.length - foodComponents.length;
    const preparedCount = foodComponents.filter(c => c.type === 'prepared').length;
    const boughtCount = foodComponents.filter(c => c.type === 'bought_in').length;
    const totalCount = foodComponents.length;
    /* Alles inclusief non-food — dit is het getal dat óók de mappen tellen. */
    const allCount = components.length;
    /* Een gemiddelde over base_cost_cents mengt €/100g met €/stuk en €/100ml —
       onvergelijkbare eenheden, dus een betekenisloos getal. Vervangen door een
       actie-stat: componenten ZONDER prijs maken elk gerecht waarin ze zitten
       stilzwijgend te goedkoop, en dat is direct op te lossen werk. */
    const zonderPrijsCount = components.filter(c => (c.base_cost_cents ?? 0) <= 0).length;
    /* Hoeveel bouwstenen worden nog nergens gebruikt — bruikbaarder signaal dan
       een AI-percentage: dit is opruimwerk dat geld kan schelen. */
    const unusedCount = components.filter(c => (usage[c.id] ?? 0) === 0).length;

    /* GP-5: render-helper voor het card-grid-gebied (loading/empty/cards).
       Wordt aangeroepen binnen DndContext (mr-comp-layout) of standalone
       wanneer folders niet beschikbaar zijn. Cards wikkelen in
       DraggableComponentCard die onClick passes door naar de wrapper-button. */
    function renderComponentGridArea(): React.ReactElement {
        if (loading) {
            return (
                <div className="flex items-center justify-center py-20 text-[var(--muted)]">
                    <Loader2 size={18} className="mr-2 animate-spin" /> Componenten laden…
                </div>
            );
        }
        if (filtered.length === 0) {
            return (
                <div
                    className="overflow-hidden rounded-2xl border border-dashed border-[var(--border)] p-14 text-center"
                    style={{ background: 'linear-gradient(135deg, var(--card) 0%, var(--card-solid) 100%)' }}
                >
                    <div className="mx-auto mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--brand)]/10 ring-1 ring-[var(--brand)]/20">
                        <Boxes size={24} className="text-[var(--brand)]" strokeWidth={1.5} />
                    </div>
                    <h3 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>
                        {components.length === 0 ? 'Nog geen componenten' : 'Geen match'}
                    </h3>
                    <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-[var(--muted-light)]">
                        {components.length === 0
                            ? 'Begin met je eerste bouwsteen. Zelf bereid met volledige receptuur (aardbeien bavaroise) of scan een kant-en-klaar product met je camera.'
                            : 'Geen component op deze filter of zoekterm.'}
                    </p>
                    {components.length === 0 && !showReceptuur && !showScan && (
                        <div className="mt-6 flex items-center justify-center gap-2">
                            <button
                                type="button"
                                onClick={() => setShowScan(true)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--brand)]/30 bg-[var(--brand)]/10 px-3 py-1.5 text-[12px] font-medium text-[var(--brand)] transition hover:bg-[var(--brand)]/15"
                            >
                                <Camera size={12} /> Scan kant-en-klaar
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowReceptuur(true)}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--brand)] px-3 py-1.5 text-[12px] font-semibold text-black transition hover:opacity-90"
                            >
                                <ChefHat size={12} /> Zelf bereid
                            </button>
                        </div>
                    )}
                </div>
            );
        }
        return (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.map((c, idx) => (
                    <motion.div
                        key={c.id}
                        layout
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{
                            duration: 0.3,
                            /* Alleen de eerste rijen krijgen een trapje — daarna
                               ineens, anders wacht je bij 100 kaarten te lang. */
                            delay: Math.min(idx, 8) * 0.035,
                            ease: [0.22, 1, 0.36, 1],
                        }}
                        whileHover={{ y: -3 }}
                    >
                    <DraggableComponentCard componentId={c.id} disabled={!foldersAvailable}>
                        <button
                            type="button"
                            onClick={() => setSelectedComponentId(c.id)}
                            className="group relative w-full h-full overflow-hidden rounded-xl border border-[var(--border)] p-4 text-left transition-all hover:border-[var(--brand)]/45 hover:shadow-[0_10px_30px_-12px_rgba(0,0,0,.55)]"
                            style={{ background: 'linear-gradient(135deg, var(--card) 0%, var(--card-solid) 100%)' }}
                        >
                            {/* Accentlijn die bij hover van links naar rechts invult. */}
                            <span
                                className="pointer-events-none absolute inset-x-0 top-0 h-[3px] origin-left transition-transform duration-300"
                                style={{ background: getComponentVisual(c.name, c.category).accent, opacity: 0.85 }}
                            />
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                                    {c.type === 'prepared'
                                        ? <><Package size={10} /> Zelf-bereid</>
                                        : <><ShoppingBag size={10} /> Inkoop</>}
                                    {c.ai_suggested && (
                                        <span className="inline-flex items-center gap-0.5 rounded bg-[var(--brand)]/10 px-1 py-0.5 text-[9px] text-[var(--brand)]">
                                            <Sparkles size={8} /> AI
                                        </span>
                                    )}
                                    {c.category === 'non_food' && (
                                        <span className="rounded bg-[var(--bg)] px-1 py-0.5 text-[9px] normal-case tracking-normal text-[var(--muted)]">
                                            non-food
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
                            {/* Soort-tegel: geeft de kaart visuele identiteit (vlees/vis/
                                groente/…), zodat de pagina scanbaar is i.p.v. 30× grijs. */}
                            <div className="mt-3 flex items-start gap-2.5">
                                {(function () {
                                    const v = getComponentVisual(c.name, c.category);
                                    const Icon = SOORT_ICONS[v.icon] ?? Boxes;
                                    return (
                                        <span
                                            aria-hidden="true"
                                            title={v.label}
                                            className="flex shrink-0 items-center justify-center rounded-lg"
                                            style={{ width: 34, height: 34, background: v.gradient }}
                                        >
                                            <Icon size={16} color="rgba(255,255,255,.92)" />
                                        </span>
                                    );
                                })()}
                                <h3 className="line-clamp-2 text-[15px] font-semibold leading-tight" style={{ color: 'var(--text)' }}>
                                    {c.name}
                                </h3>
                            </div>
                            {c.description && (
                                <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-[var(--muted-light)]">{c.description}</p>
                            )}
                            <div className="mt-3 flex items-baseline justify-between border-t border-[var(--border)] pt-2.5">
                                <span className="font-mono text-[15px] font-semibold tabular-nums" style={{ color: 'var(--text)' }}>
                                    {formatEuro(c.base_cost_cents)}
                                </span>
                                <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                                    /{c.base_quantity}{c.base_unit}
                                </span>
                            </div>
                            {/* Inkoop-helderheid: herkenbare groothandel-eenheid + de lijn
                                naar gerechten, direct op de kaart (2026-06-12). */}
                            <div className="mt-1.5 flex items-center justify-between gap-2 text-[10px]">
                                <span className="font-medium text-[var(--brand)]">
                                    {unitPriceLabel(c.base_cost_cents, c.base_quantity, c.base_unit) ?? ''}
                                    {/* Inkoopprijs blijft vóóraan (dat is wat op de factuur staat);
                                        de gecorrigeerde prijs staat er als gevolg achter. */}
                                    {normalizeYield(c.yield_factor) < 1 && (
                                        <span className="text-[var(--muted)]">
                                            {' · na snijverlies '}
                                            {unitPriceLabel(effectiveBaseCostCents(c.base_cost_cents, c.yield_factor), c.base_quantity, c.base_unit) ?? ''}
                                        </span>
                                    )}
                                </span>
                                <span className="text-[var(--muted)]">
                                    {(usage[c.id] ?? 0) > 0
                                        ? `in ${usage[c.id]} ${usage[c.id] === 1 ? 'gerecht' : 'gerechten'}`
                                        : 'nog niet in een gerecht'}
                                </span>
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
                    </DraggableComponentCard>
                    </motion.div>
                ))}
            </div>
        );
    }

    return (
        <div className="redesign-root">
            <div className="main" style={{ padding: '24px 0 40px' }}>
                {/* ── Kop ──────────────────────────────────────────────────────
                    Bewust rustig gehouden (2026-07-26): de AI-ring stond op 0%
                    en zette een lege functie in de spotlight; vier concurrerende
                    knoppen maakten "iets toevoegen" een keuzeprobleem. Nu: één
                    titel, één primaire actie met menu, en cijfers die je gebruikt.
                    De "← Menu"-knop is weg — breadcrumb + tabs doen dat al. */}
                <motion.header
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                    className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-4"
                >
                    <div className="min-w-0">
                        <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-[var(--brand)]/25 bg-[var(--brand)]/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--brand)]">
                            <Boxes size={11} /> Bouwstenen
                        </div>
                        <h1
                            className="text-[32px] font-semibold leading-[1.05] tracking-tight sm:text-[38px]"
                            style={{ color: 'var(--text)' }}
                        >
                            Componenten
                        </h1>
                        <p className="mt-2 max-w-lg text-[13px] leading-relaxed text-[var(--muted-light)]">
                            De basis onder je gerechten. Pas hier één inkoopprijs aan en elk
                            gerecht dat &apos;m gebruikt rekent direct mee.
                        </p>
                    </div>
                    <AddComponentMenu
                        onInkoop={() => setShowInkoop(true)}
                        onZelfBereid={() => setShowReceptuur(true)}
                        onScan={() => setShowScan(true)}
                        onImport={() => setShowImport(true)}
                    />
                </motion.header>

                {/* ── Cijfers ── vier tegels die je echt gebruikt. */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.06, ease: [0.22, 1, 0.36, 1] }}
                    className="mb-4 grid grid-cols-2 gap-2.5 md:grid-cols-4"
                >
                    <StatTile
                        label="Bouwstenen"
                        value={String(allCount)}
                        hint={nonFoodCount > 0 ? `${totalCount} food · ${nonFoodCount} non-food` : 'In je bibliotheek'}
                    />
                    <StatTile label="Zelf-bereid" value={String(preparedCount)} hint="Met eigen receptuur" />
                    <StatTile label="Inkoop" value={String(boughtCount)} hint="Kant-en-klaar ingekocht" />
                    <StatTile
                        label="Zonder prijs"
                        value={String(zonderPrijsCount)}
                        hint={zonderPrijsCount > 0 ? 'Maken je gerechten te goedkoop' : 'Alles heeft een prijs'}
                        accent={zonderPrijsCount > 0}
                    />
                </motion.div>

                {/* Eén regel die de kern uitlegt — de rest stond dubbel in de
                    drawers zelf. */}
                <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3.5 py-2.5 text-[12px] text-[var(--muted-light)]">
                    <Calculator size={13} className="shrink-0 text-[var(--brand)]" />
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                        <span>€62,50 / doos 5 kg</span>
                        <ArrowRight size={11} className="shrink-0 text-[var(--muted)]" />
                        <span>€12,50 / kg</span>
                        <ArrowRight size={11} className="shrink-0 text-[var(--muted)]" />
                        <span style={{ color: 'var(--text)' }}>200 g in een gerecht = €2,50</span>
                    </span>
                </div>

                {/* GP-5 (2026-05-25): FolderBar (horizontale chips) vervangen door
                    FolderTree (Drive-style sidebar) + DndContext voor drag-drop.
                    Tree mount onder de hero, de filter-bar + grid binnen DndContext
                    zodat cards naar folder-items kunnen sleep. Fallback naar FolderBar
                    als foldersAvailable=false (migration niet gedraaid). */}
                {!foldersAvailable && (
                    <div style={{ padding: 10, fontSize: 12, color: 'var(--muted)', fontStyle: 'italic', textAlign: 'center', border: '1px dashed var(--border)', borderRadius: 8, marginBottom: 10 }}>
                        Folders niet beschikbaar — draai migration component_folders om Drive-style organisatie te activeren.
                    </div>
                )}

                {/* ── Filters + zoeken ──────────────────────────────────────────
                    Segmented control met meebewegende markering. "Alle" telt nu
                    álles (= zelf-bereid + inkoop + non-food), zodat dit getal
                    gelijk loopt met de mappen links. "Ongebruikt" verving de
                    AI-tegel: dat is opruimwerk dat je wél iets oplevert. */}
                <div className="mb-4 flex flex-wrap items-center gap-2">
                    <div className="flex flex-wrap items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--card)] p-1">
                        {([
                            { key: 'all', label: 'Alle', icon: null, count: allCount },
                            { key: 'prepared', label: 'Zelf-bereid', icon: <Package size={12} />, count: preparedCount },
                            { key: 'bought_in', label: 'Inkoop', icon: <ShoppingBag size={12} />, count: boughtCount },
                            { key: 'non_food', label: 'Non-food', icon: <Boxes size={12} />, count: nonFoodCount },
                            { key: 'unused', label: 'Ongebruikt', icon: null, count: unusedCount },
                        ] as const).map(f => {
                            const active = typeFilter === f.key;
                            return (
                                <button
                                    key={f.key}
                                    type="button"
                                    onClick={() => setTypeFilter(f.key)}
                                    aria-pressed={active}
                                    className="relative rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors"
                                    style={{ color: active ? 'var(--brand)' : 'var(--muted-light)' }}
                                >
                                    {active && (
                                        <motion.span
                                            layoutId="comp-filter-active"
                                            className="absolute inset-0 rounded-lg bg-[var(--brand)]/12 ring-1 ring-inset ring-[var(--brand)]/30"
                                            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                                        />
                                    )}
                                    <span className="relative z-10 inline-flex items-center gap-1.5 whitespace-nowrap">
                                        {f.icon}
                                        {f.label}
                                        <span
                                            className="rounded px-1 text-[10px] font-semibold tabular-nums"
                                            style={{
                                                background: active ? 'var(--brand)' : 'var(--bg)',
                                                color: active ? '#0a0a0c' : 'var(--muted)',
                                            }}
                                        >
                                            {f.count}
                                        </span>
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    <div className="relative min-w-[220px] flex-1">
                        <Search
                            size={14}
                            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"
                        />
                        <input
                            type="search"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Zoek component…"
                            id="component-search"
                            className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] py-2.5 pl-9 pr-24 text-[13px] outline-none transition focus:border-[var(--brand)]/50"
                            style={{ color: 'var(--text)' }}
                        />
                        <div className="absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
                            {search.length > 0 ? (
                                <>
                                    <span className="text-[11px] tabular-nums text-[var(--muted)]">
                                        {filtered.length}/{components.length}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => setSearch('')}
                                        aria-label="Wis zoekopdracht"
                                        className="rounded p-1 text-[var(--muted)] transition hover:bg-[var(--bg)] hover:text-[var(--text)]"
                                    >
                                        <X size={11} />
                                    </button>
                                </>
                            ) : (
                                <span className="rounded border border-[var(--border)] px-1.5 py-0.5 text-[10px] text-[var(--muted)]">
                                    ⌘ K
                                </span>
                            )}
                        </div>
                    </div>
                </div>

            {/* Lijst */}
            {/* GP-5 (2026-05-25): wrap content in DndContext + mr-comp-layout grid
                wanneer folders beschikbaar. FolderTree links (sticky), cards rechts.
                @dnd-kit verwerkt drag-drop met 5px activation-constraint zodat normale
                klik op een card nog steeds de edit-drawer opent. */}
            {foldersAvailable ? (
                <DndContext
                    sensors={dndSensors}
                    onDragStart={(e) => {
                        const c = components.find(comp => String(comp.id) === e.active.id);
                        if (c) setDraggingComp(c);
                    }}
                    onDragEnd={handleDragEnd}
                    onDragCancel={() => setDraggingComp(null)}
                >
                    <div className="mr-comp-layout">
                        <FolderTree
                            folders={folders}
                            counts={folderCounts}
                            rootCount={rootCount}
                            currentFolderId={currentFolderId}
                            onSelectFolder={setCurrentFolderId}
                            onCreate={() => { setFolderEditing(null); setFolderModalOpen(true); }}
                            onEdit={(f) => { setFolderEditing(f); setFolderModalOpen(true); }}
                        />
                        <div>
                            {renderComponentGridArea()}
                        </div>
                    </div>
                    <DragOverlay>
                        {draggingComp && (
                            <div style={{
                                padding: '8px 12px', borderRadius: 10,
                                background: 'var(--card, var(--bg-subtle))',
                                border: '1px solid var(--brand)',
                                fontSize: 13, fontWeight: 500, color: 'var(--text)',
                                boxShadow: '0 12px 32px rgba(0,0,0,.4)',
                                display: 'flex', alignItems: 'center', gap: 8,
                                pointerEvents: 'none', maxWidth: 280,
                            }}>
                                {draggingComp.type === 'prepared'
                                    ? <Package size={12} color="var(--brand-gold, #c4a35a)" />
                                    : <ShoppingBag size={12} color="var(--muted)" />}
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {draggingComp.name}
                                </span>
                            </div>
                        )}
                    </DragOverlay>
                </DndContext>
            ) : (
                renderComponentGridArea()
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

            {showInkoop && (
                <InkoopDrawer
                    folderId={currentFolderId}
                    onClose={() => setShowInkoop(false)}
                    onSaved={() => { setShowInkoop(false); loadComponents(); }}
                />
            )}

            {showReceptuur && (
                <ReceptuurDrawer
                    folderId={currentFolderId}
                    onClose={() => setShowReceptuur(false)}
                    onSaved={() => { setShowReceptuur(false); loadComponents(); }}
                />
            )}

            {showScan && (
                <ScanDrawer
                    folderId={currentFolderId}
                    onClose={() => setShowScan(false)}
                    onImported={() => { setShowScan(false); loadComponents(); }}
                />
            )}

            </div>

            <FolderModal
                open={folderModalOpen}
                editing={folderEditing}
                parentId={currentFolderId}
                onClose={() => { setFolderModalOpen(false); setFolderEditing(null); }}
                onSaved={() => { refetchFolders(); }}
            />
        </div>
    );
}

/* ──────────────────────────────────────────────────────────────────────────
   Kleine bouwstenen voor de kop: cijfer-tegel + één toevoeg-menu.
   ────────────────────────────────────────────────────────────────────────── */

function StatTile({ label, value, hint, accent }: {
    label: string; value: string; hint: string; accent?: boolean;
}) {
    return (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3.5 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">{label}</div>
            <div
                className="mt-1.5 font-mono text-[24px] font-semibold leading-none tabular-nums"
                style={{ color: accent ? 'var(--brand)' : 'var(--text)' }}
            >
                {value}
            </div>
            <div className="mt-1.5 text-[11px] leading-tight text-[var(--muted)]">{hint}</div>
        </div>
    );
}

/* Eén primaire knop i.p.v. vier concurrerende: de drie manieren om een
   bouwsteen toe te voegen zitten eronder, mét uitleg wanneer je welke pakt. */
function AddComponentMenu({ onInkoop, onZelfBereid, onScan, onImport }: {
    onInkoop: () => void; onZelfBereid: () => void; onScan: () => void; onImport: () => void;
}) {
    const [open, setOpen] = useState(false);
    const wrapRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        function onDoc(e: MouseEvent) {
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
        }
        function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
        document.addEventListener('mousedown', onDoc);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDoc);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    const items = [
        { icon: <ShoppingBag size={15} />, title: 'Ingekocht product', desc: 'Zelf invullen: 60 stuks voor €48,60 → €0,81 per stuk', run: onInkoop },
        { icon: <ChefHat size={15} />, title: 'Zelf bereid', desc: 'Eigen receptuur: ingrediënten, stappen, allergenen', run: onZelfBereid },
        { icon: <Camera size={15} />, title: 'Scan kant-en-klaar', desc: 'Foto of screenshot van één product', run: onScan },
        { icon: <Upload size={15} />, title: 'Prijslijst importeren', desc: 'Veel producten tegelijk uit één bestand', run: onImport },
    ];

    return (
        <div ref={wrapRef} className="relative shrink-0">
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                aria-haspopup="menu"
                aria-expanded={open}
                className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold transition hover:opacity-90"
                style={{ background: 'var(--brand)', color: '#0a0a0c' }}
            >
                <Plus size={15} /> Nieuwe bouwsteen
            </button>

            <AnimatePresence>
                {open && (
                    <motion.div
                        role="menu"
                        initial={{ opacity: 0, y: -6, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -6, scale: 0.98 }}
                        transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                        className="absolute right-0 z-50 mt-2 w-[310px] overflow-hidden rounded-xl border border-[var(--border)] p-1.5 shadow-[0_18px_44px_rgba(0,0,0,.42)]"
                        style={{ background: 'var(--card-solid, var(--card))' }}
                    >
                        {items.map(it => (
                            <button
                                key={it.title}
                                type="button"
                                role="menuitem"
                                onClick={() => { setOpen(false); it.run(); }}
                                className="flex w-full items-start gap-3 rounded-lg px-2.5 py-2.5 text-left transition hover:bg-[var(--brand)]/10"
                            >
                                <span className="mt-0.5 shrink-0 text-[var(--brand)]">{it.icon}</span>
                                <span className="min-w-0">
                                    <span className="block text-[13px] font-semibold" style={{ color: 'var(--text)' }}>
                                        {it.title}
                                    </span>
                                    <span className="mt-0.5 block text-[11px] leading-snug text-[var(--muted)]">
                                        {it.desc}
                                    </span>
                                </span>
                            </button>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
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
    const [category, setCategory] = useState<ComponentCategory>('food');
    /* Pak-prijs (2026-06-12): de bron-administratie waar de kostprijs uit komt.
       Herzienbaar; de rekenhulp voert wijzigingen door naar de base-velden. */
    const [packPrice, setPackPrice] = useState('');
    const [packQty, setPackQty] = useState('');
    const [packUnit, setPackUnit] = useState<PackUnit>('kg');
    /* Snijverlies (0<y<=1). 1 = geen verlies, dus bestaande componenten
       gedragen zich exact als voorheen tot Sam het zelf aanzet. */
    const [yieldFactor, setYieldFactor] = useState<number>(1);
    const [ingredients, setIngredients] = useState<IngredientFormRow[]>([]);
    const [steps, setSteps] = useState<string[]>([]);
    const [allergenCodes, setAllergenCodes] = useState<Set<string>>(new Set());
    const [haccpRows, setHaccpRows] = useState<HaccpRow[]>([]);
    /* Blijvende leverancier-koppeling (Catalog A). linkLabel = weergave voor de badge. */
    const [masterProductId, setMasterProductId] = useState<number | null>(null);
    const [supplierPriceId, setSupplierPriceId] = useState<number | null>(null);
    const [supplierProductId, setSupplierProductId] = useState<number | null>(null);
    const [linkLabel, setLinkLabel] = useState<{ leverancier: string | null; naam: string; actief: boolean } | null>(null);
    const [linkSearch, setLinkSearch] = useState('');

    /* Kostprijs afleiden uit een genormaliseerde leverancier-prijs — €/kg → per
       100 g (zoals de Rekenhulp), €/stuk → per stuk. Puur code-rekenwerk. */
    function applyLinkedPrice(prijsPerKg: number | null, prijsPerStuk: number | null): boolean {
        if (prijsPerKg && prijsPerKg > 0) {
            setBaseQty('100'); setBaseUnit('g'); setCostEuros((prijsPerKg / 10).toFixed(2));
            return true;
        }
        if (prijsPerStuk && prijsPerStuk > 0) {
            setBaseQty('1'); setBaseUnit('stuk'); setCostEuros(prijsPerStuk.toFixed(2));
            return true;
        }
        return false; // geen genormaliseerde prijs → kostprijs blijft handmatig
    }

    function onPickLink(hit: CatalogSearchHit) {
        setLinkSearch('');
        setLinkLabel({ leverancier: hit.leverancier, naam: hit.naam, actief: true });
        if (hit.source === 'supplier_product' && hit.supplier_product_id) {
            /* Catalog B (gescande bestel-catalogus, bv. Bidfood) → koppel op supplier_product_id. */
            setSupplierProductId(hit.supplier_product_id);
            setMasterProductId(null);
            setSupplierPriceId(null);
            if (hit.base_cost_cents != null && hit.base_quantity != null && hit.base_unit) {
                setBaseQty(String(hit.base_quantity));
                setBaseUnit(hit.base_unit);
                setCostEuros((hit.base_cost_cents / 100).toFixed(2));
            } else {
                toast('Gekoppeld — geen nette prijs bekend, vul de kostprijs zelf in', 'info');
            }
        } else {
            /* Catalog A (prijslijst) → koppel op master_product_id + supplier_price_id. */
            setMasterProductId(hit.master_product_id);
            setSupplierPriceId(hit.supplier_price_id);
            setSupplierProductId(null);
            const derived = applyLinkedPrice(hit.prijs_per_kg, hit.prijs_per_stuk);
            if (!derived) toast('Gekoppeld — deze leverancier heeft geen €/kg of €/stuk, dus vul de kostprijs zelf in', 'info');
        }
    }

    function unlinkSupplier() {
        setMasterProductId(null);
        setSupplierPriceId(null);
        setSupplierProductId(null);
        setLinkLabel(null);
        // Kostprijs blijft staan; je kunt 'm nu weer handmatig aanpassen.
    }

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
            setCategory(c.category === 'non_food' ? 'non_food' : 'food');
            setPackPrice(c.pack_price_cents != null ? (c.pack_price_cents / 100).toFixed(2) : '');
            setPackQty(c.pack_quantity != null ? String(c.pack_quantity) : '');
            setPackUnit(PACK_UNITS.includes(c.pack_unit as PackUnit) ? (c.pack_unit as PackUnit) : 'kg');
            setYieldFactor(normalizeYield(c.yield_factor));
            setMasterProductId(typeof c.master_product_id === 'number' ? c.master_product_id : null);
            setSupplierPriceId(typeof c.supplier_price_id === 'number' ? c.supplier_price_id : null);
            setSupplierProductId(typeof c.supplier_product_id === 'number' ? c.supplier_product_id : null);
            const lp = body.linked_price as { source: string; leverancier: string | null; naam: string; actief: boolean; prijs_per_kg?: number | null; prijs_per_stuk?: number | null; base_cost_cents?: number | null; base_quantity?: number | null; base_unit?: string | null } | null;
            if (lp) {
                setLinkLabel({ leverancier: lp.leverancier, naam: lp.naam, actief: !!lp.actief });
                // Beweegt mee: kostprijs opnieuw afleiden uit de ACTUELE leverancier-prijs.
                if (lp.source === 'supplier_product') {
                    if (lp.base_cost_cents != null && lp.base_quantity != null && lp.base_unit) {
                        setBaseQty(String(lp.base_quantity)); setBaseUnit(lp.base_unit); setCostEuros((lp.base_cost_cents / 100).toFixed(2));
                    }
                } else {
                    applyLinkedPrice(lp.prijs_per_kg ?? null, lp.prijs_per_stuk ?? null);
                }
            } else {
                setLinkLabel(null);
            }
            setIngredients(ingredientsFromJson(c.ingredients));
            setSteps(stepsFromJson(c.preparation_steps));
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

    /* Rekenhulp-doorvoer: pak-invoer → base-velden. Alleen bij user-input,
       nooit op mount, zodat een opgeslagen kostprijs niet stilletjes
       herrekend wordt bij het openen van de drawer. */
    function applyPack(nextPrice: string, nextQty: string, nextUnit: PackUnit) {
        setPackPrice(nextPrice);
        setPackQty(nextQty);
        setPackUnit(nextUnit);
        const cents = Math.round(parseDec(nextPrice) * 100);
        const q = parseDec(nextQty);
        if (Number.isFinite(cents) && cents >= 0 && Number.isFinite(q) && q > 0) {
            const base = packToBase(cents, q, nextUnit);
            if (base) {
                setBaseQty(String(base.base_quantity));
                setBaseUnit(base.base_unit);
                setCostEuros((base.base_cost_cents / 100).toFixed(2));
            }
        }
    }

    /* Pak-trio voor de PATCH: compleet → meesturen, leeg → wissen (null),
       half ingevuld → bestaande administratie laten staan. */
    function packPayload(): Record<string, number | string | null> {
        const cents = Math.round(parseDec(packPrice) * 100);
        const q = parseDec(packQty);
        const complete = packPrice.trim() !== '' && Number.isFinite(cents) && cents >= 0 && Number.isFinite(q) && q > 0;
        if (complete) return { pack_price_cents: cents, pack_quantity: q, pack_unit: packUnit };
        if (packPrice.trim() === '' && packQty.trim() === '') {
            return { pack_price_cents: null, pack_quantity: null, pack_unit: null };
        }
        return {};
    }

    /* GP-4 (2026-05-25): foodcost-impact preview-state.
       Bij base_cost_cents-wijziging fetchen we eerst de impact en tonen
       een modal voordat we daadwerkelijk saven. */
    const [impactPayload, setImpactPayload] = useState<FoodcostImpactPayload | null>(null);
    const [showImpactModal, setShowImpactModal] = useState(false);
    const [committingImpact, setCommittingImpact] = useState(false);

    function validateForm() {
        if (!name.trim()) return { ok: false as const, reason: 'Naam verplicht' };
        const qty = Number(baseQty);
        if (!Number.isFinite(qty) || qty <= 0) return { ok: false as const, reason: 'Basis-hoeveelheid > 0' };
        const cost = Number(costEuros);
        if (!Number.isFinite(cost) || cost < 0) return { ok: false as const, reason: 'Kostprijs ongeldig' };
        let baseCostCents = Math.round(cost * 100);
        /* Zelf-bereid met lege kostprijs → som van de ingrediënten overnemen
           (voorkomt de €0-cascade naar gerechten bij vergeten 'Gebruik als kostprijs'). */
        if (comp?.type === 'prepared' && baseCostCents === 0) {
            const sumC = ingredientSumCents(ingredients);
            if (sumC > 0) { baseCostCents = sumC; setCostEuros((sumC / 100).toFixed(2)); }
        }
        const tags = flavorTags.split(',').map(t => t.trim()).filter(Boolean);
        return { ok: true as const, qty, baseCostCents, tags };
    }

    async function commitSave(qty: number, baseCostCents: number, tags: string[]) {
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
                category,
                ...packPayload(),
                yield_factor: yieldFactor,
                /* Blijvende leverancier-koppeling (null = ontkoppeld). Catalog A
                   (master+prijs) OF Catalog B (supplier_product), nooit beide. */
                master_product_id: masterProductId,
                supplier_price_id: supplierPriceId,
                supplier_product_id: supplierProductId,
                /* Receptuur alleen meesturen voor zelf-bereide componenten. */
                ...(comp?.type === 'prepared' ? {
                    ingredients: rowsToIngredientsJson(ingredients),
                    preparation_steps: steps.map(s => s.trim()).filter(s => s.length > 0),
                } : {}),
                allergens: Array.from(allergenCodes).map(code => ({ allergen_code: code, ai_suggested: false })),
                haccp_points: haccpRows.filter(r => r.type),
            }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || 'Opslaan mislukt');
        const recompMsg = body.recomputed_gerechten ? ` (${body.recomputed_gerechten} gerechten herrekend)` : '';
        toast(`Component bijgewerkt${recompMsg}`, 'success');
        if (body.warnings) toast(`Wel met waarschuwingen: ${body.warnings.join(', ')}`, 'error');
        onSaved();
    }

    async function handleSave() {
        const v = validateForm();
        if (!v.ok) { toast(v.reason, 'error'); return; }

        /* GP-4: detecteer of base_cost_cents wijzigt. Anders → direct save (huidige flow). */
        const oldBaseCostCents = comp?.base_cost_cents ?? null;
        const costChanged = oldBaseCostCents !== null && oldBaseCostCents !== v.baseCostCents;

        if (!costChanged) {
            setSaving(true);
            try { await commitSave(v.qty, v.baseCostCents, v.tags); }
            catch (e: any) { toast(e.message || 'Opslaan mislukt', 'error'); }
            finally { setSaving(false); }
            return;
        }

        /* Cost-change: eerst preview ophalen, modal tonen. */
        setSaving(true);
        try {
            const previewRes = await fetch(`/api/components/${componentId}/preview-impact`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ new_base_cost_cents: v.baseCostCents }),
            });
            const previewBody = await previewRes.json();
            if (!previewRes.ok) throw new Error(previewBody.error || 'Impact-preview mislukt');

            if (previewBody.affected_count === 0) {
                /* Geen gerechten geraakt → direct doorgaan zonder modal. */
                await commitSave(v.qty, v.baseCostCents, v.tags);
            } else {
                setImpactPayload(previewBody as FoodcostImpactPayload);
                setShowImpactModal(true);
            }
        } catch (e: any) {
            toast(e.message || 'Preview mislukt', 'error');
        } finally {
            setSaving(false);
        }
    }

    async function handleImpactConfirm() {
        const v = validateForm();
        if (!v.ok) { toast(v.reason, 'error'); return; }
        setCommittingImpact(true);
        try {
            await commitSave(v.qty, v.baseCostCents, v.tags);
            setShowImpactModal(false);
            setImpactPayload(null);
        } catch (e: any) {
            toast(e.message || 'Opslaan mislukt', 'error');
        } finally {
            setCommittingImpact(false);
        }
    }

    return (
        <>
            <div className="mr-drawer-scrim" onClick={onClose} role="presentation" />
            <div className="mr-drawer kdrawer" role="dialog" aria-modal="true" aria-labelledby="comp-drawer-title">
                <div className="kdrawer-head">
                    <div className="flex-1 min-w-0">
                        <span className="kf-eyebrow">
                            {comp?.type === 'prepared' ? <><ChefHat size={12} /> Zelf bereid · bewerken</> : <><ShoppingBag size={12} /> Inkoop · bewerken</>}
                        </span>
                        <h2 id="comp-drawer-title" className="kdrawer-title">{comp?.name ?? 'Laden…'}</h2>
                    </div>
                    <button type="button" onClick={onClose} aria-label="Sluit" className="kf-icon-x"><X size={17} /></button>
                </div>

                {loading ? (
                    <div className="flex flex-1 items-center justify-center gap-2" style={{ color: 'var(--muted)', padding: 24 }}>
                        <Loader2 size={18} className="animate-spin" /> Laden…
                    </div>
                ) : (
                    <>
                        <div className="kf-body">
                            {/* Basis-info */}
                            <section className="kf-section">
                                <label className="kf-field">
                                    <span className="kf-label">Naam</span>
                                    <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="kf-input" />
                                </label>
                                <label className="kf-field">
                                    <span className="kf-label">Beschrijving</span>
                                    <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} className="kf-input" />
                                </label>
                                {/* Blijvende koppeling aan een leverancier-product uit je prijslijst
                                    (alle leveranciers). Gekoppeld → kostprijs komt uit de catalogus
                                    en beweegt mee. Alleen zinvol voor inkoop-componenten. */}
                                {comp?.type === 'bought_in' && (
                                    <label className="kf-field">
                                        <span className="kf-label">Koppel aan leverancier-product</span>
                                        {linkLabel ? (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, background: 'rgba(34,197,94,.08)', border: '1px solid rgba(34,197,94,.28)' }}>
                                                <span style={{ color: '#22c55e', fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap' }}>🔗 {linkLabel.leverancier || 'Leverancier'}</span>
                                                <span style={{ color: 'var(--muted)', fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{linkLabel.naam}</span>
                                                {!linkLabel.actief && <span style={{ color: '#f59e0b', fontSize: 11, whiteSpace: 'nowrap' }} title="Deze prijs staat niet meer op actief">verouderd</span>}
                                                <button type="button" className="kf-add" onClick={unlinkSupplier} title="Koppeling losmaken — kostprijs weer handmatig">Ontkoppel</button>
                                            </div>
                                        ) : (
                                            <SupplierProductAutocomplete
                                                value={linkSearch}
                                                onChange={setLinkSearch}
                                                onPick={onPickLink}
                                                includeSupplierProducts
                                                placeholder="Zoek een product bij al je leveranciers…"
                                            />
                                        )}
                                        <p className="kf-help">Gekoppeld → de kostprijs komt uit je prijslijst en beweegt mee bij een prijswijziging.</p>
                                    </label>
                                )}
                                {/* Inkoop-items zonder koppeling: pak-prijs is de bron, base-velden het
                                    berekende resultaat. Hier herziet Mathijs wat hij bij de slager betaalt. */}
                                {comp?.type === 'bought_in' && !linkLabel && (
                                    <PakketRekenhulp priceEuros={packPrice} qty={packQty} unit={packUnit} onApply={applyPack} />
                                )}
                                {/* Snijverlies hoort naast de prijs: het is onderdeel van de prijs. */}
                                <SnijverliesVeld
                                    value={yieldFactor}
                                    onChange={setYieldFactor}
                                    baseCostCents={Math.round((parseDec(costEuros) || 0) * 100)}
                                    baseQuantity={parseDec(baseQty) || 1}
                                    baseUnit={baseUnit}
                                />
                                <div className="kf-grid-3">
                                    <label className="kf-field">
                                        <span className="kf-label">Basis-hoeveelheid</span>
                                        <input type="number" step="0.001" min="0.001" value={baseQty} onChange={(e) => setBaseQty(e.target.value)} className="kf-input" />
                                    </label>
                                    <label className="kf-field">
                                        <span className="kf-label">Eenheid</span>
                                        <select value={baseUnit} onChange={(e) => setBaseUnit(e.target.value)} className="kf-input">
                                            {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                                        </select>
                                    </label>
                                    <label className="kf-field">
                                        <span className="kf-label">Kostprijs (€)</span>
                                        <input type="number" step="0.01" min="0" value={costEuros} onChange={(e) => setCostEuros(e.target.value)} className="kf-input" />
                                    </label>
                                </div>
                                {comp?.type === 'bought_in' && packPrice.trim() !== '' && (
                                    <p className="kf-help">↑ Automatisch berekend uit de pak-prijs. Pas de rekenhulp aan, dan rekenen deze velden mee.</p>
                                )}
                                <label className="kf-field">
                                    <span className="kf-label">Smaakprofiel-tags (komma-gescheiden)</span>
                                    <input type="text" value={flavorTags} onChange={(e) => setFlavorTags(e.target.value)} placeholder="zoet, rokerig, …" className="kf-input" />
                                </label>
                                <CategoryToggle value={category} onChange={setCategory} />
                            </section>

                            {/* Receptuur — alleen voor zelf-bereide componenten */}
                            {comp?.type === 'prepared' && (
                                <>
                                    <IngredientsEditor
                                        rows={ingredients}
                                        onChange={setIngredients}
                                        onAdoptSum={(perBaseCents) => setCostEuros((perBaseCents / 100).toFixed(2))}
                                        baseQuantity={parseDec(baseQty)}
                                        baseUnit={baseUnit}
                                    />
                                    <StepsEditor steps={steps} onChange={setSteps} />
                                </>
                            )}

                            {/* Allergenen */}
                            <section className="kf-section">
                                <span className="kf-section-title">Allergenen <span style={{ color: 'var(--muted)', fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>· klik om aan/uit te zetten</span></span>
                                <AllergenToggles codes={allergenCodes} onToggle={toggleAllergen} />
                            </section>

                            {/* HACCP-punten */}
                            <HaccpEditor rows={haccpRows} onChange={setHaccpRows} />
                        </div>

                        <div className="mr-drawer-footer" style={{ justifyContent: 'flex-end' }}>
                            <button type="button" onClick={onClose} className="kf-ghost">Annuleer</button>
                            <button type="button" onClick={handleSave} disabled={saving} className="kf-primary">
                                {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                                {saving ? 'Opslaan…' : 'Opslaan'}
                            </button>
                        </div>
                    </>
                )}

                {/* GP-4: foodcost-impact modal — verschijnt vóór commit als
                    base_cost_cents wijzigt en er getroffen gerechten zijn. */}
                <FoodcostImpactModal
                    open={showImpactModal}
                    payload={impactPayload}
                    onClose={() => { if (!committingImpact) { setShowImpactModal(false); setImpactPayload(null); } }}
                    onConfirm={handleImpactConfirm}
                    committing={committingImpact}
                />
            </div>
        </>
    );
}

/* ──────────────────────────────────────────────────────────────────────────
   GP-5 (2026-05-25): DraggableComponentCard — wraps de card-knop met dnd-kit
   useDraggable zodat hij naar een FolderTree-folder kan slepen. PointerSensor
   met 5px activationConstraint laat een normale klik de edit-drawer openen.
   ────────────────────────────────────────────────────────────────────────── */

function DraggableComponentCard({
    componentId, disabled, children,
}: {
    componentId: number;
    disabled?: boolean;
    children: React.ReactNode;
}) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: String(componentId),
        disabled,
    });
    return (
        <div
            ref={setNodeRef}
            {...attributes}
            {...listeners}
            style={{
                transform: CSS.Translate.toString(transform),
                opacity: isDragging ? 0.4 : 1,
                cursor: disabled ? 'default' : 'grab',
                /* Volledig de cel vullen zodat het grid niet shrinkt op
                   een lege wrapper-div. */
                width: '100%',
                height: '100%',
            }}
        >
            {children}
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

    async function handleParse(e?: React.FormEvent) {
        e?.preventDefault();
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
        <>
            <div className="mr-drawer-scrim" onClick={onClose} role="presentation" />
            <div className="mr-drawer kdrawer" role="dialog" aria-modal="true" style={{ width: 640 }}>
                <div className="kdrawer-head">
                    <div className="flex-1 min-w-0">
                        <span className="kf-eyebrow"><Upload size={12} /> Leverancier-lijst importeren</span>
                        <h2 className="kdrawer-title">
                            {step === 'input' ? 'Plak je product-lijst' : `Preview: ${keepCount} van ${products.length} producten`}
                        </h2>
                    </div>
                    <button type="button" onClick={onClose} aria-label="Sluit" className="kf-icon-x"><X size={17} /></button>
                </div>

                {step === 'input' && (
                    <>
                        <div className="kf-body">
                            <div className="kf-banner">
                                <FileText size={14} />
                                <span>Voor je <strong>vaste assortiment</strong>: een favorietenlijst uit Hanos Shop / Sligro Marktplaats, of een foto van een productrek. AI extraheert naam, prijs, eenheid en SKU per product en voegt ze toe als kant-en-klare <strong>componenten</strong> in je bibliotheek.</span>
                            </div>
                            <div className="kf-banner">
                                <ShoppingBag size={14} />
                                <span>Zoek je in <strong>Zelf bereid → Ingrediënt</strong> je leverancier-prijzen (spareribs van Beef Club, Bidfood…)? Die komen uit je <strong>prijslijsten</strong> — importeer een prijslijst bij <Link href="/leveranciers" className="underline">Leveranciers</Link>. Deze bulk-import vult je componenten­bibliotheek, niet dat zoekvak.</span>
                            </div>

                            <div className="kf-banner kf-banner-warn">
                                <FileText size={14} />
                                <span>Heb je een <strong>losse factuur</strong> van een eenmalige bestelling? Die hoort thuis in <Link href="/inkoop" className="underline">Inkoop</Link> — daar wordt 'm voor boekhouding + BTW verwerkt. Hier bouw je je structurele product-bibliotheek op.</span>
                            </div>

                            <div className="kf-seg">
                                <button type="button" onClick={() => setInputMode('text')} className={`kf-seg-btn ${inputMode === 'text' ? 'is-on' : ''}`}>
                                    <FileText size={11} style={{ marginRight: 5 }} /> Tekst plakken
                                </button>
                                <button type="button" onClick={() => setInputMode('image')} className={`kf-seg-btn ${inputMode === 'image' ? 'is-on' : ''}`}>
                                    <Upload size={11} style={{ marginRight: 5 }} /> Foto / PDF
                                </button>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <label className="kf-field">
                                    <span className="kf-label">Leverancier (optioneel)</span>
                                    <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="kf-input">
                                        <option value="">— niet koppelen —</option>
                                        {suppliers.map(s => <option key={s.id} value={s.id}>{s.naam}</option>)}
                                    </select>
                                </label>
                                <label className="kf-field">
                                    <span className="kf-label">Hint voor AI (optioneel)</span>
                                    <input type="text" value={supplierHint} onChange={(e) => setSupplierHint(e.target.value)} placeholder="bv. 'Hanos' of 'Sligro'" className="kf-input" />
                                </label>
                            </div>

                            {inputMode === 'text' ? (
                                <label className="kf-field">
                                    <span className="kf-label">Tekst, CSV-paste of bestellijst</span>
                                    <textarea value={pasted} onChange={(e) => setPasted(e.target.value)} rows={10} maxLength={30000} placeholder={'bv.\nBrioche bun klein, 12 stuks, €5.04, Hanos 12345\nBBQ saus original, 1L, €6.80, Sligro 67890\n…'} className="kf-input" />
                                    <span className="kf-help">{pasted.length} / 30000 tekens</span>
                                </label>
                            ) : (
                                <div className="kf-field">
                                    <span className="kf-label">Foto (JPEG/PNG) of PDF — max 6 MB</span>
                                    <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={handleFile} className="block w-full" style={{ fontSize: 12, color: 'var(--muted)' }} />
                                    {fileDataUrl && fileName && (
                                        <div className="kf-card" style={{ marginTop: 2 }}>
                                            <div className="flex items-center gap-2">
                                                <FileText size={13} style={{ color: 'var(--brand)' }} />
                                                <span className="flex-1 truncate" style={{ fontSize: 12, fontWeight: 500 }}>{fileName}</span>
                                                <button type="button" onClick={() => { setFileDataUrl(null); setFileName(null); }} aria-label="Verwijder bestand" className="kf-trash"><X size={13} /></button>
                                            </div>
                                            {fileDataUrl.startsWith('data:image/') && (
                                                <img src={fileDataUrl} alt="Preview" className="mt-2 rounded" style={{ maxHeight: 190, border: '1px solid var(--border)' }} />
                                            )}
                                        </div>
                                    )}
                                    <span className="kf-help">Tip: screenshot van je Hanos-bestellijst of foto van een factuur werkt prima. PDF&apos;s worden ook ondersteund.</span>
                                </div>
                            )}
                        </div>

                        <div className="mr-drawer-footer" style={{ justifyContent: 'flex-end' }}>
                            <button type="button" onClick={onClose} className="kf-ghost">Annuleer</button>
                            <button type="button" onClick={() => handleParse()} disabled={parsing} className="kf-primary">
                                {parsing ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                                {parsing ? (inputMode === 'image' ? 'AI leest de foto/PDF…' : 'AI parseert…') : 'Parse met AI'}
                            </button>
                        </div>
                    </>
                )}

                {step === 'preview' && (
                    <>
                        <div className="kf-body">
                            <div className="kf-card">
                                <div className="flex items-center justify-between">
                                    <div style={{ fontSize: 12 }}>
                                        {detectedSupplierName && <span>Gedetecteerd: <strong>{detectedSupplierName}</strong> · </span>}
                                        <span>{products.length} producten geparsed</span>
                                        {droppedCount > 0 && <span style={{ color: 'var(--muted)', marginLeft: 4 }}>({droppedCount} overgeslagen wegens onvolledige data)</span>}
                                    </div>
                                    <div className="flex gap-2">
                                        <button type="button" onClick={() => toggleAll(true)} className="kf-add" style={{ padding: '3px 9px' }}>Alles aan</button>
                                        <button type="button" onClick={() => toggleAll(false)} className="kf-add" style={{ padding: '3px 9px' }}>Alles uit</button>
                                    </div>
                                </div>
                                <div className="kf-help" style={{ marginTop: 6 }}>Selectie: {keepCount} × · Totale prijs: €{(totalCents / 100).toFixed(2)}</div>
                            </div>

                            <div style={{ maxHeight: '46vh', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg,12px)' }}>
                                <table className="w-full" style={{ fontSize: 12 }}>
                                    <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-elevated,var(--bg))', zIndex: 1 }}>
                                        <tr>
                                            <th className="mr-table-th">✓</th>
                                            <th className="mr-table-th" style={{ textAlign: 'left' }}>Naam</th>
                                            <th className="mr-table-th" style={{ textAlign: 'left' }}>SKU</th>
                                            <th className="mr-table-th" style={{ textAlign: 'right' }}>Prijs</th>
                                            <th className="mr-table-th" style={{ textAlign: 'left' }}>Eenheid</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {products.map((p, i) => (
                                            <tr key={i} style={{ opacity: keepFlags[i] ? 1 : .4 }}>
                                                <td className="mr-table-td"><input type="checkbox" checked={keepFlags[i]} onChange={() => toggleKeep(i)} /></td>
                                                <td className="mr-table-td">{p.name}</td>
                                                <td className="mr-table-td" style={{ color: 'var(--muted)' }}>{p.supplier_sku ?? '—'}</td>
                                                <td className="mr-table-td" style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>€{(p.price_cents / 100).toFixed(2)}</td>
                                                <td className="mr-table-td" style={{ color: 'var(--muted)' }}>
                                                    {p.unit}{p.package_size ? ` (${p.package_size} ${p.package_unit ?? ''})` : ''}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <label className="kf-card flex items-center gap-2.5" style={{ cursor: 'pointer' }}>
                                <input type="checkbox" checked={createComponents} onChange={(e) => setCreateComponents(e.target.checked)} />
                                <span style={{ fontSize: 12, lineHeight: 1.5 }}>
                                    <strong>Maak meteen bought_in components</strong> per product (linked aan supplier-product). Anders zitten ze alleen in de catalogus en moet je later handmatig koppelen.
                                </span>
                            </label>
                        </div>

                        <div className="mr-drawer-footer" style={{ justifyContent: 'flex-end' }}>
                            <button type="button" onClick={() => setStep('input')} className="kf-ghost">Terug</button>
                            <button type="button" onClick={handleSave} disabled={saving || keepCount === 0} className="kf-primary">
                                {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                                {saving ? 'Opslaan…' : `Importeer ${keepCount}`}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </>
    );
}

/* ──────────────────────────────────────────────────────────────────────────
   SnijverliesVeld — "wat houd je over van je inkoop?"

   Sam koopt 1 kg bavette maar houdt er ~700 g bruikbaar van over. Zonder deze
   factor rekent de app 40 g op het bord tegen de inkoopprijs van 40 g, terwijl
   hij er 57 g voor moest kopen. Bewust in mensentaal: geen "yield", geen
   "opbrengstfactor" — hij zegt zelf snijverlies.
   ────────────────────────────────────────────────────────────────────────── */

const SNIJVERLIES_PRESETS: Array<{ label: string; y: number }> = [
    { label: 'Alles (100%)', y: 1 },
    { label: 'Beetje bijsnijden (90%)', y: 0.9 },
    { label: 'Vet & pees eraf (75%)', y: 0.75 },
    { label: 'Flink bijsnijden (65%)', y: 0.65 },
];

function SnijverliesVeld({
    value, onChange, baseCostCents, baseQuantity, baseUnit,
}: {
    value: number;
    onChange: (y: number) => void;
    baseCostCents: number;
    baseQuantity: number;
    baseUnit: string;
}) {
    const y = normalizeYield(value);
    const pctText = String(Math.round(y * 1000) / 10);
    const effectief = effectiveBaseCostCents(baseCostCents, y);
    const laag = y < 0.4;

    return (
        <section className="kf-section">
            <div className="kf-section-head">
                <span className="kf-section-title"><Scissors size={13} /> Snijverlies</span>
            </div>
            <label className="kf-field">
                <span className="kf-label">Wat houd je over van je inkoop?</span>
                <div className="flex flex-wrap gap-1.5" style={{ marginBottom: 8 }}>
                    {SNIJVERLIES_PRESETS.map(p => (
                        <button
                            key={p.label}
                            type="button"
                            onClick={() => onChange(p.y)}
                            className="kf-add"
                            style={Math.abs(y - p.y) < 0.0005
                                ? { borderColor: 'var(--brand)', color: 'var(--brand)' }
                                : undefined}
                        >
                            {p.label}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-2">
                    <input
                        type="number"
                        step="1"
                        min="1"
                        max="100"
                        value={pctText}
                        onChange={(e) => {
                            const pct = parseFloat(e.target.value);
                            if (!Number.isFinite(pct)) return;
                            onChange(Math.min(100, Math.max(1, pct)) / 100);
                        }}
                        className="kf-input"
                        style={{ width: 90 }}
                        aria-label="Percentage dat je overhoudt"
                    />
                    <span style={{ fontSize: 13, color: 'var(--muted)' }}>%</span>
                </div>
                <div className="kf-help" style={{ marginTop: 6 }}>
                    {yieldRestatement(y, baseUnit)}
                </div>
                {laag && (
                    <div style={{ fontSize: 11.5, color: '#f59e0b', marginTop: 4 }}>
                        Minder dan 40% overhouden is fors. Klopt dit? Je kostprijs wordt hierdoor meer dan 2,5x zo hoog.
                    </div>
                )}
            </label>
            <div className="kf-card" style={{ padding: '8px 12px', fontSize: 12 }}>
                <div className="flex items-center justify-between">
                    <span style={{ color: 'var(--muted)' }}>Inkoop</span>
                    <span className="font-mono">{formatPerBase(baseCostCents, baseQuantity, baseUnit)}</span>
                </div>
                {y < 1 && (
                    <div className="flex items-center justify-between" style={{ marginTop: 3 }}>
                        <span style={{ color: 'var(--muted)' }}>In gerechten reken ik met</span>
                        <span className="font-mono" style={{ color: 'var(--brand)', fontWeight: 600 }}>
                            {formatPerBase(effectief, baseQuantity, baseUnit)}
                        </span>
                    </div>
                )}
            </div>
        </section>
    );
}

/* ──────────────────────────────────────────────────────────────────────────
   PakketRekenhulp — de kern van inkoop-helderheid (2026-06-12).
   "Wat betaal je, voor hoeveel?" → eenheidsprijs + voorbeeld-dosering.
   Presentational: parent houdt de pak-state en voert base-velden door.
   Hard rule: dit is code-rekenwerk (lib/unitPrice), nooit AI-rekenwerk.
   ────────────────────────────────────────────────────────────────────────── */

function PakketRekenhulp({
    priceEuros, qty, unit, onApply,
}: {
    priceEuros: string;
    qty: string;
    unit: PackUnit;
    onApply: (price: string, qty: string, unit: PackUnit) => void;
}) {
    const cents = Math.round(parseDec(priceEuros) * 100);
    const q = parseDec(qty);
    const valid = priceEuros.trim() !== '' && Number.isFinite(cents) && cents >= 0 && Number.isFinite(q) && q > 0;
    const base = valid ? packToBase(cents, q, unit) : null;
    const label = base ? unitPriceLabel(base.base_cost_cents, base.base_quantity, base.base_unit) : null;
    const example = base ? exampleUseCost(base) : null;

    return (
        <div className="kf-card kf-card-accent">
            <div className="mb-2.5 flex items-center gap-1.5" style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
                <Calculator size={13} style={{ color: 'var(--brand)' }} />
                Rekenhulp: van groothandel naar eenheidsprijs
            </div>
            <div className="kf-grid-3">
                <label className="kf-field">
                    <span className="kf-label">Wat betaal je? (€)</span>
                    <input type="text" inputMode="decimal" placeholder="62,50" value={priceEuros} onChange={(e) => onApply(e.target.value, qty, unit)} className="kf-input" />
                </label>
                <label className="kf-field">
                    <span className="kf-label">Voor hoeveel?</span>
                    <input type="text" inputMode="decimal" placeholder="5" value={qty} onChange={(e) => onApply(priceEuros, e.target.value, unit)} className="kf-input" />
                </label>
                <label className="kf-field">
                    <span className="kf-label">Eenheid</span>
                    <select value={unit} onChange={(e) => onApply(priceEuros, qty, e.target.value as PackUnit)} className="kf-input">
                        {PACK_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                </label>
            </div>
            {base ? (
                <div className="mt-3" style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                    <div className="font-mono" style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--brand)' }}>
                        = €{(base.base_cost_cents / 100).toFixed(2)} per {base.base_quantity === 1 ? '' : base.base_quantity}{base.base_unit}
                        {label ? <span className="font-sans" style={{ marginLeft: 6, fontWeight: 400, color: 'var(--muted)' }}>({label})</span> : null}
                    </div>
                    {example && (
                        <div style={{ marginTop: 3, fontSize: 11, color: 'var(--muted)' }}>
                            Voorbeeld: {example.qty} {example.unit} in een gerecht kost €{(example.cents / 100).toFixed(2)}
                        </div>
                    )}
                </div>
            ) : (
                <div className="kf-help" style={{ marginTop: 10 }}>
                    Vul in wat de verpakking kost en hoeveel erin zit — de prijs per eenheid rekenen wij uit. Komma of punt mag allebei.
                </div>
            )}
        </div>
    );
}

/* ──────────────────────────────────────────────────────────────────────────
   Kleine herbruikbare editors voor de drawers (geëxtraheerd uit de oude
   inline drawer-markup zodat edit- én create-drawers hetzelfde gedrag delen).
   ────────────────────────────────────────────────────────────────────────── */

function CategoryToggle({ value, onChange }: { value: ComponentCategory; onChange: (v: ComponentCategory) => void }) {
    return (
        <div className="kf-field">
            <span className="kf-label">Categorie</span>
            <div className="kf-seg">
                <button type="button" onClick={() => onChange('food')} className={`kf-seg-btn ${value === 'food' ? 'is-on' : ''}`}>Food</button>
                <button type="button" onClick={() => onChange('non_food')} className={`kf-seg-btn ${value === 'non_food' ? 'is-on' : ''}`}>Non-food</button>
            </div>
            <span className="kf-help">
                {value === 'food'
                    ? 'Menu-bouwsteen — telt mee in gerecht-kostprijzen en statistieken.'
                    : 'Verpakking/materieel — telt niet mee in kostprijs-statistieken.'}
            </span>
        </div>
    );
}

function AllergenToggles({ codes, onToggle }: { codes: Set<string>; onToggle: (code: string) => void }) {
    return (
        <div className="flex flex-wrap gap-1.5">
            {ALLERGEN_CODES.map(code => {
                const on = codes.has(code);
                return (
                    <button
                        key={code}
                        type="button"
                        onClick={() => onToggle(code)}
                        className={`kf-chip ${on ? 'is-on' : ''}`}
                        title={ALLERGEN_LABELS[code]}
                    >
                        {on && <Check size={11} />}
                        {ALLERGEN_LABELS[code] ?? code}
                    </button>
                );
            })}
        </div>
    );
}

function HaccpEditor({ rows, onChange }: { rows: HaccpRow[]; onChange: (rows: HaccpRow[]) => void }) {
    function addRow() {
        onChange([...rows, { type: 'kerntemp', threshold_value: null, threshold_unit: 'celsius', note: null, ai_suggested: false }]);
    }
    function updateRow(idx: number, patch: Partial<HaccpRow>) {
        onChange(rows.map((r, i) => i === idx ? { ...r, ...patch } : r));
    }
    function removeRow(idx: number) {
        onChange(rows.filter((_, i) => i !== idx));
    }
    return (
        <section className="kf-section">
            <div className="kf-section-head">
                <span className="kf-section-title"><ThermometerSun size={13} /> HACCP-punten</span>
                <button type="button" onClick={addRow} className="kf-add"><Plus size={11} /> Toevoegen</button>
            </div>
            {rows.length === 0 ? (
                <div className="kf-empty">
                    <div className="kf-empty-icon"><ThermometerSun size={17} /></div>
                    <p>Nog geen HACCP-punten. Voeg kerntemperaturen of koel-eisen toe voor je voedselveiligheid-log.</p>
                </div>
            ) : (
                <div className="flex flex-col gap-2">
                    {rows.map((h, idx) => (
                        <div key={idx} className="kf-card">
                            <div className="flex items-start gap-2.5">
                                <ThermometerSun size={15} className="mt-1 shrink-0" style={{ color: 'var(--brand)' }} />
                                <div className="flex-1 flex flex-col gap-1.5">
                                    <select value={h.type} onChange={(e) => {
                                        const t = HACCP_TYPES.find(x => x.value === e.target.value);
                                        updateRow(idx, { type: e.target.value, threshold_unit: t?.defaultUnit || h.threshold_unit });
                                    }} className="kf-input">
                                        {HACCP_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                    </select>
                                    <div className="grid grid-cols-2 gap-1.5">
                                        <input type="number" placeholder="waarde" value={h.threshold_value ?? ''} onChange={(e) => updateRow(idx, { threshold_value: e.target.value === '' ? null : Number(e.target.value) })} className="kf-input" />
                                        <input type="text" placeholder="eenheid (celsius/minutes)" value={h.threshold_unit ?? ''} onChange={(e) => updateRow(idx, { threshold_unit: e.target.value || null })} className="kf-input" />
                                    </div>
                                    <input type="text" placeholder="notitie (optioneel)" value={h.note ?? ''} onChange={(e) => updateRow(idx, { note: e.target.value || null })} className="kf-input" />
                                </div>
                                <button type="button" onClick={() => removeRow(idx)} aria-label="Verwijder HACCP-rij" className="kf-trash"><Trash2 size={13} /></button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}

function StepsEditor({ steps, onChange }: { steps: string[]; onChange: (steps: string[]) => void }) {
    return (
        <section className="kf-section">
            <div className="kf-section-head">
                <span className="kf-section-title"><FileText size={13} /> Bereidingsstappen</span>
                <button type="button" onClick={() => onChange([...steps, ''])} className="kf-add"><Plus size={11} /> Stap toevoegen</button>
            </div>
            {steps.length === 0 ? (
                <div className="kf-empty">
                    <div className="kf-empty-icon"><FileText size={17} /></div>
                    <p>Nog geen stappen — voeg ze met de hand toe of laat AI de hele receptuur vullen.</p>
                </div>
            ) : (
                <div className="flex flex-col gap-1.5">
                    {steps.map((s, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                            <span className="kf-step-num">{idx + 1}</span>
                            <input
                                type="text"
                                value={s}
                                onChange={(e) => onChange(steps.map((x, i) => i === idx ? e.target.value : x))}
                                placeholder="bv. Ananas grillen tot karamellisatie"
                                className="kf-input flex-1"
                            />
                            <button type="button" onClick={() => onChange(steps.filter((_, i) => i !== idx))} aria-label={`Verwijder stap ${idx + 1}`} className="kf-trash"><Trash2 size={13} /></button>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}

function IngredientsEditor({
    rows, onChange, onAdoptSum, baseQuantity, baseUnit,
}: {
    rows: IngredientFormRow[];
    onChange: (rows: IngredientFormRow[]) => void;
    /* Krijgt de kostprijs per BASIS-eenheid, al omgerekend. */
    onAdoptSum: (costPerBaseCents: number) => void;
    baseQuantity: number;
    baseUnit: string;
}) {
    const sum = ingredientSumCents(rows);
    /* Gekoppelde regels zonder aantal leveren geen kostprijs en tellen niet mee. */
    const anyNeedsQty = rows.some(r => isRowLinked(r) && !!r.unit_price && linkedRowCostCents(r) == null);

    /* De som geldt voor de héle receptuur. Om 'm als kostprijs te kunnen
       gebruiken moeten we weten hoeveel die receptuur oplevert — anders belandt
       "€32,85 voor 1 kg" als "€32,85 per 100 g" in de kostprijs (factor 10 te
       hoog, en dat werkt door in elk gerecht). */
    const recipeYield = useMemo(
        () => recipeYieldFromRows(rows.map(r => ({ qty: parseDec(r.qty), unit: r.unit }))),
        [rows],
    );
    const perBaseCents = recipeYield
        ? costPerBaseFromRecipe(sum, recipeYield, baseQuantity, baseUnit)
        : null;

    function updateRow(idx: number, patch: Partial<IngredientFormRow>) {
        onChange(rows.map((r, i) => {
            if (i !== idx) return r;
            let next: IngredientFormRow = { ...r, ...patch };
            /* Handmatig de naam wijzigen op een gekoppelde regel = koppeling losmaken —
               anders hoort de opgeslagen naam niet meer bij het leverancier-product. */
            if ('name' in patch && isRowLinked(r) && patch.name !== r.name) {
                next = { ...next, ...UNLINKED_FIELDS };
            }
            /* Gekoppelde regel: kostprijs volgt automatisch uit prijs × aantal. */
            if (isRowLinked(next)) {
                const c = linkedRowCostCents(next);
                if (c != null) next.cost_euros = (c / 100).toFixed(2);
            }
            return next;
        }));
    }

    /* Koos een leverancier-product. Kan uit twee catalogi komen: de prijslijst
       (master_product_id + supplier_price_id) of de gescande bestel-catalogus
       (supplier_product_id, kostprijs per basis-eenheid). Beide worden hier naar
       dezelfde rekenwijze teruggebracht; nooit id's van de twee mengen. */
    function pickHit(idx: number, hit: CatalogSearchHit) {
        const fromScan = hit.source === 'supplier_product';
        const pricing = fromScan
            ? resolvePricingFromSupplierProduct(hit)
            : resolvePricingFromSupplierPrice(hit);

        onChange(rows.map((r, i) => {
            if (i !== idx) return r;

            /* Geen bruikbare rekenwijze (bv. onbekende basis-eenheid): vul alleen
               de naam en laat de kostprijs handmatig — beter dan fout rekenen. */
            if (!pricing) {
                return { ...r, name: hit.naam, ...UNLINKED_FIELDS };
            }

            const { price_basis: basis, unit_price: unitPrice, price_unit: priceUnit } = pricing;
            const unit = basis === 'kg' ? (r.unit === 'g' || r.unit === 'kg' ? r.unit : 'kg') : priceUnit;
            const next: IngredientFormRow = {
                ...r,
                name: hit.naam,
                unit,
                master_product_id: fromScan ? null : hit.master_product_id,
                supplier_price_id: fromScan ? null : hit.supplier_price_id,
                supplier_product_id: fromScan ? (hit.supplier_product_id ?? null) : null,
                leverancier: hit.leverancier,
                unit_price: unitPrice > 0 ? unitPrice : null,
                price_basis: basis,
                price_unit: priceUnit,
            };
            const c = linkedRowCostCents(next);
            if (c != null) next.cost_euros = (c / 100).toFixed(2);
            return next;
        }));
    }

    /* Koppeling losmaken → terug naar vrij-getikte naam + prijs. */
    function unlink(idx: number) {
        onChange(rows.map((r, i) => i === idx ? { ...r, ...UNLINKED_FIELDS } : r));
    }

    return (
        <section className="kf-section">
            <div className="kf-section-head">
                <span className="kf-section-title"><Boxes size={13} /> Ingrediënten</span>
                <button type="button" onClick={() => onChange([...rows, emptyIngredientRow()])} className="kf-add"><Plus size={11} /> Ingrediënt</button>
            </div>
            {rows.length === 0 ? (
                <div className="kf-empty">
                    <div className="kf-empty-icon"><Boxes size={17} /></div>
                    <p>Nog geen ingrediënten. Tik een naam en kies de leverancier uit je prijslijsten — de kostprijs vult zich vanzelf.</p>
                </div>
            ) : (
                <div className="flex flex-col gap-1.5">
                    <div className="grid items-center gap-1.5 px-0.5" style={{ gridTemplateColumns: '1fr 3.5rem 3.5rem 4.5rem 1.75rem', fontSize: 10, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--muted)' }}>
                        <span>Naam / leverancier</span><span>Aantal</span><span>Eenheid</span><span>Kosten €</span><span></span>
                    </div>
                    {rows.map((r, idx) => {
                        const linked = isRowLinked(r);
                        const needsQty = linked && !!r.unit_price && linkedRowCostCents(r) == null;
                        return (
                            <div key={idx} className="flex flex-col gap-1">
                                <div className="grid items-center gap-1.5" style={{ gridTemplateColumns: '1fr 3.5rem 3.5rem 4.5rem 1.75rem' }}>
                                    <SupplierProductAutocomplete
                                        value={r.name}
                                        onChange={(naam) => updateRow(idx, { name: naam })}
                                        onPick={(hit) => pickHit(idx, hit)}
                                        includeSupplierProducts
                                    />
                                    <input type="text" inputMode="decimal" value={r.qty} onChange={(e) => updateRow(idx, { qty: e.target.value })} placeholder="250" className="kf-input" />
                                    {/* Gekoppeld op kg-prijs: alleen g/kg toegestaan (geen 1000×-fout). Andere koppeling: eenheid vast. */}
                                    {linked && r.price_basis === 'kg' ? (
                                        <select value={r.unit === 'g' ? 'g' : 'kg'} onChange={(e) => updateRow(idx, { unit: e.target.value })} className="kf-input" style={{ padding: '7px 4px' }} aria-label="Eenheid">
                                            <option value="kg">kg</option>
                                            <option value="g">g</option>
                                        </select>
                                    ) : linked ? (
                                        <input type="text" value={r.unit} readOnly className="kf-input" title="Eenheid van de leverancier-prijs" style={{ opacity: 0.7, cursor: 'not-allowed' }} />
                                    ) : (
                                        <input type="text" value={r.unit} onChange={(e) => updateRow(idx, { unit: e.target.value })} placeholder="g" className="kf-input" />
                                    )}
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        value={r.cost_euros}
                                        onChange={(e) => updateRow(idx, { cost_euros: e.target.value })}
                                        placeholder={linked ? (needsQty ? 'aantal?' : '—') : '1,20'}
                                        className="kf-input"
                                        readOnly={linked}
                                        title={linked ? 'Kostprijs volgt automatisch uit de leverancier-prijs × aantal' : undefined}
                                        style={linked ? { opacity: 0.7, cursor: 'not-allowed' } : undefined}
                                    />
                                    <button type="button" onClick={() => onChange(rows.filter((_, i) => i !== idx))} aria-label={`Verwijder ${r.name || 'ingrediënt'}`} className="kf-trash"><Trash2 size={13} /></button>
                                </div>
                                {linked && (
                                    <div className="flex items-center gap-1.5" style={{ fontSize: 11, color: 'var(--muted)', paddingLeft: 2, flexWrap: 'wrap' }}>
                                        <ShoppingBag size={11} style={{ color: 'var(--brand)' }} aria-hidden="true" />
                                        <span>
                                            <strong style={{ color: 'var(--text)', fontWeight: 600 }}>{r.leverancier || 'leverancier'}</strong>
                                            {r.unit_price ? <> · {formatEuro(Math.round(r.unit_price * 100))} / {r.price_unit || r.price_basis || 'kg'}</> : null}
                                            {/* Waar de prijs vandaan komt: prijslijst of gescande bestel-catalogus.
                                                Scheelt zoeken als een bedrag onverwacht is. */}
                                            {r.supplier_product_id ? <span style={{ opacity: 0.75 }}> · gescand</span> : null}
                                        </span>
                                        {needsQty && <span style={{ color: '#f59e0b', fontWeight: 600 }}>· vul aantal in</span>}
                                        <button type="button" onClick={() => unlink(idx)} className="kf-add" style={{ marginLeft: 4 }} title="Koppeling losmaken en zelf de prijs invullen">
                                            <X size={10} /> losmaken
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                    {sum > 0 && (
                        <div className="kf-card kf-card-accent" style={{ padding: '8px 12px' }}>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <span style={{ fontSize: 12 }}>
                                    Ingrediënten samen: <strong className="font-mono" style={{ color: 'var(--brand)' }}>{formatEuro(sum)}</strong>
                                    {recipeYield && (
                                        <span style={{ color: 'var(--muted)' }}> voor {formatQty(recipeYield.quantity)} {recipeYield.unit}</span>
                                    )}
                                </span>
                                {perBaseCents != null ? (
                                    <button type="button" onClick={() => onAdoptSum(perBaseCents)} className="kf-add">
                                        Gebruik als kostprijs — {formatEuro(perBaseCents)} / {formatQty(baseQuantity)}{baseUnit}
                                    </button>
                                ) : null}
                            </div>
                            {/* Zonder eenduidige opbrengst rekenen we niets uit: een verkeerde
                                kostprijs werkt door in elk gerecht dat deze bouwsteen gebruikt. */}
                            {perBaseCents == null && (
                                <div style={{ fontSize: 11, color: '#f59e0b', marginTop: 4 }}>
                                    {recipeYield
                                        ? `Deze receptuur levert ${formatQty(recipeYield.quantity)} ${recipeYield.unit} op; dat past niet bij de basis-eenheid "${baseUnit}". Zet de basis-eenheid gelijk, dan reken ik het om.`
                                        : 'Om dit als kostprijs te gebruiken moeten alle ingrediënten in dezelfde soort eenheid staan (allemaal gewicht, of allemaal stuks).'}
                                </div>
                            )}
                            {anyNeedsQty && (
                                <div style={{ fontSize: 11, color: '#f59e0b', marginTop: 4 }}>
                                    Let op: een gekoppeld product heeft nog geen aantal en telt niet mee in dit bedrag.
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </section>
    );
}

/* ──────────────────────────────────────────────────────────────────────────
   InkoopDrawer — "Ingekocht product": begint bij de GROOTHANDEL.

   Sam: "moet eerst een productkoppeling hebben naar groothandel — ik vul
   brioche in en dan gaat hij zoeken naar best vergelijkbare opties."
   Dus: eerst zoeken in zijn eigen prijslijsten (master_products +
   supplier_prices, 4888 actieve prijzen), product aanklikken, en pas dán de
   pak-rekensom: 60 stuks voor €48,60 → €0,81 per stuk.

   Zo staat de leverancier-koppeling meteen vast (master_product_id +
   supplier_price_id), waardoor de prijs later mee kan bewegen.
   ────────────────────────────────────────────────────────────────────────── */

function InkoopDrawer({
    folderId, onClose, onSaved,
}: {
    folderId: string | null;
    onClose: () => void;
    onSaved: () => void;
}) {
    const toast = useToast();
    const [zoek, setZoek] = useState('');
    const [gekozen, setGekozen] = useState<CatalogSearchHit | null>(null);
    const [packQty, setPackQty] = useState('');
    const [packUnit, setPackUnit] = useState<PackUnit>('stuk');
    const [packPrice, setPackPrice] = useState('');
    const [yieldFactor, setYieldFactor] = useState<number>(1);
    const [saving, setSaving] = useState(false);

    function kies(hit: CatalogSearchHit) {
        setGekozen(hit);
        setZoek(hit.naam);
        /* Prijs uit de catalogus overnemen als startpunt — Sam kan 'm bijstellen
           als hij een andere staffel of doos koopt. */
        if (hit.prijs > 0) setPackPrice(String(hit.prijs).replace('.', ','));
        const e = (hit.eenheid || '').toLowerCase();
        if (e.includes('kg') || e === 'kilo') setPackUnit('kg');
        else if (e.includes('liter') || e === 'l') setPackUnit('liter');
        else if (e.includes('ml')) setPackUnit('ml');
        else setPackUnit('stuk');
    }

    const qty = parseDec(packQty);
    const prijs = parseDec(packPrice);
    const base = (Number.isFinite(qty) && qty > 0 && Number.isFinite(prijs) && prijs > 0)
        ? packToBase(Math.round(prijs * 100), qty, packUnit)
        : null;

    async function handleSave() {
        if (!gekozen) { toast('Kies eerst een product uit je prijslijsten', 'error'); return; }
        if (!base) { toast('Vul in hoeveel er in de verpakking zit en wat je betaalt', 'error'); return; }
        setSaving(true);
        try {
            const res = await fetch('/api/components', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: gekozen.naam,
                    description: gekozen.leverancier ? `Ingekocht bij ${gekozen.leverancier}` : null,
                    type: 'bought_in',
                    category: NON_FOOD_RE.test(gekozen.naam) ? 'non_food' : 'food',
                    base_quantity: base.base_quantity,
                    base_unit: base.base_unit,
                    base_cost_cents: base.base_cost_cents,
                    pack_price_cents: Math.round(prijs * 100),
                    pack_quantity: qty,
                    pack_unit: packUnit,
                    yield_factor: yieldFactor,
                    /* De koppeling waar het om begonnen was. */
                    master_product_id: gekozen.master_product_id,
                    supplier_price_id: gekozen.supplier_price_id,
                    folder_id: folderId && /^[0-9a-f-]{36}$/i.test(folderId) ? folderId : null,
                }),
            });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error || 'Opslaan mislukt');
            toast(`"${gekozen.naam}" toegevoegd`, 'success');
            onSaved();
        } catch (e: unknown) {
            toast(e instanceof Error ? e.message : 'Opslaan mislukt', 'error');
        } finally {
            setSaving(false);
        }
    }

    return (
        <>
            <div className="mr-drawer-scrim" onClick={onClose} role="presentation" />
            <div className="mr-drawer kdrawer" role="dialog" aria-modal="true" aria-labelledby="inkoop-drawer-title">
                <div className="kdrawer-head">
                    <div className="flex-1 min-w-0">
                        <span className="kf-eyebrow"><ShoppingBag size={12} /> Ingekocht</span>
                        <h2 id="inkoop-drawer-title" className="kdrawer-title">Ingekocht product toevoegen</h2>
                    </div>
                    <button type="button" onClick={onClose} aria-label="Sluit" className="kf-icon-x"><X size={17} /></button>
                </div>

                <div className="kf-body">
                    {/* Stap 1 — uit de groothandel kiezen. */}
                    <label className="kf-field">
                        <span className="kf-label">Wat koop je? <span style={{ fontWeight: 400, color: 'var(--muted)' }}>· zoekt in je prijslijsten</span></span>
                        <SupplierProductAutocomplete
                            value={zoek}
                            onChange={(v) => { setZoek(v); if (gekozen && v !== gekozen.naam) setGekozen(null); }}
                            onPick={kies}
                            placeholder="bv. brioche"
                        />
                        {gekozen ? (
                            <div className="flex items-center gap-1.5" style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 6 }}>
                                <ShoppingBag size={11} style={{ color: 'var(--brand)' }} aria-hidden="true" />
                                <span>
                                    <strong style={{ color: 'var(--text)', fontWeight: 600 }}>{gekozen.leverancier || 'leverancier'}</strong>
                                    {gekozen.prijs > 0 ? ` · €${gekozen.prijs.toFixed(2)}${gekozen.eenheid ? ' / ' + gekozen.eenheid : ''}` : ''}
                                </span>
                            </div>
                        ) : (
                            <div className="kf-help" style={{ marginTop: 6 }}>
                                Tik een paar letters — je ziet elk product uit je geïmporteerde prijslijsten, met de prijs erbij.
                            </div>
                        )}
                    </label>

                    {/* Stap 2 — hoe wordt het verpakt? */}
                    {gekozen && (
                        <section className="kf-section">
                            <div className="kf-section-head">
                                <span className="kf-section-title"><Calculator size={13} /> Hoe zit de verpakking?</span>
                            </div>
                            <div className="kf-grid-3">
                                <label className="kf-field">
                                    <span className="kf-label">Er zit in</span>
                                    <input type="text" inputMode="decimal" value={packQty}
                                        onChange={(e) => setPackQty(e.target.value)}
                                        placeholder="60" className="kf-input" autoFocus />
                                </label>
                                <label className="kf-field">
                                    <span className="kf-label">Eenheid</span>
                                    <select value={packUnit} onChange={(e) => setPackUnit(e.target.value as PackUnit)} className="kf-input">
                                        {PACK_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                                    </select>
                                </label>
                                <label className="kf-field">
                                    <span className="kf-label">Je betaalt (€)</span>
                                    <input type="text" inputMode="decimal" value={packPrice}
                                        onChange={(e) => setPackPrice(e.target.value)}
                                        placeholder="48,60" className="kf-input" />
                                </label>
                            </div>

                            {/* Het antwoord, meteen — dit is waar het om begonnen was. */}
                            <div className="kf-card kf-card-accent" style={{ padding: '10px 14px', marginTop: 4 }}>
                                {base ? (
                                    <>
                                        <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--brand)' }}>
                                            {unitPriceLabel(base.base_cost_cents, base.base_quantity, base.base_unit) ?? ''}
                                        </div>
                                        <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>
                                            {packQty} {packUnit} voor {formatEuro(Math.round(prijs * 100))} — zo rekent de app het door in je gerechten.
                                        </div>
                                    </>
                                ) : (
                                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                                        Vul in hoeveel er in de verpakking zit en wat je ervoor betaalt.
                                    </div>
                                )}
                            </div>
                        </section>
                    )}

                    {gekozen && base && (
                        <SnijverliesVeld
                            value={yieldFactor}
                            onChange={setYieldFactor}
                            baseCostCents={base.base_cost_cents}
                            baseQuantity={base.base_quantity}
                            baseUnit={base.base_unit}
                        />
                    )}
                </div>

                <div className="kdrawer-foot">
                    <button type="button" onClick={onClose} className="btn btn-ghost btn-sm">Annuleer</button>
                    <button type="button" onClick={handleSave} disabled={saving || !gekozen || !base} className="btn btn-brand btn-sm">
                        {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                        {saving ? 'Opslaan…' : 'Voeg toe aan bibliotheek'}
                    </button>
                </div>
            </div>
        </>
    );
}

/* ──────────────────────────────────────────────────────────────────────────
   ReceptuurDrawer — "Zelf bereid": nieuwe bouwsteen met volledige receptuur.
   AI vult op verzoek alles in (component-generate); mens bevestigt en slaat op.
   ────────────────────────────────────────────────────────────────────────── */

function ReceptuurDrawer({
    folderId, onClose, onSaved,
}: {
    folderId: string | null;
    onClose: () => void;
    onSaved: () => void;
}) {
    const toast = useToast();
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [baseQty, setBaseQty] = useState('100');
    const [baseUnit, setBaseUnit] = useState('g');
    const [costEuros, setCostEuros] = useState('');
    const [flavorTags, setFlavorTags] = useState('');
    const [ingredients, setIngredients] = useState<IngredientFormRow[]>([emptyIngredientRow()]);
    const [steps, setSteps] = useState<string[]>([]);
    const [allergenCodes, setAllergenCodes] = useState<Set<string>>(new Set());
    /* Codes uit het AI-voorstel — blijven bij opslaan geflagd als ai_suggested. */
    const [aiAllergens, setAiAllergens] = useState<Set<string>>(new Set());
    const [haccpRows, setHaccpRows] = useState<HaccpRow[]>([]);
    const [aiBusy, setAiBusy] = useState(false);
    const [aiUsed, setAiUsed] = useState(false);
    const [saving, setSaving] = useState(false);

    function toggleAllergen(code: string) {
        setAllergenCodes(prev => {
            const next = new Set(prev);
            if (next.has(code)) next.delete(code); else next.add(code);
            return next;
        });
    }

    /* AI suggereert de hele receptuur; alles blijft aanpasbaar en niets wordt
       opgeslagen tot de chef op Opslaan klikt (hard rule: human confirms). */
    async function handleAiFill() {
        const prompt = [name.trim(), description.trim()].filter(Boolean).join(' — ');
        if (!prompt) { toast('Geef eerst een naam of korte omschrijving, dan vult AI de rest', 'error'); return; }
        setAiBusy(true);
        try {
            const res = await fetch('/api/ai/component-generate', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt, type: 'prepared' }),
            });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error || 'AI-voorstel mislukt');
            const p = body.proposal as AiProposal;
            if (p.name) setName(p.name);
            if (p.description) setDescription(p.description);
            if (Number.isFinite(p.base_quantity) && p.base_quantity > 0) setBaseQty(String(p.base_quantity));
            if (UNITS.includes(p.base_unit)) setBaseUnit(p.base_unit);
            if (Number.isFinite(p.base_cost_cents) && p.base_cost_cents >= 0) setCostEuros((p.base_cost_cents / 100).toFixed(2));
            setFlavorTags((p.flavor_tags ?? []).join(', '));
            setIngredients((p.ingredients ?? []).map(ing => ({
                name: typeof ing.name === 'string' ? ing.name : '',
                qty: Number.isFinite(ing.qty) ? String(ing.qty) : '',
                unit: typeof ing.unit === 'string' ? ing.unit : 'g',
                cost_euros: typeof ing.cost_cents === 'number' && ing.cost_cents > 0 ? (ing.cost_cents / 100).toFixed(2) : '',
            })));
            setSteps((p.preparation_steps ?? []).filter((s): s is string => typeof s === 'string'));
            const aiCodes = (p.allergens ?? []).map(a => a.allergen_code);
            setAllergenCodes(new Set(aiCodes));
            setAiAllergens(new Set(aiCodes));
            setHaccpRows((p.haccp_points ?? []).map(h => ({
                type: h.type,
                threshold_value: h.threshold_value ?? null,
                threshold_unit: h.threshold_unit ?? null,
                note: h.note ?? null,
                ai_suggested: true,
            })));
            setAiUsed(true);
            toast('AI-voorstel ingevuld — check en pas aan waar nodig', 'success');
        } catch (e: any) {
            toast(e.message || 'AI-voorstel mislukt', 'error');
        } finally {
            setAiBusy(false);
        }
    }

    async function handleSave() {
        if (!name.trim()) { toast('Naam verplicht', 'error'); return; }
        const qty = parseDec(baseQty);
        if (!Number.isFinite(qty) || qty <= 0) { toast('Basis-hoeveelheid > 0', 'error'); return; }
        let cost = parseDec(costEuros);
        /* Voorkom de €0-cascade: is de kostprijs leeg terwijl er ingrediënt-kosten
           staan, neem dan de som automatisch over (zoals 'Gebruik als kostprijs'). */
        const sumC = ingredientSumCents(ingredients);
        if (sumC > 0 && (!Number.isFinite(cost) || Math.round(cost * 100) === 0)) {
            cost = sumC / 100;
            setCostEuros(cost.toFixed(2));
            toast(`Kostprijs overgenomen van je ingrediënten (€${cost.toFixed(2)})`, 'success');
        }
        if (!Number.isFinite(cost) || cost < 0) { toast('Kostprijs ongeldig — tip: gebruik de som van je ingrediënten', 'error'); return; }

        setSaving(true);
        try {
            const res = await fetch('/api/components', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: name.trim(),
                    description: description.trim() || null,
                    type: 'prepared',
                    category: 'food',
                    base_quantity: qty,
                    base_unit: baseUnit,
                    base_cost_cents: Math.round(cost * 100),
                    ingredients: rowsToIngredientsJson(ingredients),
                    preparation_steps: steps.map(s => s.trim()).filter(s => s.length > 0),
                    flavor_tags: flavorTags.split(',').map(t => t.trim()).filter(Boolean),
                    folder_id: folderId && /^[0-9a-f-]{36}$/i.test(folderId) ? folderId : null,
                    ai_suggested: aiUsed,
                    /* AI-gesuggereerde allergenen blijven geflagd — hard rule: AI mag
                       allergenen niet stilzwijgend als mens-bevestigd wegschrijven. */
                    allergens: Array.from(allergenCodes).map(code => ({ allergen_code: code, ai_suggested: aiAllergens.has(code) })),
                    haccp_points: haccpRows.filter(r => r.type),
                }),
            });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error || 'Opslaan mislukt');
            toast(`"${name.trim()}" toegevoegd aan de bibliotheek`, 'success');
            if (body.warnings) toast(`Wel met waarschuwingen: ${body.warnings.join(', ')}`, 'error');
            onSaved();
        } catch (e: any) {
            toast(e.message || 'Opslaan mislukt', 'error');
        } finally {
            setSaving(false);
        }
    }

    return (
        <>
            <div className="mr-drawer-scrim" onClick={onClose} role="presentation" />
            <div className="mr-drawer kdrawer" role="dialog" aria-modal="true" aria-labelledby="receptuur-drawer-title">
                <div className="kdrawer-head">
                    <div className="flex-1 min-w-0">
                        <span className="kf-eyebrow"><ChefHat size={12} /> Zelf bereid</span>
                        <h2 id="receptuur-drawer-title" className="kdrawer-title">Nieuwe bouwsteen met receptuur</h2>
                    </div>
                    <button type="button" onClick={onClose} aria-label="Sluit" className="kf-icon-x"><X size={17} /></button>
                </div>

                <div className="kf-body">
                    <section className="kf-section">
                        <label className="kf-field">
                            <span className="kf-label">Naam</span>
                            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="bv. Aardbeien bavaroise" className="kf-input" />
                        </label>
                        <label className="kf-field">
                            <span className="kf-label">Beschrijving (optioneel)</span>
                            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="1 zin smaak-pitch" className="kf-input" />
                        </label>
                        <div className="flex items-center gap-2.5 flex-wrap">
                            <button
                                type="button"
                                onClick={handleAiFill}
                                disabled={aiBusy || name.trim().length < 3}
                                title={name.trim().length < 3 ? 'Typ eerst een naam (min. 3 tekens)' : undefined}
                                className="kf-ai"
                            >
                                {aiBusy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                                {aiBusy ? 'AI denkt na…' : 'Vul receptuur met AI'}
                            </button>
                            {aiUsed && (
                                <span className="kf-ai-hint"><Sparkles size={11} /> AI-voorstel — controleer en pas aan</span>
                            )}
                        </div>
                    </section>

                    <section className="kf-section">
                        <div className="kf-grid-3">
                            <label className="kf-field">
                                <span className="kf-label">Basis-hoeveelheid</span>
                                <input type="text" inputMode="decimal" value={baseQty} onChange={(e) => setBaseQty(e.target.value)} className="kf-input" />
                            </label>
                            <label className="kf-field">
                                <span className="kf-label">Eenheid</span>
                                <select value={baseUnit} onChange={(e) => setBaseUnit(e.target.value)} className="kf-input">
                                    {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                                </select>
                            </label>
                            <label className="kf-field">
                                <span className="kf-label">Kostprijs (€)</span>
                                <input type="text" inputMode="decimal" value={costEuros} onChange={(e) => setCostEuros(e.target.value)} placeholder="1,43" className="kf-input" />
                            </label>
                        </div>
                        <p className="kf-help">De kostprijs geldt voor de basis-hoeveelheid (bv. €1,43 per 100 g). Gerechten rekenen hier automatisch mee.</p>
                        <label className="kf-field">
                            <span className="kf-label">Smaakprofiel-tags (komma-gescheiden)</span>
                            <input type="text" value={flavorTags} onChange={(e) => setFlavorTags(e.target.value)} placeholder="zoet, rokerig, …" className="kf-input" />
                        </label>
                    </section>

                    <IngredientsEditor
                        rows={ingredients}
                        onChange={setIngredients}
                        onAdoptSum={(perBaseCents) => setCostEuros((perBaseCents / 100).toFixed(2))}
                        baseQuantity={parseDec(baseQty)}
                        baseUnit={baseUnit}
                    />

                    <StepsEditor steps={steps} onChange={setSteps} />

                    <section className="kf-section">
                        <span className="kf-section-title">Allergenen <span style={{ color: 'var(--muted)', fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>· klik om aan/uit te zetten</span></span>
                        <AllergenToggles codes={allergenCodes} onToggle={toggleAllergen} />
                    </section>

                    <HaccpEditor rows={haccpRows} onChange={setHaccpRows} />
                </div>

                <div className="mr-drawer-footer" style={{ justifyContent: 'flex-end' }}>
                    <button type="button" onClick={onClose} className="kf-ghost">Annuleer</button>
                    <button type="button" onClick={handleSave} disabled={saving} className="kf-primary">
                        {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                        {saving ? 'Opslaan…' : 'Voeg toe aan bibliotheek'}
                    </button>
                </div>
            </div>
        </>
    );
}

/* ──────────────────────────────────────────────────────────────────────────
   ScanDrawer — "Scan kant-en-klaar": één screenshot of foto → AI leest naam,
   inhoud en prijs → rekenhulp toont de eenheidsprijs → mens bevestigt.
   Dé route voor "ik heb een screenshot van een nieuw briochebrood".
   ────────────────────────────────────────────────────────────────────────── */

const SCAN_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

function ScanDrawer({
    folderId, onClose, onImported,
}: {
    folderId: string | null;
    onClose: () => void;
    onImported: () => void;
}) {
    const toast = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [step, setStep] = useState<'upload' | 'form'>('upload');
    const [fileDataUrl, setFileDataUrl] = useState<string | null>(null);
    const [fileName, setFileName] = useState<string | null>(null);
    const [parsing, setParsing] = useState(false);
    const [products, setProducts] = useState<ParsedProduct[]>([]);
    const [chosenIdx, setChosenIdx] = useState(0);
    const [detectedSupplier, setDetectedSupplier] = useState<string | null>(null);
    // Form-state voor het gekozen product
    const [name, setName] = useState('');
    const [category, setCategory] = useState<ComponentCategory>('food');
    const [packPrice, setPackPrice] = useState('');
    const [packQty, setPackQty] = useState('');
    const [packUnit, setPackUnit] = useState<PackUnit>('stuk');
    const [saving, setSaving] = useState(false);
    /* Extra invoer-routes (2026-06-12): sleep, ⌘V-plak, mobiele camera, tekst. */
    const [dragOver, setDragOver] = useState(false);
    const [textMode, setTextMode] = useState(false);
    const [pasted, setPasted] = useState('');
    const cameraInputRef = useRef<HTMLInputElement>(null);

    function acceptFile(file: File) {
        if (!SCAN_ALLOWED_TYPES.includes(file.type)) {
            toast('Alleen afbeeldingen (JPG, PNG, WebP) of PDF', 'error');
            return;
        }
        if (file.size > 6 * 1024 * 1024) {
            toast('Bestand te groot (max 6 MB) — maak een kleinere screenshot', 'error');
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            setFileDataUrl(typeof reader.result === 'string' ? reader.result : null);
            setFileName(file.name);
            setTextMode(false);
        };
        reader.onerror = () => toast('Bestand lezen mislukt', 'error');
        reader.readAsDataURL(file);
    }

    function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (file) acceptFile(file);
        e.target.value = '';
    }

    /* ⌘V: geplakte screenshot direct klaarzetten zolang de upload-stap open is. */
    useEffect(() => {
        function onPaste(e: ClipboardEvent) {
            if (step !== 'upload' || parsing) return;
            const file = Array.from(e.clipboardData?.items ?? []).find(it => it.type.startsWith('image/'))?.getAsFile();
            if (file) {
                e.preventDefault();
                acceptFile(file);
            }
        }
        document.addEventListener('paste', onPaste);
        return () => document.removeEventListener('paste', onPaste);
        /* eslint-disable-next-line react-hooks/exhaustive-deps */
    }, [step, parsing]);

    function choose(idx: number, list: ParsedProduct[] = products) {
        const p = list[idx];
        if (!p) return;
        setChosenIdx(idx);
        setName(p.name);
        setCategory(NON_FOOD_RE.test(p.name) ? 'non_food' : 'food');
        const qty = p.package_size && p.package_size > 0 ? p.package_size : 1;
        const unit = (p.package_unit ?? p.unit) as PackUnit;
        setPackPrice((p.price_cents / 100).toFixed(2));
        setPackQty(String(qty));
        setPackUnit(PACK_UNITS.includes(unit) ? unit : 'stuk');
    }

    async function runParse(payload: { file_data_url?: string; text?: string }) {
        setParsing(true);
        try {
            const res = await fetch('/api/ai/supplier-catalog-parse', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error || 'AI kon de afbeelding niet lezen');
            const parsed = (body.products ?? []) as ParsedProduct[];
            if (parsed.length === 0) {
                toast('AI vond geen product — zorg dat naam én prijs zichtbaar zijn', 'error');
                return;
            }
            setProducts(parsed);
            setDetectedSupplier(body.supplier_name ?? null);
            choose(0, parsed);
            setStep('form');
        } catch (e: any) {
            toast(e.message || 'Scan mislukt', 'error');
        } finally {
            setParsing(false);
        }
    }

    function handleParse() {
        if (!fileDataUrl) { toast('Kies eerst een screenshot of foto', 'error'); return; }
        runParse({ file_data_url: fileDataUrl });
    }

    async function handleSave() {
        if (!name.trim()) { toast('Naam verplicht', 'error'); return; }
        const cents = Math.round(parseDec(packPrice) * 100);
        const qty = parseDec(packQty);
        if (!Number.isFinite(cents) || cents < 0 || !Number.isFinite(qty) || qty <= 0) {
            toast('Vul prijs en inhoud in — dan rekenen wij de eenheidsprijs uit', 'error');
            return;
        }
        const base = packToBase(cents, qty, packUnit);
        if (!base) { toast('Eenheid niet herkend', 'error'); return; }

        setSaving(true);
        try {
            const res = await fetch('/api/components', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: name.trim(),
                    description: detectedSupplier ? `Gescand — ${detectedSupplier}` : null,
                    type: 'bought_in',
                    category,
                    ...base,
                    pack_price_cents: cents,
                    pack_quantity: qty,
                    pack_unit: packUnit,
                    folder_id: folderId && /^[0-9a-f-]{36}$/i.test(folderId) ? folderId : null,
                    /* Mens heeft het AI-voorstel hier al gecheckt en bevestigd. */
                    ai_suggested: false,
                }),
            });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error || 'Opslaan mislukt');
            const label = unitPriceLabel(base.base_cost_cents, base.base_quantity, base.base_unit);
            toast(`"${name.trim()}" toegevoegd${label ? ` — ${label}` : ''}`, 'success');
            onImported();
        } catch (e: any) {
            toast(e.message || 'Opslaan mislukt', 'error');
        } finally {
            setSaving(false);
        }
    }

    return (
        <>
            <div className="mr-drawer-scrim" onClick={onClose} role="presentation" />
            <div className="mr-drawer kdrawer" role="dialog" aria-modal="true" aria-labelledby="scan-drawer-title">
                <div className="kdrawer-head">
                    <div className="flex-1 min-w-0">
                        <span className="kf-eyebrow"><Camera size={12} /> Scan kant-en-klaar</span>
                        <h2 id="scan-drawer-title" className="kdrawer-title">
                            {step === 'upload' ? 'Product toevoegen via screenshot' : 'Check en bevestig'}
                        </h2>
                    </div>
                    <button type="button" onClick={onClose} aria-label="Sluit" className="kf-icon-x"><X size={17} /></button>
                </div>

                <div className="kf-body">
                    {step === 'upload' && !textMode && (
                        <>
                            <div className="kf-banner">
                                <Camera size={14} />
                                <span>Voor <strong>één los product</strong>: een screenshot uit de webshop van je slager of Hanos/Sligro, of een foto van een etiket of schap-kaartje. AI leest naam, inhoud en prijs — jij checkt en bevestigt. Hele prijslijst? Gebruik dan <strong>Importeer leverancier (bulk)</strong>.</span>
                            </div>

                            <label
                                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                                onDragLeave={() => setDragOver(false)}
                                onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) acceptFile(f); }}
                                className={`kf-drop ${dragOver ? 'is-over' : ''}`}
                            >
                                <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={handleFile} className="sr-only" />
                                <div className="kf-empty-icon" style={{ margin: '0 auto 10px', width: 42, height: 42 }}><ImagePlus size={21} /></div>
                                <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>Kies, sleep of plak (⌘V) een screenshot of foto</div>
                                <div className="kf-help" style={{ marginTop: 4 }}>JPEG, PNG, WebP of PDF — max 6 MB</div>
                            </label>

                            <div className="flex items-center justify-between gap-2">
                                <button type="button" onClick={() => cameraInputRef.current?.click()} className="kf-ghost"><Camera size={13} /> Maak een foto met je camera</button>
                                <button type="button" onClick={() => setTextMode(true)} className="kf-add">Of plak tekst</button>
                            </div>
                            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleFile} className="sr-only" aria-label="Maak een foto met je camera" />

                            {fileDataUrl && fileName && (
                                <div className="kf-card">
                                    <div className="flex items-center gap-2">
                                        <FileText size={13} style={{ color: 'var(--brand)' }} />
                                        <span className="flex-1 truncate" style={{ fontSize: 12, fontWeight: 500 }}>{fileName}</span>
                                        <button type="button" onClick={() => { setFileDataUrl(null); setFileName(null); if (fileInputRef.current) fileInputRef.current.value = ''; }} aria-label="Verwijder bestand" className="kf-trash"><X size={13} /></button>
                                    </div>
                                    {fileDataUrl.startsWith('data:image/') && (
                                        <img src={fileDataUrl} alt="Preview van de scan" className="mt-2 rounded" style={{ maxHeight: 220, border: '1px solid var(--border)' }} />
                                    )}
                                </div>
                            )}
                        </>
                    )}

                    {step === 'upload' && textMode && (
                        <label className="kf-field">
                            <span className="kf-label">Plak de product-tekst (bv. van een etiket of webshop)</span>
                            <textarea value={pasted} onChange={(e) => setPasted(e.target.value)} rows={8} maxLength={30000} placeholder={'bv.\nBrioche bun klein, 12 stuks, €5.04'} className="kf-input" />
                        </label>
                    )}

                    {step === 'form' && (
                        <>
                            {(detectedSupplier || products.length > 1) && (
                                <div className="kf-card">
                                    {detectedSupplier && <div style={{ fontSize: 12 }}>Gedetecteerd: <strong>{detectedSupplier}</strong></div>}
                                    {products.length > 1 && (
                                        <div className="mt-1.5">
                                            <div className="kf-help" style={{ marginBottom: 6 }}>AI vond {products.length} producten — kies welke je toevoegt (één per keer):</div>
                                            <div className="flex flex-wrap gap-1.5">
                                                {products.map((p, i) => (
                                                    <button key={i} type="button" onClick={() => choose(i)} className={`kf-chip ${i === chosenIdx ? 'is-on' : ''}`}>
                                                        {p.name.slice(0, 32)}{p.name.length > 32 ? '…' : ''}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            <label className="kf-field">
                                <span className="kf-label">Naam</span>
                                <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="kf-input" />
                            </label>

                            <PakketRekenhulp
                                priceEuros={packPrice}
                                qty={packQty}
                                unit={packUnit}
                                onApply={(price, qty, unit) => { setPackPrice(price); setPackQty(qty); setPackUnit(unit); }}
                            />

                            <CategoryToggle value={category} onChange={setCategory} />
                        </>
                    )}
                </div>

                <div className="mr-drawer-footer" style={{ justifyContent: 'flex-end' }}>
                    {step === 'upload' && !textMode && (
                        <>
                            <button type="button" onClick={onClose} className="kf-ghost">Annuleer</button>
                            <button type="button" onClick={() => handleParse()} disabled={parsing || !fileDataUrl} className="kf-primary">
                                {parsing ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                                {parsing ? 'AI leest je afbeelding… (±10 sec)' : 'Lees met AI'}
                            </button>
                        </>
                    )}
                    {step === 'upload' && textMode && (
                        <>
                            <button type="button" onClick={() => setTextMode(false)} className="kf-ghost">Terug naar scannen</button>
                            <button type="button" onClick={() => { if (!pasted.trim()) { toast('Plak eerst tekst', 'error'); return; } runParse({ text: pasted }); }} disabled={parsing} className="kf-primary">
                                {parsing ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                                {parsing ? 'AI leest…' : 'Lees met AI'}
                            </button>
                        </>
                    )}
                    {step === 'form' && (
                        <>
                            <button type="button" onClick={() => setStep('upload')} className="kf-ghost">Terug</button>
                            <button type="button" onClick={handleSave} disabled={saving} className="kf-primary">
                                {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                                {saving ? 'Opslaan…' : 'Voeg toe aan bibliotheek'}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </>
    );
}
