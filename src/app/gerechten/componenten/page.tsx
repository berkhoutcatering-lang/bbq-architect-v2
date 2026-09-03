/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Boxes, Plus, X, Trash2, Sparkles, RefreshCw,
    Package, ShoppingBag, Loader2, Search, Check, ThermometerSun,
    Upload, FileText, ChefHat, Camera, Calculator, ImagePlus,
    Beef, Fish, Leaf, Milk, Droplet, Wheat, Candy, Scissors, LayoutGrid, List,
    Archive, AlertTriangle, Tag, ArrowUpDown,
} from 'lucide-react';
import { getComponentVisual } from '@/components/menu/component-visuals';
import { ComponentCard, ComponentListView, type ComponentViewRow, type ComponentSortKey } from '@/components/menu/component-views';
import ComponentKpiStrip from './_components/ComponentKpiStrip';
import '@/styles/menu-hub.css';

/* Icoon-resolver voor de soort-tegel op de componentkaart. */
const SOORT_ICONS: Record<string, typeof Beef> = {
    Beef, Fish, Leaf, Milk, Droplet, Wheat, Candy, Package, Boxes,
};
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';
import '@/components/redesign/redesign.css';
import { useComponentFolders, type ComponentFolderRow } from './_lib/useComponentFolders';
/* GP-5 (2026-05-25): FolderBar vervangen door FolderTree (Drive-style sidebar).
   Import gehouden voor evt. fallback maar momenteel niet gerendered. */
import { refreshRecipePricesAction } from '@/app/menu-templates/actions';
import FolderModal from './_components/FolderModal';
/* GP-4 (2026-05-25): live foodcost-impact preview bij component-prijswijziging. */
import { FoodcostImpactModal, type FoodcostImpactPayload } from '@/components/menu/FoodcostImpactModal';
/* GP-5 (2026-05-25): Drive-style folder tree + drag-drop. */
import { DndContext, type DragEndEvent, DragOverlay, useDraggable, useSensor, useSensors, PointerSensor } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { FolderTree, parseDropId } from '@/components/menu/FolderTree';
/* Inkoop-helderheid (2026-06-12): terugreken-canon grootverpakking → eenheidsprijs. */
import { packToBase, unitPriceLabel, unitPriceCents, costForBasisCents, exampleUseCost, PACK_UNITS, type PackUnit, type BaseFields, normalizeYield, effectiveBaseCostCents, yieldRestatement } from '@/lib/unitPrice';
import SupplierProductAutocomplete, { type CatalogSearchHit } from '@/components/SupplierProductAutocomplete';
import { formatEur } from '@/lib/format';

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

/* De 14 wettelijke allergenen, met EXACT de codes uit de allergens-tabel.
 *
 * Deze lijst liep uit de pas met de database, en dat is het gevaarlijkste soort
 * fout dat deze app kan maken:
 *   'V'  betekende hier "vis", maar in de database is V = VEGETARISCH.
 *        Vink je vis aan, dan legde de app "vegetarisch" vast.
 *   'Sd' betekende hier "sesam"; server-side werd dat SD = SELDERIJ.
 *   'Sl' (selderij), 'Lp' (lupine), 'Sf' (sulfiet) en 'Sc' (schaaldieren)
 *        bestaan helemaal niet in de allergens-tabel.
 * Vis is F, sesam is SE, selderij SD, lupine LU, sulfiet SU, schaaldieren C.
 * Wijzig deze codes nooit zonder de allergens-tabel ernaast te leggen: hier
 * hangt de allergenen-informatie op de menukaart van een gast aan. */
const ALLERGEN_CODES = ['G', 'L', 'N', 'P', 'E', 'S', 'F', 'C', 'W', 'M', 'SE', 'SU', 'SD', 'LU'];

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
    G: 'gluten', L: 'lactose', N: 'noten', P: 'pinda', E: 'ei', S: 'soja',
    F: 'vis', C: 'schaaldieren', W: 'weekdieren', M: 'mosterd',
    SE: 'sesam', SU: 'sulfiet', SD: 'selderij', LU: 'lupine',
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

/* "€ 0,75 / 100 g" — en bij een basis van 1 gewoon "/ stuk", want "/ 1stuk"
   leest als een typefout. Spatie tussen getal en eenheid, zoals overal. */
function formatPerBase(cents: number, qty: number, unit: string): string {
    const basis = qty === 1 ? unit : `${formatQty(qty)} ${unit}`;
    return `${formatEuro(cents)} / ${basis}`;
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

/**
 * Escape sluit de drawer. Universele reflex, en zonder dit moet je met de muis
 * naar het kruisje rechtsboven — juist als je net met het toetsenbord aan het
 * invullen was. Luistert in de capture-fase niet: een open zoek-popup mag Escape
 * eerst zelf afhandelen.
 */
function useEscapeToClose(onClose: () => void, heeftWerk?: () => boolean) {
    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if (e.key !== 'Escape' || e.defaultPrevented) return;
            /* Staat er ingevuld werk, dan eerst vragen. Twintig minuten
               ingrediënten, stappen en HACCP-punten intikken en dan per ongeluk
               Escape (of een klik naast de drawer) gooide alles weg zonder één
               vraag — inclusief een AI-lezing waar een verzoek voor betaald is. */
            if (heeftWerk?.()) {
                if (!window.confirm('Je hebt hier dingen ingevuld die nog niet opgeslagen zijn.\n\nSluiten en je invoer weggooien?')) return;
            }
            onClose();
        }
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose, heeftWerk]);
}

/* Zelfde vraag, maar dan voor de klik naast de drawer (het grijze vlak). */
function maakScrimSluiter(onClose: () => void, heeftWerk?: () => boolean) {
    return () => {
        if (heeftWerk?.()) {
            if (!window.confirm('Je hebt hier dingen ingevuld die nog niet opgeslagen zijn.\n\nSluiten en je invoer weggooien?')) return;
        }
        onClose();
    };
}

/* De ingrediënt-som omrekenen naar een kostprijs PER BASIS-HOEVEELHEID.
 *
 * ingredientSumCents telt de regels op en dat is de prijs van de HÉLE receptuur.
 * Het kostprijs-veld betekent iets anders: "zoveel per basis-hoeveelheid", bv.
 * € 1,43 per 100 g. Die twee door elkaar halen is een factor-10-fout: 1000 g
 * chimichurri voor € 24,00 werd € 24,00 per 100 g in plaats van € 2,40 — mét een
 * groene "kostprijs overgenomen"-melding erbij, dus zonder enig signaal dat er
 * iets fout ging. Dat rolt door in elk gerecht, elke menu-marge en elke offerte.
 *
 * Kan de omrekening niet (ingrediënten in eenheden die niet bij elkaar op te
 * tellen zijn, bv. 3 stuks + 200 g), dan geven we null terug. De aanroeper MOET
 * dan stoppen en het vragen — nooit alsnog de rauwe som wegschrijven.
 */
