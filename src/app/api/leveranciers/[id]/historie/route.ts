/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';

export const runtime = 'nodejs';

/**
 * GET /api/leveranciers/[id]/historie
 * ───────────────────────────────────
 * Alle bonnen + price_history-momenten + open marge-alerts voor één
 * leverancier. Plus top-5 ingredients in volume (per item totaal-spend).
 *
 * Cross-page koppeling — vanuit /leveranciers kan cateraar:
 *  - alle bonnen ooit ontvangen zien
 *  - prijs-trend per ingredient bij deze leverancier
 *  - margelek-impact per leverancier
 */

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: idStr } = await ctx.params;
    const id = Number(idStr);
    if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ error: 'Ongeldige id' }, { status: 400 });

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

    // Leverancier zelf
    const { data: lev } = await supabase
      .from('leveranciers')
      .select('id, naam, type, contact, email, tel, factuur_cyclus, bon_invoer_methode, kwaliteit_score')
      .eq('id', id)
      .eq('organization_id', orgId)
      .maybeSingle();
    if (!lev) return NextResponse.json({ error: 'Leverancier niet gevonden' }, { status: 404 });

    // Bonnen (laatste 200)
    const { data: bonnen } = await supabase
      .from('bonnen')
      .select('id, datum, totaal_bedrag, netto_bedrag, btw_laag_bedrag, btw_hoog_bedrag, rgs_code, rgs_category_label, notities, status, locked_at')
      .eq('organization_id', orgId)
      .eq('leverancier_id', id)
      .order('datum', { ascending: false })
      .limit(200);

    // Aggregaties op bonnen
    const totalSpend = (bonnen || []).reduce((s, b) => s + (Number(b.totaal_bedrag) || 0), 0);
    const totalBtw9 = (bonnen || []).reduce((s, b) => s + (Number(b.btw_laag_bedrag) || 0), 0);
    const totalBtw21 = (bonnen || []).reduce((s, b) => s + (Number(b.btw_hoog_bedrag) || 0), 0);

    // Prijs-historie deze leverancier — gegroepeerd per inventory
    const { data: priceRows } = await supabase
      .from('price_history')
      .select('inventory_id, datum, unit_price, unit, source, inventory:inventory_id (naam)')
      .eq('organization_id', orgId)
      .eq('leverancier_id', id)
      .order('datum', { ascending: false })
      .limit(500);
    const priceMap = new Map<number, { naam: string; unit: string; prices: Array<{ datum: string; unit_price: number; source: string }> }>();
    (priceRows || []).forEach((r: any) => {
      const inv = Array.isArray(r.inventory) ? r.inventory[0] : r.inventory;
      const cur = priceMap.get(r.inventory_id) || { naam: inv?.naam || `#${r.inventory_id}`, unit: r.unit || '', prices: [] };
      cur.prices.push({ datum: r.datum, unit_price: Number(r.unit_price), source: r.source });
      priceMap.set(r.inventory_id, cur);
    });
    const ingredientTrends = Array.from(priceMap.entries()).map(([invId, v]) => {
      const sorted = [...v.prices].sort((a, b) => a.datum.localeCompare(b.datum));
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const pctChange = first && last && first.unit_price > 0 ? ((last.unit_price - first.unit_price) / first.unit_price) * 100 : 0;
      return {
        inventory_id: invId,
        naam: v.naam,
        unit: v.unit,
        first_price: first?.unit_price ?? null,
        last_price: last?.unit_price ?? null,
        pct_change: Math.round(pctChange * 100) / 100,
        data_points: sorted.length,
        sparkline: sorted.slice(-12).map(p => p.unit_price),
      };
    }).sort((a, b) => Math.abs(b.pct_change) - Math.abs(a.pct_change));

    // Marge-alerts voor deze leverancier
    const { data: alerts } = await supabase
      .from('marge_alerts')
      .select('id, inventory_id, old_price, new_price, pct_change, total_marge_impact_eur, status, detected_at, inventory:inventory_id (naam)')
      .eq('organization_id', orgId)
      .eq('leverancier_id', id)
      .order('detected_at', { ascending: false })
      .limit(30);

    return NextResponse.json({
      leverancier: lev,
      bonnen: bonnen || [],
      totals: {
        bonnen_count: (bonnen || []).length,
        total_spend_eur: Math.round(totalSpend * 100) / 100,
        total_btw_9_eur: Math.round(totalBtw9 * 100) / 100,
        total_btw_21_eur: Math.round(totalBtw21 * 100) / 100,
      },
      ingredient_trends: ingredientTrends,
      marge_alerts: (alerts || []).map((a: any) => ({
        ...a,
        inventory_naam: (Array.isArray(a.inventory) ? a.inventory[0] : a.inventory)?.naam || null,
      })),
    });
  } catch (err: any) {
    console.error('[leveranciers/historie]', err);
    return NextResponse.json({ error: err?.message || 'Onbekende fout' }, { status: 500 });
  }
}
