/* Inzichten data-resolvers — Sprint 3 A7.
   Centraal lib-file zodat de 4 tab-componenten dezelfde data-shape gebruiken.
   Server-only (gebruikt createServerSupabase) — geen 'use client'. */

import { createServerSupabase } from '@/lib/supabase-server';

/* Item in de allergen-confirmation queue: één rij = één component met N pending allergens. */
export interface QueueItem {
    componentId: number;
    componentName: string;
    componentType: 'prepared' | 'bought_in';
    allergens: Array<{ code: string; label: string }>;
}

export interface InsightsData {
    pendingComponentsCount: number;
    totalComponents: number;
    totalGerechten: number;
    aiSuggestedComponents: number;
    topReuseComponents: Array<{ id: number; name: string; type: string; usageCount: number }>;
    bottomReuseComponents: Array<{ id: number; name: string; type: string; usageCount: number }>;
    marginBuckets: Array<{ label: string; min: number; max: number; count: number; color: string }>;
    margeAverage: number | null;
    margeMedian: number | null;
    totalIngredients: number;
    ingredientsWithAllergen: number;
    ingredientAiSuggestionsPending: number;
    /* Allergeen-confirmation roll-up — voor donut/banner-style overzichten. */
    componentsWithConfirmedAllergens: number;
    componentsWithoutAllergens: number;
}

export type InsightsResult = InsightsData | { error: string };

export async function loadInsights(): Promise<InsightsResult> {
    try {
        const sb = await createServerSupabase();
        const { data: { user } } = await sb.auth.getUser();
        if (!user) return { error: 'Niet ingelogd' };

        const { data: mem } = await sb
            .from('organization_members')
            .select('organization_id')
            .eq('user_id', user.id)
            .eq('status', 'active')
            .limit(1)
            .maybeSingle();
        if (!mem) return { error: 'Geen actieve organisatie' };
        const orgId = mem.organization_id as string;

        const [
            pendingRes,
            componentsRes,
            gerechtenRes,
            aiSuggestedRes,
            gerechtComponentsRes,
            componentsListRes,
            inventoryCountRes,
            ingredientAllergenRes,
            ingredientAiPendingRes,
            confirmedAllergenComponentsRes,
        ] = await Promise.all([
            sb.from('component_allergens').select('component_id')
                .eq('organization_id', orgId).eq('ai_suggested', true).is('confirmed_at', null),
            sb.from('components').select('id', { count: 'exact', head: true }).eq('organization_id', orgId),
            sb.from('gerechten').select('id, total_cost_cents, verkoopprijs', { count: 'exact' })
                .eq('organization_id', orgId).neq('status', 'inactief'),
            sb.from('components').select('id', { count: 'exact', head: true })
                .eq('organization_id', orgId).eq('ai_suggested', true),
            sb.from('gerecht_components').select('component_id').eq('organization_id', orgId),
            sb.from('components').select('id, name, type').eq('organization_id', orgId),
            sb.from('inventory').select('id', { count: 'exact', head: true }).eq('organization_id', orgId),
            sb.from('ingredient_allergens').select('inventory_id', { count: 'exact', head: true })
                .eq('organization_id', orgId),
            sb.from('ingredient_allergens').select('inventory_id', { count: 'exact', head: true })
                .eq('organization_id', orgId).eq('ai_suggested', true).is('confirmed_at', null),
            sb.from('component_allergens').select('component_id')
                .eq('organization_id', orgId).not('confirmed_at', 'is', null),
        ]);

        const pendingComponentsCount = new Set((pendingRes.data ?? []).map((r) => r.component_id)).size;
        const componentsWithConfirmedAllergens = new Set((confirmedAllergenComponentsRes.data ?? []).map((r) => r.component_id)).size;

        const reuseMap = new Map<number, number>();
        for (const row of gerechtComponentsRes.data ?? []) {
            const id = row.component_id as number;
            reuseMap.set(id, (reuseMap.get(id) ?? 0) + 1);
        }
        const componentLookup = new Map<number, { name: string; type: string }>(
            (componentsListRes.data ?? []).map((c) => [c.id, { name: c.name as string, type: c.type as string }]),
        );
        const reuseAll = Array.from(reuseMap.entries())
            .map(([id, count]) => {
                const lookup = componentLookup.get(id);
                return {
                    id,
                    name: lookup?.name ?? `Component #${id}`,
                    type: lookup?.type ?? 'unknown',
                    usageCount: count,
                };
            });
        const sorted = [...reuseAll].sort((a, b) => b.usageCount - a.usageCount);
        const topReuseComponents = sorted.slice(0, 5);
        const bottomReuseComponents = sorted.length > 5
            ? sorted.slice(-Math.min(5, Math.max(0, sorted.length - 5))).reverse()
            : [];

        const buckets = [
            { label: '0-30%', min: 0, max: 0.30, count: 0, color: '#ef4444' },
            { label: '30-50%', min: 0.30, max: 0.50, count: 0, color: '#f59e0b' },
            { label: '50-70%', min: 0.50, max: 0.70, count: 0, color: '#84cc16' },
            { label: '70%+', min: 0.70, max: 1.00, count: 0, color: '#00d4a1' },
        ];
        const margins: number[] = [];
        for (const g of gerechtenRes.data ?? []) {
            const cost = (g.total_cost_cents ?? 0) / 100;
            const price = Number(g.verkoopprijs ?? 0);
            if (price <= 0 || price <= cost) continue;
            const m = (price - cost) / price;
            margins.push(m);
            for (const b of buckets) {
                if (m >= b.min && m < b.max) { b.count++; break; }
                if (b.max === 1.0 && m >= 1.0) { b.count++; break; }
            }
        }
        const margeAverage = margins.length === 0
            ? null
            : margins.reduce((s, x) => s + x, 0) / margins.length;
        const margeMedian = margins.length === 0
            ? null
            : (() => {
                const sortedM = [...margins].sort((a, b) => a - b);
                const mid = Math.floor(sortedM.length / 2);
                return sortedM.length % 2 === 0
                    ? (sortedM[mid - 1] + sortedM[mid]) / 2
                    : sortedM[mid];
            })();

        const totalComponents = componentsRes.count ?? 0;
        const componentsWithAnyAllergen = pendingComponentsCount + componentsWithConfirmedAllergens;
        const componentsWithoutAllergens = Math.max(0, totalComponents - componentsWithAnyAllergen);

        return {
            pendingComponentsCount,
            totalComponents,
            totalGerechten: gerechtenRes.count ?? 0,
            aiSuggestedComponents: aiSuggestedRes.count ?? 0,
            topReuseComponents,
            bottomReuseComponents,
            marginBuckets: buckets,
            margeAverage,
            margeMedian,
            totalIngredients: inventoryCountRes.count ?? 0,
            ingredientsWithAllergen: ingredientAllergenRes.count ?? 0,
            ingredientAiSuggestionsPending: ingredientAiPendingRes.count ?? 0,
            componentsWithConfirmedAllergens,
            componentsWithoutAllergens,
        };
    } catch (e) {
        return { error: e instanceof Error ? e.message : 'Onbekende fout' };
    }
}

