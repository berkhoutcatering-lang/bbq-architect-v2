/* unitPrice — de terugreken-canon: grootverpakking → eenheidsprijs → gerechtkost.

   Eén plek waar pak-prijzen genormaliseerd worden naar de base_quantity/base_unit
   conventie van `components` (per 100 g, per 100 ml, per 1 stuk), zodat
   gerecht_components.cost_at_use_cents = (quantity_used / base_quantity) * base_cost_cents
   altijd klopt met wat de cateraar daadwerkelijk bij de groothandel betaalde.

   Hard rule: dit is code-rekenwerk, nooit AI-rekenwerk. AI mag een pak-prijs en
   inhoud UIT een foto voorstellen; de euro's per eenheid komen altijd hieruit. */

export type PackUnit = 'g' | 'kg' | 'ml' | 'liter' | 'stuk' | 'portie';

export const PACK_UNITS: PackUnit[] = ['g', 'kg', 'ml', 'liter', 'stuk', 'portie'];

export interface BaseFields {
    base_quantity: number;
    base_unit: string;
    base_cost_cents: number;
}

/* Gewichten normaliseren we naar "per 100 g" en volumes naar "per 100 ml"
   (de bestaande bibliotheek-conventie: "100g gegrilde ananas = €1,43").
   Stuks/porties naar "per 1". Zo blijven gerecht-doseringen (g/ml/stuk)
   direct deelbaar zonder unit-conversie in de kostprijs-formule. */
export function packToBase(
    packPriceCents: number,
    packQuantity: number,
    packUnit: PackUnit,
): BaseFields | null {
    if (!Number.isFinite(packPriceCents) || packPriceCents < 0) return null;
    if (!Number.isFinite(packQuantity) || packQuantity <= 0) return null;

    switch (packUnit) {
        case 'g':
        case 'kg': {
            const grams = packUnit === 'kg' ? packQuantity * 1000 : packQuantity;
            return {
                base_quantity: 100,
                base_unit: 'g',
                base_cost_cents: Math.round((packPriceCents * 100) / grams),
            };
        }
        case 'ml':
        case 'liter': {
            const ml = packUnit === 'liter' ? packQuantity * 1000 : packQuantity;
            return {
                base_quantity: 100,
                base_unit: 'ml',
                base_cost_cents: Math.round((packPriceCents * 100) / ml),
            };
        }
        case 'stuk':
        case 'portie':
            return {
                base_quantity: 1,
                base_unit: packUnit,
                base_cost_cents: Math.round(packPriceCents / packQuantity),
            };
        default:
            return null;
    }
}

/* Multipack → base. Een doos "24 × 330 ml" of "6 × 1,5 L" heeft een
   pack_count × content_per_item-structuur die packToBase (één scalaire
   hoeveelheid) niet kent. Deze helper rekent eerst de totale inhoud uit en
   normaliseert dan via packToBase, zodat de per-100-conventie exact blijft.

   contentUnit accepteert ook 'piece' (= 'stuk') zodat het aansluit op het
   leverancierssync-observation-schema. */
export type ContentPackUnit = PackUnit | 'piece';

export function packToBaseMulti(
    packPriceCents: number,
    packCount: number,
    contentPerItem: number,
    contentUnit: ContentPackUnit,
): BaseFields | null {
    if (!Number.isFinite(packCount) || packCount <= 0) return null;
    if (!Number.isFinite(contentPerItem) || contentPerItem <= 0) return null;
    const unit: PackUnit = contentUnit === 'piece' ? 'stuk' : contentUnit;
    return packToBase(packPriceCents, packCount * contentPerItem, unit);
}

/* "€12.50 / kg", "€6.80 / liter", "€0.42 / stuk" — de herkenbare
   groothandel-eenheid, los van hoe de base intern opgeslagen is. */
