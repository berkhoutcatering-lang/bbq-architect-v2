/**
 * recipeMatch — koppel AI-uitgelezen recept-ingrediënten aan een echte
 * kostprijs-bron (components / inventory / supplier_prices).
 *
 * Harde regel (Golden Pillar #3): de AI LEEST de foto; deze code BEPAALT de
 * match en LEIDT de kostprijs af uit de echte catalogus-rij. De AI verzint
 * nooit een kostprijs. Daarom staat de matching + prijs-rekenkunde hier,
 * puur en getest, los van welke AI-call dan ook.
 *
 * Zie [[project_leverancierssync_rebuild]]: kostprijs komt uit Catalog A
 * (master_products/supplier_prices), nooit uit Catalog B (supplier_products).
 */

export type BaseUnit = 'g' | 'ml' | 'stuk';
/* 'supplier'         = prijslijst-import (Catalogus A, supplier_prices)
   'supplier_product' = gescande bestel-catalogus (Catalogus B, supplier_products)
   Twee aparte bronnen met eigen id-ruimte — ze worden nooit op id gejoind, maar
   allebei WEL doorzocht: 7.7k gescande producten stilzwijgend negeren maakte de
   kostprijs van een recept structureel te laag. */
export type MatchSource = 'component' | 'inventory' | 'supplier' | 'supplier_product';

/** Genormaliseerde kandidaat: elke bron wordt hiernaartoe gemapt vóór matching. */
export interface CostCandidate {
    source: MatchSource;
    ref_id: number;                 // components.id / inventory.id / supplier_prices.id
    name: string;                   // weergavenaam
    /** Kostprijs in centen per 1 base-eenheid (per gram / per ml / per stuk). */
    centsPerBaseUnit: number;
    baseUnit: BaseUnit;
    supplier?: string | null;
    /** Alleen voor source==='supplier': master_product_id, om component te kunnen aanmaken. */
    masterProductId?: number | null;
    /** Alleen voor source==='supplier_product': de koppeling naar Catalogus B. */
    supplierProductId?: number | null;
}

export interface MatchResult {
    candidate: CostCandidate;
    score: number;                  // 0..1
    confidence: 'hoog' | 'middel' | 'laag';
}

/* ── Naam-normalisatie ────────────────────────────────────────────────────
   Kleine letters, accenten eraf, leestekens → spatie, dubbele spaties weg.
   "Crème fraîche (biologisch)" → "creme fraiche biologisch". */
