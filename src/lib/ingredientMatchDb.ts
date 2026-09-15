/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Ingrediënt → catalogusregel → kostprijs, tegen de database.
 *
 * Stond eerst helemaal in `/api/recipe/match-ingredients`. Toen er een tweede
 * plek bijkwam die hetzelfde moest doen (bouwstenen aan een prijs helpen) is het
 * hierheen verhuisd in plaats van gekopieerd — twee matchers die uit elkaar
 * lopen levert precies het soort verschil op waar niemand achter komt tot de
 * marges niet meer kloppen.
 *
 * De rangschikking en de rekenkunde blijven in `lib/recipeMatch.ts`: puur en
 * getest. Hier staat alleen wat de database moet aanleveren.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { supplierProductBaseCost } from '@/lib/supplierSync/recipeCost';
import {
    normalizeIngredientName,
    aliasSleutel,
    isGratis,
    pickBestMatch,
    lineCostCents,
    isGramMlPaar,
    toBaseUnit,
    type CostCandidate,
    type BaseUnit,
    type MatchSource,
} from '@/lib/recipeMatch';

export interface InIngredient { naam: string; qty_pp?: number | null; eenheid?: string | null }

/** De leverancier waarop gezocht wordt. null = alle leveranciers (geen voorkeur ingesteld). */
export interface LeverancierScope { id: number; naam: string }

/**
 * De kostprijs-leverancier van een organisatie: voorkeur_rang = 1 (Hop & Bites:
 * Bidfood). Zie docs/leveranciersvoorkeur-plan.md. null = niet ingesteld → de
 * matcher zoekt zoals voorheen over alle leveranciers.
 */
export async function kostprijsLeverancier(sb: SupabaseClient, orgId: string): Promise<LeverancierScope | null> {
    const { data } = await sb
        .from('leveranciers').select('id, naam')
        .eq('organization_id', orgId).eq('voorkeur_rang', 1).is('archived_at', null)
        .limit(1).maybeSingle();
    return data ? { id: data.id as number, naam: data.naam as string } : null;
}

export type GematchteRegel = {
    naam: string;
    qty_pp: number;
    eenheid: string;
    match: MatchRegel | null;
    /** Golf 4: de AI vond wel iets, maar een ánder product — de kok beslist. */
    ai_voorstel?: { name: string; reden: string } | null;
    /** Water: geen product, geen kostprijs, en ook geen "niet gevonden". */
    gratis?: boolean;
};

/** De koppeling zoals de UI hem kent: bron + prijs + hoe zeker we zijn. */
export interface MatchRegel {
        source: MatchSource;
        ref_id: number;
        name: string;
        supplier: string | null;
        master_product_id: number | null;
        confidence: 'hoog' | 'middel' | 'laag';
        line_cost_cents: number | null;
        unit_incompatible: boolean;
        /** true = gram en milliliter 1:1 gerekend (sauzen, zuivel, olie). */
        unit_approx: boolean;
        cents_per_base_unit: number;
        base_unit: BaseUnit;
        /** Gevonden via een door de kok bevestigde alias (golf 4). */
        via_alias?: boolean;
        /** Gekozen door de AI-synoniemenstap (golf 4); wacht op een ja van de kok. */
        via_ai?: boolean;
        ai_reden?: string;
}

/* ── Aliassen (golf 4) ──────────────────────────────────────────────────────
   "appelciderazijn" → "Appelazijn, can 5 ltr", één keer bevestigd. De matcher
   kijkt hier eerst. Een alias wijst op bron + id; is die rij weg (nieuwe
   prijslijst), dan zoeken we op de bewaarde productnaam in dezelfde bron. */
export interface AliasRij {
    alias_normalized: string;
    source: MatchSource;
    ref_id: number;
    product_name: string;
    supplier_name: string | null;
}