export function unitPriceLabel(baseCostCents: number, baseQuantity: number, baseUnit: string): string | null {
    if (!Number.isFinite(baseCostCents) || !Number.isFinite(baseQuantity) || baseQuantity <= 0) return null;
    const euro = (cents: number) => '€ ' + (cents / 100).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    switch (baseUnit) {
        case 'g':
            return `${euro((baseCostCents * 1000) / baseQuantity)} / kg`;
        case 'kg':
            return `${euro(baseCostCents / baseQuantity)} / kg`;
        case 'ml':
            return `${euro((baseCostCents * 1000) / baseQuantity)} / liter`;
        case 'liter':
            return `${euro(baseCostCents / baseQuantity)} / liter`;
        case 'stuk':
        case 'portie':
            return `${euro(baseCostCents / baseQuantity)} / ${baseUnit}`;
        default:
            return null;
    }
}

/* Hetzelfde getal als unitPriceLabel, maar als cijfer — zodat sorteren op
   "duurste eerst" €/kg met €/kg vergelijkt en niet een doos van 5 kg met
   100 g bavette. Bewust dezelfde switch als unitPriceLabel hierboven: gaan die
   twee uit elkaar lopen, dan zegt het label iets anders dan de volgorde.
   Retourneert null voor een eenheid die we niet kunnen normaliseren. */
export function unitPriceCents(baseCostCents: number, baseQuantity: number, baseUnit: string): number | null {
    if (!Number.isFinite(baseCostCents) || !Number.isFinite(baseQuantity) || baseQuantity <= 0) return null;
    switch (baseUnit) {
        case 'g':
            return (baseCostCents * 1000) / baseQuantity;
        case 'kg':
            return baseCostCents / baseQuantity;
        case 'ml':
            return (baseCostCents * 1000) / baseQuantity;
        case 'liter':
            return baseCostCents / baseQuantity;
        case 'stuk':
        case 'portie':
            return baseCostCents / baseQuantity;
        default:
            return null;
    }
}

/* Voorbeeldregel voor de rekenhulp: laat zien wat een realistische dosering
   in een gerecht kost ("200 g in een gerecht = €2,50"). */
export function exampleUseCost(base: BaseFields): { qty: number; unit: string; cents: number } | null {
    if (base.base_quantity <= 0) return null;
    let qty: number;
    switch (base.base_unit) {
        case 'g': qty = 200; break;
        case 'kg': qty = 0.2; break;
        case 'ml': qty = 100; break;
        case 'liter': qty = 0.1; break;
        default: qty = 1; break;
    }
    return {
        qty,
        unit: base.base_unit,
        cents: Math.round((qty / base.base_quantity) * base.base_cost_cents),
    };
}

/* ── Snijverlies (yield) ─────────────────────────────────────────────────────
   Sam koopt bavette voor €3,29/100 g, maar van 1 kg inkoop houdt hij ~700 g
   bruikbaar over (vet, pees, bakverlies). 40 g op het bord kost dus geen €1,32
   maar €1,88. Zonder deze factor staat de hele menukaart structureel te laag.

   HARDE REGEL: `base_cost_cents` blijft de ONGECORRIGEERDE inkoopprijs — dat is
   wat op de factuur staat en wat de prijs-verversing terugschrijft. De deling
   gebeurt hier, in de formule. Zou je 'm in de opgeslagen prijs vouwen, dan
   ziet priceRefresh.ts het als een handmatige override (en ververst nooit meer)
   en priceRefreshBoughtIn.ts overschrijft 'm bij de eerstvolgende prijsupdate.

   Deze helpers spiegelen de SQL-trigger 1-op-1 (migratie 20260729120000), zodat
   DB en app nooit uit elkaar lopen. Code-rekenwerk, nooit AI. */

/** Klemt een opgeslagen/ingevoerde yield naar (0,1]. Alles wat geen bruikbaar
 *  getal is → 1.0 (= geen verlies), zodat een ontbrekend veld nooit de kostprijs
 *  opblaast. */
export function normalizeYield(y: unknown): number {
    const n = Number(y);
    if (!Number.isFinite(n) || n <= 0) return 1;
    return n > 1 ? 1 : n;
}

/** De prijs waarmee we in gerechten rekenen: inkoopprijs gedeeld door wat je
 *  overhoudt. €3,29/100 g bij 70% → €4,70/100 g. */
