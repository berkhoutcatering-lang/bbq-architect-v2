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
    const euro = (cents: number) => `€${(cents / 100).toFixed(2)}`;
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
