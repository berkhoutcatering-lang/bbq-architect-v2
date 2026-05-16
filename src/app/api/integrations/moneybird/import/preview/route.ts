/**
 * GET /api/integrations/moneybird/import/preview
 *
 * Geeft een telling van inkoopfacturen die nog niet zijn geïmporteerd vanuit
 * Moneybird — incl. unieke leveranciers, oudste/nieuwste datum en een sample
 * van 5 stuks. Wordt door de MoneybirdImportCard UI-kaart aangeroepen vóór
 * de daadwerkelijke import-actie.
 *
 * Query: ?months=12 (default)
 *
 * Faalt expliciet met scopeOk=false als de huidige OAuth-scope géén
 * `documents` / `purchase_invoices` toegang heeft — dan moet Sam herverbinden.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // Lazy import — voorkomt webpack compile-loop bij build (Anthropic SDK +
  // moneybird helpers blijven uit de build-time module-graph).
  const { previewMoneybirdImport } = await import('@/lib/moneybirdImport');
  const authSb = await createServerSupabase();
  const { data: { user } } = await authSb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const sb = createServiceSupabase();
  const { data: membership } = await sb
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle();
  if (!membership) return NextResponse.json({ error: 'no_org' }, { status: 403 });

  const months = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get('months') || '12', 10) || 12, 1), 60);

  const preview = await previewMoneybirdImport(sb, {
    organizationId: membership.organization_id,
    monthsBack: months,
  });

  if (!preview.ok) {
    return NextResponse.json({
      ok: false,
      scopeOk: preview.scopeOk,
      error: preview.error,
    }, { status: preview.scopeOk ? 502 : 403 });
  }

  return NextResponse.json({
    ok: true,
    months,
    invoicesTotal: preview.invoicesTotal,
    invoicesNew: preview.invoicesNew,
    alreadyImported: preview.alreadyImported,
    suppliersTotal: preview.suppliersTotal,
    oldest: preview.oldest,
    newest: preview.newest,
    sample: preview.sample,
  });
}
