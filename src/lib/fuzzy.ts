/**
 * Lichtgewicht typfout-tolerant zoeken (trigram-similarity, pg_trgm-stijl) — puur
 * in JS, zonder database-uitbreiding.
 *
 * Waarom niet in de database: pg_trgm staat wel aan, maar een index + zoekfunctie
 * op de catalogus zou een migratie vragen. Voor de catalogus-grootte volstaat een
 * JS-fallback die pas aanslaat als de gewone (substring) zoek weinig oplevert.
 * Zo vindt "komkomer" alsnog "komkommer" en "bidfoud" alsnog "Bidfood".
 *
 * De similarity is de Jaccard-index over trigram-sets — dezelfde maat die pg_trgm
 * gebruikt — zodat de drempel (0..1) zich net zo gedraagt als daar.
 */

/** Normaliseer voor fuzzy-vergelijk: kleine letters, accenten weg, alleen a-z0-9 + spatie. */
export function normalizeForFuzzy(s: string): string {
    return s
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '') // diacrieten weg (é → e)
        .replace(/[^a-z0-9 ]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/** Trigram-set van een string, pg_trgm-stijl: per woord met randspatie-padding
 *  (2 voor, 1 na) zodat woordgrenzen meetellen. */
export function trigrams(input: string): Set<string> {
    const set = new Set<string>();
    const norm = normalizeForFuzzy(input);
    if (!norm) return set;
    for (const word of norm.split(' ')) {
        if (!word) continue;
        const padded = `  ${word} `;
        for (let i = 0; i + 3 <= padded.length; i++) set.add(padded.slice(i, i + 3));
    }
    return set;
}

/** Trigram-similarity (Jaccard, 0..1) tussen twee strings, zoals pg_trgm.similarity. */
export function trigramSimilarity(a: string, b: string): number {
    const ta = trigrams(a);
    const tb = trigrams(b);
    if (ta.size === 0 || tb.size === 0) return 0;
    let inter = 0;
    for (const t of ta) if (tb.has(t)) inter++;
    const union = ta.size + tb.size - inter;
    return union === 0 ? 0 : inter / union;
}

/** Woord-bewuste similarity (0..1): elke getypte term wordt vergeleken met het
 *  béste passende wóórd in de doel-naam; de zwakste schakel telt (alle getypte
 *  woorden moeten érgens op lijken). Zo verdrinkt een korte tikfout ("copa")
 *  niet in een lange productnaam ("Coppa Stagionata, stuk 650 gram") — we kijken
 *  naar het woord "coppa", niet naar de hele zin. Vergelijkbaar met pg_trgm's
 *  word_similarity. */
export function tokenSetSimilarity(query: string, target: string): number {
    const qs = normalizeForFuzzy(query).split(' ').filter(Boolean);
    const ts = normalizeForFuzzy(target).split(' ').filter(Boolean);
    if (qs.length === 0 || ts.length === 0) return 0;
    let weakest = 1;
    for (const qw of qs) {
        let best = 0;
        for (const tw of ts) {
            const s = trigramSimilarity(qw, tw);
            if (s > best) best = s;
            if (best === 1) break;
        }
        if (best < weakest) weakest = best;
        if (weakest === 0) break;
    }
    return weakest;
}

/** Platte 3-teken-shingles (zonder spatie/padding) om DB-kandidaten mee op te
 *  halen via een OR van ilike-substrings. Een product dat één trigram deelt met
 *  de (mogelijk verkeerd gespelde) zoekterm wordt zo kandidaat; de fijn-weging
 *  gebeurt daarna met trigramSimilarity. Max `max`, gededupliceerd. */
export function fuzzyShingles(q: string, max = 8): string[] {
    const norm = normalizeForFuzzy(q).replace(/ /g, '');
    const out: string[] = [];
    const seen = new Set<string>();
    for (let i = 0; i + 3 <= norm.length; i++) {
        const g = norm.slice(i, i + 3);
        if (!seen.has(g)) { seen.add(g); out.push(g); }
        if (out.length >= max) break;
    }
    /* Te kort voor een trigram (2 tekens): val terug op de hele term. */
    if (out.length === 0 && norm.length >= 2) out.push(norm);
    return out;
}
