/**
 * GET  /api/leveranciers       — lijst (alleen huidige org, niet-gearchiveerd)
 * POST /api/leveranciers       — maak nieuwe leverancier
 *   Body: { naam, type?, import_method?, portal_url?, portal_hint?, notes? }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';

export const runtime = 'nodejs';

async function resolveOrgId(supabase: any, userId: string): Promise<string | null> {
    const { data } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', userId)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();
    return data?.organization_id ?? null;
}

export async function GET() {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

    const orgId = await resolveOrgId(supabase, user.id);
    if (!orgId) return NextResponse.json({ error: 'Geen organisatie' }, { status: 400 });

    const { data, error } = await supabase
        .from('leveranciers')
        .select('id, naam, type, contact, email, tel, import_method, portal_url, portal_hint, last_sync_at, last_sync_status, products_count, notes, scope_filter, scope_keywords, archived_at, created_at')
        .eq('organization_id', orgId)
        .is('archived_at', null)
        .order('naam');

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
}

const ALLOWED_METHODS = ['extension', 'email_in', 'csv', 'manual'];
const ALLOWED_HINTS = ['sligro', 'makro', 'baktotaal', 'vuurenrook', 'hanos', 'bidfood'];

export async function POST(req: NextRequest) {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

    const orgId = await resolveOrgId(supabase, user.id);
    if (!orgId) return NextResponse.json({ error: 'Geen organisatie' }, { status: 400 });

    const body = await req.json().catch(() => null);
    const naam: string = (body?.naam || '').trim();
    if (naam.length < 2) return NextResponse.json({ error: 'naam: min 2 chars' }, { status: 400 });
    if (naam.length > 120) return NextResponse.json({ error: 'naam: max 120 chars' }, { status: 400 });

    const type: string = typeof body?.type === 'string' && body.type.length <= 40 ? body.type : 'Groothandel';
    const import_method: string | null = ALLOWED_METHODS.includes(body?.import_method) ? body.import_method : null;
    const portal_hint: string | null = ALLOWED_HINTS.includes(body?.portal_hint) ? body.portal_hint : null;
    const portal_url: string | null = typeof body?.portal_url === 'string' ? body.portal_url.slice(0, 500) : null;
    const notes: string | null = typeof body?.notes === 'string' ? body.notes.slice(0, 1000) : null;
    const contact: string | null = typeof body?.contact === 'string' ? body.contact.slice(0, 200) : null;
    const email: string | null = typeof body?.email === 'string' ? body.email.slice(0, 200) : null;
    const tel: string | null = typeof body?.tel === 'string' ? body.tel.slice(0, 50) : null;
    const scope_filter: 'alles' | 'food_drinks' | 'custom' = ['alles','food_drinks','custom'].includes(body?.scope_filter) ? body.scope_filter : 'alles';
    const scope_keywords: string[] | null = (Array.isArray(body?.scope_keywords) && scope_filter === 'custom')
        ? body.scope_keywords.filter((k: unknown) => typeof k === 'string' && k.trim().length > 0).slice(0, 30)
        : null;

    /* Dedup op naam binnen org (case-insensitive). Inclusief gearchiveerd. */
    const { data: existing } = await supabase
        .from('leveranciers')
        .select('id, naam, archived_at')
        .eq('organization_id', orgId)
        .ilike('naam', naam)
        .limit(1)
        .maybeSingle();

    if (existing && !existing.archived_at) {
        return NextResponse.json({ error: `leverancier "${existing.naam}" bestaat al`, existingId: existing.id }, { status: 409 });
    }

    /* Bestaat-maar-gearchiveerd → un-archive + update fields ipv nieuwe rij */
    if (existing && existing.archived_at) {
        const { data, error } = await supabase
            .from('leveranciers')
            .update({
                naam,                          // hernoem naar nieuwe casing
                type,
                import_method,
                portal_url,
                portal_hint,
                notes,
                contact,
                email,
                tel,
                scope_filter,
                scope_keywords,
                archived_at: null,
                last_sync_status: 'never',
            })
            .eq('id', existing.id)
            .eq('organization_id', orgId)
            .select('*')
            .single();
        if (error) return NextResponse.json({ error: 'unarchive: ' + error.message }, { status: 500 });
        return NextResponse.json({ data, restored: true });
    }

    const { data, error } = await supabase
        .from('leveranciers')
        .insert({
            organization_id: orgId,
            naam,
            type,
            import_method,
            portal_url,
            portal_hint,
            notes,
            contact,
            email,
            tel,
            scope_filter,
            scope_keywords,
            created_by_user_id: user.id,
            last_sync_status: 'never',
        })
        .select('*')
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
}
