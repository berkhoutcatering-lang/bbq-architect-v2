/* ═══════════════════════════════════════════════════════════════════
   PRICE-INTELLIGENCE — pure helpers.

   Geëxtraheerd uit PriceIntelligenceClient.tsx (P0.25 slice 2 preparation).
   Alle functies zijn referentieel transparant: input in, output uit, geen
   side-effects of state. Testbaar in isolatie (volgende sessie: vitest-cases
   voor detectDuplicates en fuzzyScore die de echte business-regels dekken).
   ═══════════════════════════════════════════════════════════════════ */

/* ─── Euro-formatter ─────────────────────────────────────────── */

export function fmt2(n: number | string | null | undefined) {
    if (n === null || n === undefined || n === '') return '€ 0,00';
    const v = parseFloat(String(n));
    return isNaN(v) ? '€ 0,00' : '€ ' + v.toFixed(2).replace('.', ',');
}

/* ─── Naam-normalisatie ──────────────────────────────────────── */

export function normalizeLeverancier(s?: string | null): string {
    if (!s) return '';
    let n = String(s).toLowerCase().trim();
    // Verwijder dingen tussen haakjes: "Makro (Metro Cash & Carry)" → "makro"
    n = n.replace(/\s*\([^)]*\)\s*/g, '').trim();
    // Verwijder bedrijfs-suffixes
    n = n.replace(/\s+(b\.?\s*v\.?|n\.?\s*v\.?|vof|v\.?o\.?f\.?|holding|groep|group)\.?$/i, '').trim();
    // Collapse meerdere spaties
    n = n.replace(/\s+/g, ' ');
    return n;
}

export function normalizeFactuurnummer(s?: string | null): string {
    if (!s) return '';
    return String(s).toLowerCase().replace(/[\s\-_/\\.]/g, '').trim();
}

/* ─── Fuzzy match ────────────────────────────────────────────── */

/** Simpele fuzzy match score tussen 0 en 1 */
export function fuzzyScore(a: string, b: string): number {
    const na = a.toLowerCase().trim();
    const nb = b.toLowerCase().trim();
    if (!na || !nb) return 0;
    if (na === nb) return 1;
    if (na.includes(nb) || nb.includes(na)) return 0.85;
    // Word-overlap
    const wordsA = na.split(/\s+/).filter(w => w.length > 2);
    const wordsB = nb.split(/\s+/).filter(w => w.length > 2);
    if (wordsA.length === 0 || wordsB.length === 0) return 0;
    const common = wordsA.filter(w => wordsB.some(x => x.includes(w) || w.includes(x)));
    return common.length / Math.max(wordsA.length, wordsB.length);
}

/* ─── Duplicate detection ────────────────────────────────────── */

export type DupeMatch = {
    type: 'exact' | 'likely' | 'possible';
    existing: any;
    reasons: string[];
};

export function detectDuplicates(
    candidate: { leverancier?: string | null; factuurnummer?: string | null; datum?: string | null; totaal_incl?: number | string | null },
    existing: any[] = [],
    excludeId?: number,
): DupeMatch[] {
    const matches: DupeMatch[] = [];
    const candLev = normalizeLeverancier(candidate.leverancier);
    const candNum = normalizeFactuurnummer(candidate.factuurnummer);
    const candIncl = parseFloat(String(candidate.totaal_incl ?? 0));
    const candDatum = candidate.datum;

    for (const ex of existing) {
        if (excludeId && ex.id === excludeId) continue;
        const exLev = normalizeLeverancier(ex.leverancier);
        const exNum = normalizeFactuurnummer(ex.factuurnummer);
        const exIncl = parseFloat(String(ex.totaal_incl ?? 0));
        const exDatum = ex.datum;

        const reasons: string[] = [];
        let score = 0;
        let sameFactNr = false;
        let sameLev = false;

        if (candNum && exNum && candNum === exNum) { reasons.push('Zelfde factuurnummer'); score += 3; sameFactNr = true; }
        if (candLev && exLev && candLev === exLev) { reasons.push('Zelfde leverancier'); score += 1; sameLev = true; }
        if (candIncl > 0 && exIncl > 0 && Math.abs(candIncl - exIncl) < 0.02) { reasons.push('Zelfde bedrag'); score += 2; }
        if (candDatum && exDatum && candDatum === exDatum) { reasons.push('Zelfde datum'); score += 1; }

        // Classificatie:
        // EXACT: factuurnr + leverancier matchen → 100% dubbel
        // LIKELY: alles behalve factuurnr (bedrag + datum + leverancier) → zeer waarschijnlijk
        // POSSIBLE: bedrag + datum zonder leverancier match → check handmatig
        if (sameFactNr && sameLev) {
            matches.push({ type: 'exact', existing: ex, reasons });
        } else if (score >= 4) {
            matches.push({ type: 'likely', existing: ex, reasons });
        } else if (score >= 3 && reasons.includes('Zelfde bedrag') && reasons.includes('Zelfde datum')) {
            matches.push({ type: 'possible', existing: ex, reasons });
        }
    }

    // Sorteer: exact > likely > possible
    const prio: Record<string, number> = { exact: 3, likely: 2, possible: 1 };
    matches.sort((a, b) => prio[b.type] - prio[a.type]);
    return matches;
}

