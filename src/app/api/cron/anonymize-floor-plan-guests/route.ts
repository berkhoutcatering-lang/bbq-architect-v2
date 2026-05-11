/* GET/POST /api/cron/anonymize-floor-plan-guests — AVG Art. 9 retention.
 *
 * Roept Postgres-functie `anonymize_old_floor_plan_guests()` aan die
 * full_name + note leegt voor events ouder dan 30 dagen.
 *
 * Auth: CRON_SECRET in Authorization header.
 * Vercel cron config in vercel.json: dagelijks 03:00 UTC.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const maxDuration = 30;

async function run(req: NextRequest) {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers.get('authorization') || '';
    const provided = authHeader.replace(/^Bearer\s+/i, '');

    if (!cronSecret || provided !== cronSecret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServiceSupabase();
    const { data, error } = await supabase.rpc('anonymize_old_floor_plan_guests');
    if (error) {
        console.error('[cron/anonymize-floor-plan-guests]', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const affected = typeof data === 'number' ? data : 0;
    console.log(`[cron/anonymize-floor-plan-guests] anonymized ${affected} rows`);
    return NextResponse.json({ ok: true, anonymized: affected });
}

export async function GET(req: NextRequest) { return run(req); }
export async function POST(req: NextRequest) { return run(req); }
