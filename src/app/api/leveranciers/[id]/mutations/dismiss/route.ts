/**
 * POST /api/leveranciers/[id]/mutations/dismiss
 * Body: { mutationIds: uuid[] }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
    const { id } = await context.params;
    const leverancierId = Number(id);
    if (!Number.isInteger(leverancierId)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

    const body = await req.json().catch(() => null);
    const mutationIds: string[] = Array.isArray(body?.mutationIds)
        ? body.mutationIds.filter((x: unknown) => typeof x === 'string')
        : [];
    if (mutationIds.length === 0 || mutationIds.length > 2000) {
        return NextResponse.json({ error: 'mutationIds: 1..2000 verplicht' }, { status: 400 });
    }

    const { data: memberData } = await supabase
        .from('organization_members').select('organization_id')
        .eq('user_id', user.id).eq('status', 'active').limit(1).maybeSingle();
    const orgId = memberData?.organization_id;
    if (!orgId) return NextResponse.json({ error: 'Geen organisatie' }, { status: 400 });

    const { data: updated, error } = await supabase
        .from('org_price_mutations')
        .update({
            status: 'dismissed',
            reviewed_by: user.id,
            reviewed_at: new Date().toISOString(),
        })
        .in('id', mutationIds)
        .eq('organization_id', orgId)
        .eq('leverancier_id', leverancierId)
        .eq('status', 'pending')
        .select('id');

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, dismissed: updated?.length || 0 });
}
