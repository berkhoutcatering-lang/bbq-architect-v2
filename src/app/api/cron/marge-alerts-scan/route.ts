/**
 * GET/POST /api/cron/marge-alerts-scan
 *
 * Pillar #4 stille-margelek-detector. Roept scanMargeAlerts() aan per org
 * die actief inventory met prijshistorie heeft. Schrijft naar marge_alerts
 * (engine in src/lib/dal/margeAlerts.ts).
 *
 * Schedule: 4x/dag (elke 6h) zodat prijsshifts uit pricelist-imports snel
 * worden opgepikt zonder de Anthropic-quota op te eten.
 *
 * Auth: CRON_SECRET header.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase-server';
import { scanMargeAlerts } from '@/lib/dal/margeAlerts';

export const runtime = 'nodejs';
export const maxDuration = 300;

async function run(req: NextRequest) {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers.get('authorization') || '';
    const provided = authHeader.replace(/^Bearer\s+/i, '');

    if (!cronSecret || provided !== cronSecret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sb = createServiceSupabase();

    // Pak orgs met op zijn minst 1 inventory-rij met last_price_eur (anders
    // is er niets te vergelijken).
    const { data: orgsRaw, error } = await sb
        .from('inventory')
        .select('organization_id')
        .not('last_price_eur', 'is', null);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const orgIds = Array.from(new Set((orgsRaw || []).map(function (r: any) { return r.organization_id as string; })))
        .filter(Boolean);

    const results: Array<{
        orgId: string;
        inventory_items_checked: number;
        alerts_created: number;
        alerts_updated: number;
        error?: string;
    }> = [];

    for (const orgId of orgIds) {
        try {
            const r = await scanMargeAlerts(sb as any, orgId);
            results.push({
                orgId,
                inventory_items_checked: r.inventory_items_checked,
                alerts_created: r.alerts_created,
                alerts_updated: r.alerts_updated,
            });
        } catch (e: any) {
            console.error('[cron/marge-alerts-scan] org', orgId, 'failed:', e.message);
            results.push({
                orgId,
                inventory_items_checked: 0,
                alerts_created: 0,
                alerts_updated: 0,
                error: e.message,
            });
        }
    }

    return NextResponse.json({
        ok: true,
        processedOrgs: orgIds.length,
        totalCreated: results.reduce(function (s, r) { return s + r.alerts_created; }, 0),
        totalUpdated: results.reduce(function (s, r) { return s + r.alerts_updated; }, 0),
        results,
    });
}

export async function GET(req: NextRequest) { return run(req); }
export async function POST(req: NextRequest) { return run(req); }