export function effectiveBaseCostCents(baseCostCents: number, yieldFactor: unknown): number {
    const c = Number(baseCostCents);
    if (!Number.isFinite(c)) return 0;
    return Math.round(c / normalizeYield(yieldFactor));
}

/** Kostprijs van één gebruik in een gerecht. Spiegelt de DB-trigger exact:
 *  GREATEST(0, ROUND(quantity_used / base_quantity * base_cost_cents / yield)). */
export function costAtUseCents(opts: {
    quantityUsed: number;
    baseQuantity: number;
    baseCostCents: number;
    yieldFactor?: unknown;
    /** Eenheid waarin op het gerecht gerekend wordt (bv. 'kg'). */
    usedUnit?: string;
    /** Basis-eenheid van de component (bv. 'g' bij "per 100 g"). */
    baseUnit?: string;
}): number {
    const { quantityUsed, baseQuantity, baseCostCents, usedUnit, baseUnit } = opts;
    let qty = Number(quantityUsed);
    const base = Number(baseQuantity);
    const cost = Number(baseCostCents);
    if (!Number.isFinite(qty) || !Number.isFinite(base) || base === 0 || !Number.isFinite(cost)) return 0;

    /* Eenheden gelijktrekken vóór de deling. Zonder dit gaf "2,5 kg" op een
       component van "100 g" → 2,5/100 = €0,00 i.p.v. €1,50 (factor 1000).
       Alleen omrekenen als beide eenheden bekend zijn én in dezelfde familie
       zitten; anders laten we de hoeveelheid staan (het gedrag van vóór deze
       fix), zodat een onmogelijke combinatie niet stil een verzonnen getal
       oplevert — de UI hoort die combinatie te blokkeren en te melden. */
    if (usedUnit && baseUnit) {
        const converted = convertQty(qty, usedUnit, baseUnit);
        if (converted !== null) qty = converted;
    }

    const y = normalizeYield(opts.yieldFactor);
    return Math.max(0, Math.round((qty / base) * cost / y));
}

/** Hoeveel je moet INKOPEN voor wat er op het bord ligt. 40 g bij 70% → 57 g. */
export function purchaseQtyForUse(quantityUsed: number, yieldFactor: unknown): number {
    const qty = Number(quantityUsed);
    if (!Number.isFinite(qty)) return 0;
    return qty / normalizeYield(yieldFactor);
}

/** Mensentaal-herformulering onder het invoerveld: "Van 1 kg inkoop houd je
 *  700 g over." Eenheid-bewust, want stuks lezen anders dan gewicht. */
export function yieldRestatement(yieldFactor: unknown, baseUnit: string): string {
    const y = normalizeYield(yieldFactor);
    if (y >= 1) return 'Geen verlies — je gebruikt alles wat je inkoopt.';
    const pct = Math.round(y * 1000) / 10;
    switch (baseUnit) {
        case 'g':
        case 'kg':
            return `Van 1 kg inkoop houd je ${Math.round(y * 1000)} g over (${pct}%).`;
        case 'ml':
        case 'liter':
            return `Van 1 liter inkoop houd je ${Math.round(y * 1000)} ml over (${pct}%).`;
        default:
            return `Van 10 ${baseUnit || 'stuks'} inkoop houd je er ${(y * 10).toFixed(1).replace('.0', '')} over (${pct}%).`;
    }
}

/* ── Eenheid-conversie ───────────────────────────────────────────────────────
   De kostprijs-formule deelde quantity_used door base_quantity zonder naar de
   eenheden te kijken. Component per 100 g + "2,5 kg" gebruikt gaf dus
   2,5/100 × prijs = €0,00 i.p.v. €1,50 — een factor 1000, en stil.

   Binnen een familie rekenen we exact om (g↔kg, ml↔liter, stuk↔portie).
   Tussen families (gram vs milliliter, stuk vs gram) kán het niet zonder
   dichtheid of stukgewicht: dan geven we null terug en laat de app het zien
   i.p.v. een verzonnen getal. */

