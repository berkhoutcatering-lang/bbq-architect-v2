/**
 * Pure helpers voor mise-en-place aggregatie.
 *
 * Geëxtraheerd uit acceptance-workflow.ts zodat tests deze kunnen
 * importeren zonder de Supabase-client mee te slepen (en daarmee een
 * heel auth/SSR boundary in de test-runner).
 */

export interface MiseSourceDish {
    naam?: string;
    /* JSONB-veld zoals het uit gerechten komt. Kan ook een string-JSON
       zijn bij legacy data; aggregateMiseFromDishes parsed dat. */
    ingredient_costs?: any;
}

export interface MiseEntry {
    item: string;
    qty: string;
}

/** Format kg/g/L/ml naar meest leesbare eenheid.
 *   - >= 1 kg → "1.5 kg"
 *   - < 1 kg → "750 g"
 *   - >= 1 L → "1.2 L"
 *   - < 1 L → "300 ml"
 *   - andere units (stuks/pak/...) → onveranderd doorgeven met afronding op 1 decimaal. */
export function formatMiseQty(amount: number, unit: string): string {
    const u = (unit || '').toLowerCase();
    if (amount <= 0) return '';
    if (u === 'kg') {
        if (amount < 1) return Math.round(amount * 1000) + ' g';
        return Number(amount.toFixed(2)).toString().replace('.', ',') + ' kg';
    }
    if (u === 'g') {
        if (amount >= 1000) return Number((amount / 1000).toFixed(2)).toString().replace('.', ',') + ' kg';
        return Math.round(amount) + ' g';
    }
    if (u === 'l') {
        if (amount < 1) return Math.round(amount * 1000) + ' ml';
        return Number(amount.toFixed(2)).toString().replace('.', ',') + ' L';
    }
    if (u === 'ml') {
        if (amount >= 1000) return Number((amount / 1000).toFixed(2)).toString().replace('.', ',') + ' L';
        return Math.round(amount) + ' ml';
    }
    /* stuks / pak / krat / fles / bos — afgerond. */
    return Math.ceil(amount) + ' ' + (unit || 'stuks');
}

/**
 * Aggregeer ingredient_costs uit alle dishes van een course → mise array.
 *
 * Per ingredient: totaal = sum over alle dishes van (qty_pp ÷ yield × guests).
 * yield-correctie verdisconteerd zodat we ruim genoeg inkopen (lager yield =
 * meer aankopen).
 *
 * Dish-namen zijn case-insensitief lookup tegen `gerechten.naam`. Onbekende
 * dishes worden silent overgeslagen (caller heeft al validatie). Mengeenheden
 * voor zelfde ingredient (bv. "kg" + "g") blijven gescheiden zodat geen
 * verkeerde optellingen ontstaan.
 */
export function aggregateMiseFromDishes(
    dishes: string[],
    gerechten: MiseSourceDish[],
    guests: number,
): MiseEntry[] {
    if (guests <= 0 || dishes.length === 0) return [];

    /* Dual-map: totals voor qty/unit, names voor original-casing per key. */
    const totals = new Map<string, { qty: number; unit: string }>();
    const names = new Map<string, string>();

    for (const dishName of dishes) {
        const g = gerechten.find(x => x.naam && x.naam.toLowerCase().trim() === dishName.toLowerCase().trim());
        if (!g) continue;
        let costs: any = g.ingredient_costs;
        if (typeof costs === 'string') { try { costs = JSON.parse(costs); } catch { costs = []; } }
        if (!Array.isArray(costs)) continue;

        for (const c of costs) {
            if (!c || !c.naam) continue;
            const qtyPp = Number(c.qty_pp) || 0;
            const yld = Number(c.yield) || 1;
            const unit = (c.unit || 'stuks').toLowerCase();
            const total = (qtyPp / Math.max(yld, 0.01)) * guests;
            if (total <= 0) continue;

            const key = c.naam.toLowerCase().trim() + '|' + unit;
            const cur = totals.get(key);
            if (cur) cur.qty += total;
            else {
                totals.set(key, { qty: total, unit });
                names.set(key, c.naam);
            }
        }
    }

    const out: MiseEntry[] = [];
    for (const [key, v] of totals) {
        out.push({ item: names.get(key) || key.split('|')[0], qty: formatMiseQty(v.qty, v.unit) });
    }
    return out.sort((a, b) => a.item.localeCompare(b.item));
}
