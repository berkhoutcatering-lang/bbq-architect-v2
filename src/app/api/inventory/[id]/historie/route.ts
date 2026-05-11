/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';

export const runtime = 'nodejs';

/**
 * GET /api/inventory/[id]/historie
 * ────────────────────────────────
 * Volledige audit-trail van een inventory-item:
 *  • stock_movements (alle mutaties) met bon-link
 *  • price_history (alle prijs-momenten per leverancier)
 *  • marge_alerts (open + resolved) voor dit item
 *
 * Cross-page koppeling — vanuit /voorraad kan cateraar zien wanneer en
 * via welke bon de stock gedaald is. Audit-trail voor Belastingdienst +
 * eigen controle.
 */

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: idStr } = await ctx.params;
    const id = Number(idStr);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: 'Ongeldige id' }, { status: 400 });
    }

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

    // Inventory-item check (RLS doet het automatisch maar expliciet org-check is netter)
    const { data: inv } = await supabase
      .from('inventory')
      .select('id, naam, unit, current_stock, last_price_eur, last_price_at')
      .eq('id', id)
      .eq('organization_id', orgId)
      .maybeSingle();
    if (!inv) return NextResponse.json({ error: 'Inventory niet gevonden' }, { status: 404 });

    // Stock-movements (limit 200, recent eerst)
    const { data: movements } = await supabase
      .from('stock_movements')
      .select('id, type, qty, resulting_stock, unit_price, bon_id, by_user, note, created_at')
      .eq('inventory_id', id)
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(200);

    // Bon-info voor movements met bon_id
    const bonIds = Array.from(new Set((movements || []).map(m => m.bon_id).filter(Boolean)));
    const bonsById = new Map<number, any>();
    if (bonIds.length > 0) {
      const { data: bonRows } = await supabase
        .from('bonnen')
        .select('id, datum, leverancier_id, totaal_bedrag, leverancier:leverancier_id (naam)')
        .in('id', bonIds);
      (bonRows || []).forEach(b => bonsById.set(b.id, b));
    }

    // Price history (alle prijs-momenten)
    const { data: prices } = await supabase
      .from('price_history')
      .select('id, leverancier_id, datum, unit_price, unit, source, leverancier:leverancier_id (naam, type)')
      .eq('inventory_id', id)
      .eq('organization_id', orgId)
      .order('datum', { ascending: false })
      .limit(60);

    // Open marge-alerts
    const { data: alerts } = await supabase
      .from('marge_alerts')
      .select('id, leverancier_id, old_price, new_price, pct_change, total_marge_impact_eur, status, detected_at, leverancier:leverancier_id (naam)')
      .eq('inventory_id', id)
      .eq('organization_id', orgId)
      .order('detected_at', { ascending: false })
      .limit(20);

    return NextResponse.json({
      inventory: inv,
      stock_movements: (movements || []).map(m => {
        const bon = m.bon_id ? bonsById.get(m.bon_id) : null;
        const lev = bon ? (Array.isArray(bon.leverancier) ? bon.leverancier[0] : bon.leverancier) : null;
        return {
          ...m,
          bon: bon ? { id: bon.id, datum: bon.datum, totaal_bedrag: bon.totaal_bedrag, leverancier_naam: lev?.naam || null } : null,
        };
      }),
      price_history: (prices || []).map((p: any) => ({
        ...p,
        leverancier_naam: (Array.isArray(p.leverancier) ? p.leverancier[0] : p.leverancier)?.naam || null,
      })),
      marge_alerts: (alerts || []).map((a: any) => ({
        ...a,
        leverancier_naam: (Array.isArray(a.leverancier) ? a.leverancier[0] : a.leverancier)?.naam || null,
      })),
    });
  } catch (err: any) {
    console.error('[inventory/historie]', err);
    return NextResponse.json({ error: err?.message || 'Onbekende fout' }, { status: 500 });
  }
}
