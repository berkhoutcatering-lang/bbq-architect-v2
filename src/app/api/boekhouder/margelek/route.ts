/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';

export const runtime = 'nodejs';

/**
 * GET /api/boekhouder/margelek?period=YYYY-MM | YYYY-Qx | YYYY
 * ──────────────────────────────────────────
 * Aggregeert marge_alerts over een periode om de "stille margelek" zichtbaar
 * te maken: hoeveel marge verloren door prijs-shifts bij leveranciers.
 *
 * Per leverancier: totaal impact + grootste shifts.
 * Per ingredient: prijsbewegingen.
 *
 * Wordt gebruikt in pakket-PDF (sectie) + tile op /geld/boekhouder.
 */

function resolveDateRange(periodParam: string): { start: string; end: string; label: string } | null {
  if (/^\d{4}-\d{2}$/.test(periodParam)) {
    const [y, m] = periodParam.split('-');
    const year = Number(y), month = Number(m);
    const end = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
    return { start: `${periodParam}-01`, end, label: new Date(`${periodParam}-01T00:00:00`).toLocaleDateString('nl-NL', { year: 'numeric', month: 'long' }) };
  }
  if (/^\d{4}-Q[1-4]$/.test(periodParam)) {
    const [y, q] = periodParam.split('-Q');
    const year = Number(y), quarter = Number(q);
    const startMonth = (quarter - 1) * 3 + 1;
    const endMonth = startMonth + 3;
    const start = `${year}-${String(startMonth).padStart(2, '0')}-01`;
    const end = endMonth > 12 ? `${year + 1}-01-01` : `${year}-${String(endMonth).padStart(2, '0')}-01`;
    return { start, end, label: `Q${quarter} ${year}` };
  }
  if (/^\d{4}$/.test(periodParam)) {
    const year = Number(periodParam);
    return { start: `${year}-01-01`, end: `${year + 1}-01-01`, label: `Jaar ${year}` };
  }
  return null;
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

    const { data: memberships } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .limit(1);
    const orgId = memberships?.[0]?.organization_id;
    if (!orgId) return NextResponse.json({ error: 'Geen organisatie' }, { status: 403 });

    const periodParam = req.nextUrl.searchParams.get('period') || new Date().toISOString().slice(0, 7);
    const range = resolveDateRange(periodParam);
    if (!range) return NextResponse.json({ error: 'Ongeldige period' }, { status: 400 });

    const { data: alerts } = await supabase
      .from('marge_alerts')
      .select(`
        id, old_price, new_price, pct_change, total_marge_impact_eur,
        detected_at, status, leverancier_id, inventory_id,
        leverancier:leverancier_id (naam, type),
        inventory:inventory_id (naam, unit)
      `)
      .eq('organization_id', orgId)
      .gte('detected_at', range.start + 'T00:00:00')
      .lt('detected_at', range.end + 'T00:00:00');

    const rows = (alerts || []).map(function (a: any) {
      const lev = Array.isArray(a.leverancier) ? a.leverancier[0] : a.leverancier;
      const inv = Array.isArray(a.inventory) ? a.inventory[0] : a.inventory;
      return {
        id: a.id,
        ingredient: inv?.naam || `Item #${a.inventory_id}`,
        unit: inv?.unit || 'kg',
        leverancier: lev?.naam || 'onbekend',
        leverancier_type: lev?.type || '',
        old_price: Number(a.old_price),
        new_price: Number(a.new_price),
        pct_change: Number(a.pct_change),
        impact_eur: Number(a.total_marge_impact_eur),
        detected_at: a.detected_at,
        status: a.status,
      };
    });

    // Aggregaties
    const totalImpact = rows.reduce(function (s, r) { return s + r.impact_eur; }, 0);
    const negativeImpact = rows.filter(function (r) { return r.impact_eur < 0; }).reduce(function (s, r) { return s + r.impact_eur; }, 0);

    const byLeverancier = new Map<string, { naam: string; alerts: number; impact: number }>();
    rows.forEach(function (r) {
      const cur = byLeverancier.get(r.leverancier) || { naam: r.leverancier, alerts: 0, impact: 0 };
      cur.alerts += 1;
      cur.impact += r.impact_eur;
      byLeverancier.set(r.leverancier, cur);
    });
    const perLeverancier = Array.from(byLeverancier.values()).sort(function (a, b) { return a.impact - b.impact; });

    const biggestShifts = [...rows].sort(function (a, b) { return Math.abs(b.pct_change) - Math.abs(a.pct_change); }).slice(0, 5);

    return NextResponse.json({
      period: { ...range, param: periodParam },
      summary: {
        alerts_count: rows.length,
        total_impact_eur: Math.round(totalImpact * 100) / 100,
        negative_impact_eur: Math.round(negativeImpact * 100) / 100,
        open_alerts: rows.filter(function (r) { return r.status === 'open'; }).length,
      },
      per_leverancier: perLeverancier,
      biggest_shifts: biggestShifts,
      alerts: rows,
    });
  } catch (err: any) {
    console.error('[boekhouder/margelek]', err);
    return NextResponse.json({ error: err?.message || 'Onbekende fout' }, { status: 500 });
  }
}
