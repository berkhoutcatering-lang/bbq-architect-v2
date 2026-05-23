/**
 * GET /api/email-inbox/stats
 *
 * Returnt eigen inbound-email-adres + 30-dagen-stats (received/parsing/parsed/
 * failed) voor de actieve organisatie. Gebruikt door EmailInboxCard op
 * /instellingen — server-side queries omdat /instellingen client-component is.
 *
 * Re-auth via supabase.auth.getUser() — RLS doet de tenant-filtering.
 */

import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';

export const runtime = 'nodejs';

export async function GET() {
    const sb = await createServerSupabase();
    const { data: { user }, error: authError } = await sb.auth.getUser();
    if (authError || !user) {
        return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });
    }

    const { data: mem, error: memError } = await sb
        .from('organization_members')
        .select('organization_id, organizations(slug)')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();
    if (memError || !mem) {
        return NextResponse.json({ error: 'Geen actieve organisatie' }, { status: 403 });
    }

    const org = mem.organizations as unknown as { slug?: string } | null;
    const slug = org?.slug ?? '';
    const inboundAddress = slug ? `pl-${slug}@in.bbqarchitect.app` : '';

    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await sb
        .from('org_email_inbox')
        .select('status')
        .eq('organization_id', mem.organization_id)
        .gte('received_at', monthAgo);

    if (error) {
        /* 42P01 = undefined_table → email-inbox migration nog niet gedraaid.
           Returnen we 200 met error-veld zodat client een nette uitleg toont. */
        if (error.code === '42P01') {
            return NextResponse.json({
                inboundAddress,
                total: 0, parsed: 0, received: 0, failed: 0,
                tableMissing: true,
            });
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = data ?? [];
    return NextResponse.json({
        inboundAddress,
        total: rows.length,
        parsed: rows.filter(r => r.status === 'parsed').length,
        received: rows.filter(r => r.status === 'received' || r.status === 'parsing').length,
        failed: rows.filter(r => r.status === 'failed').length,
    });
}
