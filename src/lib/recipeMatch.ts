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
    /* Verpakking zegt niets over wat het product ís. Zonder deze lijst won
       "Appelazijn, fles 500 ml" van "Appelazijn, can 5 ltr" — puur omdat
       "can 5 ltr" één woord meer is — en dat scheelde een factor 8 in prijs. */
    'fles', 'flessen', 'can', 'emmer', 'pot', 'potten', 'bus', 'zak', 'zakken',
    'doos', 'dozen', 'doosje', 'tray', 'krat', 'tube', 'bag', 'box', 'pak', 'pakken',
    'sachet', 'sachets', 'ltr', 'gr', 'st', 'stks', 'cm', 'mm', 'circa', 'ca',
]);

/* Getallen zijn vrijwel altijd inhoud of stuks ("5", "500", "10") en horen
   niet in de naam-score. Een percentage ("80%") verliest hierdoor ook zijn
   getal — "Mayonaise 80%" en "Mayonaise" gelden dan als dezelfde naam, en
   dat is precies de groep waaruit de middelste prijs mag kiezen. */
function tokens(s: string): string[] {
    return normalizeIngredientName(s).split(' ')
        .filter((t) => t && !STOPWORDS.has(t) && !/^\d+$/.test(t));
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
    /* Een gedeeltelijke dekking moet op een echt woord rusten. "Basterdsuiker
       (wit)" ↔ "Molenaarsbrood wit" deelt alleen "wit" — dat is geen suiker. */
    if (coverage < 1 && !a.some((t) => t.length >= 5 && setB.has(t))) return 0;
    // Coverage weegt het zwaarst; precision voorkomt dat een 10-woord-kandidaat
    // met 1 toevallig woord wint van een strakke match.
    return Math.min(1, coverage * 0.75 + precision * 0.25);
}