function kostprijsPerBasisUitIngredienten(
    rows: IngredientFormRow[],
    baseQty: number,
    baseUnit: string,
): { cents: number; sumCents: number } | null {
    const sumCents = ingredientSumCents(rows);
    if (sumCents <= 0) return null;
    const opbrengst = recipeYieldFromRows(rows.map(r => ({ qty: parseDec(r.qty), unit: r.unit })));
    if (!opbrengst) return null;
    const perBase = costPerBaseFromRecipe(sumCents, opbrengst, baseQty, baseUnit);
    if (perBase === null || !Number.isFinite(perBase)) return null;
    return { cents: perBase, sumCents };
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

/* Onthoudt een keuze in localStorage. Map, filter, sortering en weergave waren
   vergeten zodra je even naar een gerecht klikte: je stond weer op "Alle
   componenten", grid, naam A–Z, en moest alles opnieuw instellen. Per tabblad
   dezelfde sleutel, dus het voelt als "waar ik gebleven was".
   Faalt localStorage (privémodus, volle opslag), dan gedraagt de pagina zich
   gewoon als voorheen — een voorkeur is nooit een reden om iets te breken. */
function useBewaardeKeuze<T>(sleutel: string, start: T): [T, (v: T) => void] {
    const [waarde, setWaarde] = useState<T>(start);
    /* Pas ná mount lezen: op de server bestaat localStorage niet, en direct in
       useState lezen geeft een hydration-mismatch. */
    useEffect(() => {
        try {
            const rauw = window.localStorage.getItem(sleutel);
            if (rauw !== null) setWaarde(JSON.parse(rauw) as T);
        } catch { /* geen voorkeur beschikbaar — start-waarde blijft staan */ }
    }, [sleutel]);
    const zet = useCallback((v: T) => {
        setWaarde(v);
        try { window.localStorage.setItem(sleutel, JSON.stringify(v)); }
        catch { /* niet kunnen onthouden mag nooit de actie zelf blokkeren */ }
    }, [sleutel]);
    return [waarde, zet];
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
    const [selectedComponentId, setSelectedComponentId] = useState<number | null>(null);
    const [showImport, setShowImport] = useState(false);
    /* Zelf-bereid/Inkoop zijn food-only; non_food en unused zijn eigen chips.
       "Alle" toont álles, zodat Alle = Zelf-bereid + Inkoop + Non-food. */
    const [typeFilter, setTypeFilter] = useBewaardeKeuze<'all' | ComponentType | 'non_food' | 'unused' | 'geen_prijs' | 'in_gebruik'>('componenten.filter', 'all');
    const [search, setSearch] = useState('');
    /* Grid of lijst — zelfde keuze als op de gerechten-pagina. */
    const [viewMode, setViewMode] = useBewaardeKeuze<'grid' | 'list'>('componenten.weergave', 'grid');
    /* De volgorde woont hier, niet in de lijst-weergave. Eerder zat sorteren
       alléén op de kolomkoppen van de lijst, dus in de grid — de weergave die
       standaard aan staat — kreeg je gewoon de database-volgorde. Nu bedienen
       het menu hierboven én de kolomkoppen dezelfde keuze. */
    const [sortKey, setSortKey] = useBewaardeKeuze<ComponentSortKey>('componenten.sortering', 'naam_az');

    /* Twee first-class toevoegen-routes (2026-06-12):
       Zelf bereid → ReceptuurDrawer, Scan kant-en-klaar → ScanDrawer. */
    const [showReceptuur, setShowReceptuur] = useState(false);
    const [showScan, setShowScan] = useState(false);
    /* Het pad dat ontbrak: een ingekocht product handmatig toevoegen, zonder AI. */
    const [showInkoop, setShowInkoop] = useState(false);
    /* Zoekterm die de Ingekocht-drawer meekrijgt als je 'm opent vanuit een lege
       zoekresultaat-lijst ("salsa staat niet in je bouwstenen — zoek bij je
       leveranciers"). Leeg = gewoon een blanco drawer. */
    const [inkoopStartZoek, setInkoopStartZoek] = useState('');

    /* S2-deel-3: folder-state. currentFolderId=null toont alle componenten;
       als ingesteld → filter op components.folder_id.
       GP-5 (2026-05-25): currentFolderId kan ook '__root__' zijn = "zonder folder". */
    const { rows: folders, available: foldersAvailable, refetch: refetchFolders } = useComponentFolders();
    const [currentFolderId, setCurrentFolderId] = useBewaardeKeuze<string | null>('componenten.map', null);
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

    /* `stil` = herladen zonder de lijst weg te halen.
       Na elke opslag draaide de hele pagina terug naar een spinner; de lijst kromp
       daardoor tot niets en de browser gooide je scrollpositie weg. Wie bouwsteen
       nummer 40 aanpaste, stond daarna weer bij nummer 1. Bij een hérlaad hebben we
       de vorige lijst nog, dus die laten we gewoon staan tot de nieuwe binnen is. */
    async function loadComponents(stil = false) {
        if (!stil) setLoading(true);
        try {
            const res = await fetch('/api/components', { credentials: 'include' });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error || 'Laden mislukt');
            setComponents(body.components ?? []);
            setUsage(body.usage ?? {});
        } catch (e: any) {
            toast(e.message || 'Laden mislukt', 'error');
        } finally {
            if (!stil) setLoading(false);
        }
    }

    useEffect(() => { loadComponents(); }, []);

    const [ververst, setVerverst] = useState(false);

    /* Haalt de actuele leveranciersprijzen op voor álle gekoppelde bouwstenen
       (zelf-bereid uit de prijslijst én ingekocht uit beide catalogi) en laat de
       database de gerechten opnieuw doorrekenen. Zonder argument = org-breed. */
    async function ververesPrijzen() {
        setVerverst(true);
        try {
            const res = await refreshRecipePricesAction();
            if ('error' in res) { toast(res.error || 'Verversen mislukt', 'error'); return; }
            const recepten = res.data.receptenBijgewerkt ?? 0;
            const inkoop = res.data.boughtIn?.bijgewerkt ?? 0;
            const totaal = recepten + inkoop;
            toast(
                totaal === 0
                    ? 'Alle prijzen waren al actueel — er is niets veranderd.'
                    : `${totaal} ${totaal === 1 ? 'bouwsteen' : 'bouwstenen'} bijgewerkt naar de actuele leveranciersprijs. Je gerechten zijn opnieuw doorgerekend.`,
                'success',
            );
            await loadComponents(true);
        } catch (e: unknown) {
            toast(e instanceof Error ? e.message : 'Verversen mislukt', 'error');
        } finally {
            setVerverst(false);
        }
    }

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
            if (currentFolderId === '__root__') {
                /* "Zonder folder" toonde nul componenten: '__root__' werd
                   letterlijk vergeleken met folder_id, en die is null voor een
                   component zonder map. */
                if (c.folder_id !== null) return false;
            } else if (currentFolderId !== null && c.folder_id !== currentFolderId) return false;
            /* "Alle" toont écht alles (food + non-food) zodat de tellingen
               kloppen: Alle = Zelf-bereid + Inkoop + Non-food. Eerder liet
               "Alle" non-food weg, waardoor de chip 23 zei en de mappen 29 —
               verwarrend. Zelf-bereid/Inkoop blijven food-only. */
            if (typeFilter === 'non_food') {
                if (c.category !== 'non_food') return false;
            } else if (typeFilter === 'unused') {
                if ((usage[c.id] ?? 0) > 0) return false;
            } else if (typeFilter === 'geen_prijs') {
                if ((c.base_cost_cents ?? 0) > 0) return false;
            } else if (typeFilter === 'in_gebruik') {
                if ((usage[c.id] ?? 0) <= 0) return false;
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

    /* Sorteren gebeurt ná het filteren, over álle weergaven heen.
       Op prijs sorteren we op de GENORMALISEERDE eenheidsprijs (€/kg, €/liter,
       €/stuk) en niet op base_cost_cents — anders is €62,50 voor een doos van
       5 kg "duurder" dan €3,29 voor 100 g bavette, en dat is precies andersom.
       Componenten waarvan we de eenheid niet kunnen normaliseren zakken in
       beide richtingen naar onderen: onbekend hoort nooit bovenaan. */
    const sorted = useMemo(() => {
        const opNaam = (a: ComponentRow, b: ComponentRow) => a.name.localeCompare(b.name, 'nl');
        const prijs = (c: ComponentRow) => unitPriceCents(c.base_cost_cents, c.base_quantity, c.base_unit);
        const gebruik = (c: ComponentRow) => usage[c.id] ?? 0;

        return [...filtered].sort((a, b) => {
            switch (sortKey) {
                case 'naam_za':
                    return -opNaam(a, b);
                case 'soort_az': {
                    const d = getComponentVisual(a.name, a.category).label
                        .localeCompare(getComponentVisual(b.name, b.category).label, 'nl');
                    return d !== 0 ? d : opNaam(a, b);
                }
                case 'gebruik_veel': {
                    const d = gebruik(b) - gebruik(a);
                    return d !== 0 ? d : opNaam(a, b);
                }
                case 'gebruik_weinig': {
                    const d = gebruik(a) - gebruik(b);
                    return d !== 0 ? d : opNaam(a, b);
                }
                case 'prijs_hoog':
                case 'prijs_laag': {
                    const pa = prijs(a);
                    const pb = prijs(b);
                    if (pa === null && pb === null) return opNaam(a, b);
                    if (pa === null) return 1;
                    if (pb === null) return -1;
                    const d = sortKey === 'prijs_hoog' ? pb - pa : pa - pb;
                    return d !== 0 ? d : opNaam(a, b);
                }
                case 'nieuwste': {
                    const d = String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''));
                    return d !== 0 ? d : opNaam(a, b);
                }
                case 'naam_az':
                default:
                    return opNaam(a, b);
            }
        });
    }, [filtered, sortKey, usage]);

    /* Counts per folder voor de FolderBar chips. */
    /* Een map telt ook wat er in haar SUBMAPPEN zit.
       Eerder telde alleen wat er rechtstreeks in zat: "Vlees 2" terwijl er via
       "Rund" en "Varken" dertig bouwstenen onder hingen. In combinatie met
       dichtgeklapte submappen leek het dan alsof je bouwstenen kwijt was. */
    const folderCounts = useMemo(() => {
        const direct: Record<string, number> = {};
        for (const c of components) {
            if (c.folder_id) direct[c.folder_id] = (direct[c.folder_id] ?? 0) + 1;
        }
        const kinderen = new Map<string, string[]>();
        for (const f of folders) {
            const ouder = f.parent_id;
            if (!ouder) continue;
            const lijst = kinderen.get(ouder) ?? [];
            lijst.push(f.id);
            kinderen.set(ouder, lijst);
        }
        /* Diepte-eerst met bezoek-set: een (per ongeluk) cyclische map-boom mag
           de pagina niet laten vastlopen. */
        const totaal: Record<string, number> = {};
        const bezig = new Set<string>();
        function tel(id: string): number {
            if (totaal[id] !== undefined) return totaal[id];
            if (bezig.has(id)) return direct[id] ?? 0;
            bezig.add(id);
            let som = direct[id] ?? 0;
            for (const kind of kinderen.get(id) ?? []) som += tel(kind);
            bezig.delete(id);
            totaal[id] = som;
            return som;
        }
        for (const f of folders) tel(f.id);
        return totaal;
    }, [components, folders]);
    const rootCount = useMemo(() => components.filter(c => c.folder_id === null).length, [components]);

    /* De cijfers moeten gaan over wat er OP HET SCHERM staat. Stond hier eerder
       `components` (alles), dan bleef de strook "31 bouwstenen · 6 zonder prijs"
       zeggen terwijl je in de map "Sauzen" met 4 stuks keek — en klikken op
       "Zonder prijs 6" leverde een leeg scherm op, want in díe map zat er geen.
       Dus: dezelfde map-tak als in `filtered`, zonder de soort/zoek-filters (die
       zijn juist wat de tegels en chips zélf aanzetten). */
    const inMap = useMemo(() => components.filter(c => {
        if (currentFolderId === '__root__') return c.folder_id === null;
        if (currentFolderId !== null) return c.folder_id === currentFolderId;
        return true;
    }), [components, currentFolderId]);

    /* Statistieken rekenen alleen over food — non-food (folie, kratten) zou
       het gemiddelde kostprijs-beeld vervuilen. Defensief: alles ≠ non_food = food. */
    const foodComponents = inMap.filter(c => c.category !== 'non_food');
    const nonFoodCount = inMap.length - foodComponents.length;
    const preparedCount = foodComponents.filter(c => c.type === 'prepared').length;
    const boughtCount = foodComponents.filter(c => c.type === 'bought_in').length;
    const totalCount = foodComponents.length;
    /* Alles inclusief non-food — dit is het getal dat óók de mappen tellen. */
    const allCount = inMap.length;
    /* Een gemiddelde over base_cost_cents mengt €/100g met €/stuk en €/100ml —
       onvergelijkbare eenheden, dus een betekenisloos getal. Vervangen door een
       actie-stat: componenten ZONDER prijs maken elk gerecht waarin ze zitten
       stilzwijgend te goedkoop, en dat is direct op te lossen werk. */
    const zonderPrijsCount = inMap.filter(c => (c.base_cost_cents ?? 0) <= 0).length;
    /* Hoeveel bouwstenen worden nog nergens gebruikt — bruikbaarder signaal dan
       een AI-percentage: dit is opruimwerk dat geld kan schelen. */
    const unusedCount = inMap.filter(c => (usage[c.id] ?? 0) === 0).length;

    /* De telling naast de titel. Toont "12 van 30" zodra er iets aan staat,
       zodat een korte lijst een zichtbare reden heeft en je niet denkt dat er
       bouwstenen kwijt zijn. */
    const filterActief = typeFilter !== 'all' || search.trim().length > 0 || currentFolderId !== null;
    const mapSuffix = currentFolderId === '__root__'
        ? ' · zonder map'
        : currentFolderId !== null
            ? (() => {
                const naam = folders.find(f => f.id === currentFolderId)?.name;
                return naam ? ` · map ${naam}` : '';
            })()
            : '';
    const telling = (filterActief
        ? `${sorted.length} van ${allCount} bouwstenen`
        : `${allCount} ${allCount === 1 ? 'bouwsteen' : 'bouwstenen'}`)
        + mapSuffix;

    /* De cijfer-strook filtert op STAAT; de chips eronder op SOORT. Staat er een
       staat-filter aan, dan is dat in de chips-rij onzichtbaar — vandaar deze pil. */
    const staatFilterLabel =
        typeFilter === 'unused' ? 'Ongebruikt'
        : typeFilter === 'geen_prijs' ? 'Zonder prijs'
        : typeFilter === 'in_gebruik' ? 'In gebruik'
        : null;

    /* id → naam, zodat een kaart kan tonen in welke map hij ligt. Zonder deze
       koppeling bleef de kolom "Map" leeg voor elke ingedeelde bouwsteen: een kop
       die informatie belooft die er niet is. Bij een omgeving zonder mappen-
       migratie geven we niets mee, dan verdwijnt de kolom vanzelf. */
    const folderNamen = useMemo(
        () => (foldersAvailable ? Object.fromEntries(folders.map(f => [f.id, f.name])) : undefined),
        [folders, foldersAvailable],
    );

    /* Staat er iets in de weg dat treffers kan verbergen — een map of een
       soort/staat-filter? De zoekterm zelf telt hier niet mee: die IS de vraag. */
    const beperkingAan = currentFolderId !== null || typeFilter !== 'all';
    const beperkingTekst = [
        currentFolderId === '__root__'
            ? 'bouwstenen zonder map'
            : currentFolderId !== null
                ? `de map "${folders.find(f => f.id === currentFolderId)?.name ?? 'deze map'}"`
                : null,
        staatFilterLabel ? `het filter "${staatFilterLabel}"` : null,
        typeFilter === 'prepared' ? 'het filter "Zelf-bereid"'
            : typeFilter === 'bought_in' ? 'het filter "Inkoop"'
                : typeFilter === 'non_food' ? 'het filter "Non-food"' : null,
    ].filter(Boolean).join(' en ') || 'de huidige selectie';

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
        if (sorted.length === 0) {
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
                        {/* Alleen "je hebt 'm niet" zeggen als er ook echt niets in de weg
                            staat. Zoek je in de map "Sauzen" naar een chimichurri die in
                            "Marinades" ligt, dan is de stellige melding onwaar — en de knop
                            eronder nodigt uit om 'm nóg een keer aan te maken. */}
                        {components.length === 0
                            ? "Begin met je eerste bouwsteen. Zelf bereid met volledige receptuur (aardbeien bavaroise) of scan een kant-en-klaar product met je camera. Pas hier één inkoopprijs aan en elk gerecht dat 'm gebruikt rekent direct mee."
                            : beperkingAan
                                ? `Geen bouwsteen gevonden${search.trim() ? ` op "${search.trim()}"` : ''} binnen ${beperkingTekst}. Misschien staat hij ergens anders — wis de filters om overal te kijken.`
                                : search.trim().length > 0
                                    ? `Je hebt nog geen bouwsteen die "${search.trim()}" heet. Deze zoekbalk kijkt alleen in je eigen bouwstenen — je leverancier-catalogi doorzoek je hieronder.`
                                    : 'Geen component op deze filter of zoekterm.'}
                    </p>
                    {/* Een lege lijst mag geen muur zijn. Wie hier op "salsa" zoekt en niets
                        vindt, concludeert dat het product niet bestaat — terwijl het gewoon
                        in de Bidfood-catalogus staat en één klik verderop toe te voegen is. */}
                    {components.length > 0 && (
                        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                            {search.trim().length >= 2 && (
                                <button
                                    type="button"
                                    onClick={() => { setInkoopStartZoek(search.trim()); setShowInkoop(true); }}
                                    className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--brand)] px-3 py-1.5 text-[12px] font-semibold text-black transition hover:opacity-90"
                                >
                                    <ShoppingBag size={12} /> Zoek &ldquo;{search.trim()}&rdquo; bij je leveranciers
                                </button>
                            )}
                            {filterActief && (
                                <button
                                    type="button"
                                    onClick={() => { setSearch(''); setTypeFilter('all'); setCurrentFolderId(null); }}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-[12px] font-medium transition hover:bg-[var(--brand)]/10"
                                    style={{ color: 'var(--text)' }}
                                >
                                    <X size={12} /> Wis filters en zoekterm
                                </button>
                            )}
                        </div>
                    )}
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
        /* Grid in de gerechten-taal (mr-grid-*): beeldvlak van ~46% met de
           soort-gradient, badge, prijs en signaal. De sleep-naar-map-wrapper
           blijft eromheen staan, anders verlies je die functie. */
        if (viewMode === 'grid') {
            return (
                <div className="mr-grid-wrap" style={{ gap: 16 }}>
                    {sorted.map((c, idx) => (
                        <motion.div
                            key={c.id}
                            layout
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.3, delay: Math.min(idx, 8) * 0.035, ease: [0.22, 1, 0.36, 1] }}
                        >
                            <DraggableComponentCard componentId={c.id} disabled={!foldersAvailable}>
                                <ComponentCard
                                    component={c as unknown as ComponentViewRow}
                                    gebruikt={usage[c.id] ?? 0}
                                    onClick={() => setSelectedComponentId(c.id)}
                                    compact={false}
                                    folderNamen={folderNamen}
                                    onFolderSelect={setCurrentFolderId}
                                />
                            </DraggableComponentCard>
                        </motion.div>
                    ))}
                </div>
            );
        }
        return (
            <ComponentListView
                componenten={sorted as unknown as ComponentViewRow[]}
                usage={usage}
                onSelect={(c) => setSelectedComponentId(c.id)}
                sortKey={sortKey}
                onSortKeyChange={setSortKey}
                folderNamen={folderNamen}
                onFolderSelect={setCurrentFolderId}
            />
        );
    }

    return (
        <div className="redesign-root">
            <div className="main" style={{ padding: '8px 0 40px' }}>
                {/* ── Kop ──────────────────────────────────────────────────────
                    Overgenomen van /gerechten (_client.tsx r.800-856), want die
                    pagina is de maatstaf: mr-page-header met titel + telling
                    links, bediening rechts, en de toevoeg-knop op een eigen
                    mr-action-bar eronder.
                    Wat eruit ging: de eyebrow-pil "BOUWSTENEN" (het woord
                    "Componenten" stond binnen 100 px al drie keer op het scherm)
                    en de uitleg-alinea (staat nu in de lege staat, waar je hem
                    nodig hebt). Ook weg: het balkje "€62,50 / doos 5 kg → …" —
                    dat toonde een verzonnen doos die bij geen enkele bouwsteen
                    van Sam hoort, terwijl PakketRekenhulp diezelfde som al maakt
                    met zijn eigen cijfers, in de drawer waar je hem invult. */}
                <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                    className="mr-page-header"
                    style={{ padding: '14px 0 12px', borderBottom: '1px solid var(--border)' }}
                >
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
                        <h1 className="chassis-titel">Componenten</h1>
                        <span style={{ fontSize: 13, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                            {telling}
                        </span>
                    </div>

                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                        {/* Zoeken — bewust het BESTAANDE veld, verplaatst en niet
                            vervangen: het id 'component-search' is waar ⌘K aan hangt. */}
                        <div className="relative" style={{ minWidth: 220, maxWidth: 320, flex: 1 }}>
                            <Search
                                size={14}
                                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"
                            />
                            {/* type="text", niet "search": bij type="search" tekent de browser
                                zijn eigen kruisje ér nog eens naast het onze, en dan staan er
                                twee wis-knopjes in hetzelfde veld. */}
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Zoek component…"
                                id="component-search"
                                className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] py-2 pl-9 pr-14 text-[13px] outline-none transition focus:border-[var(--brand)]/50"
                                style={{ color: 'var(--text)' }}
                            />
                            <div className="absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
                                {search.length > 0 ? (
                                    <button
                                        type="button"
                                        onClick={() => setSearch('')}
                                        aria-label="Wis zoekopdracht"
                                        className="rounded p-1 text-[var(--muted)] transition hover:bg-[var(--bg)] hover:text-[var(--text)]"
                                    >
                                        <X size={11} />
                                    </button>
                                ) : (
                                    <span className="rounded border border-[var(--border)] px-1.5 py-0.5 text-[10px] text-[var(--muted)]">
                                        ⌘ K
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Sorteren — gold eerder alléén in de lijst, via de
                            kolomkoppen. In de grid (de standaard) was er niets.
                            Native select: werkt met toetsenbord en op telefoon,
                            zonder 60 regels eigen popover. */}
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <ArrowUpDown size={14} color="var(--muted)" />
                            <span className="sr-only">Sorteer componenten</span>
                            <select
                                value={sortKey}
                                onChange={(e) => setSortKey(e.target.value as ComponentSortKey)}
                                style={{
                                    background: 'var(--card)',
                                    border: '1px solid var(--border)',
                                    borderRadius: 10,
                                    height: 34,
                                    padding: '0 8px',
                                    fontSize: 12.5,
                                    color: 'var(--text)',
                                    cursor: 'pointer',
                                }}
                            >
                                <option value="naam_az">Naam (A–Z)</option>
                                <option value="naam_za">Naam (Z–A)</option>
                                <option value="gebruik_veel">Meest gebruikt</option>
                                <option value="gebruik_weinig">Nog nergens gebruikt bovenaan</option>
                                <option value="prijs_hoog">Duurste eerst (per kilo, liter of stuk)</option>
                                <option value="prijs_laag">Goedkoopste eerst (per kilo, liter of stuk)</option>
                                <option value="nieuwste">Laatst toegevoegd</option>
                            </select>
                        </label>

                        {/* Grid/lijst — zelfde keuze als op de gerechten-pagina. */}
                        <div className="flex shrink-0 items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--card)] p-1">
                            {([['grid', 'Grid', LayoutGrid], ['list', 'Lijst', List]] as const).map(([mode, label, Icon]) => (
                                <button
                                    key={mode}
                                    type="button"
                                    onClick={() => setViewMode(mode)}
                                    title={`Toon als ${label}`}
                                    aria-pressed={viewMode === mode}
                                    className="rounded-lg px-2.5 py-1.5 transition"
                                    style={viewMode === mode
                                        ? { background: 'var(--brand)', color: '#0a0a0c' }
                                        : { color: 'var(--muted)' }}
                                >
                                    <Icon size={14} />
                                </button>
                            ))}
                        </div>
                    </div>
                </motion.div>

                {/* Toevoegen staat op een eigen regel, net als "+ Nieuw gerecht"
                    op de gerechten-pagina. */}
                <div className="mr-action-bar">
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <AddComponentMenu
                            onInkoop={() => setShowInkoop(true)}
                            onZelfBereid={() => setShowReceptuur(true)}
                            onScan={() => setShowScan(true)}
                            onImport={() => setShowImport(true)}
                        />
                        {/* De bewerk-lade belooft "de kostprijs beweegt mee bij een
                            prijswijziging", maar dat gebeurt alleen als iemand het
                            aftrapt — en die knop zat verstopt in de marge-lade van een
                            menukaart. Een belofte hoort een knop te hebben op de plek
                            waar hij gedaan wordt. */}
                        <button
                            type="button"
                            onClick={ververesPrijzen}
                            disabled={ververst}
                            className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold transition hover:opacity-90 disabled:opacity-60"
                            style={{ background: 'var(--panel)', color: 'var(--text)', border: '1px solid var(--border)' }}
                            title="Haalt de actuele leveranciersprijzen op en rekent je gerechten opnieuw door"
                        >
                            {ververst ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                            {ververst ? 'Prijzen ophalen…' : 'Ververs prijzen'}
                        </button>
                    </div>
                </div>

                {/* ── Cijfers ──────────────────────────────────────────────────
                    Eén aaneengesloten strook in plaats van vier losse doosjes,
                    en elke cel is een filter. Groen betekent hier "een probleem
                    staat op nul" — daarom kleurt "in gebruik" nooit groen: 7 van
                    de 30 is een feit, geen prestatie, en er hangt geen actie aan. */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.06, ease: [0.22, 1, 0.36, 1] }}
                >
                    {/* Tijdens het laden geen cijfers tonen: met nul componenten in beeld
                        zei deze strook groen "0 ongebruikt — alles wordt gebruikt" en
                        "0 zonder prijs — elke bouwsteen heeft een prijs". Dat is een
                        geruststelling die nog nergens op gebaseerd is. Streepjes, en
                        pas kleur zodra de cijfers echt geteld zijn. */}
                    <ComponentKpiStrip
                        stats={[
                            {
                                key: 'all',
                                label: 'Bouwstenen',
                                value: loading ? '—' : String(allCount),
                                sub: loading ? 'aan het tellen…' : nonFoodCount > 0 ? `waarvan ${nonFoodCount} non-food` : 'alles bij elkaar',
                                Icon: Boxes,
                                tone: 'default',
                                onClick: () => setTypeFilter('all'),
                                active: typeFilter === 'all',
                            },
                            {
                                key: 'in_gebruik',
                                label: 'In gebruik',
                                value: loading ? '—' : String(allCount - unusedCount),
                                sub: loading ? 'aan het tellen…' : 'zit in minstens één gerecht',
                                Icon: ChefHat,
                                tone: 'default',
                                onClick: () => setTypeFilter('in_gebruik'),
                                active: typeFilter === 'in_gebruik',
                            },
                            {
                                key: 'unused',
                                label: 'Ongebruikt',
                                value: loading ? '—' : String(unusedCount),
                                sub: loading ? 'aan het tellen…' : unusedCount > 0
                                    ? 'nog nergens gebruikt — opruimen of inzetten'
                                    : 'alles wordt gebruikt',
                                Icon: Archive,
                                tone: loading ? 'default' : unusedCount === 0 ? 'green' : 'default',
                                onClick: () => setTypeFilter('unused'),
                                active: typeFilter === 'unused',
                            },
                            {
                                key: 'geen_prijs',
                                label: 'Zonder prijs',
                                value: loading ? '—' : String(zonderPrijsCount),
                                sub: loading ? 'aan het tellen…' : zonderPrijsCount > 0
                                    ? `Vul aan voor ${zonderPrijsCount} ${zonderPrijsCount === 1 ? 'bouwsteen' : 'bouwstenen'} →`
                                    : 'elke bouwsteen heeft een prijs',
                                Icon: !loading && zonderPrijsCount > 0 ? AlertTriangle : Tag,
                                tone: loading ? 'default' : zonderPrijsCount > 0 ? 'warn' : 'green',
                                onClick: () => setTypeFilter('geen_prijs'),
                                active: typeFilter === 'geen_prijs',
                            },
                        ]}
                    />
                </motion.div>

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

                {/* ── Filters ──────────────────────────────────────────────────
                    Dit is de SOORT-as: wat voor ding is het. De staat-as (waar
                    moet ik aan werken) zit in de cijfer-strook hierboven.
                    "Ongebruikt" stond hier én daar — die is hier weg, want twee
                    knoppen voor hetzelfde filter is verwarrend. Staat er een
                    staat-filter aan, dan verschijnt rechts een pil die laat zien
                    wát er aanstaat en hoe je hem uitzet. */}
                <div className="mb-4 flex flex-wrap items-center gap-2">
                    <div className="flex flex-wrap items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--card)] p-1">
                        {([
                            { key: 'all', label: 'Alle', icon: null, count: allCount },
                            { key: 'prepared', label: 'Zelf-bereid', icon: <Package size={12} />, count: preparedCount },
                            { key: 'bought_in', label: 'Inkoop', icon: <ShoppingBag size={12} />, count: boughtCount },
                            { key: 'non_food', label: 'Non-food', icon: <Boxes size={12} />, count: nonFoodCount },
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

                    {staatFilterLabel && (
                        <button
                            type="button"
                            onClick={() => setTypeFilter('all')}
                            className="inline-flex items-center gap-1.5"
                            style={{
                                borderRadius: 999,
                                border: '1px solid var(--border)',
                                background: 'var(--card)',
                                padding: '5px 10px',
                                fontSize: 12,
                                color: 'var(--muted-light)',
                            }}
                        >
                            {staatFilterLabel}
                            <X size={11} />
                        </button>
                    )}
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
                    onSaved={() => { setSelectedComponentId(null); loadComponents(true); }}
                    onDeleted={() => { setSelectedComponentId(null); loadComponents(true); }}
                />
            )}

            {showImport && (
                <SupplierImportDrawer
                    onClose={() => setShowImport(false)}
                    onImported={() => { setShowImport(false); loadComponents(true); }}
                />
            )}

            {showInkoop && (
                <InkoopDrawer
                    folderId={currentFolderId}
                    /* Kom je hier vanuit een lege zoekresultaat-lijst, dan staat je
                       zoekterm meteen in het veld — anders moet je 'm overtikken. */
                    initialZoek={inkoopStartZoek}
                    onClose={() => { setShowInkoop(false); setInkoopStartZoek(''); }}
                    onSaved={() => { setShowInkoop(false); setInkoopStartZoek(''); loadComponents(true); }}
                />
            )}

            {showReceptuur && (
                <ReceptuurDrawer
                    folderId={currentFolderId}
                    onClose={() => setShowReceptuur(false)}
                    onSaved={() => { setShowReceptuur(false); loadComponents(true); }}
                />
            )}

            {showScan && (
                <ScanDrawer
                    folderId={currentFolderId}
                    onClose={() => setShowScan(false)}
                    onImported={() => { setShowScan(false); loadComponents(true); }}
                />
            )}

            </div>

            {/* parentId bewust null: "Nieuwe map" maakt een HOOFDMAP.
                Hier stond currentFolderId, en dat deed twee dingen fout tegelijk.
                Stond je in de map "Vlees", dan werd je nieuwe map stilzwijgend een
                submap dáárvan — onzichtbaar achter een dichtgeklapt pijltje, dus je
                maakte 'm nog een keer en kreeg "bestaat al". En stond je op "Zonder
                folder", dan ging de tekst '__root__' als parent mee; dat is geen
                geldig id, dus je kreeg een kale "Validatie-fout" zonder uitleg.
                De knop kent geen bovenliggende map (onCreate: () => void), dus er
                viel hier ook niets zinnigs te kiezen. */}
            <FolderModal
                open={folderModalOpen}
                editing={folderEditing}
                parentId={null}
                onClose={() => { setFolderModalOpen(false); setFolderEditing(null); }}
                onSaved={() => { refetchFolders(); }}
            />
        </div>
    );
}

/* ──────────────────────────────────────────────────────────────────────────
   Kleine bouwstenen voor de kop: cijfer-tegel + één toevoeg-menu.
   ────────────────────────────────────────────────────────────────────────── */

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
                        /* left-0, niet right-0: deze knop staat linksboven op de pagina,
                           dus een menu dat naar links uitklapt valt 56 px buiten beeld
                           en is onleesbaar. Uitklappen naar rechts houdt 'm in beeld. */
                        className="absolute left-0 z-50 mt-2 w-[310px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-[var(--border)] p-1.5 shadow-[0_18px_44px_rgba(0,0,0,.42)]"
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
    componentId, onClose, onSaved, onDeleted,
}: {
    componentId: number;
    onClose: () => void;
    onSaved: () => void;
    onDeleted: () => void;
}) {
    const toast = useToast();
    useEscapeToClose(onClose);
    const [deleting, setDeleting] = useState(false);

    /* Verwijderen. De database houdt het tegen zolang de bouwsteen in een gerecht
       zit (FK RESTRICT) en de API vertelt in gewone taal wélke gerechten dat zijn —
       dus we hoeven hier niets te raden en er kan niets stilzwijgend sneuvelen. */
    async function handleDelete() {
        const naam = comp?.name || 'deze bouwsteen';
        if (!window.confirm(
            `"${naam}" verwijderen?\n\n` +
            'Dit kan niet ongedaan worden gemaakt. Zit de bouwsteen nog in een gerecht, ' +
            'dan houdt de app het tegen en hoor je in welk gerecht.',
        )) return;
        setDeleting(true);
        try {
            const res = await fetch(`/api/components/${componentId}`, { method: 'DELETE', credentials: 'include' });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(body.error || 'Verwijderen mislukt');
            toast(`"${naam}" verwijderd`, 'success');
            onDeleted();
        } catch (e: unknown) {
            toast(e instanceof Error ? e.message : 'Verwijderen mislukt', 'error');
        } finally {
            setDeleting(false);
        }
    }
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
    /* De genormaliseerde leverancierprijs achter de koppeling. Bewaren we als
       BRON en niet als conclusie, zodat de waarschuwing hieronder meebeweegt als
       je de eenheid ter plekke wijzigt. */
    const [linkBron, setLinkBron] = useState<{ cents: number; quantity: number; unit: string } | null>(null);

    /* De gekoppelde leverancierprijs als één bron: "zoveel centen voor zoveel van
       deze eenheid". Beide catalogi leveren dat, alleen anders verpakt — Catalog A
       (prijslijst) als €/kg of €/stuk, Catalog B (supplier_products) als een al
       genormaliseerd drietal. Zo hoeft de aanroeper het verschil niet te kennen. */
    function leverancierBron(lp: {
        source: string;
        prijs_per_kg?: number | null; prijs_per_stuk?: number | null;
        base_cost_cents?: number | null; base_quantity?: number | null; base_unit?: string | null;
    }): { cents: number; quantity: number; unit: string } | null {
        if (lp.source === 'supplier_product') {
            if (lp.base_cost_cents != null && lp.base_quantity != null && lp.base_unit) {
                return { cents: lp.base_cost_cents, quantity: lp.base_quantity, unit: lp.base_unit };
            }
            return null;
        }
        if (lp.prijs_per_kg && lp.prijs_per_kg > 0) {
            return { cents: Math.round(lp.prijs_per_kg * 100), quantity: 1, unit: 'kg' };
        }
        if (lp.prijs_per_stuk && lp.prijs_per_stuk > 0) {
            return { cents: Math.round(lp.prijs_per_stuk * 100), quantity: 1, unit: 'stuk' };
        }
        return null;
    }

    /* Beweegt de gekoppelde prijs mee met de basis die NU in het formulier staat?
       Zo niet, dan zit hij in een andere eenheid-familie en mogen we dat niet
       wegpoetsen achter een groene "beweegt mee"-tekst. */
    const prijsBeweegtNietMee = (linkBron && parseDec(baseQty) > 0 && costForBasisCents({
        srcCostCents: linkBron.cents, srcQuantity: linkBron.quantity, srcUnit: linkBron.unit,
        baseQuantity: parseDec(baseQty), baseUnit,
    }) === null)
        ? { basisEenheid: baseUnit, leverancierEenheid: linkBron.unit }
        : null;

    /* Kostprijs afleiden uit een genormaliseerde leverancier-prijs — €/kg → per
       100 g (zoals de Rekenhulp), €/stuk → per stuk. Puur code-rekenwerk.
       Alleen voor het MOMENT VAN KOPPELEN: dan is er nog geen basis en is 100 g
       een prima startpunt. Bij het heropenen van een bestaande component mag dit
       niet draaien — daar blijft de basis van de gebruiker staan. */
    function applyLinkedPrice(prijsPerKg: number | null, prijsPerStuk: number | null): boolean {
        /* Rekent via dezelfde canon als het heropenen (costForBasisCents), zodat
           één prijslijstregel niet twee bedragen kan opleveren. Eerder deed dit
           pad `(prijsPerKg / 10).toFixed(2)`, en dat rondt op de binaire
           representatie naar beneden: €3,05/kg werd €0,30 bij koppelen en €0,31
           bij heropenen. Postgres rondt half-up (migratie 20260601100000 doet
           `round(prijs_per_kg * 100)`), dus €0,31 is het juiste getal. */
        const bron = leverancierBron({ source: 'price_list', prijs_per_kg: prijsPerKg, prijs_per_stuk: prijsPerStuk });
        if (!bron) return false; // geen genormaliseerde prijs → kostprijs blijft handmatig

        const startBasis = bron.unit === 'kg'
            ? { qty: 100, unit: 'g' }   // gewicht: per 100 g, zoals de Rekenhulp
            : { qty: 1, unit: bron.unit };
        const cents = costForBasisCents({
            srcCostCents: bron.cents, srcQuantity: bron.quantity, srcUnit: bron.unit,
            baseQuantity: startBasis.qty, baseUnit: startBasis.unit,
        });
        if (cents === null) return false;

        setBaseQty(String(startBasis.qty));
        setBaseUnit(startBasis.unit);
        setCostEuros((cents / 100).toFixed(2));
        return true;
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
                setLinkBron({ cents: hit.base_cost_cents, quantity: hit.base_quantity, unit: hit.base_unit });
            } else {
                setLinkBron(null);
                toast('Gekoppeld — geen nette prijs bekend, vul de kostprijs zelf in', 'info');
            }
            /* Vul de rekenhulp met de doos zoals de leverancier hem verkoopt, zodat
               je 'm ook per STUK kunt zien. Een doos van 60 broodjes staat in de
               catalogus als 2100 g, dus normaliseert hij naar €1,41 per 100 g —
               rekenkundig juist, maar wie per broodje calculeert wil €29,60 / 60 =
               €0,49 zien. Met pack_count voorgevuld is dat één klik. */
            /* Alleen voorvullen bij een ECHT afgebakende verpakking: pack_count én
               content_per_item samen betekenen "zoveel stuks van zoveel inhoud", en
               dan is `prijs` de doosprijs. Staat alleen unit='kg' zonder doosinhoud,
               dan is `prijs` een kiloprijs en zou "60 stuks voor €29,60" gelogen zijn.
               De harde toets daarop is pack_total_quantity: alleen als de catalogus de
               TOTALE inhoud kent, deelt supplierProductBaseCost de prijs door die
               inhoud — en pas dán is `prijs` echt een doosprijs. "Runderhamburger
               150 gr, bak 5 stuks" staat als €14,98 /kg zónder totale inhoud; "5 stuks
               voor €14,98" zou daar €3,00 per burger zeggen i.p.v. €2,25.
               En pack_count moet écht > 1 zijn: bij een gewone bak schrijft de
               catalogus "1 × 1 kg", en een stuk-basis kun je niet per gram doseren. */
            if (hit.pack_total_quantity && hit.pack_total_quantity > 0
                && hit.pack_count && hit.pack_count > 1 && hit.content_per_item_quantity) {
                setPackPrice(hit.prijs.toFixed(2).replace('.', ','));
                setPackQty(String(hit.pack_count));
                setPackUnit('stuk');
            }
        } else {
            /* Catalog A (prijslijst) → koppel op master_product_id + supplier_price_id. */
            setMasterProductId(hit.master_product_id);
            setSupplierPriceId(hit.supplier_price_id);
            setSupplierProductId(null);
            setLinkBron(leverancierBron({ source: 'price_list', prijs_per_kg: hit.prijs_per_kg, prijs_per_stuk: hit.prijs_per_stuk }));
            const derived = applyLinkedPrice(hit.prijs_per_kg, hit.prijs_per_stuk);
            if (!derived) toast('Gekoppeld — deze leverancier heeft geen €/kg of €/stuk, dus vul de kostprijs zelf in', 'info');
        }
    }

    function unlinkSupplier() {
        setMasterProductId(null);
        setSupplierPriceId(null);
        setSupplierProductId(null);
        setLinkLabel(null);
        setLinkBron(null);
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
                /* De kostprijs beweegt mee met de leverancier — de BASIS niet.
                   Dit zette eerder ook base_quantity/base_unit terug (naar 100 g
                   bij een €/kg-prijs), waardoor een zelf ingevulde basis van 1 kg
                   bij het heropenen weer 100 g was. Opslaan wérkte; openen gooide
                   het weg. Nu rekenen we de actuele leverancierprijs om naar de
                   basis die er staat. */
                const bron = leverancierBron(lp);
                if (bron) {
                    const herrekend = costForBasisCents({
                        srcCostCents: bron.cents,
                        srcQuantity: bron.quantity,
                        srcUnit: bron.unit,
                        baseQuantity: c.base_quantity,
                        baseUnit: c.base_unit,
                    });
                    /* null = andere eenheid-familie (basis in liter, prijs per kg).
                       Dan niet gokken: laat staan wat is opgeslagen, en zeg het
                       eerlijk in plaats van te beloven dat de prijs meebeweegt. */
                    if (herrekend !== null) setCostEuros((herrekend / 100).toFixed(2));
                }
                setLinkBron(bron);
            } else {
                setLinkLabel(null);
                setLinkBron(null);
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
            /* Omrekenen naar de basis-hoeveelheid, niet de rauwe som overnemen —
               zie kostprijsPerBasisUitIngredienten. Kan het niet, dan liever geen
               kostprijs dan een verkeerde: blokkeren en het vragen. */
            const sumC = ingredientSumCents(ingredients);
            if (sumC > 0) {
                const afgeleid = kostprijsPerBasisUitIngredienten(ingredients, qty, baseUnit);
                if (!afgeleid) {
                    return {
                        ok: false as const,
                        reason: `Ik kan de kostprijs niet omrekenen naar ${formatQty(qty)} ${baseUnit}: `
                            + 'je ingrediënten staan in eenheden die niet bij elkaar op te tellen zijn. '
                            + 'Zet ze in dezelfde soort eenheid, of vul de kostprijs zelf in.',
                    };
                }
                baseCostCents = afgeleid.cents;
                setCostEuros((afgeleid.cents / 100).toFixed(2));
            }
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
                /* De versie die we bij het openen kregen. Klopt die niet meer, dan
                   heeft iemand anders (of de prijs-verversing) de bouwsteen intussen
                   gewijzigd en slaat de server niets op — anders overschrijft de
                   lade die al een kwartier openstond stilzwijgend andermans werk,
                   inclusief allergenen. */
                expected_updated_at: comp?.updated_at ?? null,
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
        if (!res.ok) {
            /* Botsing: iemand anders was ons voor. Niet alleen melden maar de lade
               ook bijwerken, anders blijft Sam op Opslaan drukken met een versie
               die per definitie verouderd is. */
            if (res.status === 409 && body?.conflict) {
                toast(body.error || 'Deze bouwsteen is intussen door iemand anders gewijzigd.', 'error');
                await loadDetail();
                return;
            }
            throw new Error(body.error || 'Opslaan mislukt');
        }
        const recompMsg = body.recomputed_gerechten ? ` (${body.recomputed_gerechten} gerechten herrekend)` : '';
        toast(`Component bijgewerkt${recompMsg}`, 'success');
        if (body.warnings) toast(`Wel met waarschuwingen: ${body.warnings.join(', ')}`, 'error');
        onSaved();
    }

    async function handleSave() {
        const v = validateForm();
        if (!v.ok) { toast(v.reason, 'error'); return; }

        /* Wat verandert er aan de PRIJS-KANT van deze bouwsteen?
           Niet alleen het bedrag telt. De kostprijs in een gerecht is
           (hoeveelheid / basis) x bedrag / snijverlies — dus de basis-hoeveelheid,
           de basis-eenheid én het snijverlies verschuiven diezelfde uitkomst.
           Eerder keken we alléén naar het bedrag: wie de basis corrigeerde van
           "€2,50 per 100 g" naar "€2,50 per 250 g" maakte al zijn gerechten in
           één klik 2,5x goedkoper, zonder modal en zonder melding. En van 100 g
           naar 1 stuk kon een gerecht x100 gooien. Alles wat de uitkomst raakt
           moet dus door hetzelfde bevestig-scherm. */
        const oldBaseCostCents = comp?.base_cost_cents ?? null;
        const prijsRaakt =
            oldBaseCostCents !== null && (
                oldBaseCostCents !== v.baseCostCents
                || Number(comp?.base_quantity ?? 0) !== v.qty
                || String(comp?.base_unit ?? '') !== baseUnit
                || normalizeYield(comp?.yield_factor) !== normalizeYield(yieldFactor)
            );

        if (!prijsRaakt) {
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
                body: JSON.stringify({
                    new_base_cost_cents: v.baseCostCents,
                    /* De basis die STRAKS wordt opgeslagen meesturen, anders rekent
                       de preview met de oude en klopt het getoonde bedrag niet. */
                    new_base_quantity: v.qty,
                    new_base_unit: baseUnit,
                    new_yield_factor: normalizeYield(yieldFactor),
                }),
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
                                        {/* Alleen beloven wat er echt gebeurt. Staat jouw basis in
                                            een andere eenheid-familie dan de leverancier rekent
                                            (jij per stuk, zij per kilo), dan is er geen eerlijke
                                            omrekening en beweegt deze prijs dus NIET mee — dan
                                            hoort er geen groene geruststelling te staan. */}
                                        {prijsBeweegtNietMee ? (
                                            <p className="kf-help" style={{ color: 'var(--amber, #f59e0b)' }}>
                                                Gekoppeld, maar de prijs beweegt <strong>niet</strong> mee: jouw basis staat in{' '}
                                                {prijsBeweegtNietMee.basisEenheid} en de leverancier rekent per{' '}
                                                {prijsBeweegtNietMee.leverancierEenheid}. Zet de basis-eenheid gelijk, dan
                                                rekent hij weer mee — of pas de kostprijs zelf aan.
                                            </p>
                                        ) : (
                                            <p className="kf-help">Gekoppeld → de kostprijs komt uit je prijslijst en beweegt mee bij een prijswijziging.</p>
                                        )}
                                    </label>
                                )}
                                {/* Pak-prijs is de bron, base-velden het berekende resultaat. Hier
                                    herziet Mathijs wat hij bij de slager betaalt.

                                    Stond eerder achter `!linkLabel`, dus zodra je een leverancier
                                    koppelde verdween de rekenhulp. Precies dan heb je hem nodig: de
                                    catalogus slaat een doos van 60 briochebroodjes op als 2100 gram
                                    en normaliseert naar €1,41 per 100 g, terwijl je per broodje
                                    inkoopt en €29,60 / 60 = €0,49 wilt zien. Zonder deze rekenhulp
                                    was die som in het scherm niet te maken. */}
                                {comp?.type === 'bought_in' && (
                                    <PakketRekenhulp
                                        priceEuros={packPrice}
                                        qty={packQty}
                                        unit={packUnit}
                                        onApply={applyPack}
                                        huidigeBasis={{
                                            qty: parseDec(baseQty),
                                            unit: baseUnit,
                                            cents: Math.round((parseDec(costEuros) || 0) * 100),
                                        }}
                                        onOvernemen={(base) => {
                                            setBaseQty(String(base.base_quantity));
                                            setBaseUnit(base.base_unit);
                                            setCostEuros((base.base_cost_cents / 100).toFixed(2));
                                        }}
                                    />
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

                        {/* Verwijderen stond nergens in dit scherm: de functie en de API
                            bestonden wél, maar niets riep ze aan. Elke typefout en elke
                            dubbele import bleef daardoor voor altijd in de bibliotheek
                            staan. Links, weg van Opslaan, zodat je 'm niet per ongeluk
                            raakt — en de server vertelt welke gerechten 'm nog gebruiken. */}
                        <div className="mr-drawer-footer" style={{ justifyContent: 'space-between' }}>
                            <button
                                type="button"
                                onClick={handleDelete}
                                disabled={saving || deleting}
                                className="kf-ghost"
                                style={{ color: '#ef4444' }}
                            >
                                {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                                {deleting ? 'Verwijderen…' : 'Verwijderen'}
                            </button>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button type="button" onClick={onClose} className="kf-ghost">Annuleer</button>
                                <button type="button" onClick={handleSave} disabled={saving} className="kf-primary">
                                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                                    {saving ? 'Opslaan…' : 'Opslaan'}
                                </button>
                            </div>
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
    useEscapeToClose(onClose);
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
                                <span>Zoek je in <strong>Zelf bereid → Ingrediënt</strong> een leverancier-product (spareribs van Beef Club, salsa van Bidfood…)? Dat zoekvak doorzoekt zowel je geïmporteerde <strong>prijslijsten</strong> als je <strong>gescande bestel-catalogus</strong> — daar hoef je hier niets voor te doen. Deze bulk-import vult je componenten­bibliotheek; wil je er een prijslijst bij, dan doe je dat bij <Link href="/leveranciers" className="underline">Leveranciers</Link>.</span>
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
                                <div className="kf-help" style={{ marginTop: 6 }}>Selectie: {keepCount} × · Totale prijs: {formatEur((totalCents / 100))}</div>
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
                                                <td className="mr-table-td" style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatEur((p.price_cents / 100))}</td>
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
    priceEuros, qty, unit, onApply, huidigeBasis, onOvernemen,
}: {
    priceEuros: string;
    qty: string;
    unit: PackUnit;
    onApply: (price: string, qty: string, unit: PackUnit) => void;
    /* Wat er nu in de base-velden staat — om te zien of de uitkomst hieronder
       daarvan afwijkt. */
    huidigeBasis?: { qty: number; unit: string; cents: number };
    onOvernemen?: (base: BaseFields) => void;
}) {
    const cents = Math.round(parseDec(priceEuros) * 100);
    const q = parseDec(qty);
    const valid = priceEuros.trim() !== '' && Number.isFinite(cents) && cents >= 0 && Number.isFinite(q) && q > 0;
    const base = valid ? packToBase(cents, q, unit) : null;
    const label = base ? unitPriceLabel(base.base_cost_cents, base.base_quantity, base.base_unit) : null;
    const example = base ? exampleUseCost(base) : null;

    /* Wijkt de uitkomst af van wat er in de velden staat? Dan is er iets om over
       te nemen. Doet zich vooral voor bij een gekoppeld groothandelsproduct: een
       doos van 60 broodjes staat in de catalogus als 2100 g en normaliseert naar
       €1,41 per 100 g, terwijl je per broodje inkoopt en €0,49 wilt. Zonder deze
       knop moest je een veld aanraken om de som over te nemen — te verstopt. */
    const wijktAf = !!(base && huidigeBasis && onOvernemen && (
        base.base_unit !== huidigeBasis.unit
        || base.base_quantity !== huidigeBasis.qty
        || base.base_cost_cents !== huidigeBasis.cents
    ));

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
                        = {formatEuro(base.base_cost_cents)} per {base.base_quantity === 1 ? '' : formatQty(base.base_quantity)}{base.base_unit}
                        {label ? <span className="font-sans" style={{ marginLeft: 6, fontWeight: 400, color: 'var(--muted)' }}>({label})</span> : null}
                    </div>
                    {example && (
                        <div style={{ marginTop: 3, fontSize: 11, color: 'var(--muted)' }}>
                            Voorbeeld: {formatQty(example.qty)} {example.unit} in een gerecht kost {formatEuro(example.cents)}
                        </div>
                    )}
                    {wijktAf && base && (
                        <button
                            type="button"
                            onClick={() => onOvernemen!(base)}
                            className="kf-add"
                            style={{ marginTop: 10 }}
                        >
                            Gebruik {formatEuro(base.base_cost_cents)} per{' '}
                            {base.base_quantity === 1 ? '' : formatQty(base.base_quantity)}{base.base_unit} als kostprijs
                        </button>
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
    folderId, onClose, onSaved, initialZoek = '',
}: {
    folderId: string | null;
    onClose: () => void;
    onSaved: () => void;
    initialZoek?: string;
}) {
    const toast = useToast();
    useEscapeToClose(onClose);
    const [zoek, setZoek] = useState(initialZoek);
    const [gekozen, setGekozen] = useState<CatalogSearchHit | null>(null);
    /* Zichtbare naam van de bouwsteen. Begint als de catalogusnaam, maar is
       aanpasbaar: die naam gaat mee naar je gerechten, menukaart en kookbord. */
    const [naam, setNaam] = useState('');
    const [packQty, setPackQty] = useState('');
    const [packUnit, setPackUnit] = useState<PackUnit>('stuk');
    const [packPrice, setPackPrice] = useState('');
    const [yieldFactor, setYieldFactor] = useState<number>(1);
    const [saving, setSaving] = useState(false);

    /* Eenheden waarbij de catalogusprijs de prijs van de HELE verpakking is
       ("€34,00 / doos"). Bij een maat-eenheid ("€7,75 / kg") is het een prijs
       PER kilo — die mag je niet als pak-prijs invullen, want dan rekent de app
       met een verzonnen bedrag zodra Sam er "60 stuks" bij zet. */
    const PAK_EENHEDEN = /doos|pak|zak|krat|tray|bak|emmer|colli|omdoos/i;

    /* De catalogus-eenheid ('kg', 'liter', 'stuks'…) naar een rekenhulp-eenheid. */
    function naarPackUnit(eenheid: string | null | undefined): PackUnit | null {
        const e = (eenheid || '').toLowerCase().trim();
        if (!e) return null;
        if (e === 'g' || e === 'gram') return 'g';
        if (e === 'ml') return 'ml';
        if (e === 'kg' || e === 'kilo') return 'kg';
        if (e === 'l' || e === 'liter' || e === 'ltr') return 'liter';
        if (e === 'stuk' || e === 'stuks' || e === 'piece') return 'stuk';
        if (e === 'portie' || e === 'porties') return 'portie';
        return null;
    }

    function kies(hit: CatalogSearchHit) {
        setGekozen(hit);
        setZoek(hit.naam);
        /* Alles van het VORIGE product eerst wissen. Zonder deze reset bleef de
           inhoud staan: koos je eerst "Kipdij, bak 5 stuks" (5 / stuk / €14,69) en
           daarna de kipdij uit je prijslijst (€7,75 per kg), dan sprong de eenheid
           naar kg en werd de prijs leeggemaakt, maar bleef die 5 staan — "5 kg voor
           €7,75", vijf keer te goedkoop. Hetzelfde gold voor het snijverlies: 65%
           dat je bij bavette instelde, gold ineens ook voor een fles saus.
           De takken hieronder vullen daarna zelf in wat ze zéker weten. */
        setPackQty('');
        setPackPrice('');
        setYieldFactor(1);
        /* De naam is vanaf hier bewerkbaar: de catalogusnaam is vaak een schreeuw
           ("BROODJE BRIOCHE 60X72GR BAKKERSLAND") en die belandt zo op je kookbord
           en je menukaart. */
        setNaam(hit.naam);

        /* ── Gescande bestel-catalogus (Bidfood) ── De catalogus wéét al hoe de
           verpakking eruitziet, dus vullen we de rekenhulp voor met de ECHTE doos
           i.p.v. Sam alles te laten overtikken. We gebruiken precies dezelfde bron
           en volgorde als supplierProductBaseCost, zodat de kostprijs die hij
           straks ziet gelijk is aan die in de rest van de app. */
        if (hit.source === 'supplier_product') {
            /* De vraag die alles bepaalt: is `prijs` de prijs van de HELE verpakking,
               of een prijs PER kilo? Dat weet je alleen als de catalogus de totale
               inhoud kent (pack_total_quantity) — dan deelt supplierProductBaseCost
               de prijs door die inhoud, en is het dus een verpakkingsprijs. Ontbreekt
               die inhoud, dan rekent diezelfde functie met €/kg. Wij houden ons exact
               aan die volgorde, anders kost hetzelfde product hier iets anders dan in
               de rest van de app.
               Tegenvoorbeeld dat dit afdwingt: "Runderhamburger 150 gr, bak 5 stuks"
               staat als €14,98 /kg zónder totale inhoud. "5 stuks voor €14,98" zou
               €3,00 per burger zeggen, terwijl de app overal €2,25 rekent. */
            const totaalBekend = !!(hit.pack_total_quantity && hit.pack_total_quantity > 0);
            const packU = naarPackUnit(hit.pack_total_unit);

            /* 1) Echte doos met bekende inhoud én meerdere stuks ("bak 5 × 80 g") →
               toon 'm per stuk, want zo koop en dosseer je 'm. Dit geeft exact
               dezelfde kostprijs als de kilo-weg: 5 stuks voor €14,69 = €2,94, en
               400 g voor €14,69 = €3,67/100 g → een stuk van 80 g = €2,94. */
            if (totaalBekend && hit.pack_count && hit.pack_count > 1 && hit.content_per_item_quantity && hit.prijs > 0) {
                setPackQty(String(hit.pack_count));
                setPackUnit('stuk');
                setPackPrice(hit.prijs.toFixed(2).replace('.', ','));
                return;
            }
            /* 2) Vaste verpakking met bekende inhoud ("bak 1 kg" → 1000 g voor €7,50). */
            if (totaalBekend && packU && hit.prijs > 0) {
                setPackQty(String(hit.pack_total_quantity));
                setPackUnit(packU);
                setPackPrice(hit.prijs.toFixed(2).replace('.', ','));
                return;
            }
            /* 3) Prijs per maat-eenheid ("€12,50 / kg") → 1 kg voor €12,50. */
            const unitU = naarPackUnit(hit.eenheid);
            if (unitU && hit.prijs > 0) {
                setPackQty('1');
                setPackUnit(unitU);
                setPackPrice(hit.prijs.toFixed(2).replace('.', ','));
                return;
            }
            /* 4) Niets bruikbaars bekend → leeg laten, Sam vult zelf in. */
            setPackQty('');
            setPackUnit('stuk');
            setPackPrice('');
            return;
        }

        /* ── Prijslijst (Catalog A) — ongewijzigd gedrag. ── */
        const e = (hit.eenheid || '').toLowerCase();
        if (e.includes('kg') || e === 'kilo') setPackUnit('kg');
        else if (e.includes('liter') || e === 'l') setPackUnit('liter');
        else if (e.includes('ml')) setPackUnit('ml');
        else setPackUnit('stuk');
        /* Alleen voorvullen als de catalogus écht een verpakkingsprijs geeft. */
        if (hit.prijs > 0 && PAK_EENHEDEN.test(hit.eenheid || '')) {
            setPackPrice(String(hit.prijs).replace('.', ','));
        } else {
            setPackPrice('');
        }
    }

    const qty = parseDec(packQty);
    const prijs = parseDec(packPrice);
    const base = (Number.isFinite(qty) && qty > 0 && Number.isFinite(prijs) && prijs > 0)
        ? packToBase(Math.round(prijs * 100), qty, packUnit)
        : null;

    async function handleSave() {
        if (!gekozen) { toast('Kies eerst een product uit je prijslijsten', 'error'); return; }
        if (!base) { toast('Vul in hoeveel er in de verpakking zit en wat je betaalt', 'error'); return; }
        /* Een bouwsteen van € 0,00 telt in élk gerecht als gratis: je foodcost valt
           te laag uit en je marge lijkt beter dan hij is — zonder dat er ooit een
           foutmelding komt. Dat mag niet stilzwijgend gebeuren. Kan voorkomen bij
           veel stuks in één pak (1000 servetten voor € 4,50 = 0,45 cent per stuk,
           afgerond 0). Non-food mag wel gratis zijn: krattten en folie hoeven geen
           kostprijs te hebben. */
        const isNonFood = NON_FOOD_RE.test(naam.trim() || gekozen.naam);
        if (!isNonFood && base.base_cost_cents === 0) {
            const door = window.confirm(
                `Dit komt neer op € 0,00 per ${formatQty(base.base_quantity)} ${base.base_unit}.\n\n` +
                'Deze bouwsteen telt dan in al je gerechten als gratis mee, waardoor je ' +
                'kostprijs te laag en je marge te mooi wordt.\n\n' +
                'Tip: kies een grotere basis (bijvoorbeeld per 100 stuks in plaats van per stuk).\n\n' +
                'Toch zo opslaan?',
            );
            if (!door) return;
        }
        setSaving(true);
        try {
            const res = await fetch('/api/components', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: naam.trim() || gekozen.naam,
                    description: gekozen.leverancier ? `Ingekocht bij ${gekozen.leverancier}` : null,
                    type: 'bought_in',
                    category: isNonFood ? 'non_food' : 'food',
                    base_quantity: base.base_quantity,
                    base_unit: base.base_unit,
                    base_cost_cents: base.base_cost_cents,
                    pack_price_cents: Math.round(prijs * 100),
                    pack_quantity: qty,
                    pack_unit: packUnit,
                    yield_factor: yieldFactor,
                    /* De koppeling waar het om begonnen was — en die hangt af van
                       wélke catalogus de treffer kwam uit. Een gescand product
                       (Bidfood) heeft master_product_id/supplier_price_id 0; die
                       0 als koppeling opslaan levert een verwijzing naar niets.
                       Nooit beide invullen: het is A óf B. */
                    master_product_id: gekozen.source === 'supplier_product' ? null : gekozen.master_product_id,
                    supplier_price_id: gekozen.source === 'supplier_product' ? null : gekozen.supplier_price_id,
                    supplier_product_id: gekozen.source === 'supplier_product' ? (gekozen.supplier_product_id ?? null) : null,
                    folder_id: folderId && /^[0-9a-f-]{36}$/i.test(folderId) ? folderId : null,
                }),
            });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error || 'Opslaan mislukt');
            toast(`"${naam.trim() || gekozen.naam}" toegevoegd`, 'success');
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
                        <span className="kf-label">Wat koop je? <span style={{ fontWeight: 400, color: 'var(--muted)' }}>· zoekt in al je leverancier-catalogi</span></span>
                        <SupplierProductAutocomplete
                            value={zoek}
                            onChange={(v) => { setZoek(v); if (gekozen && v !== gekozen.naam) setGekozen(null); }}
                            onPick={kies}
                            includeSupplierProducts
                            /* Kom je hier vanuit "zoek 'guacamole' bij je leveranciers", dan
                               staat de term er al — dan hoort de cursor er ook te staan en
                               de lijst meteen open, anders lijkt het alsof er niets gebeurt. */
                            autoFocus={!!initialZoek}
                            placeholder="bv. brioche"
                        />
                        {gekozen ? (
                            <div className="flex items-center gap-1.5" style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 6 }}>
                                <ShoppingBag size={11} style={{ color: 'var(--brand)' }} aria-hidden="true" />
                                <span>
                                    <strong style={{ color: 'var(--text)', fontWeight: 600 }}>{gekozen.leverancier || 'leverancier'}</strong>
                                    {gekozen.prijs > 0 ? ` · ${formatEuro(Math.round(gekozen.prijs * 100))}${gekozen.eenheid ? ' / ' + gekozen.eenheid : ''}` : ''}
                                </span>
                            </div>
                        ) : (
                            <div className="kf-help" style={{ marginTop: 6 }}>
                                Tik een paar letters — je ziet elk product uit je prijslijsten én uit je gescande
                                bestel-catalogus (Bidfood), met de prijs erbij.
                            </div>
                        )}
                    </label>

                    {/* Hoe heet het bij jou? De catalogusnaam is vaak onleesbaar
                        ("BROODJE BRIOCHE 60X72GR BAKKERSLAND") en gaat zo mee naar je
                        gerechten, menukaart en kookbord. Hier meteen te corrigeren,
                        in plaats van eerst opslaan en dan de bewerk-drawer in. */}
                    {gekozen && (
                        <label className="kf-field">
                            <span className="kf-label">
                                Hoe noem jij het? <span style={{ fontWeight: 400, color: 'var(--muted)' }}>· zo staat het straks op je kaart</span>
                            </span>
                            <input
                                type="text"
                                value={naam}
                                onChange={(e) => setNaam(e.target.value)}
                                placeholder={gekozen.naam}
                                className="kf-input"
                            />
                        </label>
                    )}

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
                                        placeholder="34,00" className="kf-input" />
                                </label>
                            </div>

                            {/* Alleen vragen wat nog niet ingevuld is. Zodra de catalogus de
                                verpakking al kent (gescand product), staat alles er al en is
                                "vul hierboven in" verwarrend in plaats van behulpzaam. */}
                            {gekozen.prijs > 0 && !packPrice && !PAK_EENHEDEN.test(gekozen.eenheid || '') && (
                                <div className="kf-help" style={{ marginTop: 2 }}>
                                    Je catalogus geeft {formatEuro(Math.round(gekozen.prijs * 100))} per {gekozen.eenheid || 'eenheid'} —
                                    vul hierboven in wat je voor de héle verpakking betaalt.
                                </div>
                            )}

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

    /* Is er iets ingevuld dat verloren zou gaan? Bewust ruim: liever één keer te
       vaak vragen dan een half uur receptuur weggooien. Een lege startrij telt niet. */
    const heeftWerk = useCallback(() => (
        name.trim() !== '' || description.trim() !== '' || costEuros.trim() !== ''
        || flavorTags.trim() !== '' || steps.length > 0 || allergenCodes.size > 0
        || haccpRows.length > 0
        || ingredients.some(r => r.name.trim() !== '' || r.qty.trim() !== '' || r.cost_euros.trim() !== '')
    ), [name, description, costEuros, flavorTags, steps, allergenCodes, haccpRows, ingredients]);
    useEscapeToClose(onClose, heeftWerk);
    const sluitViaScrim = maakScrimSluiter(onClose, heeftWerk);

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
            const afgeleid = kostprijsPerBasisUitIngredienten(ingredients, qty, baseUnit);
            if (!afgeleid) {
                toast(
                    `Ik kan de kostprijs niet omrekenen naar ${formatQty(qty)} ${baseUnit}: ` +
                    'je ingrediënten staan in eenheden die niet bij elkaar op te tellen zijn. ' +
                    'Zet ze in dezelfde soort eenheid, of vul de kostprijs zelf in.',
                    'error',
                );
                return;
            }
            cost = afgeleid.cents / 100;
            setCostEuros(cost.toFixed(2));
            toast(
                `Kostprijs berekend uit je ingrediënten: ${formatEuro(afgeleid.sumCents)} voor de hele ` +
                `receptuur = ${formatEuro(afgeleid.cents)} per ${formatQty(qty)} ${baseUnit}`,
                'success',
            );
        }
        if (!Number.isFinite(cost) || cost < 0) { toast('Kostprijs ongeldig — tip: gebruik de som van je ingrediënten', 'error'); return; }
        /* Zie de toelichting in InkoopDrawer: € 0,00 telt overal als gratis mee. */
        if (Math.round(cost * 100) === 0) {
            const door = window.confirm(
                `"${name.trim()}" krijgt kostprijs € 0,00.\n\n` +
                'Deze bouwsteen telt dan in al je gerechten als gratis mee, waardoor je ' +
                'kostprijs te laag en je marge te mooi wordt.\n\n' +
                'Toch zo opslaan?',
            );
            if (!door) return;
        }

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
            <div className="mr-drawer-scrim" onClick={sluitViaScrim} role="presentation" />
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

    /* Een gelezen foto is niet gratis: daar is een AI-verzoek voor gedaan. Die
       samen met de ingevulde velden niet zomaar weggooien op één toetsaanslag. */
    const heeftWerk = useCallback(() => (
        products.length > 0 || fileDataUrl !== null || pasted.trim() !== ''
        || name.trim() !== '' || packPrice.trim() !== '' || packQty.trim() !== ''
    ), [products, fileDataUrl, pasted, name, packPrice, packQty]);
    useEscapeToClose(onClose, heeftWerk);
    const sluitViaScrim = maakScrimSluiter(onClose, heeftWerk);

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
            <div className="mr-drawer-scrim" onClick={sluitViaScrim} role="presentation" />
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