/** Vind paren van duplicates in een bestaande lijst (voor opruim-functie) */
export function findDuplicateGroups(list: any[]): any[][] {
    const groups: any[][] = [];
    const seen = new Set<number>();
    for (let i = 0; i < list.length; i++) {
        if (seen.has(list[i].id)) continue;
        const dupes = detectDuplicates(list[i], list, list[i].id)
            .filter(m => m.type === 'exact' || m.type === 'likely')
            .map(m => m.existing);
        if (dupes.length > 0) {
            const group = [list[i], ...dupes];
            group.forEach(x => seen.add(x.id));
            groups.push(group);
        }
    }
    return groups;
}

/* ─── Inventory matching ─────────────────────────────────────── */

export type InventoryMatch = { item: any; confidence: number };

/** Match een factuur-regel tegen bestaande voorraad */
export function matchInventoryItem(productNaam: string, inventory: any[]): InventoryMatch | null {
    if (!productNaam || !inventory || inventory.length === 0) return null;
    let best: InventoryMatch | null = null;
    for (const item of inventory) {
        if (!item.naam) continue;
        const score = fuzzyScore(productNaam, item.naam);
        if (score > 0.5 && (!best || score > best.confidence)) {
            best = { item, confidence: score };
        }
    }
    return best;
}

/** Haal prijshistorie op voor een product uit supplier_prices + eerdere factuurregels.
 *  Gebruikt prijs_normaal (reguliere stuksprijs) wanneer beschikbaar — anders zie je
 *  bulkkorting als prijsdaling, wat het signaal vertroebelt. */
export function getProductPriceHistory(productNaam: string, supplierPrices: any[], invoices: any[]): { prijs: number; datum?: string; bron: 'csv' | 'factuur' }[] {
    const history: { prijs: number; datum?: string; bron: 'csv' | 'factuur' }[] = [];
    const low = (productNaam || '').toLowerCase().trim();
    if (!low) return [];

    // Uit supplier_prices tabel
    for (const sp of supplierPrices || []) {
        if (!sp.product_naam) continue;
        if (fuzzyScore(low, sp.product_naam) > 0.5) {
            history.push({ prijs: parseFloat(sp.prijs) || 0, datum: sp.datum, bron: 'csv' });
        }
    }
    // Uit eerder gescande factuur-regels (via raw_ai_response)
    for (const inv of invoices || []) {
        const regels = inv.raw_ai_response?.regels || [];
        for (const r of regels) {
            if (!r.product_naam) continue;
            if (fuzzyScore(low, r.product_naam) > 0.6) {
                const referentiePrijs = r.prijs_normaal != null && r.prijs_normaal > 0
                    ? parseFloat(r.prijs_normaal)
                    : parseFloat(r.prijs_per_eenheid) || 0;
                history.push({ prijs: referentiePrijs, datum: inv.datum, bron: 'factuur' });
            }
        }
    }
    // Sort nieuwste eerst
    history.sort((a, b) => {
        if (!a.datum) return 1;
        if (!b.datum) return -1;
        return b.datum.localeCompare(a.datum);
    });
    return history.slice(0, 8);
}
