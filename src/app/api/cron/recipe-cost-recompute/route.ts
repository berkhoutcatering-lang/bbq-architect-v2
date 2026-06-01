/**
 * GET/POST /api/cron/recipe-cost-recompute
 *
 * Pillar #1 — Live Recipe Cost cascade.
 *
 * Roept process_recipe_recompute_queue() aan. De queue wordt gevuld door de
 * trigger trg_mutation_approved_enqueue: zodra een org_price_mutation
 * approved wordt, krijgen alle geraakte components een rij in de queue.
 * Deze cron verwerkt batches van 200, update components.base_cost_cents,
 * laat de bestaande gerecht_components-triggers het werk doen, en snapshot
 * de nieuwe kostprijs per gerecht. Daarna triggert Pillar #2:
 * check_open_offerte_margins per geraakt gerecht.
 *
 * Schedule: elke 5 min (Vercel cron). Idempotent — verwerkt alleen rijen
 * waar processed_at IS NULL en attempts < 3.
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

    const { data, error } = await sb.rpc('process_recipe_recompute_queue', {
        p_batch_size: 200,
    });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const row = Array.isArray(data) ? data[0] : data;
    return NextResponse.json({
        ok: true,
        processed: row?.processed_count ?? 0,
        errors: row?.error_count ?? 0,
    });
}

export async function GET(req: NextRequest) { return run(req); }
export async function POST(req: NextRequest) { return run(req); }
