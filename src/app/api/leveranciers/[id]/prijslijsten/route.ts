/**
 * GET /api/leveranciers/[id]/prijslijsten
 *
 * Lijst van pricelist-uploads voor één leverancier, scoped op org via RLS.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }): Promise<Response> {
    const { id } = await context.params;
    const leverancierId = Number(id);
    if (!Number.isInteger(leverancierId)) {
        return NextResponse.json({ error: 'invalid id' }, { status: 400 });
    }

    const sb = await createServerSupabase();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

    const { data: mem } = await sb
        .from('organization_members').select('organization_id')
        .eq('user_id', user.id).eq('status', 'active').limit(1).maybeSingle();
    const orgId = mem?.organization_id as string | undefined;
    if (!orgId) return NextResponse.json({ error: 'Geen organisatie' }, { status: 403 });

    const { data: lev } = await sb
        .from('leveranciers')
        .select('id, naam')
        .eq('id', leverancierId)
        .eq('organization_id', orgId)
        .maybeSingle();
    if (!lev) return NextResponse.json({ error: 'leverancier niet gevonden' }, { status: 404 });

    const { data, error } = await sb
        .from('org_pricelist_uploads')
        .select('id, filename, size_bytes, page_count, status, processing_mode, parsed_product_count, new_count, updated_count, ai_cost_cents, ai_model, parse_error, created_at, parse_finished_at')
        .eq('organization_id', orgId)
        .eq('leverancier_id', leverancierId)
        .order('created_at', { ascending: false })
        .limit(100);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
        leverancier: lev,
        uploads: data ?? [],
        count: data?.length ?? 0,
    });
}
