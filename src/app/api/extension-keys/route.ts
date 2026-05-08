/**
 * GET  /api/extension-keys     — lijst keys van huidige user
 * POST /api/extension-keys     — genereer nieuwe key (raw key 1× geretourneerd)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { generateExtensionKey } from '@/lib/extensionAuth';

export const runtime = 'nodejs';

export async function GET() {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

    const { data, error } = await supabase
        .from('org_extension_api_keys')
        .select('id, key_prefix, label, last_used_at, use_count, created_at, revoked_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

    const { data: memberData } = await supabase
        .from('organization_members').select('organization_id')
        .eq('user_id', user.id).eq('status', 'active').limit(1).maybeSingle();
    const orgId = memberData?.organization_id;
    if (!orgId) return NextResponse.json({ error: 'Geen organisatie' }, { status: 400 });

    const body = await req.json().catch(() => null);
    const label: string = typeof body?.label === 'string' && body.label.trim().length > 0
        ? body.label.trim().slice(0, 80)
        : 'Chrome extensie';

    const { rawKey, keyHash, keyPrefix } = generateExtensionKey();

    const { data, error } = await supabase
        .from('org_extension_api_keys')
        .insert({
            user_id: user.id,
            organization_id: orgId,
            key_hash: keyHash,
            key_prefix: keyPrefix,
            label,
        })
        .select('id, label, key_prefix, created_at')
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    /* Raw key alleen NU gereturned — daarna nooit meer */
    return NextResponse.json({
        ok: true,
        rawKey,
        key: data,
        message: 'Bewaar deze key — hij is nooit meer zichtbaar.',
    });
}