export async function leesAliassen(sb: SupabaseClient, orgId: string, namen: string[]): Promise<Map<string, AliasRij>> {
    const keys = [...new Set(namen.map(aliasSleutel).filter(Boolean))];
    if (keys.length === 0) return new Map();
    const { data } = await sb
        .from('ingredient_aliases')
        .select('alias_normalized, source, ref_id, product_name, supplier_name')
        .eq('organization_id', orgId)
        .in('alias_normalized', keys);
    const map = new Map<string, AliasRij>();
    (data ?? []).forEach((r: any) => map.set(r.alias_normalized, r as AliasRij));
    return map;
}

/** De catalogusregel waar een alias naar wijst, als kandidaat met prijs. */
export async function kandidaatVanAlias(
    sb: SupabaseClient,
    orgId: string,
    alias: AliasRij,
    levById: Map<number, string>,
): Promise<CostCandidate | null> {
    const opId = async (): Promise<CostCandidate | null> => {
        switch (alias.source) {
            case 'component': {
                const { data } = await sb.from('components').select('id,name,base_quantity,base_unit,base_cost_cents')
                    .eq('organization_id', orgId).eq('id', alias.ref_id).maybeSingle();
                return data ? fromComponent(data) : null;
            }
            case 'inventory': {
                const { data } = await sb.from('inventory').select('id,naam,unit,purchase_price,last_price_eur,supplier')
                    .eq('organization_id', orgId).eq('id', alias.ref_id).maybeSingle();
                return data ? fromInventory(data) : null;
            }
            case 'supplier': {
                const { data } = await sb.from('supplier_prices').select('id,product_naam,prijs,prijs_per_kg,prijs_per_stuk,eenheid,leverancier,master_product_id')
                    .eq('organization_id', orgId).eq('actief', true).eq('id', alias.ref_id).maybeSingle();
                return data ? fromSupplierPrice(data) : null;
            }
            case 'supplier_product': {
                const { data } = await sb.from('supplier_products').select('id,name,supplier_id,price_cents,unit,package_size,package_unit,total_base_quantity,base_unit')
                    .eq('organization_id', orgId).eq('active', true).eq('id', alias.ref_id).maybeSingle();
                return data ? fromSupplierProduct(data, levById.get(data.supplier_id) ?? null) : null;
            }
        }
    };
    const direct = await opId();
    if (direct) return direct;
    /* Rij weg of inactief (nieuwe prijslijst): zelfde productnaam in dezelfde bron. */
    const naam = alias.product_name;
    if (alias.source === 'supplier_product') {
        const { data } = await sb.from('supplier_products').select('id,name,supplier_id,price_cents,unit,package_size,package_unit,total_base_quantity,base_unit')
            .eq('organization_id', orgId).eq('active', true).ilike('name', naam).limit(1).maybeSingle();
        return data ? fromSupplierProduct(data, levById.get(data.supplier_id) ?? null) : null;
    }
    if (alias.source === 'supplier') {
        const { data } = await sb.from('supplier_prices').select('id,product_naam,prijs,prijs_per_kg,prijs_per_stuk,eenheid,leverancier,master_product_id')
            .eq('organization_id', orgId).eq('actief', true).ilike('product_naam', naam).limit(1).maybeSingle();
        return data ? fromSupplierPrice(data) : null;
    }
    return null;
}

/** Alle betekenisvolle woorden — de ruime greep voor de alternatieven-route. */
export function alleZoektermen(naam: string): string[] {
    return [...new Set(normalizeIngredientName(naam).split(' ').filter((t) => t.length >= 3 && !/^\d+$/.test(t)))];
}

/** Zoektermen voor de ilike-greep: de drie langste betekenisvolle woorden.
 *  Eén term (de langste) was te smal: "zwarte peper (versgemalen)" zocht op
 *  "versgemalen" en vond geen van de 108 pepers. De rangschikking daarna
 *  gebeurt op de volledige naam, dus ruimer zoeken kost geen precisie. */
export function searchTerms(naam: string): string[] {
    const toks = normalizeIngredientName(naam).split(' ').filter((t) => t.length >= 3 && !/^\d+$/.test(t));
    if (toks.length === 0) return [normalizeIngredientName(naam)].filter(Boolean);
    return [...new Set(toks)].sort((a, b) => b.length - a.length).slice(0, 3);
}

