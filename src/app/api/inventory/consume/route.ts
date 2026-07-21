/* POST /api/inventory/consume — trek verbruik af van de voorraad.
 *
 * Eén server-side ingang voor consumptie (serve, event-afronding, …). Doet de
 * naam-resolving + unit-conversie + atomaire mutatie server-side via de gedeelde
 * helper, zodat vraag én aftrek op dezelfde inventory_id landen (fix #1).
 *
 * Body: { lines: ConsumeLine[], note?: string }
 * Best-effort: niet-gematchte lijnen komen terug als matched=false i.p.v. te falen.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withTenantAuth, type TenantAuthCtx } from '@/lib/withTenantAuth';
import { applyConsumption, type ConsumeLine } from '@/lib/dal/stockMutation';

export const runtime = 'nodejs';
export const maxDuration = 20;

export const POST = withTenantAuth(async (req: NextRequest, { supabase, orgId }: TenantAuthCtx) => {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const lines = (body as { lines?: ConsumeLine[] })?.lines;
  const note = (body as { note?: string })?.note;
  if (!Array.isArray(lines) || lines.length === 0) {
    return NextResponse.json({ error: 'lines[] verplicht' }, { status: 400 });
  }

  const { results, posted, skipped } = await applyConsumption(supabase, orgId, lines, { defaultNote: note ?? null });
  return NextResponse.json({ ok: true, posted, skipped, results });
});