/** Deel van de ingrediënt-woorden dat in de kandidaat terugkomt (0..1). */
export function coverageOf(ingredient: string, candidate: string): number {
    const a = tokens(ingredient);
    if (a.length === 0) return 0;
    const setB = new Set(tokens(candidate));
    return a.filter((t) => setB.has(t)).length / a.length;
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

/** Positie van het eerste ingrediënt-woord in de kandidaatnaam (-1 = geen). */
export function firstHitIndex(ingredient: string, candidate: string): number {
    const setA = new Set(tokens(ingredient));
    return tokens(candidate).findIndex((t) => setA.has(t));
}

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

/* Alleen kandidaten met dezelfde naam-score zijn "even goed": "Mayonaise,
   fles 1 ltr" naast "Mayonaise, emmer 10 ltr". Een ruimere marge (0,15)
   liet "Truffel mayonaise" en "Melkchocolade karamel zeezout" in de groep
   toe, en dan koos de middelste prijs een smaakvariant. De marge dekt nu
   alleen afrondingsruis. */
const GELIJKE_NAAM_MARGE = 0.001;

/* Middelste prijs (docs/leveranciersvoorkeur-plan.md, golf 1): bij vijf even
   goed passende mayonaises niet de goedkoopste (verkeerde kwaliteit) en niet
   de duurste, maar de middelste — uitwijkruimte naar beide kanten. Bij een
   even aantal de onderste van de twee middelste. */
function middelstePrijs<T extends { candidate: CostCandidate }>(rows: T[]): T {
    const sorted = [...rows].sort((a, b) => a.candidate.centsPerBaseUnit - b.candidate.centsPerBaseUnit);
    return sorted[Math.floor((sorted.length - 1) / 2)];
}

export function pickBestMatch(
    ingredientName: string,
    candidates: CostCandidate[],
    floor = 0.45,
    /**
     * De eenheid uit het recept ("g", "ml", "stuk").
     *
     * Meegeven loont: Bidfood heeft "Karnemelk, pak 1 ltr" per ml én Makro
     * "Campina Karnemelk 1 l" per stuk. Op naam scoren die vrijwel gelijk, en
     * zonder deze hint won de tweede — waarna de regel afketste op "eenheid
     * onvergelijkbaar" terwijl de goede prijs gewoon in huis was. Bij een
     * gelijkwaardige naam wint het product waarvan de eenheid past.
     */
    ingredientUnit?: string | null,
): MatchResult | null {
    const gewenst = ingredientUnit ? toBaseUnit(ingredientUnit)?.base ?? null : null;

    /* Hoeveel naam-score een passende eenheid waard is. Klein genoeg dat een
       duidelijk betere naam nog steeds wint — "zure room" mag nooit verliezen
       van "room" omdat die toevallig in grammen staat. */
    const EENHEID_BONUS = 0.08;

    /* g en ml gelden als passend bij elkaar (zie isGramMlPaar): anders kreeg
       "Olijfolie met witte truffel, fles 250 gr" de bonus boven alle gewone
       olijfolies in ml, alleen omdat het recept "10 g" zei. */
    const pastBij = (u: BaseUnit) => gewenst != null && (u === gewenst || isGramMlPaar(u, gewenst));
    const scored = candidates
        .map((c) => {
            const score = nameScore(ingredientName, c.name);
            return { candidate: c, score, gewogen: score + (pastBij(c.baseUnit) ? EENHEID_BONUS : 0) };
        })
        .filter((r) => r.score >= floor);
    if (scored.length === 0) return null;

    /* Past de eenheid van het recept bij een kandidaat die op naam in de
       buurt komt, dan gaan die voor: "Karnemelk" per stuk is niets waard voor
       een regel in ml, ook al is de naam korter dan "Karnemelk pak 1 ltr".
       Maar nooit een ánder product omdat de eenheid toevallig past — "zure
       room" verliest niet van "room" in grammen. Vandaar de naam-grens. */
    const EENHEID_NAAM_GRENS = 0.2;
    const topAlles = Math.max(...scored.map((r) => r.gewogen));
    const bruikbaar = gewenst != null
        ? scored.filter((r) => pastBij(r.candidate.baseUnit) && r.gewogen >= topAlles - EENHEID_NAAM_GRENS)
        : [];
    const kandidaten = bruikbaar.length > 0 ? bruikbaar : scored;

    const top = Math.max(...kandidaten.map((r) => r.gewogen));

    /* 1. Alles wat op naam even goed is als de beste. Staart-matches
          ("… karamel zeezout") gaan eruit zodra er een gewone kandidaat is. */
    let pool = kandidaten.filter((r) => r.gewogen >= top - GELIJKE_NAAM_MARGE);
    const gewoon = pool.filter((r) => !isTailOnlyMatch(ingredientName, r.candidate.name));
    if (gewoon.length > 0) pool = gewoon;
    /* Hoofdwoord vooraan gaat vóór: "Roomboter ongezouten" ís boter,
       "Croissant roomboter" is een croissant. Beide scoren gelijk op naam. */
    const vooraan = pool.filter((r) => firstHitIndex(ingredientName, r.candidate.name) === 0);
    if (vooraan.length > 0) pool = vooraan;
    /* 2. Daarbinnen wint de bron die het dichtst bij de eigen administratie
          staat (bibliotheek > voorraad > prijslijst > gescande catalogus). */
    const bronTop = Math.max(...pool.map((r) => SOURCE_RANK[r.candidate.source]));
    pool = pool.filter((r) => SOURCE_RANK[r.candidate.source] === bronTop);
    /* 3. Blijven er meerdere over met dezelfde basis-eenheid: middelste prijs.
          Verschillende eenheden zijn niet op prijs te vergelijken → dan toch
          de hoogste naam-score. */
    const eenheid = pool[0].candidate.baseUnit;
    const zelfdeEenheid = pool.filter((r) => r.candidate.baseUnit === eenheid);
    const gekozen = zelfdeEenheid.length === pool.length && pool.length > 1
        ? middelstePrijs(pool)
        : pool.reduce((a, b) => (b.gewogen > a.gewogen ? b : a));

    /* Uitschieter-rem, alleen voor catalogusprijzen (eigen bibliotheek en
       voorraad zijn Sam's eigen cijfers). "Zwarte peper, pot 47 gr" stond
       voor € 18,13 in de gescande catalogus — € 386/kg, een doos-prijs die
       als potje is ingelezen — en won op naam van tien gewone pepers rond
       € 30/kg. Is de winnaar meer dan 3× duurder dan de middenprijs van alle
       kandidaten die het hele ingrediënt dekken, dan neemt die middenprijs
       het over, met zekerheid 'middel' zodat de chip laat zien dat er is
       ingegrepen. */
    const UITSCHIETER_FACTOR = 3;
    const isCatalogus = gekozen.candidate.source === 'supplier' || gekozen.candidate.source === 'supplier_product';
    if (isCatalogus) {
        /* De productfamilie: alles waarvan het hoofdwoord (vooraan) een
           ingrediënt-woord is, in een vergelijkbare eenheid. Bij "zwarte
           peper" zijn dat alle "Zwarte peper …"-producten; "Flambeergel
           zwarte peper" hoort er niet bij. */
        const familie = kandidaten.filter((r) =>
            (r.candidate.baseUnit === gekozen.candidate.baseUnit || isGramMlPaar(r.candidate.baseUnit, gekozen.candidate.baseUnit))
            && firstHitIndex(ingredientName, r.candidate.name) === 0);
        if (familie.length >= 3) {
            const grens = UITSCHIETER_FACTOR * middelstePrijs(familie).candidate.centsPerBaseUnit;
            if (gekozen.candidate.centsPerBaseUnit > grens) {
                /* Beste naam onder de normaal geprijsde familieleden; bij
                   gelijke naam weer de middelste prijs. */
                const normaal = familie.filter((r) => r.candidate.centsPerBaseUnit <= grens);
                const topN = Math.max(...normaal.map((r) => r.gewogen));
                const besteN = normaal.filter((r) => r.gewogen >= topN - GELIJKE_NAAM_MARGE);
                const alt = besteN.length > 1 ? middelstePrijs(besteN) : besteN[0];
                return { candidate: alt.candidate, score: alt.score, confidence: 'middel' };
            }
        }
    }

    /* Staart-match → altijd 'laag', ook bij een hoge score. Anders
       presenteert een knäckebröd-met-zeezout zich als zekere zout-match. */
    const confidence = isTailOnlyMatch(ingredientName, gekozen.candidate.name)
        ? 'laag'
        : confidenceFromScore(gekozen.score);
    return { candidate: gekozen.candidate, score: gekozen.score, confidence };
}

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
    if (conv.base !== cand.baseUnit && !isGramMlPaar(conv.base, cand.baseUnit)) return null; // g vs stuk → onvergelijkbaar
    const qtyInBase = qty * conv.factor;
    const cents = qtyInBase * cand.centsPerBaseUnit;
    return Math.round(cents);
}

/* Gram ↔ milliliter: de AI schrijft "40 g mayonaise", Bidfood verkoopt per ml.
   Voor sauzen, zuivel, olie en azijn scheelt dat hooguit ~10%; liever een
   prijs mét "≈" dan het hoofdingrediënt zonder prijs. De regel geeft dat
   door als benadering (unit_approx), zodat het geen stille aanname wordt. */
export function isGramMlPaar(a: BaseUnit, b: BaseUnit): boolean {
    return (a === 'g' && b === 'ml') || (a === 'ml' && b === 'g');
}