export type UnitFamily = 'gewicht' | 'volume' | 'stuk';

const UNIT_TO_BASE: Record<string, { family: UnitFamily; factor: number }> = {
    g:      { family: 'gewicht', factor: 1 },
    gram:   { family: 'gewicht', factor: 1 },
    kg:     { family: 'gewicht', factor: 1000 },
    kilo:   { family: 'gewicht', factor: 1000 },
    ml:     { family: 'volume',  factor: 1 },
    cl:     { family: 'volume',  factor: 10 },
    dl:     { family: 'volume',  factor: 100 },
    l:      { family: 'volume',  factor: 1000 },
    liter:  { family: 'volume',  factor: 1000 },
    stuk:   { family: 'stuk',    factor: 1 },
    stuks:  { family: 'stuk',    factor: 1 },
    portie: { family: 'stuk',    factor: 1 },
};

export function unitFamily(unit: string): UnitFamily | null {
    return UNIT_TO_BASE[String(unit || '').trim().toLowerCase()]?.family ?? null;
}

/** Kunnen deze twee eenheden in elkaar omgerekend worden? */
export function unitsCompatible(a: string, b: string): boolean {
    const fa = unitFamily(a); const fb = unitFamily(b);
    return fa !== null && fa === fb;
}

/** Reken een hoeveelheid om naar een andere eenheid binnen dezelfde familie.
 *  null = niet mogelijk (andere familie of onbekende eenheid) — de aanroeper
 *  moet dat tonen, niet gokken. */
export function convertQty(qty: number, from: string, to: string): number | null {
    const f = UNIT_TO_BASE[String(from || '').trim().toLowerCase()];
    const t = UNIT_TO_BASE[String(to || '').trim().toLowerCase()];
    if (!f || !t || f.family !== t.family) return null;
    const n = Number(qty);
    if (!Number.isFinite(n)) return null;
    return (n * f.factor) / t.factor;
}

/* De omgekeerde van unitPriceCents: je kent een leverancierprijs (kost X centen
   voor Y van eenheid Z) en wilt weten wat JOUW basis kost.
   "€32,90 per 1 kg" met een basis van 100 g → 329 centen. Met een basis van
   1 kg → 3290 centen.

   Bestaat omdat de component-drawer bij het openen de kostprijs opnieuw afleidde
   uit de gekoppelde leverancier, maar daarbij óók de basis terugzette naar
   100 g. Zette je hem op 1 kg, dan stond er bij het heropenen weer 100 g. De
   prijs hoort mee te bewegen, de basis is jouw keuze.

   null = de eenheden zitten in verschillende families (bv. jouw basis in liter,
   de leverancierprijs per kg). Dan niet gokken maar laten staan wat er stond. */
export function costForBasisCents(opts: {
    /** wat de leverancier kost: srcCostCents voor srcQuantity van srcUnit */
    srcCostCents: number;
    srcQuantity: number;
    srcUnit: string;
    /** de basis die de gebruiker zelf koos */
    baseQuantity: number;
    baseUnit: string;
}): number | null {
    const { srcCostCents, srcQuantity, srcUnit, baseQuantity, baseUnit } = opts;
    if (!Number.isFinite(srcCostCents) || srcCostCents < 0) return null;
    if (!Number.isFinite(srcQuantity) || srcQuantity <= 0) return null;
    if (!Number.isFinite(baseQuantity) || baseQuantity <= 0) return null;
    const basisInLeveranciersEenheid = convertQty(baseQuantity, baseUnit, srcUnit);
    if (basisInLeveranciersEenheid === null) return null;
    return Math.round((srcCostCents / srcQuantity) * basisInLeveranciersEenheid);
}

/** Welke eenheden mag je kiezen bij een component met deze basis-eenheid? */
export function compatibleUnits(baseUnit: string): string[] {
    switch (unitFamily(baseUnit)) {
        case 'gewicht': return ['g', 'kg'];
        case 'volume':  return ['ml', 'liter'];
        case 'stuk':    return ['stuk', 'portie'];
        default:        return [String(baseUnit || 'stuk')];
    }
}
