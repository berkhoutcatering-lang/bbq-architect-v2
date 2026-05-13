/**
 * GET /api/leveranciers/[id]/mutations
 *
 * Lijst van alle pending org_price_mutations voor een leverancier (alle bronnen:
 * extension / email_inbox / invoice / manual). Gefilterd op organization_id
 * via session, scope-checked tegen leverancier-organization.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
    const { id } = await context.params;
    const leverancierId = Number(id);
    if (!Number.isInteger(leverancierId)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

    const { data: memberData } = await supabase
        .from('organization_members').select('organization_id')
        .eq('user_id', user.id).eq('status', 'active').limit(1).maybeSingle();
    const orgId = memberData?.organization_id;
    if (!orgId) return NextResponse.json({ error: 'Geen organisatie' }, { status: 400 });

    /* Verify scope */
    const { data: lev } = await supabase
        .from('leveranciers')
        .select('id, naam')
        .eq('id', leverancierId)
        .eq('organization_id', orgId)
        .maybeSingle();
    if (!lev) return NextResponse.json({ error: 'leverancier niet gevonden' }, { status: 404 });

    const { data, error } = await supabase
        .from('org_price_mutations')
        .select('id, source, leverancier, parsed_naam, parsed_eenheid, parsed_categorie, parsed_prijs, current_prijs, delta_pct, master_product_id, match_confidence, confidence, status, notes, suggested_aliases, created_at')
        .eq('organization_id', orgId)
        .eq('leverancier_id', leverancierId)
        .eq('status', 'pending')
        .order('delta_pct', { ascending: false, nullsFirst: false })
        .limit(2000);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
        leverancier: lev,
        mutations: data || [],
        count: data?.length || 0,
    });
}
