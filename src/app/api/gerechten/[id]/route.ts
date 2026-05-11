/* /api/gerechten/[id] — PR6 Inspiratie Bibliotheek
   PATCH: update gerecht-velden. PR6-scope: alleen is_in_wizard toggle (de wizard-curatie). */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const { id } = await ctx.params;
    // gerechten.id is UUID
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
        return NextResponse.json({ error: 'Ongeldig gerecht-id (UUID verwacht)' }, { status: 400 });
    }

    const supabase = await createServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

    const { data: membership } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();
    if (!membership) return NextResponse.json({ error: 'Geen actieve organisatie-membership' }, { status: 403 });

    const body = await req.json().catch(() => null);
    if (typeof body !== 'object' || body === null) {
        return NextResponse.json({ error: 'Body moet object zijn' }, { status: 400 });
    }
    const b = body as Record<string, unknown>;

    const updateData: Record<string, unknown> = {};
    if (typeof b.is_in_wizard === 'boolean') updateData.is_in_wizard = b.is_in_wizard;

    if (Object.keys(updateData).length === 0) {
        return NextResponse.json({ error: 'Geen wijzigingen' }, { status: 400 });
    }

    const { data, error } = await supabase
        .from('gerechten')
        .update(updateData)
        .eq('id', id)
        .eq('organization_id', membership.organization_id)
        .select('id, naam, is_in_wizard, total_cost_cents, verkoopprijs')
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'Gerecht niet gevonden of geen toegang' }, { status: 404 });
    return NextResponse.json({ gerecht: data });
}