/** PostgREST-filter: kolom bevat één van de termen. */
function ilikeAny(col: string, terms: string[]): string {
    return terms.map((t) => `${col}.ilike.%${t.replace(/[%,()]/g, '')}%`).join(',');
}

/** components-rij → CostCandidate (centen per base-eenheid). */
function fromComponent(r: any): CostCandidate | null {
    const conv = toBaseUnit(r.base_unit);
    const qty = Number(r.base_quantity) || 0;
    const cents = Number(r.base_cost_cents) || 0;
    if (!conv || qty <= 0 || cents <= 0) return null;
    // base_cost_cents geldt voor base_quantity van base_unit → per 1 base-eenheid
    const perBase = cents / qty / conv.factor;
    return { source: 'component', ref_id: r.id, name: r.name, centsPerBaseUnit: perBase, baseUnit: conv.base };
}

/** inventory-rij → CostCandidate. purchase_price/last_price_eur is euro per `unit`. */
function fromInventory(r: any): CostCandidate | null {
    const conv = toBaseUnit(r.unit);
    const eur = Number(r.last_price_eur ?? r.purchase_price) || 0;
    if (!conv || eur <= 0) return null;
    const perBase = (eur * 100) / conv.factor; // euro→cent, per base-eenheid
    return { source: 'inventory', ref_id: r.id, name: r.naam, centsPerBaseUnit: perBase, baseUnit: conv.base, supplier: r.supplier ?? null };
}

/** supplier_prices-rij (Catalog A) → CostCandidate. Prefereer genormaliseerde velden. */
function fromSupplierPrice(r: any): CostCandidate | null {
    const name = r.product_naam as string;
    const perKg = Number(r.prijs_per_kg) || 0;
    const perStuk = Number(r.prijs_per_stuk) || 0;
    // Alléén de genormaliseerde prijs-velden zijn betrouwbaar. De kale `prijs`
    // + vrije `eenheid` ("doos", "pak", "stuks", "500 gr") is te dubbelzinnig —
    // een pak-totaal als €/kg of €/stuk lezen geeft een catastrofaal foute
    // kostprijs. Zonder genormaliseerde prijs → geen kandidaat → eerlijk "geschat".
    // (66% van de catalogus heeft prijs_per_kg/prijs_per_stuk; ruim genoeg.)
    const base: { base: BaseUnit; perBase: number } | null =
        perKg > 0 ? { base: 'g', perBase: (perKg * 100) / 1000 }
        : perStuk > 0 ? { base: 'stuk', perBase: perStuk * 100 }
        : null;
    if (!base) return null;
    return {
        source: 'supplier', ref_id: r.id, name,
        centsPerBaseUnit: base.perBase, baseUnit: base.base,
        supplier: r.leverancier ?? null, masterProductId: r.master_product_id ?? null,
    };
}

/** supplier_products-rij (Catalog B, gescande bestel-catalogus) → CostCandidate.
 *
 * Deze bron ontbrak, en dat kostte geld: master_products bevat 0 producten met
 * "salsa", supplier_products twee mét prijs. Zo'n regel kwam er als "geschat"
 * uit terwijl de echte prijs (EUR 7,50/kg) gewoon in huis was — de kostprijs van
 * het recept viel te laag uit en de marge zag er te mooi uit.
 *
 * De kostprijs komt uit supplierProductBaseCost, dezelfde deterministische
 * helper die de catalogus-zoek en de component-drawer gebruiken. We joinen
 * NOOIT op id met Catalogus A; dit is een eigen bron met een eigen id-ruimte. */
function fromSupplierProduct(r: any, levNaam: string | null): CostCandidate | null {
    const base = supplierProductBaseCost({
        price_cents: r.price_cents, unit: r.unit,
        package_size: r.package_size, package_unit: r.package_unit,
        total_base_quantity: r.total_base_quantity, base_unit: r.base_unit,
    });
    if (!base || base.base_cost_cents <= 0) return null;
    const conv = toBaseUnit(base.base_unit);
    if (!conv || base.base_quantity <= 0) return null;
    const perBase = base.base_cost_cents / base.base_quantity / conv.factor;
    return {
        source: 'supplier_product', ref_id: r.id, name: r.name,
        centsPerBaseUnit: perBase, baseUnit: conv.base,
        supplier: levNaam, supplierProductId: r.id,
    };
}

