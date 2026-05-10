/* DELETE /api/gerechten/[id]/components/[componentId] — verwijder koppeling
   AFTER-trigger recomputes gerechten.total_cost_cents. */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';

export async function DELETE(
    _req: NextRequest,
    ctx: { params: Promise<{ id: string; componentId: string }> },
) {
    const { id, componentId } = await ctx.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
        return NextResponse.json({ error: 'Ongeldig gerecht-id' }, { status: 400 });
    }
    const cid = Number(componentId);
    if (!Number.isInteger(cid) || cid <= 0) {
        return NextResponse.json({ error: 'Ongeldig component-id' }, { status: 400 });
    }

    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

    const { data: membership } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id).eq('status', 'active').limit(1).maybeSingle();
    if (!membership) return NextResponse.json({ error: 'Geen organisatie' }, { status: 403 });

    const { error } = await supabase
        .from('gerecht_components')
        .delete()
        .eq('gerecht_id', id)
        .eq('component_id', cid)
        .eq('organization_id', membership.organization_id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}
