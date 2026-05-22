/* Server-side data-loader voor de Insights-page. Eén Promise.all-blok voor
   alle queries; gefilterd via RLS op organization_id (we doen 're-auth' op de
   user en laten RLS de tenant-isolatie afdwingen).

   Hard rule: BTW splits / allergens / quantities NIET AI-derived. Allergen-
   readiness komt uit join-counts op component_allergens, niet uit een prompt. */

import { createServerSupabase } from '@/lib/supabase-server';
import type { InsightsData, MarginStats, MarginOutlier, LaunchChecklistItem, AiCoverage } from './types';

const EMPTY: InsightsData = {
    library: {
        gerechten:    { total: 0, prev30d: 0, label: 'Gerechten',    icon: 'utensils-crossed', href: '/gerechten' },
        componenten:  { total: 0, prev30d: 0, label: 'Componenten',  icon: 'boxes',            href: '/gerechten/componenten' },
        ingredienten: { total: 0, prev30d: 0, label: 'Ingrediënten', icon: 'package',          href: '/voorraad' },
    },
    sparklines: { gerechten: [0], componenten: [0], ingredienten: [0] },
    marginStats: { median: 0, p10: 0, p90: 0, min: 0, max: 0, count: 0, outliers_low: [], outliers_high: [] },
    marginBuckets: [
        { label: '0–30%',  count: 0, color: '#ef4444' },
        { label: '30–50%', count: 0, color: '#f59e0b' },
        { label: '50–70%', count: 0, color: '#c4a35a' },
        { label: '70%+',   count: 0, color: '#22c55e' },
    ],
    topComponents: [],
    bottomComponents: [],
    allergenStats: { totalGerechten: 0, auditProof: 0, partial: 0, missing: 0, queueSize: 0 },
    aiCoverage: {
        componenten: { total: 0, aiSuggested: 0, confirmed: 0 },
        allergenen:  { total: 0, aiSuggested: 0, confirmed: 0 },
        gerechten:   { total: 0, aiSuggested: 0, confirmed: 0 },
    },
    launchChecklist: [],
    aiCosts: { month: '', totalCents: 0, features: [], softCap: 1500, hardCap: 2250, tier: 'Pro' },
};

/* Bucket-bound voor percentiel berekening — index 0..1 op gesorteerde array.
   Lineaire interpolatie tussen omliggende waarden. */
function percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    if (sorted.length === 1) return sorted[0];
    const idx = (sorted.length - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/* 5 weekly-snapshot waarden van created_at-distributie. Voor MVP synthetiseren
   we ze uit de bestaande created_at-waarden — we tellen rows met
   created_at <= weekN-grens. Geeft een nette stijgende lijn als data groeit. */
function buildSparkline(createdDates: string[]): number[] {
    if (createdDates.length === 0) return [0];
    const now = Date.now();
    const weeks = 5;
    const points: number[] = [];
    for (let i = weeks - 1; i >= 0; i--) {
        const cutoff = now - i * 7 * 24 * 60 * 60 * 1000;
        points.push(createdDates.filter(d => new Date(d).getTime() <= cutoff).length);
    }
    return points;
}

export async function loadInsightsData(): Promise<{ data: InsightsData; error?: string }> {
    const sb = await createServerSupabase();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return { data: EMPTY, error: 'Niet ingelogd' };

    const { data: mem } = await sb
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();
    if (!mem) return { data: EMPTY, error: 'Geen actieve organisatie' };
    const orgId = mem.organization_id as string;

    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const monthStart = (() => {
        const d = new Date();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        return `${d.getFullYear()}-${m}-01`;
    })();
    const monthLabel = new Date().toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' });

    try {
        const [
            gerechtenRes,
            gerechtenPrevRes,
            gerechtenDatesRes,
            componentsRes,
            componentsPrevRes,
            componentsDatesRes,
            componentsListRes,
            inventoryRes,
            inventoryPrevRes,
            inventoryDatesRes,
            gerechtComponentsRes,
            componentAllergensRes,
            ingredientAllergensRes,
            aiUsageRes,
            checklistGerechtenRes,
            checklistComponentsRes,
            checklistIngredientsRes,
        ] = await Promise.all([
            sb.from('gerechten').select('id, naam, total_cost_cents, verkoopprijs, status').eq('organization_id', orgId).neq('status', 'inactief'),
            sb.from('gerechten').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).neq('status', 'inactief').lt('created_at', monthAgo),
            sb.from('gerechten').select('created_at').eq('organization_id', orgId).neq('status', 'inactief'),
            sb.from('components').select('id', { count: 'exact', head: true }).eq('organization_id', orgId),
            sb.from('components').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).lt('created_at', monthAgo),
            sb.from('components').select('created_at').eq('organization_id', orgId),
            sb.from('components').select('id, name, type, ai_suggested, approved_at, base_cost_cents').eq('organization_id', orgId),
            sb.from('inventory').select('id', { count: 'exact', head: true }).eq('organization_id', orgId),
            sb.from('inventory').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).lt('created_at', monthAgo),
            sb.from('inventory').select('created_at').eq('organization_id', orgId),
            sb.from('gerecht_components').select('gerecht_id, component_id').eq('organization_id', orgId),
            sb.from('component_allergens').select('component_id, ai_suggested, confirmed_at').eq('organization_id', orgId),
            sb.from('ingredient_allergens').select('inventory_id, ai_suggested, confirmed_at').eq('organization_id', orgId),
            sb.from('ai_usage').select('feature, cost_cents').eq('organization_id', orgId).gte('created_at', monthStart),
            sb.from('gerechten').select('id, naam').eq('organization_id', orgId).or('verkoopprijs.is.null,verkoopprijs.eq.0'),
            sb.from('components').select('id, name').eq('organization_id', orgId).or('base_cost_cents.is.null,base_cost_cents.eq.0'),
            sb.from('inventory').select('id, name').eq('organization_id', orgId).limit(500),
        ]);

        const gerechten = gerechtenRes.data ?? [];
        const components = componentsListRes.data ?? [];
        const inventoryItems = checklistIngredientsRes.data ?? [];

        /* ── Library + sparklines ───────────────────────── */
        const library = {
            gerechten:    { total: gerechten.length, prev30d: gerechtenPrevRes.count ?? 0, label: 'Gerechten', icon: 'utensils-crossed', href: '/gerechten' },
            componenten:  { total: componentsRes.count ?? 0, prev30d: componentsPrevRes.count ?? 0, label: 'Componenten', icon: 'boxes', href: '/gerechten/componenten' },
            ingredienten: { total: inventoryRes.count ?? 0, prev30d: inventoryPrevRes.count ?? 0, label: 'Ingrediënten', icon: 'package', href: '/voorraad' },
        };
        const sparklines = {
            gerechten:    buildSparkline((gerechtenDatesRes.data ?? []).map(r => r.created_at as string).filter(Boolean)),
            componenten:  buildSparkline((componentsDatesRes.data ?? []).map(r => r.created_at as string).filter(Boolean)),
            ingredienten: buildSparkline((inventoryDatesRes.data ?? []).map(r => r.created_at as string).filter(Boolean)),
        };

        /* ── Marge-stats + buckets + outliers ────────── */
        const marginsWithId: Array<{ id: string; name: string; margin: number }> = [];
        for (const g of gerechten) {
            const cost = (g.total_cost_cents ?? 0) / 100;
            const price = Number(g.verkoopprijs ?? 0);
            if (price <= 0 || price <= cost) continue;
            const m = ((price - cost) / price) * 100;
            marginsWithId.push({ id: String(g.id), name: g.naam as string, margin: Math.round(m) });
        }
        const sortedM = [...marginsWithId].sort((a, b) => a.margin - b.margin);
        const margins = sortedM.map(m => m.margin);
        const marginStats: MarginStats = {
            median: Math.round(percentile(margins, 0.5)),
            p10: Math.round(percentile(margins, 0.1)),
            p90: Math.round(percentile(margins, 0.9)),
            min: margins[0] ?? 0,
            max: margins[margins.length - 1] ?? 0,
            count: margins.length,
            outliers_low: sortedM.slice(0, 2) as MarginOutlier[],
            outliers_high: sortedM.slice(-2).reverse() as MarginOutlier[],
        };
        const buckets = [
            { label: '0–30%',  count: 0, color: '#ef4444' },
            { label: '30–50%', count: 0, color: '#f59e0b' },
            { label: '50–70%', count: 0, color: '#c4a35a' },
            { label: '70%+',   count: 0, color: '#22c55e' },
        ];
        for (const m of margins) {
            if (m < 30) buckets[0].count++;
            else if (m < 50) buckets[1].count++;
            else if (m < 70) buckets[2].count++;
            else buckets[3].count++;
        }

        /* ── Reuse: top + bottom componenten ────────── */
        const reuseMap = new Map<number, number>();
        for (const row of gerechtComponentsRes.data ?? []) {
            const id = row.component_id as number;
            reuseMap.set(id, (reuseMap.get(id) ?? 0) + 1);
        }
        const componentLookup = new Map<number, { name: string }>(
            components.map(c => [c.id as number, { name: c.name as string }]),
        );
        /* Voor BOTTOM: alleen components die WEL bestaan maar nauwelijks gebruikt zijn (1 of 0 keer).
           Pak alle components, vul 0 in als ze niet in de reuseMap zitten, sorteer asc. */
        const allWithCount: Array<{ id: number; name: string; usageCount: number }> = components.map(c => ({
            id: c.id as number,
            name: c.name as string,
            usageCount: reuseMap.get(c.id as number) ?? 0,
        }));
        const topComponents = [...allWithCount].sort((a, b) => b.usageCount - a.usageCount).slice(0, 5).filter(c => c.usageCount > 0);
        const bottomComponents = [...allWithCount].sort((a, b) => a.usageCount - b.usageCount).slice(0, 5);

        /* ── Allergen-readiness: % gerechten met volledige cascade ──
           Een gerecht is "audit-proof" als al z'n gekoppelde componenten
           tenminste één confirmed_at hebben in component_allergens
           (= mensje heeft het bevestigd, geen pending AI-suggesties meer). */
        const allergenCompMap = new Map<number, { hasAny: boolean; allConfirmed: boolean; anyConfirmed: boolean }>();
        for (const row of componentAllergensRes.data ?? []) {
            const cid = row.component_id as number;
            const confirmed = !!row.confirmed_at;
            const cur = allergenCompMap.get(cid) ?? { hasAny: false, allConfirmed: true, anyConfirmed: false };
            cur.hasAny = true;
            cur.anyConfirmed = cur.anyConfirmed || confirmed;
            if (!confirmed) cur.allConfirmed = false;
            allergenCompMap.set(cid, cur);
        }
        const gerechtCompMap = new Map<string, number[]>();
        for (const row of gerechtComponentsRes.data ?? []) {
            const gid = String(row.gerecht_id);
            const cid = row.component_id as number;
            const arr = gerechtCompMap.get(gid) ?? [];
            arr.push(cid);
            gerechtCompMap.set(gid, arr);
        }
        let auditProof = 0, partial = 0, missing = 0;
        for (const g of gerechten) {
            const cids = gerechtCompMap.get(String(g.id)) ?? [];
            if (cids.length === 0) { missing++; continue; }
            const states = cids.map(cid => allergenCompMap.get(cid));
            if (states.every(s => s?.allConfirmed)) auditProof++;
            else if (states.some(s => s?.anyConfirmed)) partial++;
            else missing++;
        }
        const queueSize = new Set(
            (componentAllergensRes.data ?? [])
                .filter(r => r.ai_suggested && !r.confirmed_at)
                .map(r => r.component_id)
        ).size + new Set(
            (ingredientAllergensRes.data ?? [])
                .filter(r => r.ai_suggested && !r.confirmed_at)
                .map(r => r.inventory_id)
        ).size;
        const allergenStats = { totalGerechten: gerechten.length, auditProof, partial, missing, queueSize };

        /* ── AI-coverage per laag ──────────────────────── */
        const compsAi = components.filter(c => c.ai_suggested);
        const compsAiConfirmed = compsAi.filter(c => !!c.approved_at);
        const allergensAiAll = (componentAllergensRes.data ?? []).filter(r => r.ai_suggested);
        const allergensAiConfirmed = allergensAiAll.filter(r => !!r.confirmed_at);
        const aiCoverage: AiCoverage = {
            componenten: { total: componentsRes.count ?? 0, aiSuggested: compsAi.length, confirmed: compsAiConfirmed.length },
            allergenen:  { total: (componentAllergensRes.data ?? []).length, aiSuggested: allergensAiAll.length, confirmed: allergensAiConfirmed.length },
            gerechten:   { total: gerechten.length, aiSuggested: 0, confirmed: 0 },
        };

        /* ── AI-kosten (deze maand) ────────────────────── */
        const usageRows = aiUsageRes.data ?? [];
        const featureMap = new Map<string, { calls: number; costCents: number }>();
        let totalCents = 0;
        for (const u of usageRows) {
            const f = (u.feature as string) ?? 'overig';
            const c = Number(u.cost_cents ?? 0);
            totalCents += c;
            const cur = featureMap.get(f) ?? { calls: 0, costCents: 0 };
            cur.calls++;
            cur.costCents += c;
            featureMap.set(f, cur);
        }
        const aiCosts = {
            month: monthLabel,
            totalCents,
            features: Array.from(featureMap.entries())
                .map(([feature, v]) => ({ feature, calls: v.calls, costCents: v.costCents, avgCents: v.calls ? v.costCents / v.calls : 0 }))
                .sort((a, b) => b.costCents - a.costCents),
            softCap: 1500,
            hardCap: 2250,
            tier: 'Pro',
        };

        /* ── Pre-launch checklist ──────────────────────── */
        const gerechtenZonderComp = gerechten.filter(g => (gerechtCompMap.get(String(g.id)) ?? []).length === 0);
        const conceptGerechten = gerechten.filter(g => g.status === 'concept');
        const noPriceGerechten = checklistGerechtenRes.data ?? [];
        const noCostComponents = checklistComponentsRes.data ?? [];
        const ingredientIdsWithAllergen = new Set((ingredientAllergensRes.data ?? []).map(r => r.inventory_id));
        const ingredientsZonderAllergen = inventoryItems.filter(i => !ingredientIdsWithAllergen.has(i.id as number));

        const launchChecklist: LaunchChecklistItem[] = [
            {
                label: 'Gerechten zonder verkoopprijs',
                count: noPriceGerechten.length,
                items: noPriceGerechten.slice(0, 8).map(g => g.naam as string).filter(Boolean),
                href: '/gerechten',
                icon: 'tag',
                severity: noPriceGerechten.length > 0 ? 'warn' : 'ok',
            },
            {
                label: 'Componenten zonder kostprijs',
                count: noCostComponents.length,
                items: noCostComponents.slice(0, 8).map(c => c.name as string).filter(Boolean),
                href: '/gerechten/componenten',
                icon: 'calculator',
                severity: noCostComponents.length > 0 ? 'warn' : 'ok',
            },
            {
                label: 'Ingrediënten zonder allergeen',
                count: ingredientsZonderAllergen.length,
                items: ingredientsZonderAllergen.slice(0, 8).map(i => i.name as string).filter(Boolean),
                href: '/voorraad',
                icon: 'alert-triangle',
                severity: ingredientsZonderAllergen.length > 0 ? 'danger' : 'ok',
            },
            {
                label: 'Gerechten zonder componenten',
                count: gerechtenZonderComp.length,
                items: gerechtenZonderComp.slice(0, 8).map(g => g.naam as string).filter(Boolean),
                href: '/gerechten',
                icon: 'link',
                severity: gerechtenZonderComp.length > 0 ? 'warn' : 'ok',
            },
            {
                label: 'Concept-gerechten niet goedgekeurd',
                count: conceptGerechten.length,
                items: conceptGerechten.slice(0, 8).map(g => g.naam as string).filter(Boolean),
                href: '/gerechten',
                icon: 'circle-dot',
                severity: conceptGerechten.length > 0 ? 'info' : 'ok',
            },
            {
                label: 'Allergeen-queue nog open',
                count: queueSize,
                items: [],
                href: '/gerechten/allergen-queue',
                icon: 'shield-check',
                severity: queueSize > 0 ? 'danger' : 'ok',
            },
        ];

        return {
            data: {
                library, sparklines, marginStats, marginBuckets: buckets,
                topComponents, bottomComponents,
                allergenStats, aiCoverage,
                launchChecklist, aiCosts,
            },
        };
    } catch (e) {
        return { data: EMPTY, error: e instanceof Error ? e.message : 'Onbekende fout' };
    }
}
