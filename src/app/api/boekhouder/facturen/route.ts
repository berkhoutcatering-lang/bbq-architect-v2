/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { RGS_BY_CODE, SALES_CODES } from '@/lib/rgsCategories';

export const runtime = 'nodejs';

/**
 * GET  /api/boekhouder/facturen?month=YYYY-MM
 *      List verkoop-facturen voor de boekhouder-flow.
 *
 * PATCH /api/boekhouder/facturen
 *      Body: { id, rgs_code }
 *      Wijzig RGS-code (default WOpbCat — food 9%). Boekhouder kan splitsen
 *      naar WOpbCatDrnk (dranken/service 21%).
 */

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

    const monthParam = req.nextUrl.searchParams.get('month');

    let query = supabase
      .from('facturen')
      .select('id, nummer, datum, client_naam, status, items, rgs_code, locked_at')
      .eq('organization_id', orgId)
      .order('datum', { ascending: false })
      .limit(500);

    if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
      const [yyyy, mm] = monthParam.split('-');
      const start = `${yyyy}-${mm}-01`;
      const nextMonth = Number(mm) === 12
        ? `${Number(yyyy) + 1}-01-01`
        : `${yyyy}-${String(Number(mm) + 1).padStart(2, '0')}-01`;
      query = query.gte('datum', start).lt('datum', nextMonth);
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Bereken BTW-splits per factuur uit items-JSONB
    const enriched = (data || []).map(function (f: any) {
      const items = Array.isArray(f.items) ? f.items : [];
      let netto = 0, btw9 = 0, btw21 = 0;
      items.forEach(function (it: any) {
        const lineTotal = (Number(it.aantal) || 0) * (Number(it.prijs) || 0);
        const pct = Number(it.btw_pct) || 21;
        const btwAmount = lineTotal * pct / (100 + pct);
        netto += lineTotal - btwAmount;
        if (pct === 9) btw9 += btwAmount;
        else if (pct === 21) btw21 += btwAmount;
      });
      const code = f.rgs_code || 'WOpbCat';
      const cat = RGS_BY_CODE[code];
      return {
        id: f.id,
        nummer: f.nummer,
        datum: f.datum,
        client_naam: f.client_naam,
        status: f.status,
        rgs_code: code,
        rgs_label: cat?.label || 'Omzet catering — food',
        netto_eur: Math.round(netto * 100) / 100,
        btw_9_eur: Math.round(btw9 * 100) / 100,
        btw_21_eur: Math.round(btw21 * 100) / 100,
        totaal_eur: Math.round((netto + btw9 + btw21) * 100) / 100,
        locked_at: f.locked_at,
      };
    });

    return NextResponse.json({
      rows: enriched,
      sales_codes: SALES_CODES.map(c => ({ code: c, label: RGS_BY_CODE[c].label })),
    });
  } catch (err: any) {
    console.error('[boekhouder/facturen GET]', err);
    return NextResponse.json({ error: err?.message || 'Onbekende fout' }, { status: 500 });
  }
}

interface PatchBody {
  id: number;
  rgs_code: string;
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

    const body = await req.json() as PatchBody;
    if (!body.id || !body.rgs_code) {
      return NextResponse.json({ error: 'id + rgs_code verplicht' }, { status: 400 });
    }
    if (!SALES_CODES.includes(body.rgs_code)) {
      return NextResponse.json({ error: `Niet-geldige omzet-RGS-code: ${body.rgs_code}` }, { status: 400 });
    }

    const { data: memberships } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .limit(1);
    const orgId = memberships?.[0]?.organization_id;
    if (!orgId) return NextResponse.json({ error: 'Geen organisatie' }, { status: 403 });

    // Check locked
    const { data: existing } = await supabase
      .from('facturen')
      .select('id, locked_at')
      .eq('id', body.id)
      .eq('organization_id', orgId)
      .single();
    if (!existing) return NextResponse.json({ error: 'Factuur niet gevonden' }, { status: 404 });
    if (existing.locked_at) return NextResponse.json({ error: 'Factuur is vergrendeld in een maandpakket' }, { status: 409 });

    const { error } = await supabase
      .from('facturen')
      .update({ rgs_code: body.rgs_code })
      .eq('id', body.id)
      .eq('organization_id', orgId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Onbekende fout' }, { status: 500 });
  }
}
