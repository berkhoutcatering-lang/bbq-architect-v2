/**
 * Vlees-cut-taxonomie + alias-classifier.
 *
 * "Spiering" → varken · nek-borst · low-slow.
 * "Kippendij" en "kippenbillen" → kip · bil-dij · hot-fast (zelfde cut).
 *
 * Strategie (deterministisch, geen AI):
 *   1. Check tenant-specifieke aliassen (org_product_aliases) — geleerd uit eerdere approvals
 *   2. Check globale meat_taxonomy.aliassen — Sam's seed
 *   3. Substring-match
 *
 * AI mag dit suggereren via Claude, maar approve gaat altijd via UI (Pillar #3).
 */
import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export interface CutClassification {
    taxonomyId: number | null;
    soort: string | null;     // "varken"
    cutGroep: string | null;  // "nek-borst"
    bereiding: string | null; // "low-slow"
    color: string;            // "#d4827a"
    matchedAlias: string | null;
    matchConfidence: number;  // 0..1
    source: 'tenant_alias' | 'global_alias' | 'substring' | 'none';
}

const NULL_CLASSIFICATION: CutClassification = {
    taxonomyId: null, soort: null, cutGroep: null, bereiding: null,
    color: '#7a7a7a', matchedAlias: null, matchConfidence: 0, source: 'none',
};

function adminClient(): SupabaseClient | null {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null;
    return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
    });
}

