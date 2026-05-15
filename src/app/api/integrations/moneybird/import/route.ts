/**
 * POST /api/integrations/moneybird/import
 *
 * Backfill-import van inkoopfacturen uit Moneybird → review-queue.
 * Werkt batched: elke call verwerkt maximaal `batchSize` (default 25) facturen
 * en returnt summary. Caller (UI) roept opnieuw aan tot `invoicesProcessed=0`
 * om de hele historie te dekken zonder Vercel-timeout.
 *
 * Body: { months?: 12, batchSize?: 25 }
 */

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase-server';
import { checkAiCapServer } from '@/lib/aiUsageServer';
import { runMoneybirdImport } from '@/lib/moneybirdImport';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const authSb = await createServerSupabase();
  const { data: { user } } = await authSb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const sb = createServiceSupabase();
  const { data: membership } = await sb
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .in('role', ['owner', 'admin'])
    .eq('status', 'active')
    .maybeSingle();
  if (!membership) return NextResponse.json({ error: 'no_org_admin' }, { status: 403 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY ontbreekt' }, { status: 500 });

  const body = await req.json().catch(() => ({}));
  const months = Math.min(Math.max(parseInt(body.months || 12, 10) || 12, 1), 60);
  const batchSize = Math.min(Math.max(parseInt(body.batchSize || 25, 10) || 25, 1), 100);

  // Cap-check: blokkeer hele import als AI-cap volledig op (>150%) — anders door
  const cap = await checkAiCapServer(membership.organization_id);
  if (!cap.allowed) {
    return NextResponse.json({ error: 'AI-cap overschreden', cap }, { status: 429 });
  }

  const anthropic = new Anthropic({ apiKey });

  const result = await runMoneybirdImport(sb, anthropic, {
    organizationId: membership.organization_id,
    monthsBack: months,
    maxInvoices: batchSize,
    source: 'backfill',
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error, ...result }, { status: 502 });
  }

  return NextResponse.json(result);
}