/**
 * Zoek per ingrediënt de beste catalogusregel en reken de regelkosten uit.
 *
 * Vier bronnen, allemaal org-scoped. Catalogus A en B worden nooit op id
 * gejoind maar wel allebei doorzocht: 7,7k gescande producten negeren maakte de
 * kostprijs structureel te laag.
 */
export async function matchIngredientenTegenCatalogus(
    sb: SupabaseClient,
    orgId: string,
    ingredienten: InIngredient[],
    /**
     * Beperk de leverancier-bronnen tot één leverancier. Niet meegegeven →
     * de kostprijs-leverancier (voorkeur_rang 1) van de organisatie; is die
     * er niet, dan alle leveranciers. Expliciet null = alle leveranciers.
     * Eigen bibliotheek en eigen voorraad worden altijd doorzocht.
     */
    scope?: LeverancierScope | null,
): Promise<GematchteRegel[]> {
    const lev = scope === undefined ? await kostprijsLeverancier(sb, orgId) : scope;
    /* Leveranciersnamen één keer ophalen: supplier_products heeft alleen een
       supplier_id, en zonder naam staat er "onbekende leverancier" bij een
       product waarvan we de leverancier prima kennen. */
    const levById = await leveranciersOpId(sb, orgId);
    /* Golf 4: wat de kok al bevestigd heeft gaat vóór alles. */
    const aliassen = await leesAliassen(sb, orgId, ingredienten.map((i) => String(i.naam ?? '')));

    return Promise.all(ingredienten.map(async (ing) => {
        const naam = String(ing.naam ?? '').trim();
        const qty = Number(ing.qty_pp) || 0;
        const eenheid = String(ing.eenheid ?? '').trim();
        if (!naam) return { naam, qty_pp: qty, eenheid, match: null };
        /* Water kost niets en hoort niet aan "Coconut Water" te hangen. */
        if (isGratis(naam)) return { naam, qty_pp: qty, eenheid, match: null, gratis: true };

        const alias = aliassen.get(aliasSleutel(naam));
        if (alias) {
            const cand = await kandidaatVanAlias(sb, orgId, alias, levById);
            if (cand) {
                /* Een eigen bouwsteen ("Procureur slager") heeft zelf geen
                   leverancier; de alias weet bij wie hij gekocht is. */
                const metLev = { ...cand, supplier: cand.supplier ?? alias.supplier_name ?? null };
                return { naam, qty_pp: qty, eenheid, match: { ...maakMatchRegel(metLev, 'hoog', qty, eenheid), via_alias: true } };
            }
            /* Alias wijst naar iets dat niet meer bestaat → gewoon zoeken. */
        }

        const terms = searchTerms(naam);
        if (terms.length === 0) return { naam, qty_pp: qty, eenheid, match: null };

        const candidates = await zoekKandidaten(sb, orgId, terms, lev, levById);
        const best = pickBestMatch(naam, candidates, undefined, eenheid);
        if (!best) return { naam, qty_pp: qty, eenheid, match: null };
        return { naam, qty_pp: qty, eenheid, match: maakMatchRegel(best.candidate, best.confidence, qty, eenheid) };
    }));
}

/** Naam → leverancier voor Catalogus B, die alleen een supplier_id heeft. */
export async function leveranciersOpId(sb: SupabaseClient, orgId: string): Promise<Map<number, string>> {
    const { data: levs } = await sb
        .from('leveranciers').select('id, naam').eq('organization_id', orgId);
    return new Map<number, string>((levs ?? []).map((l: any) => [l.id, l.naam]));
}

/**
 * Alle kandidaten uit de vier bronnen voor een set zoektermen. Gedeeld door de
 * matcher en door de alternatieven-route, zodat die dezelfde catalogus zien.
 */
