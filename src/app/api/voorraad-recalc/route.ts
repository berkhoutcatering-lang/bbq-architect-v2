/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const maxDuration = 30;

/*
 * Voorraad recompute endpoint
 * ───────────────────────────
 * Triggert sync_avg_daily(orgId) — herberekent inventory.avg_daily op basis van
 * stock_movements (usage in laatste 30 dagen). Aan te roepen vanuit voorraad-pagina
 * "Herbereken dekking" knop, of als nightly cron-job.
 */

export async function POST(req: NextRequest) {
    try {
        void req;
        const supabase = await createServerSupabase();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

        const { data: memberData } = await supabase
            .from('organization_members').select('organization_id')
            .eq('user_id', user.id).eq('status', 'active').limit(1);
        const orgId = memberData?.[0]?.organization_id;
        if (!orgId) return NextResponse.json({ error: 'Geen organisatie' }, { status: 400 });

        const { data, error } = await supabase.rpc('sync_avg_daily', { p_org_id: orgId });
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        return NextResponse.json({ success: true, rows_updated: data || 0 });
    } catch (e: any) {
        console.error('[voorraad-recalc]', e);
        return NextResponse.json({ error: e?.message || 'Fout' }, { status: 500 });
    }
}
