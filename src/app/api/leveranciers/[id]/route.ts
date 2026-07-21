/**
 * GET    /api/leveranciers/[id]   — detail + recent sync runs
 * PATCH  /api/leveranciers/[id]   — update fields
 * DELETE /api/leveranciers/[id]   — soft archive (sets archived_at)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';

export const runtime = 'nodejs';

async function resolveOrgId(supabase: any, userId: string): Promise<string | null> {
    const { data } = await supabase
        .from('organization_members').select('organization_id')
        .eq('user_id', userId).eq('status', 'active').limit(1).maybeSingle();
    return data?.organization_id ?? null;
}

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
    const { id } = await context.params;
    const leverancierId = Number(id);
    if (!Number.isInteger(leverancierId)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

    const orgId = await resolveOrgId(supabase, user.id);
    if (!orgId) return NextResponse.json({ error: 'Geen organisatie' }, { status: 400 });

    const [levRes, runsRes, mutsRes] = await Promise.all([
        supabase
            .from('leveranciers')
            .select('id, naam, type, contact, email, tel, import_method, portal_url, portal_hint, last_sync_at, last_sync_status, products_count, notes, created_at')
            .eq('id', leverancierId)
            .eq('organization_id', orgId)
            .maybeSingle(),
        supabase
            .from('leverancier_sync_runs')
            .select('id, started_at, finished_at, status, mode, pages_scanned, products_seen, products_new, products_updated, ai_cost_cents, error_text')
            .eq('leverancier_id', leverancierId)
            .eq('organization_id', orgId)
            .order('started_at', { ascending: false })
            .limit(10),
        supabase
            .from('org_price_mutations')
            .select('id, status', { count: 'exact', head: true })
            .eq('leverancier_id', leverancierId)
            .eq('organization_id', orgId)
            .eq('status', 'pending'),
    ]);

    if (!levRes.data) return NextResponse.json({ error: 'leverancier niet gevonden' }, { status: 404 });

    return NextResponse.json({
        leverancier: levRes.data,
        recentRuns: runsRes.data || [],
        pendingMutations: mutsRes.count || 0,
    });
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
    const { id } = await context.params;
    const leverancierId = Number(id);
    if (!Number.isInteger(leverancierId)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

    const orgId = await resolveOrgId(supabase, user.id);
    if (!orgId) return NextResponse.json({ error: 'Geen organisatie' }, { status: 400 });

    const body = await req.json().catch(() => null);
    const update: Record<string, unknown> = {};
    if (typeof body?.naam === 'string') update.naam = body.naam.trim().slice(0, 120);
    if (typeof body?.type === 'string') update.type = body.type.slice(0, 40);
    if (typeof body?.contact === 'string') update.contact = body.contact.slice(0, 200);
    if (typeof body?.email === 'string') update.email = body.email.slice(0, 200);
    if (typeof body?.tel === 'string') update.tel = body.tel.slice(0, 50);
    if (typeof body?.notes === 'string') update.notes = body.notes.slice(0, 1000);
    if (typeof body?.portal_url === 'string') update.portal_url = body.portal_url.slice(0, 500);
    if (['extension','email_in','csv','manual',null].includes(body?.import_method)) update.import_method = body.import_method;
    if (['sligro','makro','baktotaal','vuurenrook','hanos','bidfood',null].includes(body?.portal_hint)) update.portal_hint = body.portal_hint;
    /* Levertijd in dagen (fix #3): stuurt de bestel-vóór-deadline op /inkoop.
       null = wissen; anders clampen op 0–365 en afronden. */
    if (body?.lead_time_days === null) update.lead_time_days = null;
    else if (body?.lead_time_days != null && Number.isFinite(Number(body.lead_time_days))) {
        update.lead_time_days = Math.max(0, Math.min(365, Math.round(Number(body.lead_time_days))));
    }

    if (Object.keys(update).length === 0) return NextResponse.json({ error: 'niets te updaten' }, { status: 400 });

    const { data, error } = await supabase
        .from('leveranciers')
        .update(update)
        .eq('id', leverancierId)
        .eq('organization_id', orgId)
        .select('*')
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
}

export async function DELETE(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
    const { id } = await context.params;
    const leverancierId = Number(id);
    if (!Number.isInteger(leverancierId)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

    const orgId = await resolveOrgId(supabase, user.id);
    if (!orgId) return NextResponse.json({ error: 'Geen organisatie' }, { status: 400 });

    const { error } = await supabase
        .from('leveranciers')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', leverancierId)
        .eq('organization_id', orgId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}
