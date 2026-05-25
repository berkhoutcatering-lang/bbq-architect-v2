/* ═══════════════════════════════════════════════════════════════
   Menu & Recepten — Helpers
   Mapping van Supabase Gerecht naar UI-vriendelijke shape, gang
   gradients/icons (ported uit mr-data.jsx), formatters, etc.
   ═══════════════════════════════════════════════════════════════ */

import type { Gerecht, Gang } from '@/types';

/* ── Gang gradients + icons (per categorie kleur + Lucide icon-naam) ───
   Bucket C: na review-iteratie waar Sam zei "Voorgerecht ↔ Dessert lijken
   op elkaar" — Dessert iets warmer/roziger getrokken. */
export interface GangVisual {
    gradient: string;
    icon: string; // Lucide icon-naam (PascalCase wordt later naar Lucide gemapt)
}

export const GANG_VISUALS: Record<string, GangVisual> = {
    bite:      { gradient: 'linear-gradient(135deg, #B55720 0%, #8A3E14 100%)', icon: 'Drumstick' },
    voor:      { gradient: 'linear-gradient(135deg, #C4B07A 0%, #9E8A56 100%)', icon: 'Salad' },
    hoofd:     { gradient: 'linear-gradient(135deg, #6B1F1F 0%, #3D0F0F 100%)', icon: 'Beef' },
    bij:       { gradient: 'linear-gradient(135deg, #9A612B 0%, #6E451C 100%)', icon: 'Wheat' },
    dessert:   { gradient: 'linear-gradient(135deg, #E8B5A2 0%, #B57858 100%)', icon: 'IceCream2' },
    veggie:    { gradient: 'linear-gradient(135deg, #697734 0%, #4C5621 100%)', icon: 'Leaf' },
    /* Sam-eigen gangen — Hop & Bites dataset gebruikt deze slugs naast de
       6 default-categorieën. Eigen tinten zodat de filter-bar in 1 oogopslag
       toont welke categorie waar zit. */
    borrelhap: { gradient: 'linear-gradient(135deg, #D67A3A 0%, #A05A1F 100%)', icon: 'Cookie' },
    hapje:     { gradient: 'linear-gradient(135deg, #C49A4E 0%, #8E6D2D 100%)', icon: 'Sandwich' },
    anders:    { gradient: 'linear-gradient(135deg, #5B6470 0%, #3A4148 100%)', icon: 'Soup' },
    /* Fallback */
    default:   { gradient: 'linear-gradient(135deg, #2a2024 0%, #1a1a1e 100%)', icon: 'UtensilsCrossed' },
};

/* Bepaal gang-key uit Gerecht (probeert gang_slug, gang.slug, of categorie).
   Volgorde van checks is belangrijk: meer-specifieke slugs eerst (borrelhap
   bevat ook 'hap' = potential conflict met 'hapje'). */
export function getGangKey(gerecht: Gerecht | { gang_slug?: string; categorie?: string }, gangen?: Gang[]): string {
    if (gerecht.gang_slug) {
        const slug = gerecht.gang_slug.toLowerCase();
        /* Specifieke matches eerst */
        if (slug === 'borrelhap' || slug.startsWith('borrel')) return 'borrelhap';
        if (slug === 'hapje' || slug === 'hapjes') return 'hapje';
        if (slug === 'anders' || slug === 'overig') return 'anders';
        /* Algemene matches */
        if (slug.includes('bite')) return 'bite';
        if (slug.includes('voor')) return 'voor';
        if (slug.includes('hoofd')) return 'hoofd';
        if (slug.includes('bij')) return 'bij';
        if (slug.includes('dessert') || slug.includes('zoet')) return 'dessert';
        if (slug.includes('veg')) return 'veggie';
        return slug;
    }
    if ('gang_id' in gerecht && gerecht.gang_id && gangen) {
        const g = gangen.find((x) => x.id === gerecht.gang_id);
        if (g?.slug) return getGangKey({ gang_slug: g.slug });
    }
    if (gerecht.categorie) return gerecht.categorie.toLowerCase();
    return 'default';
}

export function getGangVisual(key: string): GangVisual {
    return GANG_VISUALS[key] ?? GANG_VISUALS.default;
}

export function getGangLabel(key: string, gangen?: Gang[]): string {
    if (gangen) {
        const g = gangen.find((x) => x.slug?.toLowerCase() === key);
        if (g) return g.naam;
    }
    const labels: Record<string, string> = {
        bite: 'Bite', voor: 'Voorgerecht', hoofd: 'Hoofdgerecht',
        bij: 'Bijgerecht', dessert: 'Dessert', veggie: 'Vegetarisch',
        borrelhap: 'Borrelhap', hapje: 'Hapje', anders: 'Anders',
    };
    return labels[key] ?? key;
}