function norm(s: string): string {
    return (s || '').toLowerCase().trim().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

interface TaxonomyRow {
    id: number;
    soort: string;
    cut_groep: string;
    bereiding_default: string;
    aliassen: string[];
    color_hex: string;
}

/* Cached in-memory globals — taxonomie verandert zelden. */
let cachedGlobals: TaxonomyRow[] | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 5 * 60_000;

async function loadGlobals(sb: SupabaseClient): Promise<TaxonomyRow[]> {
    if (cachedGlobals && Date.now() - cachedAt < CACHE_TTL_MS) return cachedGlobals;
    const { data } = await sb
        .from('meat_taxonomy')
        .select('id, soort, cut_groep, bereiding_default, aliassen, color_hex')
        .order('sort_order', { ascending: true });
    cachedGlobals = (data || []) as TaxonomyRow[];
    cachedAt = Date.now();
    return cachedGlobals;
}

/**
 * Classify één product-naam tot cut + bereiding.
 * Pure read-only. Caller persistert resultaat in org_price_mutations.notes JSON.
 */
export async function classifyCut(
    productNaam: string,
    organizationId: string,
): Promise<CutClassification> {
    const sb = adminClient();
    if (!sb) return NULL_CLASSIFICATION;

    const naamN = norm(productNaam);
    if (!naamN) return NULL_CLASSIFICATION;

    /* 1. Tenant-aliassen (exact match op normalized) */
    const { data: tenant } = await sb
        .from('org_product_aliases')
        .select('cut_taxonomy_id, alias')
        .eq('organization_id', organizationId)
        .eq('alias_normalized', naamN)
        .not('cut_taxonomy_id', 'is', null)
        .limit(1)
        .maybeSingle();

    if (tenant?.cut_taxonomy_id) {
        const enriched = await enrichTaxonomy(sb, tenant.cut_taxonomy_id);
        if (enriched) {
            return { ...enriched, matchedAlias: tenant.alias as string, matchConfidence: 1.0, source: 'tenant_alias' };
        }
    }

    /* 2. Global aliassen array-match */
    const globals = await loadGlobals(sb);
    let bestSubstring: { row: TaxonomyRow; alias: string; conf: number } | null = null;

    for (const t of globals) {
        for (const a of t.aliassen || []) {
            const aN = norm(a);
            if (!aN) continue;
            if (naamN === aN) {
                return {
                    taxonomyId: t.id, soort: t.soort, cutGroep: t.cut_groep,
                    bereiding: t.bereiding_default, color: t.color_hex,
                    matchedAlias: a, matchConfidence: 1.0, source: 'global_alias',
                };
            }
            /* Substring: alias appears in product-name OR product-name appears in alias */
            if (naamN.includes(aN) || aN.includes(naamN)) {
                /* Score: hoe groter de overlap, hoe hoger. Min 0.6 vereist. */
                const overlap = Math.min(naamN.length, aN.length) / Math.max(naamN.length, aN.length);
                const conf = 0.7 + 0.25 * overlap;
                if (!bestSubstring || conf > bestSubstring.conf) {
                    bestSubstring = { row: t, alias: a, conf };
                }
            }
        }
    }

    if (bestSubstring) {
        const t = bestSubstring.row;
        return {
            taxonomyId: t.id, soort: t.soort, cutGroep: t.cut_groep,
            bereiding: t.bereiding_default, color: t.color_hex,
            matchedAlias: bestSubstring.alias,
            matchConfidence: Number(bestSubstring.conf.toFixed(2)),
            source: 'substring',
        };
    }

    return NULL_CLASSIFICATION;
}

async function enrichTaxonomy(sb: SupabaseClient, taxId: number): Promise<CutClassification | null> {
    const globals = await loadGlobals(sb);
    const t = globals.find(g => g.id === taxId);
    if (!t) return null;
    return {
        taxonomyId: t.id, soort: t.soort, cutGroep: t.cut_groep,
        bereiding: t.bereiding_default, color: t.color_hex,
        matchedAlias: null, matchConfidence: 1.0, source: 'tenant_alias',
    };
}

/**
 * Batch-versie voor 200+ regels in 1 PDF — laadt globals + tenant-aliassen 1×.
 */
export async function classifyCutBatch(
    namen: string[],
    organizationId: string,
): Promise<CutClassification[]> {
    const sb = adminClient();
    if (!sb) return namen.map(() => NULL_CLASSIFICATION);

    const normNamen = namen.map(norm);
    const uniq = Array.from(new Set(normNamen.filter(Boolean)));
    if (uniq.length === 0) return namen.map(() => NULL_CLASSIFICATION);

    /* Bulk-fetch tenant-aliassen voor deze normalized naams */
    const { data: tenantAliases } = await sb
        .from('org_product_aliases')
        .select('alias_normalized, cut_taxonomy_id, alias')
        .eq('organization_id', organizationId)
        .in('alias_normalized', uniq)
        .not('cut_taxonomy_id', 'is', null);

    const tenantMap = new Map<string, { taxId: number; alias: string }>();
    for (const a of tenantAliases || []) {
        if (a.cut_taxonomy_id) {
            tenantMap.set(a.alias_normalized as string, {
                taxId: a.cut_taxonomy_id as number,
                alias: a.alias as string,
            });
        }
    }

    const globals = await loadGlobals(sb);

    return normNamen.map((naamN, i): CutClassification => {
        if (!naamN) return NULL_CLASSIFICATION;

        /* Tenant first */
        const t = tenantMap.get(naamN);
        if (t) {
            const tax = globals.find(g => g.id === t.taxId);
            if (tax) {
                return {
                    taxonomyId: tax.id, soort: tax.soort, cutGroep: tax.cut_groep,
                    bereiding: tax.bereiding_default, color: tax.color_hex,
                    matchedAlias: t.alias, matchConfidence: 1.0, source: 'tenant_alias',
                };
            }
        }

        /* Global alias match */
        let bestSubstring: { row: TaxonomyRow; alias: string; conf: number } | null = null;
        for (const g of globals) {
            for (const a of g.aliassen || []) {
                const aN = norm(a);
                if (!aN) continue;
                if (naamN === aN) {
                    return {
                        taxonomyId: g.id, soort: g.soort, cutGroep: g.cut_groep,
                        bereiding: g.bereiding_default, color: g.color_hex,
                        matchedAlias: a, matchConfidence: 1.0, source: 'global_alias',
                    };
                }
                if (naamN.includes(aN) || aN.includes(naamN)) {
                    const overlap = Math.min(naamN.length, aN.length) / Math.max(naamN.length, aN.length);
                    const conf = 0.7 + 0.25 * overlap;
                    if (!bestSubstring || conf > bestSubstring.conf) {
                        bestSubstring = { row: g, alias: a, conf };
                    }
                }
            }
        }

        if (bestSubstring) {
            const g = bestSubstring.row;
            return {
                taxonomyId: g.id, soort: g.soort, cutGroep: g.cut_groep,
                bereiding: g.bereiding_default, color: g.color_hex,
                matchedAlias: bestSubstring.alias,
                matchConfidence: Number(bestSubstring.conf.toFixed(2)),
                source: 'substring',
            };
        }
        return NULL_CLASSIFICATION;
    });
}

/* Reset cache — voor tests of admin-tools die taxonomie wijzigen. */
export function resetTaxonomyCache(): void {
    cachedGlobals = null;
    cachedAt = 0;
}
