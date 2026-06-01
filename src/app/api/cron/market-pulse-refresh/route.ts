/**
 * GET/POST /api/cron/market-pulse-refresh
 *
 * Pillar #5 — Markt-Pulse (Pro+, opt-in default OFF).
 *
 * REFRESH MATERIALIZED VIEW van market_pulse_30d. De view aggregeert
 * supplier_prices van alle organisaties met feature_flags.market_pulse_opt_in
 * = true en filtert k-anonymity ≥ 5 (HAVING count(distinct organization_id)
 * >= 5). Alle aggregate-rows zijn al gegarandeerd safe — geen RLS nodig op
 * de view zelf, alleen op de RPC get_market_pulse die opt-in checkt.
 *
 * Schedule: dagelijks 04:00 UTC (Vercel cron).
 *
 * Auth: CRON_SECRET Bearer.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

async function run(req: NextRequest) {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers.get('authorization') || '';
    const provided = authHeader.replace(/^Bearer\s+/i, '');

    if (!cronSecret || provided !== cronSecret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sb = createServiceSupabase();

    // REFRESH MATERIALIZED VIEW kan niet via standaard supabase-js .from() ;
    // we gebruiken een eenmalige RPC of (fallback) raw rpc-execute via een
    // service-role-only helper. Hier roepen we een security-definer RPC.
    // Als die nog niet bestaat: maak 'm aan binnen deze endpoint of via
    // separate migration. Voor nu vertrouwen we op een service-role wrapper
    // die hieronder gedefinieerd staat als sql-rpc.
    const { error } = await sb.rpc('refresh_market_pulse_30d');

    if (error) {
        // Fallback: maak de RPC alsnog aan met inline DDL via execute_sql.
        // (Komt niet voor als de pre-deploy migration alles aanmaakte.)
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, refreshed_at: new Date().toISOString() });
}

export async function GET(req: NextRequest) { return run(req); }
export async function POST(req: NextRequest) { return run(req); }
