/**
 * Shared helpers voor matching geparseerde prijslijst-rijen tegen
 * `master_products` + `supplier_prices`.
 *
 * NB: dbNormalize MOET exact gelijk blijven aan de generated-column
 * `master_products.naam_normalized` in de database, anders breekt unique-match.
 * Zie ook: src/app/api/pricelist-sync/route.ts (waar dezelfde helpers
 * embedded staan — toekomstige refactor: import van hier).
 */

export interface ParsedProduct {
    naam: string;
    eenheid?: string;
    prijs: number;
    categorie?: string;
    confidence?: number;
}

export interface MasterRow {
    id: number;
    naam: string;
    naam_normalized: string;
}

export interface SupplierPriceSnapshot {
    id: number;
    master_product_id: number | null;
    product_naam: string;
    eenheid: string | null;
    prijs: number;
    actief: boolean;
}

export function dbNormalize(s: string): string {
    return (s || '').toLowerCase().trim();
}

export function strictNorm(s: string): string {
    return (s || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');
}

export function cleanBase(s: string): string {
    return (s || '')
        .toLowerCase()
        .trim()
        .replace(/[\*★☆]+\s*$/g, '')
        .replace(
            /\s+(ca\.?\s+)?\d+([.,]\d+)?\s*(x\s*\d+\s*)?(kg|g|l|ml|stuks?|pak|stks?|krat|fles|doos|bakje|kist|cl|liter)\s*$/i,
            ''
        )
        .replace(/\s+/g, ' ')
        .trim();
}

/** Jaccard over char-bigrams, in-memory fuzzy similarity (0..1). */
export function similarity(a: string, b: string): number {
    const aN = strictNorm(a),
        bN = strictNorm(b);
    if (aN === bN) return 1;
    if (aN.length < 3 || bN.length < 3) return 0;
    const bigrams = (s: string): Set<string> => {
        const set = new Set<string>();
        for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
        return set;
    };
    const aBi = bigrams(aN),
        bBi = bigrams(bN);
    let intersect = 0;
    aBi.forEach((x) => {
        if (bBi.has(x)) intersect++;
    });
    return (2 * intersect) / (aBi.size + bBi.size);
}

export interface MatchResult {
    parsed: ParsedProduct;
    masterId: number | null;
    matchConfidence: number; // 1.0 exact, 0.9 base, 0..1 fuzzy, 0 = unmatched
    currentPrice: number | null;
}

/**
 * Match een lijst geparseerde producten tegen masters + huidige supplier_prices.
 * Returnt voor elk: (masterId | null), match-score, snapshot van huidige prijs
 * (zodat de UI delta_pct kan tonen).
 *
 * Geen DB-writes — pure in-memory. Caller schrijft in org_price_mutations.
 */
export function matchAgainstMasters(
    parsed: ParsedProduct[],
    masters: MasterRow[],
    currentPrices: SupplierPriceSnapshot[]
): MatchResult[] {
    const masterByNorm = new Map<string, MasterRow>();
    const byCleanBase = new Map<string, MasterRow[]>();

    for (const m of masters) {
        masterByNorm.set(m.naam_normalized, m);
        const base = cleanBase(m.naam);
        if (!base) continue;
        const list = byCleanBase.get(base);
        if (list) list.push(m);
        else byCleanBase.set(base, [m]);
    }

    /* Lookup huidige prijs per master+eenheid voor delta_pct */
    const priceByMaster = new Map<string, number>();
    for (const p of currentPrices) {
        if (!p.actief || !p.master_product_id) continue;
        const k = `${p.master_product_id}|${dbNormalize(p.eenheid || 'stuks')}`;
        priceByMaster.set(k, Number(p.prijs));
    }

    const out: MatchResult[] = [];
    for (const p of parsed) {
        const norm = dbNormalize(p.naam);

        /* 1. Exact-match */
        const exact = masterByNorm.get(norm);
        if (exact) {
            const k = `${exact.id}|${dbNormalize(p.eenheid || 'stuks')}`;
            out.push({
                parsed: p,
                masterId: exact.id,
                matchConfidence: 1.0,
                currentPrice: priceByMaster.get(k) ?? null,
            });
            continue;
        }

        /* 2. Clean-base match (1 unieke kandidaat) */
        const base = cleanBase(p.naam);
        if (base) {
            const candidates = byCleanBase.get(base);
            if (candidates && candidates.length === 1) {
                const k = `${candidates[0].id}|${dbNormalize(p.eenheid || 'stuks')}`;
                out.push({
                    parsed: p,
                    masterId: candidates[0].id,
                    matchConfidence: 0.9,
                    currentPrice: priceByMaster.get(k) ?? null,
                });
                continue;
            }
        }

        /* 3. Fuzzy >0.88 */
        let bestScore = 0.88;
        let bestMatch: MasterRow | null = null;
        for (const m of masters) {
            const score = similarity(p.naam, m.naam);
            if (score > bestScore) {
                bestScore = score;
                bestMatch = m;
            }
        }
        if (bestMatch) {
            const k = `${bestMatch.id}|${dbNormalize(p.eenheid || 'stuks')}`;
            out.push({
                parsed: p,
                masterId: bestMatch.id,
                matchConfidence: bestScore,
                currentPrice: priceByMaster.get(k) ?? null,
            });
        } else {
            out.push({ parsed: p, masterId: null, matchConfidence: 0, currentPrice: null });
        }
    }

    return out;
}