export async function zoekKandidaten(
    sb: SupabaseClient,
    orgId: string,
    terms: string[],
    lev: LeverancierScope | null,
    levById: Map<number, string>,
): Promise<CostCandidate[]> {
    if (terms.length === 0) return [];
    /* Per zoekwoord een eigen greep, niet één OR-greep met een gedeelde limiet:
       "saus" haalt honderden producten op en dan valt "Worcestersaus" buiten
       de 150 — zonder ORDER BY is de greep willekeurig. Met een greep per
       woord krijgt elk woord zijn eigen 150, en de kandidaten worden daarna
       op id ontdubbeld. */
    const perTerm = await Promise.all(terms.map(async (term) => {
        const pat = `%${term.replace(/[%,()]/g, '')}%`;
        const [comp, inv, sup, sprod] = await Promise.all([
            sb.from('components').select('id,name,base_quantity,base_unit,base_cost_cents')
                .eq('organization_id', orgId).ilike('name', pat).limit(30),
            sb.from('inventory').select('id,naam,unit,purchase_price,last_price_eur,supplier')
                .eq('organization_id', orgId).ilike('naam', pat).limit(30),
            /* Prijslijst (A) kent de leverancier alleen bij naam; de gescande
               catalogus (B) bij id. Beide beperken tot de gekozen leverancier. */
            (() => {
                let q = sb.from('supplier_prices').select('id,product_naam,prijs,prijs_per_kg,prijs_per_stuk,eenheid,leverancier,master_product_id')
                    .eq('organization_id', orgId).eq('actief', true).ilike('product_naam', pat);
                if (lev) q = q.ilike('leverancier', lev.naam);
                return q.limit(150);
            })(),
            (() => {
                let q = sb.from('supplier_products').select('id,name,supplier_id,price_cents,unit,package_size,package_unit,total_base_quantity,base_unit')
                    .eq('organization_id', orgId).eq('active', true).ilike('name', pat);
                if (lev) q = q.eq('supplier_id', lev.id);
                /* Bidfood heeft 58 mayonaises en 108 pepers; een greep van 25
                   zonder volgorde miste "Fijn zeezout" terwijl die er is. */
                return q.limit(150);
            })(),
        ]);
        return [
            ...(comp.data || []).map(fromComponent),
            ...(inv.data || []).map(fromInventory),
            ...(sup.data || []).map(fromSupplierPrice),
            ...(sprod.data || []).map((r: any) => fromSupplierProduct(r, levById.get(r.supplier_id) ?? null)),
        ].filter((c): c is CostCandidate => c !== null);
    }));
    const gezien = new Set<string>();
    const uit: CostCandidate[] = [];
    for (const lijst of perTerm) {
        for (const c of lijst) {
            const k = `${c.source}:${c.ref_id}`;
            if (gezien.has(k)) continue;
            gezien.add(k);
            uit.push(c);
        }
    }
    return uit;
}

/** Kandidaat + hoeveelheid → de regel zoals de UI hem toont en opslaat. */
export function maakMatchRegel(
    cand: CostCandidate,
    confidence: 'hoog' | 'middel' | 'laag',
    qty: number,
    eenheid: string,
): MatchRegel {
    const line = lineCostCents(qty, eenheid, cand);
    const basis = toBaseUnit(eenheid)?.base ?? null;
    const approx = basis != null && basis !== cand.baseUnit && isGramMlPaar(basis, cand.baseUnit);
    return {
        source: cand.source,
        ref_id: cand.ref_id,
        name: cand.name,
        supplier: cand.supplier ?? null,
        master_product_id: cand.masterProductId ?? null,
        /* Een g≈ml-benadering is nooit "hoog". */
        confidence: approx && confidence === 'hoog' ? 'middel' : confidence,
        /* null = eenheden onvergelijkbaar → geen valse zekerheid. */
        line_cost_cents: line,
        unit_incompatible: line === null,
        unit_approx: approx,
        cents_per_base_unit: cand.centsPerBaseUnit,
        base_unit: cand.baseUnit,
    };
}
