/* /api/components/allergen-pending — Sprint 3 A8
   Geeft per component een lijst van AI-suggested allergens die nog niet bevestigd zijn,
   zodat de /gerechten/componenten pagina inline orange-dashed chips kan tonen
   zonder een eigen page-route te hoeven openen. Re-auth + RLS.

   Response: { pending: Record<componentId, Array<{ code: string; label: string }>> }
*/
import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';

interface ComponentAllergenRow {
    component_id: number;
    allergen_code: string;
}

interface AllergenRow {
    code: string;
    nl_label: string;
}

export async function GET() {
    const supabase = await createServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });
    }

    // Re-authorize tegen actieve org-membership (defence-in-depth bovenop RLS).
    const { data: membership, error: memberErr } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();
    if (memberErr || !membership) {
        return NextResponse.json({ error: 'Geen actieve organisatie-membership' }, { status: 403 });
    }

    const [pendingRes, labelsRes] = await Promise.all([
        supabase
            .from('component_allergens')
            .select('component_id, allergen_code')
            .eq('organization_id', membership.organization_id)
            .eq('ai_suggested', true)
            .is('confirmed_at', null),
        supabase
            .from('allergens')
            .select('code, nl_label'),
    ]);

    if (pendingRes.error) {
        return NextResponse.json({ error: pendingRes.error.message }, { status: 500 });
    }

    const labelMap = new Map<string, string>();
    for (const row of (labelsRes.data ?? []) as AllergenRow[]) {
        labelMap.set(row.code, row.nl_label);
    }

    const pending: Record<number, Array<{ code: string; label: string }>> = {};
    for (const row of (pendingRes.data ?? []) as ComponentAllergenRow[]) {
        const list = pending[row.component_id] ?? [];
        list.push({
            code: row.allergen_code,
            label: labelMap.get(row.allergen_code) ?? row.allergen_code.toLowerCase(),
        });
        pending[row.component_id] = list;
    }

    return NextResponse.json({ pending });
}
