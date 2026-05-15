/**
 * GET/POST /api/cron/moneybird-purchase-sync
 *
 * Dagelijkse sync van nieuwe Moneybird-inkoopfacturen → review-queue.
 * Loopt over alle organizations met een actieve Moneybird-koppeling en
 * importeert facturen van de afgelopen 7 dagen (overlap = robuust tegen
 * gemiste runs; org_moneybird_invoices.UNIQUE op (org_id, mb_invoice_id)
 * voorkomt dubbel-werk).
 *
 * Auth: CRON_SECRET in Authorization header.
 * Vercel cron config in vercel.json (zie patch hieronder).
 */

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServiceSupabase } from '@/lib/supabase-server';
import { runMoneybirdImport } from '@/lib/moneybirdImport';

export const runtime = 'nodejs';
export const maxDuration = 300;

const SYNC_DAYS = 7;
const MAX_INVOICES_PER_ORG = 100;

async function run(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization') || '';
  const provided = authHeader.replace(/^Bearer\s+/i, '');

  if (!cronSecret || provided !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY ontbreekt' }, { status: 500 });
  }

  const sb = createServiceSupabase();
  const anthropic = new Anthropic({ apiKey });

  // Vind organisaties met een Moneybird-koppeling
  const { data: orgs, error } = await sb
    .from('organizations')
    .select('id, name, feature_flags')
    .not('feature_flags->moneybird', 'is', null);

  if (error) {
    console.error('[cron/moneybird-sync] org-fetch failed:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const eligible = (orgs || []).filter(o => {
    const ff = (o.feature_flags || {}) as Record<string, unknown>;
    const mb = ff.moneybird as { access_token?: string; administration_id?: string } | undefined;
    return !!(mb?.access_token && mb?.administration_id);
  });

  const since = new Date();
  since.setDate(since.getDate() - SYNC_DAYS);
  const sinceStr = since.toISOString().slice(0, 10);

  const results: Array<{
    org: string;
    ok: boolean;
    processed: number;
    mutations: number;
    failed: number;
    error?: string;
  }> = [];

  for (const org of eligible) {
    try {
      const r = await runMoneybirdImport(sb, anthropic, {
        organizationId: org.id,
        since: sinceStr,
        maxInvoices: MAX_INVOICES_PER_ORG,
        source: 'cron',
      });
      results.push({
        org: org.name,
        ok: r.ok,
        processed: r.invoicesProcessed,
        mutations: r.mutationsCreated,
        failed: r.invoicesFailed,
        error: r.error,
      });
    } catch (e) {
      console.error('[cron/moneybird-sync] org failed:', org.id, (e as Error).message);
      results.push({
        org: org.name,
        ok: false,
        processed: 0,
        mutations: 0,
        failed: 0,
        error: (e as Error).message,
      });
    }
  }

  const totalMutations = results.reduce((sum, r) => sum + r.mutations, 0);
  console.log(`[cron/moneybird-sync] ${eligible.length} orgs, ${totalMutations} mutations created`);

  return NextResponse.json({
    ok: true,
    orgsChecked: eligible.length,
    totalMutations,
    results,
  });
}

export async function GET(req: NextRequest) { return run(req); }
export async function POST(req: NextRequest) { return run(req); }