export function normalizeIngredientName(s: string): string {
    return (s || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')   // diacritics
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/* Ruis-woorden die niets zeggen over identiteit — tellen niet mee in de score
   zodat "verse tijm" ↔ "tijm" nog steeds hoog matcht. */
const STOPWORDS = new Set([
    'vers', 'verse', 'fijn', 'grof', 'gehakt', 'gesneden', 'geraspt', 'bio',
    'biologisch', 'naturel', 'per', 'stuk', 'stuks', 'g', 'gram', 'kg', 'ml',
    'l', 'liter', 'de', 'het', 'een', 'van', 'met', 'en',
]);

function tokens(s: string): string[] {
    return normalizeIngredientName(s).split(' ').filter((t) => t && !STOPWORDS.has(t));
}

/* ── Naam-score 0..1 ──────────────────────────────────────────────────────
   Token-overlap gewogen naar de kortste kant: als álle betekenisvolle tokens
   van het ingrediënt in de kandidaat zitten telt dat zwaar (kandidaat mag
   extra woorden hebben, bv. "Bidfood Roomboter ongezouten 250 g" ↔ "roomboter").
   Exacte gelijkheid = 1. */
export function nameScore(ingredient: string, candidate: string): number {
    const a = tokens(ingredient);
    const b = tokens(candidate);
    if (a.length === 0 || b.length === 0) return 0;
    const setB = new Set(b);
    const overlap = a.filter((t) => setB.has(t)).length;
    if (overlap === 0) {
        // laatste kans: substring van de hele genormaliseerde string
        const na = normalizeIngredientName(ingredient);
        const nc = normalizeIngredientName(candidate);
        if (na.length >= 4 && nc.includes(na)) return 0.6;
        return 0;
    }
    const coverage = overlap / a.length;          // hoeveel van het ingrediënt gedekt is
    const precision = overlap / b.length;         // hoe gericht de kandidaat is
    // Coverage weegt het zwaarst; precision voorkomt dat een 10-woord-kandidaat
    // met 1 toevallig woord wint van een strakke match.
    return Math.min(1, coverage * 0.75 + precision * 0.25);
}

export function confidenceFromScore(score: number): 'hoog' | 'middel' | 'laag' {
    if (score >= 0.8) return 'hoog';
    if (score >= 0.5) return 'middel';
    return 'laag';
}

/* ── Staart-match herkennen ───────────────────────────────────────────────
   Een ingrediënt van één woord dat álleen achteraan in een veel langere naam
   voorkomt, is meestal een smaak of variant — niet het product zelf:

     "zeezout fijn"  ↔ "Knäckebröd meergranen zeezout"   ← knäckebröd mét zout
     "roomboter"     ↔ "Bidfood Roomboter ongezouten"    ← wél de boter

   In Nederlandse productnamen staat het hoofdwoord vooraan, hooguit achter een
   merknaam. Matcht het ingrediënt pas vanaf positie 3, dan is de kandidaat
   waarschijnlijk iets anders. We gooien 'm niet weg (dat kan een terechte
   treffer kosten) maar zetten de zekerheid op 'laag', zodat de gebruiker een
   "?" ziet en zelf kijkt. Beter twijfel tonen dan valse zekerheid. */
const HEAD_WINDOW = 2;      // hoofdwoord staat op positie 0 of 1 (na een merk)
const MIN_LONG_NAME = 3;    // pas beoordelen bij namen van 3+ betekenisvolle woorden

export function isTailOnlyMatch(ingredient: string, candidate: string): boolean {
    const a = tokens(ingredient);
    const b = tokens(candidate);
    if (a.length === 0 || b.length < MIN_LONG_NAME) return false;
    const setA = new Set(a);
    const firstHit = b.findIndex((t) => setA.has(t));
    return firstHit >= HEAD_WINDOW;
}

/* ── Beste match kiezen ───────────────────────────────────────────────────
   Kandidaten worden gescoord; bij gelijke score wint de bron-prioriteit
   (eigen bibliotheek > eigen voorraad > leverancier-catalogus). Onder de
   floor → null (dan tonen we "geschat, geen match" i.p.v. een gok). */
/* Bij een gelijke naam-score wint de bron die het dichtst bij Sam's eigen
   administratie staat. De prijslijst gaat vóór de gescande catalogus: dat is de
   prijs die hij daadwerkelijk onderhandeld heeft. Onderlinge volgorde bewust
   gelijk aan voorheen, alleen met de nieuwe bron eronder. */
const SOURCE_RANK: Record<MatchSource, number> = { component: 4, inventory: 3, supplier: 2, supplier_product: 1 };

export function pickBestMatch(
    ingredientName: string,
    candidates: CostCandidate[],
    floor = 0.45,
): MatchResult | null {
    let best: MatchResult | null = null;
    for (const c of candidates) {
        const score = nameScore(ingredientName, c.name);
        if (score < floor) continue;
        if (
            !best ||
            score > best.score ||
            (score === best.score && SOURCE_RANK[c.source] > SOURCE_RANK[best.candidate.source])
        ) {
            /* Staart-match → altijd 'laag', ook bij een hoge score. Anders
               presenteert een knäckebröd-met-zeezout zich als zekere zout-match. */
            const confidence = isTailOnlyMatch(ingredientName, c.name)
                ? 'laag'
                : confidenceFromScore(score);
            best = { candidate: c, score, confidence };
        }
    }
    return best;
}

/* ── Eenheid-conversie ────────────────────────────────────────────────────
   Alles naar één base-eenheid: g / ml / stuk. */
export function toBaseUnit(unit: string): { base: BaseUnit; factor: number } | null {
    const u = (unit || '').toLowerCase().trim();
    switch (u) {
        case 'g': case 'gram': case 'gr': return { base: 'g', factor: 1 };
        case 'kg': case 'kilo': case 'kilogram': return { base: 'g', factor: 1000 };
        case 'ml': case 'milliliter': return { base: 'ml', factor: 1 };
        case 'l': case 'liter': case 'ltr': return { base: 'ml', factor: 1000 };
        case 'stuk': case 'stuks': case 'st': case 'stk': case 'portie': case 'plak':
        case 'el': case 'tl': case 'teen': case 'blik': case 'pak':
            return { base: 'stuk', factor: 1 };
        default: return null;
    }
}

/* ── Regel-kostprijs ──────────────────────────────────────────────────────
   qty in ingredient-eenheid × centsPerBaseUnit van de kandidaat, met
   eenheid-conversie. Geeft null als de eenheden niet te rijmen zijn
   (bv. ingrediënt in gram maar kandidaat geprijsd per stuk) — dan blijft
   de regel "geschat" en telt niet mee als valse zekerheid. */
export function lineCostCents(
    qty: number,
    ingredientUnit: string,
    cand: Pick<CostCandidate, 'centsPerBaseUnit' | 'baseUnit'>,
): number | null {
    if (!Number.isFinite(qty) || qty <= 0) return 0;
    const conv = toBaseUnit(ingredientUnit);
    if (!conv) return null;
    if (conv.base !== cand.baseUnit) return null; // g vs stuk → onvergelijkbaar
    const qtyInBase = qty * conv.factor;
    const cents = qtyInBase * cand.centsPerBaseUnit;
    return Math.round(cents);
}