/* ─── Allergen-queue loader (verhuisd uit /gerechten/allergen-queue/page.tsx) ─── */
export async function loadAllergenQueue(): Promise<{ items: QueueItem[]; loadError: string | null }> {
    try {
        const sb = await createServerSupabase();
        const { data: { user } } = await sb.auth.getUser();
        if (!user) return { items: [], loadError: 'Niet ingelogd' };

        const { data: mem } = await sb
            .from('organization_members')
            .select('organization_id')
            .eq('user_id', user.id)
            .eq('status', 'active')
            .limit(1)
            .maybeSingle();
        if (!mem) return { items: [], loadError: 'Geen actieve organisatie' };
        const orgId = mem.organization_id as string;

        const [allergensRes, rowsRes] = await Promise.all([
            sb.from('allergens').select('code, nl_label'),
            sb
                .from('component_allergens')
                .select(`
                    component_id,
                    allergen_code,
                    ai_suggested,
                    confirmed_at,
                    components!inner ( id, name, type, organization_id )
                `)
                .eq('organization_id', orgId)
                .eq('ai_suggested', true)
                .is('confirmed_at', null)
                .order('component_id', { ascending: true }),
        ]);

        if (allergensRes.error) return { items: [], loadError: allergensRes.error.message };
        if (rowsRes.error) return { items: [], loadError: rowsRes.error.message };

        const labelMap = new Map<string, string>(
            (allergensRes.data ?? []).map((a) => [a.code, a.nl_label]),
        );

        const grouped = new Map<number, QueueItem>();
        for (const r of rowsRes.data ?? []) {
            const comp = (r as unknown as { components: { id: number; name: string; type: string } | null }).components;
            if (!comp) continue;

            const code = r.allergen_code as string;
            const label = labelMap.get(code) ?? code;

            const existing = grouped.get(comp.id);
            if (existing) {
                existing.allergens.push({ code, label });
            } else {
                grouped.set(comp.id, {
                    componentId: comp.id,
                    componentName: comp.name,
                    componentType: comp.type as 'prepared' | 'bought_in',
                    allergens: [{ code, label }],
                });
            }
        }

        return { items: Array.from(grouped.values()), loadError: null };
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Onbekende fout';
        return { items: [], loadError: msg };
    }
}
