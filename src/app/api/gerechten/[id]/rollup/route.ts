/* GET /api/gerechten/[id]/rollup — aggregate allergens + HACCP-spec uit gerecht's components
   Voor de gerecht-detail-drawer: laat zien wat het gerecht ERFT van z'n components.
   Eén roundtrip ipv N separate queries. RLS-filter op gerecht (via FK-check). */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';

interface AllergenRollup {
    allergen_code: string;
    from_components: string[];  // namen
    has_ai_only: boolean;       // true als alleen ai_suggested = pas-op-flag
}

interface HaccpRollup {
    component_name: string;
    type: string;
    threshold_value: number | null;
    threshold_unit: string | null;
    note: string | null;
    ai_suggested: boolean;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const { id } = await ctx.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
        return NextResponse.json({ error: 'Ongeldig gerecht-id' }, { status: 400 });
    }

    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

    const { data: membership } = await supabase
        .from('organization_members').select('organization_id')
        .eq('user_id', user.id).eq('status', 'active').limit(1).maybeSingle();
    if (!membership) return NextResponse.json({ error: 'Geen organisatie' }, { status: 403 });
    const orgId = membership.organization_id as string;

    // Get gerecht-components first (RLS doet org-filter)
    const { data: gc, error: gcErr } = await supabase
        .from('gerecht_components')
        .select('component_id, components(id, name)')
        .eq('gerecht_id', id)
        .eq('organization_id', orgId);

    if (gcErr) return NextResponse.json({ error: gcErr.message }, { status: 500 });

    const componentIds = (gc ?? []).map(g => g.component_id);
    const componentNameById = new Map<number, string>();
    for (const g of (gc ?? [])) {
        const comp = g.components as unknown as { id: number; name: string } | null;
        if (comp) componentNameById.set(comp.id, comp.name);
    }

    if (componentIds.length === 0) {
        return NextResponse.json({ allergens: [], haccp_points: [], component_count: 0 });
    }

    // Parallel fetch allergens + haccp
    const [allergensRes, haccpRes] = await Promise.all([
        supabase.from('component_allergens')
            .select('component_id, allergen_code, ai_suggested, confirmed_at')
            .in('component_id', componentIds),
        supabase.from('component_haccp_points')
            .select('component_id, type, threshold_value, threshold_unit, note, ai_suggested')
            .in('component_id', componentIds),
    ]);

    // Allergens: UNION per code met attribution naar component-namen
    const allergensMap = new Map<string, AllergenRollup>();
    for (const a of (allergensRes.data ?? [])) {
        const code = a.allergen_code as string;
        const compName = componentNameById.get(a.component_id as number) ?? 'onbekend';
        const isConfirmed = !!a.confirmed_at;
        let row = allergensMap.get(code);
        if (!row) {
            row = { allergen_code: code, from_components: [], has_ai_only: false };
            allergensMap.set(code, row);
        }
        if (!row.from_components.includes(compName)) row.from_components.push(compName);
        // has_ai_only = true zolang geen enkele confirm-bron gevonden
        if (!isConfirmed) {
            row.has_ai_only = row.has_ai_only || row.from_components.every(_ => true);
        } else {
            row.has_ai_only = false;
        }
    }

    // HACCP: per component houden — chef wil weten WAT van wat
    const haccp: HaccpRollup[] = (haccpRes.data ?? []).map(h => ({
        component_name: componentNameById.get(h.component_id as number) ?? 'onbekend',
        type: h.type as string,
        threshold_value: h.threshold_value as number | null,
        threshold_unit: h.threshold_unit as string | null,
        note: h.note as string | null,
        ai_suggested: !!h.ai_suggested,
    }));

    return NextResponse.json({
        allergens: Array.from(allergensMap.values()).sort((a, b) => a.allergen_code.localeCompare(b.allergen_code)),
        haccp_points: haccp,
        component_count: componentIds.length,
    });
}