/* ── Photo mixed-mode logic ─────────────────────────────────────
   ~30% van de gerechten toont een echte foto in 'mixed' mode (default).
   In 'all' altijd, in 'none' nooit. */
export type PhotoMode = 'all' | 'mixed' | 'none';

export function shouldShowPhoto(gerecht: { id: string | number; foto_url?: string | null }, mode: PhotoMode = 'mixed'): boolean {
    if (mode === 'all') return Boolean(gerecht.foto_url);
    if (mode === 'none') return false;
    /* Mixed: alleen als een echte foto bestaat EN id-hash een 30% sample raakt. */
    if (!gerecht.foto_url) return false;
    const idNum = typeof gerecht.id === 'number' ? gerecht.id : String(gerecht.id).split('').reduce((s, c) => s + c.charCodeAt(0), 0);
    return idNum % 10 < 3;
}

/* ── Formatters ─────────────────────────────────────────────── */
export const fmtEuro = (n: number | null | undefined): string => {
    if (n == null || isNaN(Number(n))) return '€ 0,00';
    return '€ ' + Number(n).toFixed(2).replace('.', ',');
};

export const fmtPct = (n: number | null | undefined): string => {
    if (n == null || isNaN(Number(n))) return '–';
    return Math.round(Number(n)) + '%';
};

/* ── Margin tone (kleur op basis van marge%) ───────────────── */
export function marginTone(margin: number): { color: string; cssVar: string } {
    if (margin > 75) return { color: '#22c55e', cssVar: 'var(--green)' };
    if (margin > 60) return { color: '#FFBF00', cssVar: 'var(--brand)' };
    return { color: '#f59e0b', cssVar: '#f59e0b' };
}

/* ── Compute margin uit Gerecht ─────────────────────────────── */
export function getMargin(gerecht: Pick<Gerecht, 'kostprijs_pp' | 'verkoopprijs' | 'prijs'>): number {
    const cost = Number(gerecht.kostprijs_pp ?? 0);
    const price = Number(gerecht.verkoopprijs ?? gerecht.prijs ?? 0);
    if (!price || price <= 0) return 0;
    return Math.round((1 - cost / price) * 100);
}

/* ── Round-robin interleave per gang voor visuele variatie ────
   Mengt gerechten van verschillende gangen door elkaar zodat de eerste
   viewport meerdere kleuren gradients toont (Sam's feedback ronde 1). */
export function interleaveByGang<T extends { gang_slug?: string; categorie?: string }>(
    items: T[],
    gangOrder: string[] = ['bite', 'voor', 'hoofd', 'bij', 'dessert', 'veggie'],
): T[] {
    const buckets: Record<string, T[]> = {};
    gangOrder.forEach((g) => { buckets[g] = []; });
    const rest: T[] = [];
    items.forEach((item) => {
        const key = getGangKey(item);
        if (buckets[key]) buckets[key].push(item);
        else rest.push(item);
    });
    const result: T[] = [];
    let added = true;
    let idx = 0;
    while (added) {
        added = false;
        for (const g of gangOrder) {
            if (idx < buckets[g].length) { result.push(buckets[g][idx]); added = true; }
        }
        idx++;
    }
    return [...result, ...rest];
}

/* ── Fuzzy search helper (subsequence match) ────────────────── */
export function fuzzyMatch(query: string, text: string): boolean {
    if (!query) return true;
    const q = query.toLowerCase();
    const t = (text ?? '').toLowerCase();
    if (t.includes(q)) return true;
    let qi = 0;
    for (let i = 0; i < t.length && qi < q.length; i++) {
        if (t[i] === q[qi]) qi++;
    }
    return qi === q.length;
}

/* ── EU-14 allergenen referentie ────────────────────────────── */
export const EU14_ALLERGENS = [
    'Gluten', 'Schaaldieren', 'Ei', 'Vis', 'Pinda', 'Soja', 'Lactose',
    'Noten', 'Selderij', 'Mosterd', 'Sesam', 'Sulfiet', 'Lupine', 'Weekdieren',
] as const;

/* ── Gerecht status helper ───────────────────────────────────
   Bestaande _client.tsx filtert op 'actief'|'concept'|'review_nodig'|'inactief'.
   Status zit niet als kolom in Gerecht-type; we lezen 'bron' of een
   ander veld als proxy. Voor display in cards komt deze helper. */
export function getGerechtStatus(gerecht: Gerecht & { status?: string }): 'actief' | 'concept' | 'review' | 'inactief' {
    const s = ((gerecht as any).status ?? gerecht.bron ?? 'actief').toLowerCase();
    if (s.includes('concept')) return 'concept';
    if (s.includes('review')) return 'review';
    if (s.includes('inact')) return 'inactief';
    return 'actief';
}
