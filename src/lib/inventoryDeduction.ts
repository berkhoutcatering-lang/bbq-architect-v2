/**
 * Shared inventory-aftrek helper.
 *
 * Vóór deze module hadden Service Mode (gang served → aftrek) en Prep Counter
 * (prep-step done → aftrek) elk een eigen substring-matching block. Dat had 2
 * problemen:
 *   1. Substring-match `includes` levert willekeurig de éérste hit op — bij
 *      "Pulled pork shoulder" + "Pulled pork rub" pakte het de verkeerde rij.
 *   2. Beide pagina's parsten qty-strings zelf; subtle parser-drift tussen ze.
 *
 * Deze module:
 *   - parseQty(str): één regex, één bron van waarheid
 *   - matchInventory(name, inv): scoring (exact > prefix > include, kortste wins)
 *   - deductFromInventory(...): doet de hele flow incl. stock-movement POST
 *
 * Belangrijk: alle aftrek-aanroepen blijven best-effort (no-throw). Service-
 * en prep-flow mogen nooit blokkeren als de stock-call faalt.
 */

export interface InventoryRow {
    id: number | string;
    naam: string;
    current_stock?: number | null;
    unit?: string | null;
}

export interface DeductionLine {
    /* Direct inventory_id wins — geen matching nodig. */
    inventory_id?: number | string;
    /* Anders: naam-string voor de gedeelde resolver (server-side). */
    name?: string;
    /* Hoeveelheid in `unit` — server rekent om naar de inventory-eenheid. */
    qty: number;
    /* Eenheid van qty (g/ml/kg/L/stuks…). Nodig voor correcte conversie. */
    unit?: string | null;
    /* Vrije note voor stock_movements log. */
    note?: string;
    /* Optioneel: 'usage' (default) | 'waste' | 'correction'. */
    type?: 'usage' | 'waste' | 'correction';
}

/** Normaliseer naam: lowercase, alleen alfanum + spaties, getrimd. */
export function normalizeInventoryName(s: string): string {
    return (s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
}

/** Parse "1.5 kg pulled pork" / "300g" / "8 stuks" / "2.4kg pulled pork" → qty + unit + naam. */
export function parseQty(str: string): { qty: number; unit: string | null; rest: string } | null {
    if (!str) return null;
    const m = str.match(/^([\d.,]+)\s*(kg|g|l|ml|stuks?|pak|krat|fles|bos)?\s*(.+)?$/i);
    if (!m) return null;
    const qty = parseFloat(m[1].replace(',', '.'));
    if (isNaN(qty) || qty <= 0) return null;
    return {
        qty,
        unit: m[2] ? m[2].toLowerCase() : null,
        rest: (m[3] || '').trim(),
    };
}

/**
 * Score-based matching tegen inventory.
 *
 * Prioriteit:
 *  - exact-match (genormaliseerd) → score 100
 *  - inventory.naam start met query → score 80 - lengte-verschil
 *  - query start met inventory.naam → score 60 - lengte-verschil
 *  - beide bevatten → score 40 - lengte-verschil
 *
 * Hoogste score wint; bij gelijkspel wint de kortste inventory-naam (specifieker).
 *
 * Returnt `null` als er geen plausibele match is (alle kandidaten scoren ≤ 0).
 */
export function matchInventory(query: string, inventory: InventoryRow[]): InventoryRow | null {
    const q = normalizeInventoryName(query);
    if (q.length < 3) return null;

    let best: { row: InventoryRow; score: number } | null = null;
    for (const row of inventory) {
        const n = normalizeInventoryName(row.naam || '');
        if (!n) continue;
        let score = 0;
        if (n === q) score = 100;
        else if (n.startsWith(q)) score = 80 - Math.abs(n.length - q.length);
        else if (q.startsWith(n)) score = 60 - Math.abs(n.length - q.length);
        else if (n.includes(q) || q.includes(n)) score = 40 - Math.abs(n.length - q.length);
        if (score <= 0) continue;
        if (!best || score > best.score || (score === best.score && n.length < normalizeInventoryName(best.row.naam || '').length)) {
            best = { row, score };
        }
    }
    return best?.row || null;
}

/**
 * Boek verbruik-lines af tegen inventory via de server-route /api/inventory/consume.
 *
 * De naam-resolving (exact → alias → meat_taxonomy, dezelfde als de demand-motor)
 * én unit-conversie én de atomaire mutatie gebeuren nu SERVER-SIDE, zodat vraag en
 * aftrek op dezelfde inventory_id landen en er geen lost-update-race is (fix #1).
 * Caller hoeft niet meer om te rekenen: geef qty in de eenheid van `unit` mee.
 *
 * De tweede parameter is niet meer nodig (matching is server-side); hij blijft
 * optioneel voor achterwaartse compatibiliteit en wordt genegeerd.
 *
 * Returns: { posted, skipped, results } (best-effort — geen throw).
 */
export async function deductFromInventory(
    lines: DeductionLine[],
    _legacyInventory?: InventoryRow[],
): Promise<{ posted: number; skipped: number; results?: unknown[] }> {
    const clean = lines.filter(l => Number.isFinite(l.qty) && l.qty > 0);
    if (clean.length === 0) return { posted: 0, skipped: 0 };
    try {
        const res = await fetch('/api/inventory/consume', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                lines: clean.map(l => ({
                    inventory_id: l.inventory_id != null ? Number(l.inventory_id) : undefined,
                    name: l.name,
                    qty: l.qty,
                    unit: l.unit ?? null,
                    note: l.note || '',
                })),
            }),
        });
        if (!res.ok) return { posted: 0, skipped: clean.length };
        const json = await res.json();
        return { posted: json.posted ?? 0, skipped: json.skipped ?? 0, results: json.results };
    } catch {
        return { posted: 0, skipped: clean.length };
    }
}
